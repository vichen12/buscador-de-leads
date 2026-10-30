// Trabajador en segundo plano (pg_cron llama a la función "correo" cada minuto con el secreto de Vault). Hace tres cosas, para todas las cuentas:
//  1. Cola de envíos: manda de a un mail por persona, con pausas aleatorias de 45 a 120 s, reintentos ante errores
//     temporales y pausa automática del envío masivo si rebota más del 5 %.
//  2. Secuencias: arma los pasos que tocan (mail en el mismo hilo, o tarea de llamar / WhatsApp / LinkedIn).
//  3. Casillas: lee las respuestas cada 10 minutos y las clasifica con Claude.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { claveServicio } from '../_shared/supabase.ts'
import { enviarUno, revisarCasilla, ErrorEnvio, explicar } from '../_shared/correo.ts'
import { cargarContexto, pasoSecuencia, aplicarPlantilla, clasificarRespuesta, type Contexto } from '../_shared/redactar.ts'

type Dic = Record<string, any>
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const azar = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))
const TIEMPO = 120_000

/** Hora local de la persona; los pasos de secuencia sólo salen de lunes a sábado de 8 a 20 */
function proximaVentana(tz: string, desde = new Date()) {
  const local = (d: Date) => new Date(d.toLocaleString('en-US', { timeZone: tz }))
  let d = new Date(desde)
  for (let i = 0; i < 48 * 4; i++) {
    const l = local(d), h = l.getHours(), dia = l.getDay()
    if (dia !== 0 && h >= 8 && h < 20) return d
    d = new Date(d.getTime() + 15 * 60000)
  }
  return d
}

async function procesarCola(db: any, soloOwner: string | null, fin: number) {
  let enviados = 0
  const { data: jobs, error } = await db.rpc('tomar_envios', { p_max: 50, p_owner: soloOwner })
  if (error) { console.error('tomar_envios', error); return 0 }
  for (const j of jobs ?? []) {
    if (Date.now() > fin) { await db.from('envios_cola').update({ estado: 'en_cola', intentos: j.intentos - 1 }).eq('id', j.id); continue }
    try {
      const r = await enviarUno(db, j.owner_id, { prospecto_id: j.prospecto_id, asunto: j.asunto, cuerpo: j.cuerpo, adjuntos: j.adjuntos, mensaje_id: j.mensaje_id, hilo: j.hilo })
      await db.from('envios_cola').update({ estado: 'enviado', enviado_at: new Date().toISOString(), message_id: r.message_id, error: r.en_enviados ? '' : 'Salió, pero no se pudo copiar a Enviados' }).eq('id', j.id)
      enviados++
      if (j.inscripcion_id) {
        const { data: ins } = await db.from('inscripciones').select('hilo_id').eq('id', j.inscripcion_id).maybeSingle()
        if (ins && !ins.hilo_id) await db.from('inscripciones').update({ hilo_id: r.message_id, asunto_hilo: j.asunto }).eq('id', j.inscripcion_id)
      }
      // El próximo mail de esta persona sale entre 45 y 120 segundos después
      const proximo = new Date(Date.now() + azar(45, 120) * 1000).toISOString()
      await db.from('envios_cola').update({ proximo_at: proximo }).eq('owner_id', j.owner_id).eq('estado', 'en_cola').lt('proximo_at', proximo)
      if (j.lote_id) await revisarLote(db, j.lote_id)
    } catch (e) {
      const err = e as ErrorEnvio
      const codigo = err.codigo ?? 'ERROR'
      if (codigo === 'LIMITE_EMAIL') {
        // Se terminó el cupo de hoy: sigue mañana a la mañana
        const manana = new Date(); manana.setUTCDate(manana.getUTCDate() + 1); manana.setUTCHours(12, azar(0, 50), 0, 0)
        await db.from('envios_cola').update({ estado: 'en_cola', intentos: j.intentos - 1, proximo_at: manana.toISOString(), error: 'Llegaste al límite de hoy: sigue mañana' }).eq('id', j.id)
        await db.from('envios_cola').update({ proximo_at: manana.toISOString() }).eq('owner_id', j.owner_id).eq('estado', 'en_cola').lt('proximo_at', manana.toISOString())
      } else if (err.temporal && j.intentos < 4) {
        // Reintento con espera creciente: 5, 20 y 80 minutos
        await db.from('envios_cola').update({ estado: 'en_cola', proximo_at: new Date(Date.now() + 5 * 4 ** (j.intentos - 1) * 60000).toISOString(), error: err.message }).eq('id', j.id)
      } else {
        await db.from('envios_cola').update({ estado: 'fallido', error: err.message || explicar(e) }).eq('id', j.id)
        if (codigo === 'SIN_CORREO') await db.from('envios_cola').update({ estado: 'fallido', error: err.message }).eq('owner_id', j.owner_id).eq('estado', 'en_cola')
        if (j.lote_id) await revisarLote(db, j.lote_id)
      }
    }
  }
  return enviados
}

/** Termina el lote si no queda nada, o lo pausa si rebota más del 5 % */
async function revisarLote(db: any, loteId: string) {
  const { data: l } = await db.from('lotes_envio').select('*').eq('id', loteId).single()
  if (!l || l.estado !== 'activo') return
  const { data: filas } = await db.from('envios_cola').select('estado, prospecto_id').eq('lote_id', loteId)
  const enviados = (filas ?? []).filter((f: Dic) => f.estado === 'enviado')
  const pendientes = (filas ?? []).filter((f: Dic) => ['en_cola', 'enviando'].includes(f.estado)).length
  if (enviados.length >= 5) {
    const { count } = await db.from('interacciones').select('id', { count: 'exact', head: true }).eq('tipo', 'rebote').gte('created_at', l.created_at).in('prospecto_id', enviados.map((f: Dic) => f.prospecto_id))
    if ((count ?? 0) / enviados.length > 0.05) {
      await db.from('lotes_envio').update({ estado: 'pausado', motivo_pausa: `Rebotaron ${count} de ${enviados.length} mails (más del 5 %). Revisá esos emails antes de seguir: muchos rebotes dañan tu casilla.` }).eq('id', loteId)
      return
    }
  }
  if (!pendientes) await db.from('lotes_envio').update({ estado: 'terminado', terminado_at: new Date().toISOString() }).eq('id', loteId)
}

async function procesarSecuencias(db: any, fin: number) {
  const { data: pendientes } = await db.from('inscripciones').select('*, secuencias(*), prospectos(*)').eq('estado', 'activa').lte('proximo_at', new Date().toISOString()).order('proximo_at').limit(15)
  if (!pendientes?.length) return 0
  const key = await claveServicio('anthropic')
  const modelo = (await claveServicio('modelo_ia')) || 'claude-haiku-5-5'
  const ctxs = new Map<string, Contexto>()
  let hechos = 0
  for (const ins of pendientes) {
    if (Date.now() > fin) break
    const p = ins.prospectos as Dic, sec = ins.secuencias as Dic
    const pasos: Dic[] = Array.isArray(sec?.pasos) ? sec.pasos : []
    if (!p || ['no_interesado', 'no_contactar', 'cliente', 'perdido'].includes(p.estado)) {
      await db.from('inscripciones').update({ estado: 'frenada', motivo: 'La empresa ya no se puede contactar' }).eq('id', ins.id); continue
    }
    const paso = pasos[ins.paso]
    if (!paso) { await db.from('inscripciones').update({ estado: 'terminada', motivo: 'Completó todos los pasos' }).eq('id', ins.id); continue }
    const { data: perf } = await db.from('perfiles').select('zona_horaria').eq('id', ins.owner_id).maybeSingle()
    const tz = perf?.zona_horaria || 'America/Argentina/Buenos_Aires'
    const ventana = proximaVentana(tz)
    if (ventana.getTime() > Date.now() + 60000) { await db.from('inscripciones').update({ proximo_at: ventana.toISOString() }).eq('id', ins.id); continue }

    if (!ctxs.has(ins.owner_id)) ctxs.set(ins.owner_id, await cargarContexto(db, ins.owner_id, key, modelo))
    const ctx = ctxs.get(ins.owner_id)!
    const { data: cont } = await db.from('contactos').select('nombre, cargo, email').eq('prospecto_id', p.id).order('principal', { ascending: false }).limit(1)
    const contacto = cont?.[0] ?? null
    const { data: hs } = await db.from('interacciones').select('tipo, detalle, created_at').eq('prospecto_id', p.id).in('tipo', ['enviado', 'llamada', 'nota']).order('created_at').limit(15)
    const historial = (hs ?? []).map((h: Dic) => `- ${h.created_at.slice(0, 10)}: ${String(h.detalle ?? '').slice(0, 300)}`).join('\n')

    let asunto = '', cuerpo = ''
    try {
      if (paso.como === 'plantilla' && paso.cuerpo) {
        cuerpo = aplicarPlantilla(paso.cuerpo, p, ctx, contacto)
        asunto = ins.paso > 0 && ins.asunto_hilo ? `Re: ${String(ins.asunto_hilo).replace(/^(re:\s*)+/i, '')}` : aplicarPlantilla(paso.asunto || 'Hola', p, ctx, contacto)
      } else if (ins.paso === 0 && paso.tipo === 'email') {
        // Primer mail: si ya hay un borrador de email sin enviar, se usa ese (puede estar revisado por la persona)
        const { data: m } = await db.from('mensajes').select('*').eq('prospecto_id', p.id).eq('tipo', 'email').maybeSingle()
        if (m?.cuerpo && !m.enviado_at) { asunto = m.asunto || 'Hola'; cuerpo = m.cuerpo }
      }
      if (!cuerpo) {
        if (!key) throw new Error('Falta la clave de Claude para escribir este paso')
        const r = await pasoSecuencia(ctx, p, paso, { numero: ins.paso, total: pasos.length, historial, asuntoHilo: ins.asunto_hilo, contacto })
        asunto = r.asunto; cuerpo = r.cuerpo
        await db.from('chat_uso').insert({ owner_id: ins.owner_id, tokens_in: 0, tokens_out: 0 })
      }
    } catch (e) {
      console.error('paso de secuencia', e)
      await db.from('inscripciones').update({ proximo_at: new Date(Date.now() + 3 * 3600000).toISOString(), motivo: 'No se pudo escribir el paso: se reintenta en 3 horas' }).eq('id', ins.id)
      continue
    }

    if (paso.tipo === 'email') {
      if (!p.email || p.email_estado === 'invalido') {
        await db.from('tareas').insert({ owner_id: ins.owner_id, prospecto_id: p.id, tipo: 'llamar', titulo: `Contactar a ${p.nombre} (no tiene un email válido)`, texto: cuerpo, origen: 'secuencia', inscripcion_id: ins.id })
      } else {
        const { data: m } = ins.paso === 0 ? await db.from('mensajes').select('id').eq('prospecto_id', p.id).eq('tipo', 'email').maybeSingle() : { data: null }
        await db.from('envios_cola').insert({ owner_id: ins.owner_id, prospecto_id: p.id, inscripcion_id: ins.id, mensaje_id: m?.id ?? null, asunto, cuerpo, hilo: ins.paso > 0 ? ins.hilo_id : null })
      }
    } else {
      const titulos: Dic = { llamada: `Llamar a ${p.nombre}`, whatsapp: `Mandar WhatsApp a ${p.nombre}`, linkedin_visita: `Visitar el LinkedIn de ${contacto?.nombre || p.nombre}`, linkedin_conexion: `Pedir conexión en LinkedIn a ${contacto?.nombre || p.nombre}`, linkedin_mensaje: `Mensaje por LinkedIn a ${contacto?.nombre || p.nombre}` }
      await db.from('tareas').insert({ owner_id: ins.owner_id, prospecto_id: p.id, tipo: paso.tipo === 'llamada' ? 'llamar' : paso.tipo, titulo: titulos[paso.tipo] ?? `Paso de secuencia con ${p.nombre}`, texto: cuerpo, origen: 'secuencia', inscripcion_id: ins.id })
    }
    const siguiente = pasos[ins.paso + 1]
    if (!siguiente) await db.from('inscripciones').update({ paso: ins.paso + 1, estado: 'terminada', motivo: 'Completó todos los pasos' }).eq('id', ins.id)
    else {
      const cuando = new Date(new Date(ins.inicio).getTime() + Number(siguiente.dia ?? 0) * 86400000)
      await db.from('inscripciones').update({ paso: ins.paso + 1, proximo_at: new Date(Math.max(cuando.getTime(), Date.now() + 3600000)).toISOString() }).eq('id', ins.id)
    }
    hechos++
  }
  return hechos
}

async function revisarCasillas(db: any, fin: number) {
  const hace = new Date(Date.now() - 10 * 60000).toISOString()
  const { data: cs } = await db.from('conexiones_correo').select('*').eq('leer_respuestas', true).or(`ultima_revision.is.null,ultima_revision.lt.${hace}`).order('ultima_revision', { ascending: true, nullsFirst: true }).limit(4)
  if (!cs?.length) return 0
  const key = await claveServicio('anthropic')
  const modelo = (await claveServicio('modelo_resumen')) || 'claude-haiku-5-5'
  let n = 0
  for (const cfg of cs) {
    if (Date.now() > fin - 30000) break
    const { data: clave } = await db.rpc('correo_leer_secreto', { p_owner: cfg.owner_id })
    if (!clave) continue
    try {
      const ctx = key ? await cargarContexto(db, cfg.owner_id, key, modelo) : null
      await revisarCasilla(db, cfg.owner_id, cfg, clave, ctx ? (m: Dic, p: Dic) => clasificarRespuesta(ctx, m.texto, m.asunto, p) : undefined)
      n++
    } catch (e) {
      await db.from('conexiones_correo').update({ ultimo_error: explicar(e, cfg), ultima_revision: new Date().toISOString() }).eq('owner_id', cfg.owner_id)
    }
  }
  return n
}

/** Corrida completa (cron) */
export async function correrTrabajador() {
  const fin = Date.now() + TIEMPO
  const db = admin()
  const [enviados, pasos] = await Promise.all([procesarCola(db, null, fin), procesarSecuencias(db, fin - 20000)])
  const casillas = await revisarCasillas(db, fin)
  return { ok: true, enviados, pasos, casillas }
}

/** Una persona destraba sólo su propia cola (el envío masivo lo usa para que el primero salga enseguida) */
export async function correrColaDe(owner: string) {
  return { ok: true, enviados: await procesarCola(admin(), owner, Date.now() + 60_000) }
}

/** ¿El pedido viene del cron? Compara el secreto guardado en Vault */
export async function esCron(req: Request) {
  const recibido = req.headers.get('x-trabajador') ?? ''
  if (!recibido) return false
  const secreto = String((await admin().rpc('secreto_trabajador')).data ?? '')
  return secreto.length >= 32 && recibido === secreto
}
