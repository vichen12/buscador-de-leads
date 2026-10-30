// Borradores con Claude para prospectos. Tres modos:
//   { modo: 'estado' }                         → qué está configurado (IA, Google Places)
//   { prospecto_ids: [...], forzar? }          → genera WhatsApp + Email + Seguimiento y los guarda
//   { modo: 'reescribir', prospecto_id, tipo, cuerpo, asunto?, instruccion }
//                                              → devuelve una versión nueva (NO guarda: la persona revisa)
// Nunca envía nada. Sin ANTHROPIC_API_KEY usa plantillas variadas.
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { borradoresPlantilla, situacionHoy, nombreCorto } from '../_shared/plantillas.js'

let MODELO = 'claude-haiku-5-5'
const MAX_POR_LLAMADA = 25
const TOKENS = 16000 // el modelo puede pensar antes de responder: con poco margen se queda sin espacio y no escribe nada

type Borradores = { whatsapp: string; email: { asunto: string; cuerpo: string; adjuntos?: string[] }; seguimiento: string }
type Dic = Record<string, unknown>

const TONO_WEB = `Reglas de tono (obligatorias):
- Español rioplatense, cercano, con "vos", natural, como lo escribiría una persona de Mendoza. Nada corporativo ni de vendedor.
- Entrá por el VALOR: algo genuino de su negocio o su Instagram ("te vi el IG, está buenísimo") y lo que ganarían con una web propia (que la gente los encuentre en Google y reserve o consulte sin DM).
- NUNCA por el miedo, la culpa o la urgencia falsa. No critiques su Instagram ni su negocio. No prometas resultados.
- Una sola pregunta al final, liviana y sin compromiso (mostrar un boceto o una idea).
- No inventes datos que no estén en la ficha (premios, años, seguidores, precios).`

// Perfil comercial del usuario (qué vende y a quién). Si no lo completó, se asume un estudio de diseño web.
let COMERCIAL: Dic | null = null
// Archivos del usuario: los que se pueden adjuntar (con su descripción) y si tiene firma con imagen
let ADJUNTOS: { id: string, nombre: string, descripcion: string, siempre?: boolean }[] = []
// Cómo quiere la persona sus emails: { tono, largo: 'corto'|'medio'|'largo', estructura }
let CONFIG: Dic = {}
const fijos = () => ADJUNTOS.filter(a => a.siempre)
let FIRMA_IMAGEN = false
function textoAdjuntos() {
  if (!ADJUNTOS.length) return ''
  const f = fijos(), opcionales = ADJUNTOS.map((a, i) => ({ ...a, n: i + 1 })).filter(a => !a.siempre)
  return `${f.length ? `\nEl email lleva SIEMPRE adjunto: ${f.map(a => `${a.nombre}${a.descripcion ? ` (${a.descripcion})` : ''}`).join('; ')}. Mencionalo con naturalidad en el cuerpo (ej. "te adjunto nuestro brochure").` : ''}${opcionales.length ? `\nOtros archivos que podés sumar si de verdad aportan para ESTE negocio (0 o 1; si lo sumás, mencionalo):
${opcionales.map(a => `[${a.n}] ${a.nombre}${a.descripcion ? ` — ${a.descripcion}` : ''}`).join('\n')}` : ''}`
}
function reglasEmail() {
  const largo = CONFIG.largo === 'corto' ? '50 a 90 palabras' : CONFIG.largo === 'largo' ? '150 a 230 palabras' : '80 a 140 palabras'
  return `- Email: asunto corto (máximo 6 palabras, sin mayúsculas sostenidas) y cuerpo de ${largo} con saludo y firma.${CONFIG.estructura ? `\n- Estructura que pidió la persona para el email (seguila en ese orden): ${String(CONFIG.estructura).slice(0, 1200)}` : ''}`
}
// Lo que vende, en corto (el resumen de la estrategia; si no hay, el comienzo de lo que contó)
const oferta = () => {
  const e = (COMERCIAL?.estrategia ?? {}) as Dic, r = (COMERCIAL?.respuestas ?? {}) as Dic
  return String(e.resumen || r.que_vende || 'una página web').replace(/\s+/g, ' ').slice(0, 300)
}
// Si la persona pegó un documento largo (brief, manual de estilo), es la guía de la empresa: manda sobre todo
const guia = () => {
  const t = String(((COMERCIAL?.respuestas ?? {}) as Dic).que_vende ?? '')
  return t.length > 400 ? t.slice(0, 14000) : ''
}
function tono() {
  const e = (COMERCIAL?.estrategia ?? {}) as Dic
  if (!COMERCIAL) return TONO_WEB + (CONFIG.tono ? `\n- Tono que pidió la persona (manda sobre lo anterior): ${String(CONFIG.tono).slice(0, 400)}` : '')
  const g = guia()
  return `${g ? `GUÍA DE LA EMPRESA (es la regla principal: registro usted/vos, estructura, qué se puede y qué NO se puede decir, cifras permitidas. Si algo de abajo la contradice, gana la guía. Usala para entender el negocio, pero NUNCA la copies ni la resumas en el email):
<<<
${g}
>>>

` : ''}Reglas de tono:
- Español natural, como lo escribiría una persona real. Nada de frases de vendedor ni jerga exagerada.${g ? ' Usá el registro que pida la guía (si pide usted, nada de voseo).' : ' Con "vos", rioplatense.'}${e.tono && !g ? `\n- Tono pedido: ${e.tono}` : ''}
- Entrá por el VALOR para ESE negocio: algo genuino de lo que hacen y cómo lo que ofrecemos les sirve a ellos.${e.angulo ? `\n- Ángulo de entrada recomendado: ${e.angulo}` : ''}
- NUNCA por el miedo, la culpa o la urgencia falsa. No critiques su negocio. No prometas resultados.
- Un solo paso siguiente al final, liviano y sin compromiso.
- Frases cortas y bien escritas, sin repetir ideas. Hablá de ELLOS (su rubro, su problema probable) antes que de nosotros.
- No inventes datos que no estén en la ficha (premios, años, precios, clientes).${CONFIG.tono ? `\n- Tono que pidió la persona (manda sobre lo anterior): ${String(CONFIG.tono).slice(0, 400)}` : ''}`
}

function ficha(p: Dic, perfil: Dic) {
  return `Negocio:
- Nombre: ${p.nombre}
- Rubro: ${p.rubro || 's/d'}
- Zona: ${p.zona || p.direccion || 'Mendoza'}
- Instagram: ${p.instagram || 'no informado'}
${COMERCIAL ? `- Web o presencia online: ${p.web_actual || p.que_tiene_hoy || 's/d'}` : `- Qué tiene hoy en lugar de web: ${p.que_tiene_hoy || 'no tiene web'} (${situacionHoy(String(p.que_tiene_hoy || ''))})`}
${p.encaje ? `- Por qué es buen prospecto: ${p.encaje}` : ''}
- Reseñas en Google: ${p.resenas ?? 's/d'} (puntaje ${p.rating ?? 's/d'})
- Notas del vendedor: ${p.notas || '—'}

Quien escribe: ${perfil.nombre || '[tu nombre]'}, de ${(COMERCIAL?.respuestas as Dic)?.empresa || perfil.estudio || '[tu empresa]'}${COMERCIAL ? `. Qué ofrecemos: ${oferta()}${(COMERCIAL.respuestas as Dic)?.diferencial ? `. Diferencial: ${(COMERCIAL.respuestas as Dic).diferencial}` : ''}` : ' (estudio de diseño web de Mendoza)'}.
Firma de email (cerrá el email con esta firma, tal cual): ${perfil.firma || perfil.nombre || ''}${FIRMA_IMAGEN ? `\nDebajo de la firma el email lleva sola una imagen (logo): no la menciones.` : ''}${textoAdjuntos()}
${perfil.portfolio_url ? `Portfolio (mencionalo sólo si suma): ${perfil.portfolio_url}` : ''}
${perfil.instrucciones_ia ? `Indicaciones del usuario para todos sus mensajes: ${perfil.instrucciones_ia}` : ''}`
}

async function claude(key: string, prompt: string, maxTokens = TOKENS): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const data = await r.json()
  const texto = data.content?.map((c: { text?: string }) => c.text ?? '').join('') ?? ''
  if (!texto.includes('{')) console.error('IA sin JSON', data.stop_reason, JSON.stringify((data.content ?? []).map((c: Dic) => c.type)), texto.slice(0, 300))
  return texto
}

// Lee el JSON aunque la IA ponga saltos de línea crudos dentro de los textos o lo envuelva en ```json
function extraerJSON(texto: string) {
  const m = (texto.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? texto).match(/\{[\s\S]*\}/)
  if (!m) throw new Error('La IA no devolvió JSON')
  try { return JSON.parse(m[0]) } catch { /* sigue abajo */ }
  let out = '', enTexto = false, escape = false
  for (const ch of m[0]) {
    if (enTexto && !escape && ch === '\n') { out += '\\n'; continue }
    if (enTexto && !escape && ch === '\r') continue
    if (enTexto && !escape && ch === '\t') { out += '\\t'; continue }
    if (ch === '"' && !escape) enTexto = !enTexto
    escape = ch === '\\' && !escape
    out += ch
  }
  return JSON.parse(out.replace(/,\s*([}\]])/g, '$1'))
}

async function generarConIA(p: Dic, perfil: Dic, key: string): Promise<Borradores> {
  const prompt = `Escribí borradores para contactar a UN negocio${COMERCIAL ? '' : ' y ofrecerle una página web'}. Los revisa y envía una persona.

${ficha(p, perfil)}

${tono()}
- WhatsApp: 3 a 5 oraciones, máximo 600 caracteres, sin emojis o como mucho uno.
${reglasEmail()}
- Seguimiento (para quien no respondió en unos días): 1 a 3 oraciones, amable, ofrece algo concreto y deja la puerta abierta a decir que no.

Respondé SOLO con JSON válido, sin texto antes ni después:
{"whatsapp": "...", "email": {"asunto": "...", "cuerpo": "..."${ADJUNTOS.length ? ', "adjuntos": [números de los archivos que adjuntás, o vacío]' : ''}}, "seguimiento": "..."}`
  const b = extraerJSON(await claude(key, prompt))
  if (!b.whatsapp || !b.email?.cuerpo || !b.seguimiento) throw new Error('JSON incompleto')
  const nums = Array.isArray(b.email.adjuntos) ? b.email.adjuntos : []
  b.email.adjuntos = [...new Set([...fijos().map(a => a.id), ...nums.map((n: unknown) => ADJUNTOS[Number(n) - 1]?.id).filter(Boolean)])].slice(0, 4)
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

${tono()}
- Mantené lo que esté bien y cambiá sólo lo que pide la indicación.
${tipo === 'email' ? '- Devolvé también el asunto.' : '- Máximo 600 caracteres.'}

Respondé SOLO con JSON válido: {"cuerpo": "..."${tipo === 'email' ? ', "asunto": "..."' : ''}}`
  const r = extraerJSON(await claude(key, prompt))
  if (!r.cuerpo) throw new Error('La IA no devolvió el texto')
  return { cuerpo: String(r.cuerpo), asunto: r.asunto ? String(r.asunto) : asunto }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { supabase, user } = await clienteDelUsuario(req)
    const body = await req.json()
    const [key, modelo, places] = await Promise.all([claveServicio('anthropic'), claveServicio('modelo_ia'), claveServicio('google_places')])
    MODELO = modelo || 'claude-haiku-5-5'

    if (body.modo === 'estado') {
      return json({ ia: !!key, modelo: key ? MODELO : null, places: !!places })
    }

    const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', user.id).single()
    const { data: com } = await supabase.from('perfil_comercial').select('respuestas, estrategia').eq('owner_id', user.id).maybeSingle()
    COMERCIAL = (com?.respuestas as Dic)?.que_vende ? com : null
    const { data: archivos } = await supabase.from('archivos').select('id, tipo, nombre, descripcion, siempre').eq('owner_id', user.id)
    ADJUNTOS = (archivos ?? []).filter(a => a.tipo === 'adjunto').map(a => ({ id: a.id, nombre: a.nombre, descripcion: a.descripcion, siempre: !!a.siempre }))
    CONFIG = ((perfil as Dic)?.config_email ?? {}) as Dic
    FIRMA_IMAGEN = (archivos ?? []).some(a => a.tipo === 'firma')

    if (body.modo === 'reescribir') {
      const { prospecto_id, tipo = 'whatsapp', cuerpo = '', asunto = '', instruccion = '' } = body
      if (!key) return json({ error: 'Para reescribir con Claude falta cargar la clave de Claude (Super admin → Claves, o ANTHROPIC_API_KEY en Supabase).' }, 400)
      if (!instruccion.trim()) return json({ error: 'Escribí qué querés cambiar' }, 400)
      const { data: p, error } = await supabase.from('prospectos').select('*').eq('id', prospecto_id).single()
      if (error || !p) return json({ error: 'Prospecto no encontrado' }, 404)
      if (p.estado === 'no_interesado') return json({ error: 'Este negocio pidió no ser contactado' }, 400)
      return json({ ok: true, ...(await reescribirConIA(p, perfil ?? {}, key, tipo, cuerpo, asunto, instruccion.slice(0, 500))) })
    }

    const { prospecto_ids, forzar = false, solo_email = false } = body
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
        catch (e) {
          errorIA = e instanceof Error ? e.message : String(e); console.error(e)
          if (COMERCIAL) { resultados[p.id] = 'error: ' + errorIA; continue } // mejor sin borrador que uno malo
          b = borradoresPlantilla(p, perfil ?? {})
        }
      } else {
        if (COMERCIAL) { resultados[p.id] = 'error: falta la clave de Claude'; continue }
        b = borradoresPlantilla(p, perfil ?? {})
      }

      if (!b.email.adjuntos?.length) b.email.adjuntos = fijos().map(a => a.id)
      const filas = [
        { tipo: 'whatsapp', asunto: '', cuerpo: b.whatsapp, adjuntos: [] as string[] },
        { tipo: 'email', asunto: b.email.asunto, cuerpo: b.email.cuerpo, adjuntos: b.email.adjuntos ?? [] },
        { tipo: 'seguimiento', asunto: `Re: ${b.email.asunto || nombreCorto(p.nombre)}`, cuerpo: b.seguimiento, adjuntos: [] as string[] },
      ].filter(f => solo_email ? f.tipo === 'email' && !editados.has('email') : (forzar || !editados.has(f.tipo)))
        .map(f => ({ ...f, prospecto_id: p.id, owner_id: user.id, generado_por: origen, editado: false }))

      const { error: e2 } = await supabase.from('mensajes').upsert(filas, { onConflict: 'prospecto_id,tipo' })
      resultados[p.id] = e2 ? 'error: ' + e2.message : `${origen} (${filas.length})`
    }
    const fallidos = Object.values(resultados).filter(r => r.startsWith('error')).length
    return json({ ok: true, ia: !!key, error_ia: errorIA ? `Claude no pudo escribir ${fallidos === 1 ? 'un email' : fallidos + ' emails'}. Probá de nuevo en un momento.` : undefined, resultados })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ error: msg }, msg === 'NO_AUTH' ? 401 : 500)
  }
})
