// Borradores con Claude para prospectos. Tres modos:
//   { modo: 'estado' }                         → qué está configurado (IA, Google Places)
//   { prospecto_ids: [...], forzar? }          → genera WhatsApp + Email + Seguimiento y los guarda
//   { modo: 'reescribir', prospecto_id, tipo, cuerpo, asunto?, instruccion }
//                                              → devuelve una versión nueva (NO guarda: la persona revisa)
// Nunca envía nada. Sin ANTHROPIC_API_KEY usa plantillas variadas.
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { borradoresPlantilla, situacionHoy, nombreCorto } from '../_shared/plantillas.js'

let MODELO = 'claude-sonnet-5-5'
const MAX_POR_LLAMADA = 25

type Borradores = { whatsapp: string; email: { asunto: string; cuerpo: string }; seguimiento: string }
type Dic = Record<string, unknown>

const TONO = `Reglas de tono (obligatorias):
- Español rioplatense, cercano, con "vos", natural, como lo escribiría una persona de Mendoza. Nada corporativo ni de vendedor.
- Entrá por el VALOR: algo genuino de su negocio o su Instagram ("te vi el IG, está buenísimo") y lo que ganarían con una web propia (que la gente los encuentre en Google y reserve o consulte sin DM).
- NUNCA por el miedo, la culpa o la urgencia falsa. No critiques su Instagram ni su negocio. No prometas resultados.
- Una sola pregunta al final, liviana y sin compromiso (mostrar un boceto o una idea).
- No inventes datos que no estén en la ficha (premios, años, seguidores, precios).`

function ficha(p: Dic, perfil: Dic) {
  return `Negocio:
- Nombre: ${p.nombre}
- Rubro: ${p.rubro || 's/d'}
- Zona: ${p.zona || p.direccion || 'Mendoza'}
- Instagram: ${p.instagram || 'no informado'}
- Qué tiene hoy en lugar de web: ${p.que_tiene_hoy || 'no tiene web'} (${situacionHoy(String(p.que_tiene_hoy || ''))})
- Reseñas en Google: ${p.resenas ?? 's/d'} (puntaje ${p.rating ?? 's/d'})
- Notas del vendedor: ${p.notas || '—'}

Quien escribe: ${perfil.nombre || '[tu nombre]'}, de ${perfil.estudio || '[tu estudio]'} (estudio de diseño web de Mendoza).
Firma de email: ${perfil.firma || perfil.nombre || ''}
${perfil.portfolio_url ? `Portfolio (mencionalo sólo si suma): ${perfil.portfolio_url}` : ''}
${perfil.instrucciones_ia ? `Indicaciones del usuario para todos sus mensajes: ${perfil.instrucciones_ia}` : ''}`
}

async function claude(key: string, prompt: string, maxTokens = 1200): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const data = await r.json()
  return data.content?.map((c: { text?: string }) => c.text ?? '').join('') ?? ''
}

function extraerJSON(texto: string) {
  const m = texto.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('La IA no devolvió JSON')
  return JSON.parse(m[0])
}

async function generarConIA(p: Dic, perfil: Dic, key: string): Promise<Borradores> {
  const prompt = `Escribí borradores para contactar a UN negocio y ofrecerle una página web. Los revisa y envía una persona, a mano.

${ficha(p, perfil)}

${TONO}
- WhatsApp: 3 a 5 oraciones, máximo 600 caracteres, sin emojis o como mucho uno.
- Email: asunto corto (máximo 6 palabras, sin mayúsculas sostenidas) y cuerpo de 80 a 140 palabras con saludo y firma.
- Seguimiento (para quien no respondió en unos días): 1 a 3 oraciones, amable, ofrece algo concreto y deja la puerta abierta a decir que no.

Respondé SOLO con JSON válido, sin texto antes ni después:
{"whatsapp": "...", "email": {"asunto": "...", "cuerpo": "..."}, "seguimiento": "..."}`
  const b = extraerJSON(await claude(key, prompt))
  if (!b.whatsapp || !b.email?.cuerpo || !b.seguimiento) throw new Error('JSON incompleto')
  return b
}

async function reescribirConIA(p: Dic, perfil: Dic, key: string, tipo: string, cuerpo: string, asunto: string, instruccion: string) {
  const canal = tipo === 'email' ? 'un email' : tipo === 'seguimiento' ? 'un mensaje de seguimiento' : 'un mensaje de WhatsApp'
  const prompt = `Reescribí ${canal} para un negocio, siguiendo la indicación de la persona que lo va a enviar.

${ficha(p, perfil)}

Texto actual:
"""
${tipo === 'email' && asunto ? `Asunto: ${asunto}\n` : ''}${cuerpo}
"""

Indicación: ${instruccion}

${TONO}
- Mantené lo que esté bien y cambiá sólo lo que pide la indicación.
${tipo === 'email' ? '- Devolvé también el asunto.' : '- Máximo 600 caracteres.'}

Respondé SOLO con JSON válido: {"cuerpo": "..."${tipo === 'email' ? ', "asunto": "..."' : ''}}`
  const r = extraerJSON(await claude(key, prompt, 900))
  if (!r.cuerpo) throw new Error('La IA no devolvió el texto')
  return { cuerpo: String(r.cuerpo), asunto: r.asunto ? String(r.asunto) : asunto }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { supabase, user } = await clienteDelUsuario(req)
    const body = await req.json()
    const [key, modelo, places] = await Promise.all([claveServicio('anthropic'), claveServicio('modelo_ia'), claveServicio('google_places')])
    MODELO = modelo || 'claude-sonnet-5-5'

    if (body.modo === 'estado') {
      return json({ ia: !!key, modelo: key ? MODELO : null, places: !!places })
    }

    const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', user.id).single()

    if (body.modo === 'reescribir') {
      const { prospecto_id, tipo = 'whatsapp', cuerpo = '', asunto = '', instruccion = '' } = body
      if (!key) return json({ error: 'Para reescribir con Claude falta cargar la clave de Claude (Super admin → Claves, o ANTHROPIC_API_KEY en Supabase).' }, 400)
      if (!instruccion.trim()) return json({ error: 'Escribí qué querés cambiar' }, 400)
      const { data: p, error } = await supabase.from('prospectos').select('*').eq('id', prospecto_id).single()
      if (error || !p) return json({ error: 'Prospecto no encontrado' }, 404)
      if (p.estado === 'no_interesado') return json({ error: 'Este negocio pidió no ser contactado' }, 400)
      return json({ ok: true, ...(await reescribirConIA(p, perfil ?? {}, key, tipo, cuerpo, asunto, instruccion.slice(0, 500))) })
    }

    const { prospecto_ids, forzar = false } = body
    if (!Array.isArray(prospecto_ids) || prospecto_ids.length === 0) return json({ error: 'Falta prospecto_ids' }, 400)
    if (prospecto_ids.length > MAX_POR_LLAMADA) return json({ error: `Máximo ${MAX_POR_LLAMADA} por vez` }, 400)

    const { data: prospectos, error } = await supabase.from('prospectos').select('*').in('id', prospecto_ids)
    if (error) throw error

    const resultados: Record<string, string> = {}
    let errorIA = ''
    for (const p of prospectos ?? []) {
      if (p.estado === 'no_interesado') { resultados[p.id] = 'omitido: no interesado'; continue }
      const { data: existentes } = await supabase.from('mensajes').select('tipo, editado').eq('prospecto_id', p.id)
      const editados = new Set((existentes ?? []).filter(m => m.editado).map(m => m.tipo))

      let b: Borradores
      let origen = 'plantilla'
      if (key) {
        try { b = await generarConIA(p, perfil ?? {}, key); origen = 'ia' }
        catch (e) { errorIA = e instanceof Error ? e.message : String(e); console.error(e); b = borradoresPlantilla(p, perfil ?? {}) }
      } else {
        b = borradoresPlantilla(p, perfil ?? {})
      }

      const filas = [
        { tipo: 'whatsapp', asunto: '', cuerpo: b.whatsapp },
        { tipo: 'email', asunto: b.email.asunto, cuerpo: b.email.cuerpo },
        { tipo: 'seguimiento', asunto: `Re: ${b.email.asunto || nombreCorto(p.nombre)}`, cuerpo: b.seguimiento },
      ].filter(f => forzar || !editados.has(f.tipo))
        .map(f => ({ ...f, prospecto_id: p.id, owner_id: user.id, generado_por: origen, editado: false }))

      const { error: e2 } = await supabase.from('mensajes').upsert(filas, { onConflict: 'prospecto_id,tipo' })
      resultados[p.id] = e2 ? 'error: ' + e2.message : `${origen} (${filas.length})`
    }
    return json({ ok: true, ia: !!key, error_ia: errorIA || undefined, resultados })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, msg === 'NO_AUTH' ? 401 : 500)
  }
})
