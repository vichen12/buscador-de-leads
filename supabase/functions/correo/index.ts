// Correo conectado: envía emails desde la cuenta del usuario y lee sus respuestas.
// Modos: estado | conectar | probar | desconectar | enviar | encolar | lote | cola | revisar | salud (+ cron: trabajador.ts)
//  - enviar: un mail ya (individual), con todas las protecciones.
//  - encolar: envío masivo en el servidor (cola): se puede cerrar la pestaña; el "trabajador" los manda de a uno.
//  - lote: pausar / reanudar / cancelar un envío masivo.
// La contraseña vive cifrada en Vault. Supabase no deja salir por 25/587: sólo SMTP con TLS directo (465).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { PROVEEDORES, Imap, smtpSesion, enviarMail, guardarEnEnviados, archivosDe, saludDominio, explicar, revisarCasilla, enviarUno, enviarACliente, ErrorEnvio } from '../_shared/correo.ts'
import { cargarContexto, clasificarRespuesta } from '../_shared/redactar.ts'
import { correrTrabajador, correrColaDe, esCron } from './trabajador.ts'

type Dic = Record<string, any>
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  // pg_cron: cola de envíos, secuencias y lectura de casillas de todas las cuentas
  if (await esCron(req)) return json(await correrTrabajador())
  let usuario
  try { usuario = await clienteDelUsuario(req) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const { supabase, user } = usuario
  const db = admin()
  const body = await req.json().catch(() => ({}))
  const modo = String(body.modo ?? 'estado')

  const { data: cfg } = await db.from('conexiones_correo').select('*').eq('owner_id', user.id).maybeSingle()
  const sinSecreto = (c: Dic | null) => c && (({ secreto_id, ...r }) => r)(c)

  if (modo === 'estado') return json({ conexion: sinSecreto(cfg) })

  if (modo === 'desconectar') { await db.rpc('correo_borrar', { p_owner: user.id }); return json({ ok: true }) }

  if (modo === 'conectar') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const clave = String(body.clave ?? '').replace(/\s+/g, '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Escribí un email válido.' }, 400)
    if (clave.length < 6) return json({ error: 'Pegá la contraseña.' }, 400)
    const preset = PROVEEDORES.find(([re]) => re.test(email))?.[1]
    if (preset && !preset.smtp) return json({ error: 'Outlook, Hotmail e iCloud sólo permiten enviar por el puerto 587, que nuestro servidor no puede usar. Conectá Gmail, Private Email, Zoho, Yahoo o el correo de tu dominio.', codigo: 'NO_SOPORTADO' }, 400)
    const dominio = email.split('@')[1]
    const nuevo = {
      owner_id: user.id, email, nombre_remitente: String(body.nombre ?? '').slice(0, 80),
      smtp_host: String(body.smtp_host || preset?.smtp || `mail.${dominio}`).trim(), smtp_puerto: Number(body.smtp_puerto) || 465,
      imap_host: String(body.imap_host || preset?.imap || `mail.${dominio}`).trim(), imap_puerto: Number(body.imap_puerto) || 993,
    }
    if (nuevo.smtp_puerto === 587 || nuevo.smtp_puerto === 25) return json({ error: 'El puerto 587/25 no está disponible en nuestro servidor. Usá el 465 (SSL).' }, 400)
    try { await smtpSesion(nuevo, clave) } catch (e) { return json({ error: 'No pude entrar para enviar: ' + explicar(e, nuevo) }, 400) }
    let leer = true, avisoImap = ''
    try { (await Imap.abrir(nuevo, clave)).cerrar() } catch (e) { leer = false; avisoImap = 'Puede enviar, pero no pude entrar a la bandeja para leer respuestas (' + explicar(e, nuevo) + ').' }
    const { data: sid, error: e1 } = await db.rpc('correo_guardar_secreto', { p_owner: user.id, p_valor: clave })
    if (e1) return json({ error: 'No pude guardar la contraseña: ' + e1.message }, 500)
    const { error: e2 } = await db.from('conexiones_correo').upsert({ ...nuevo, secreto_id: sid, leer_respuestas: leer, ultimo_uid: 0, uid_validez: 0, ultimo_error: avisoImap })
    if (e2) return json({ error: e2.message }, 500)
    await db.from('auditoria').insert({ owner_id: user.id, tenant_id: null, accion: 'casilla_conectada', detalle: email }).then(() => {}, () => {})
    const { data: listo } = await db.from('conexiones_correo').select('*').eq('owner_id', user.id).single()
    return json({ ok: true, conexion: sinSecreto(listo), aviso: avisoImap })
  }

  if (!cfg) return json({ error: 'Todavía no conectaste tu email. Hacelo en Email.', codigo: 'SIN_CORREO' }, 400)

  if (modo === 'cola') return json(await correrColaDe(user.id))

  if (modo === 'salud') {
    try { return json({ ok: true, salud: await saludDominio(cfg.email, cfg.smtp_host) }) }
    catch (e) { return json({ error: 'No pude revisar el dominio: ' + (e as Error).message }, 502) }
  }

  if (modo === 'lote') {
    const accion = String(body.accion ?? '')
    const estado = accion === 'pausar' ? 'pausado' : accion === 'reanudar' ? 'activo' : accion === 'cancelar' ? 'cancelado' : ''
    if (!estado) return json({ error: 'Acción desconocida' }, 400)
    const { data: l, error } = await supabase.from('lotes_envio').update({ estado, motivo_pausa: accion === 'pausar' ? 'Lo pausaste vos' : '' }).eq('id', body.lote_id).select().single()
    if (error || !l) return json({ error: 'No encontré ese envío' }, 404)
    if (estado === 'cancelado') await db.from('envios_cola').update({ estado: 'cancelado', error: 'Cancelado' }).eq('lote_id', l.id).eq('estado', 'en_cola')
    return json({ ok: true, lote: l })
  }

  if (modo === 'encolar') {
    // Envío masivo: cada item { mensaje_id, asunto, cuerpo, adjuntos, variante? }. El servidor los manda con pausas.
    const items: Dic[] = Array.isArray(body.items) ? body.items.slice(0, 500) : []
    if (!items.length) return json({ error: 'No hay emails para enviar' }, 400)
    const { data: ms } = await supabase.from('mensajes').select('id, prospecto_id').in('id', items.map(i => i.mensaje_id))
    const porId = new Map<string, Dic>((ms ?? []).map((m: Dic) => [m.id, m]))
    const { data: lote, error: eL } = await supabase.from('lotes_envio').insert({ nombre: String(body.nombre ?? '').slice(0, 120) || `Envío del ${new Date().toLocaleDateString('es-AR')}`, asunto_b: body.asunto_b || null }).select().single()
    if (eL) return json({ error: eL.message }, 500)
    // Espaciado: el primero sale ya; los demás los va soltando el trabajador con pausas de 45 a 120 s
    const filas = items.filter(i => porId.has(i.mensaje_id)).map((i, n) => ({
      owner_id: user.id, prospecto_id: (porId.get(i.mensaje_id) as Dic).prospecto_id, mensaje_id: i.mensaje_id, lote_id: lote.id,
      asunto: String(i.asunto ?? '').slice(0, 300), cuerpo: String(i.cuerpo ?? ''), adjuntos: Array.isArray(i.adjuntos) ? i.adjuntos : [],
      variante: i.variante === 'b' ? 'b' : i.variante === 'a' ? 'a' : null, proximo_at: new Date(Date.now() + n * 1000).toISOString(),
    }))
    const { error: eC } = await supabase.from('envios_cola').insert(filas)
    if (eC) { await supabase.from('lotes_envio').delete().eq('id', lote.id); return json({ error: /cola_mensaje_unico/.test(eC.message) ? 'Alguno de estos emails ya está en cola o ya se envió.' : eC.message }, 400) }
    // Mandar el primero ahora mismo para que se vea el avance enseguida (sigue después de responder)
    const ya = correrColaDe(user.id).catch(e => console.error('cola', e))
    ;(globalThis as Dic).EdgeRuntime?.waitUntil?.(ya)
    return json({ ok: true, lote, encolados: filas.length })
  }

  const { data: clave } = await db.rpc('correo_leer_secreto', { p_owner: user.id })
  if (!clave) return json({ error: 'Falta la contraseña del email: volvé a conectarlo.', codigo: 'SIN_CORREO' }, 400)

  if (modo === 'probar') {
    try {
      const { firma } = await archivosDe(db, user.id, [])
      const copia = await enviarMail(cfg, clave, cfg.email, 'Prueba de Prospecta ✓', `¡Hola!\n\nSi te llegó este mail, tu cuenta ${cfg.email} quedó conectada a Prospecta y ya podés enviar emails a tus prospectos desde la app.${firma ? '\n\nAbajo vas a ver tu firma tal como la reciben tus clientes.' : ''}\n\nProspecta`, { firma })
      let enEnviados = true
      try { await guardarEnEnviados(cfg, clave, copia) } catch (e) { enEnviados = false; console.error('copia en Enviados', e) }
      return json({ ok: true, en_enviados: enEnviados })
    } catch (e) { return json({ error: explicar(e, cfg) }, 400) }
  }

  if (modo === 'enviar') {
    const { data: m } = await supabase.from('mensajes').select('*').eq('id', body.mensaje_id).maybeSingle()
    if (!m) return json({ error: 'No encontré el borrador. Guardalo y probá de nuevo.' }, 404)
    const ids: string[] = Array.isArray(body.adjuntos) ? body.adjuntos.map(String) : (m.adjuntos ?? [])
    if (Array.isArray(body.adjuntos)) await supabase.from('mensajes').update({ adjuntos: ids }).eq('id', m.id)
    try {
      const r = await enviarUno(db, user.id, { prospecto_id: m.prospecto_id, asunto: m.asunto || 'Hola', cuerpo: m.cuerpo, adjuntos: ids, mensaje_id: m.id, hilo: m.en_respuesta_a })
      return json(r)
    } catch (e) {
      const err = e as ErrorEnvio
      return json({ error: err.message, codigo: err.codigo }, err.codigo === 'SMTP' ? 502 : 400)
    }
  }

  if (modo === 'cliente') {
    // B2C: un email de campaña a un cliente propio con permiso (de a uno; la pantalla los va mandando con pausas)
    try { return json(await enviarACliente(db, user.id, { cliente_id: String(body.cliente_id ?? ''), campana_id: String(body.campana_id ?? ''), asunto: String(body.asunto ?? ''), cuerpo: String(body.cuerpo ?? '') })) }
    catch (e) { const err = e as ErrorEnvio; return json({ error: err.message, codigo: err.codigo }, err.codigo === 'SMTP' ? 502 : 400) }
  }

  if (modo === 'revisar') {
    if (!cfg.leer_respuestas || !cfg.imap_host) return json({ ok: true, revisados: 0, respondieron: [], aviso: 'La lectura de respuestas está desactivada.' })
    try {
      const key = await claveServicio('anthropic')
      const ctx = key ? await cargarContexto(db, user.id, key, (await claveServicio('modelo_resumen')) || 'claude-haiku-5-5') : null
      const clasificar = ctx ? (m: Dic, p: Dic) => clasificarRespuesta(ctx, m.texto, m.asunto, p) : undefined
      return json({ ok: true, ...(await revisarCasilla(db, user.id, cfg, clave, clasificar)) })
    } catch (e) {
      const msg = explicar(e, cfg)
      await db.from('conexiones_correo').update({ ultimo_error: msg, ultima_revision: new Date().toISOString() }).eq('owner_id', user.id)
      return json({ error: msg }, 502)
    }
  }

  return json({ error: 'Modo desconocido' }, 400)
})
