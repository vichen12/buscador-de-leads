// Borradores con Claude para prospectos. Modos:
//   { modo: 'estado' }                         → qué está configurado (IA, Google Places)
//   { prospecto_ids: [...], forzar?, solo_email? } → genera WhatsApp + Email + Seguimiento y los guarda
//   { modo: 'reescribir', prospecto_id, tipo, cuerpo, asunto?, instruccion } → versión nueva (NO guarda)
//   { modo: 'responder', respuesta_id }         → borrador de respuesta a lo que dijo el prospecto (lo guarda como tipo "respuesta")
// Nunca envía nada. Sin clave de Claude usa plantillas (sólo si no hay perfil comercial).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { borradoresPlantilla, nombreCorto } from '../_shared/plantillas.js'
import { cargarContexto, borradores, reescribir, responder, fijos } from '../_shared/redactar.ts'

const MAX_POR_LLAMADA = 25
type Dic = Record<string, any>
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

async function contactoPrincipal(supabase: any, prospectoId: string) {
  const { data } = await supabase.from('contactos').select('nombre, cargo, email').eq('prospecto_id', prospectoId).order('principal', { ascending: false }).limit(1)
  return data?.[0] ?? null
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { supabase, user } = await clienteDelUsuario(req)
    const body = await req.json()
    const [key, modelo, places] = await Promise.all([claveServicio('anthropic'), claveServicio('modelo_ia'), claveServicio('google_places')])

    if (body.modo === 'estado') return json({ ia: !!key, modelo: key ? (modelo || 'claude-haiku-5-5') : null, places: !!places })

    // El contexto se lee con los permisos de la persona (RLS)
    const ctx = await cargarContexto(supabase, user.id, key, modelo)
    const NO_ESCRIBIR = ['no_interesado', 'no_contactar']

    if (body.modo === 'reescribir') {
      const { prospecto_id, tipo = 'whatsapp', cuerpo = '', asunto = '', instruccion = '' } = body
      if (!key) return json({ error: 'Para reescribir con Claude falta cargar la clave de Claude (Super admin → Claves).' }, 400)
      if (!instruccion.trim()) return json({ error: 'Escribí qué querés cambiar' }, 400)
      const { data: p, error } = await supabase.from('prospectos').select('*').eq('id', prospecto_id).single()
      if (error || !p) return json({ error: 'Prospecto no encontrado' }, 404)
      if (NO_ESCRIBIR.includes(p.estado)) return json({ error: 'Este negocio pidió no ser contactado' }, 400)
      return json({ ok: true, ...(await reescribir(ctx, p, tipo, cuerpo, asunto, instruccion.slice(0, 500))) })
    }

    if (body.modo === 'responder') {
      if (!key) return json({ error: 'Para responder con Claude falta cargar la clave de Claude.' }, 400)
      const { data: r } = await supabase.from('respuestas').select('*').eq('id', body.respuesta_id).maybeSingle()
      if (!r?.prospecto_id) return json({ error: 'No encontré la respuesta' }, 404)
      const [{ data: p }, { data: hs }] = await Promise.all([
        supabase.from('prospectos').select('*').eq('id', r.prospecto_id).single(),
        supabase.from('interacciones').select('tipo, detalle, created_at').eq('prospecto_id', r.prospecto_id).order('created_at').limit(30),
      ])
      if (NO_ESCRIBIR.includes(p.estado)) return json({ error: 'Esta empresa pidió no ser contactada' }, 400)
      const historial = (hs ?? []).map((h: Dic) => `- ${h.created_at.slice(0, 10)} ${h.tipo}: ${String(h.detalle ?? '').slice(0, 300)}`).join('\n')
      const b = await responder(ctx, p, r, historial)
      const { data: m, error } = await supabase.from('mensajes').upsert({
        prospecto_id: p.id, owner_id: user.id, tipo: 'respuesta', asunto: b.asunto, cuerpo: b.cuerpo, generado_por: 'ia', editado: false,
        enviado_at: null, en_respuesta_a: r.message_id, adjuntos: [],
      }, { onConflict: 'prospecto_id,tipo' }).select().single()
      if (error) return json({ error: error.message }, 500)
      await supabase.from('respuestas').update({ leida: true }).eq('id', r.id)
      return json({ ok: true, mensaje: m })
    }

    const { prospecto_ids, forzar = false, solo_email = false } = body
    if (!Array.isArray(prospecto_ids) || prospecto_ids.length === 0) return json({ error: 'Falta prospecto_ids' }, 400)
    if (prospecto_ids.length > MAX_POR_LLAMADA) return json({ error: `Máximo ${MAX_POR_LLAMADA} por vez` }, 400)
    const { data: prospectos, error } = await supabase.from('prospectos').select('*').in('id', prospecto_ids)
    if (error) throw error

    // Control de costos: la generación descuenta del cupo de IA
    const { data: cupo } = await admin().rpc('cupo_chat', { p_usuario: user.id })
    if (key && cupo && cupo.usados >= cupo.limite) return json({ error: cupo.mensaje || 'Llegaste al límite de IA de hoy.', codigo: 'LIMITE_CHAT' }, 429)

    const resultados: Record<string, string> = {}
    let errorIA = ''
    const uno = async (p: Dic) => {
      if (NO_ESCRIBIR.includes(p.estado)) { resultados[p.id] = 'omitido: no contactar'; return }
      const { data: existentes } = await supabase.from('mensajes').select('tipo, editado').eq('prospecto_id', p.id)
      const editados = new Set((existentes ?? []).filter((m: Dic) => m.editado).map((m: Dic) => m.tipo))
      let b: Dic, origen = 'plantilla'
      if (key) {
        try { b = await borradores(ctx, p, await contactoPrincipal(supabase, p.id)); origen = 'ia' }
        catch (e) {
          errorIA = e instanceof Error ? e.message : String(e); console.error(e)
          if (ctx.comercial) { resultados[p.id] = 'error: ' + errorIA; return } // mejor sin borrador que uno malo
          b = borradoresPlantilla(p, ctx.perfil)
        }
      } else {
        if (ctx.comercial) { resultados[p.id] = 'error: falta la clave de Claude'; return }
        b = borradoresPlantilla(p, ctx.perfil)
      }
      if (!b.email.adjuntos?.length) b.email.adjuntos = fijos(ctx).map(a => a.id)
      const filas = [
        { tipo: 'whatsapp', asunto: '', cuerpo: b.whatsapp, adjuntos: [] as string[], personalizado: [] },
        { tipo: 'email', asunto: b.email.asunto, cuerpo: b.email.cuerpo, adjuntos: b.email.adjuntos ?? [], personalizado: b.personalizado ?? [] },
        { tipo: 'seguimiento', asunto: `Re: ${b.email.asunto || nombreCorto(p.nombre)}`, cuerpo: b.seguimiento, adjuntos: [] as string[], personalizado: [] },
      ].filter(f => solo_email ? f.tipo === 'email' && !editados.has('email') : (forzar || !editados.has(f.tipo)))
        .map(f => ({ ...f, prospecto_id: p.id, owner_id: user.id, generado_por: origen, editado: false }))
      const { error: e2 } = await supabase.from('mensajes').upsert(filas, { onConflict: 'prospecto_id,tipo' })
      resultados[p.id] = e2 ? 'error: ' + e2.message : `${origen} (${filas.length})`
    }
    const lista = prospectos ?? []
    for (let i = 0; i < lista.length; i += 5) await Promise.all(lista.slice(i, i + 5).map(uno)) // de a 5 para no saturar a Claude
    if (key && (prospectos ?? []).length) await admin().from('chat_uso').insert({ owner_id: user.id, tokens_in: 0, tokens_out: 0 })
    const fallidos = Object.values(resultados).filter(r => r.startsWith('error')).length
    return json({ ok: true, ia: !!key, error_ia: errorIA ? `Claude no pudo escribir ${fallidos === 1 ? 'un email' : fallidos + ' emails'}. Probá de nuevo en un momento.` : undefined, resultados })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, msg === 'NO_AUTH' ? 401 : 500)
  }
})
