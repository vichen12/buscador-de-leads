// Todo lo que escribe Claude para contactar empresas: borradores, reescrituras, pasos de secuencias,
// clasificación de respuestas y respuestas sugeridas. Lo usan "generar-mensajes" (la persona) y el "trabajador".
// Regla de oro: cada dato puntual de la empresa sale de la ficha guardada; si no hay datos, se escribe en base
// al rubro, sin inventar hechos.
import { situacionHoy } from './plantillas.js'

type Dic = Record<string, any>
export type Contexto = {
  key: string, modelo: string, perfil: Dic, comercial: Dic | null, config: Dic, firmaImagen: boolean,
  adjuntos: { id: string, nombre: string, descripcion: string, siempre?: boolean }[],
}
export const TOKENS = 16000 // el modelo puede pensar antes de responder: con poco margen se queda sin espacio y no escribe nada

/** Carga lo que necesita Claude para escribir en nombre de una persona */
export async function cargarContexto(db: any, owner: string, key: string, modelo: string): Promise<Contexto> {
  const [{ data: perfil }, { data: com }, { data: archivos }] = await Promise.all([
    db.from('perfiles').select('*').eq('id', owner).single(),
    db.from('perfil_comercial').select('respuestas, estrategia').eq('owner_id', owner).maybeSingle(),
    db.from('archivos').select('id, tipo, nombre, descripcion, siempre').eq('owner_id', owner),
  ])
  return {
    key, modelo: modelo || 'claude-haiku-5-5', perfil: perfil ?? {},
    comercial: (com?.respuestas as Dic)?.que_vende || (com?.estrategia as Dic)?.resumen ? com : null,
    config: (perfil?.config_email ?? {}) as Dic,
    firmaImagen: (archivos ?? []).some((a: Dic) => a.tipo === 'firma'),
    adjuntos: (archivos ?? []).filter((a: Dic) => a.tipo === 'adjunto').map((a: Dic) => ({ id: a.id, nombre: a.nombre, descripcion: a.descripcion ?? '', siempre: !!a.siempre })),
  }
}

export const fijos = (c: Contexto) => c.adjuntos.filter(a => a.siempre)
function textoAdjuntos(c: Contexto) {
  if (!c.adjuntos.length) return ''
  const f = fijos(c), opcionales = c.adjuntos.map((a, i) => ({ ...a, n: i + 1 })).filter(a => !a.siempre)
  return `${f.length ? `\nEl email lleva SIEMPRE adjunto: ${f.map(a => `${a.nombre}${a.descripcion ? ` (${a.descripcion})` : ''}`).join('; ')}. Mencionalo con naturalidad en el cuerpo (ej. "te adjunto nuestro brochure").` : ''}${opcionales.length ? `\nOtros archivos que podés sumar si de verdad aportan para ESTE negocio (0 o 1; si lo sumás, mencionalo):
${opcionales.map(a => `[${a.n}] ${a.nombre}${a.descripcion ? ` — ${a.descripcion}` : ''}`).join('\n')}` : ''}`
}
export function reglasEmail(c: Contexto) {
  const largo = c.config.largo === 'corto' ? '50 a 90 palabras' : c.config.largo === 'largo' ? '150 a 230 palabras' : '80 a 140 palabras'
  return `- Email: asunto corto (máximo 6 palabras, sin mayúsculas sostenidas) y cuerpo de ${largo} con saludo y firma.${c.config.estructura ? `\n- Estructura que pidió la persona para el email (seguila en ese orden): ${String(c.config.estructura).slice(0, 1200)}` : ''}`
}
const oferta = (c: Contexto) => {
  const e = (c.comercial?.estrategia ?? {}) as Dic, r = (c.comercial?.respuestas ?? {}) as Dic
  return String(e.resumen || r.que_vende || 'una página web').replace(/\s+/g, ' ').slice(0, 300)
}
const guia = (c: Contexto) => {
  const t = String(((c.comercial?.respuestas ?? {}) as Dic).que_vende ?? '')
  return t.length > 400 ? t.slice(0, 14000) : ''
}
const TONO_WEB = `Reglas de tono (obligatorias):
- Español rioplatense, cercano, con "vos", natural, como lo escribiría una persona de Mendoza. Nada corporativo ni de vendedor.
- Entrá por el VALOR: algo genuino de su negocio y lo que ganarían con una web propia (que la gente los encuentre en Google y reserve o consulte sin DM).
- NUNCA por el miedo, la culpa o la urgencia falsa. No critiques su Instagram ni su negocio. No prometas resultados.
- Una sola pregunta al final, liviana y sin compromiso.`

/** Idioma del mail según el país de la empresa: portugués para Brasil, inglés para países angloparlantes */
export function idiomaDe(p: Dic) {
  const z = `${p.zona ?? ''} ${p.direccion ?? ''}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/\bbrasil\b|\bbrazil\b|sao paulo|rio de janeiro|\bcuritiba\b|porto alegre|belo horizonte/.test(z)) return 'portugués de Brasil'
  if (/estados unidos|\busa\b|united states|\bcanada\b|united kingdom|reino unido|\blondon\b|\bmiami\b|new york|\btexas\b/.test(z)) return 'inglés'
  return ''
}

export function tono(c: Contexto, p?: Dic) {
  const e = (c.comercial?.estrategia ?? {}) as Dic
  const idioma = p ? idiomaDe(p) : ''
  const reglaIdioma = idioma ? `\n- IDIOMA: escribí todo el mensaje en ${idioma} (la empresa está en ese país). La firma va tal cual.` : ''
  const reglaDatos = `
- DATOS: cada dato puntual de la empresa que uses para personalizar (lo que hacen, dónde están, una novedad) tiene que salir de la ficha de abajo. Si la ficha tiene poco, escribí en base al rubro y a problemas típicos de ese tipo de empresa, sin inventar hechos puntuales (premios, años, sucursales, clientes, cifras, nombres).`
  if (!c.comercial) return TONO_WEB + reglaDatos + reglaIdioma + (c.config.tono ? `\n- Tono que pidió la persona (manda sobre lo anterior): ${String(c.config.tono).slice(0, 400)}` : '')
  const g = guia(c)
  return `${g ? `GUÍA DE LA EMPRESA (es la regla principal: registro usted/vos, estructura, qué se puede y qué NO se puede decir, cifras permitidas. Si algo de abajo la contradice, gana la guía. Usala para entender el negocio, pero NUNCA la copies ni la resumas en el email):
<<<
${g}
>>>

` : ''}Reglas de tono:
- Español natural, como lo escribiría una persona real. Nada de frases de vendedor ni jerga exagerada.${g ? ' Usá el registro que pida la guía (si pide usted, nada de voseo).' : ' Con "vos", rioplatense.'}${e.tono && !g ? `\n- Tono pedido: ${e.tono}` : ''}
- Entrá por el VALOR para ESE negocio: algo genuino de lo que hacen y cómo lo que ofrecemos les sirve a ellos.${e.angulo ? `\n- Ángulo de entrada recomendado: ${e.angulo}` : ''}
- NUNCA por el miedo, la culpa o la urgencia falsa. No critiques su negocio. No prometas resultados.
- Un solo paso siguiente al final, liviano y sin compromiso.
- Frases cortas y bien escritas, sin repetir ideas. Hablá de ELLOS (su rubro, su problema probable) antes que de nosotros.${reglaDatos}${reglaIdioma}${c.config.tono ? `\n- Tono que pidió la persona (manda sobre lo anterior): ${String(c.config.tono).slice(0, 400)}` : ''}`
}

export function ficha(c: Contexto, p: Dic, contacto?: Dic | null) {
  const perfil = c.perfil
  return `Negocio (todo lo que sabemos; cada línea es un dato guardado):
- Nombre: ${p.nombre}
- Rubro: ${p.rubro || 's/d'}
- Zona: ${p.zona || p.direccion || 's/d'}
${p.direccion ? `- Dirección: ${p.direccion}\n` : ''}- Instagram: ${p.instagram || 'no informado'}
${c.comercial ? `- Web o presencia online: ${p.web_actual || p.que_tiene_hoy || 's/d'}` : `- Qué tiene hoy en lugar de web: ${p.que_tiene_hoy || 'no tiene web'} (${situacionHoy(String(p.que_tiene_hoy || ''))})`}
${p.encaje ? `- Por qué es buen prospecto (de la búsqueda): ${p.encaje}` : ''}
${p.senales ? `- Novedades recientes: ${p.senales}` : ''}
- Reseñas en Google: ${p.resenas ?? 's/d'} (puntaje ${p.rating ?? 's/d'})
- Notas del vendedor: ${p.notas || '—'}
${contacto?.nombre ? `- A quién le escribimos: ${contacto.nombre}${contacto.cargo ? ` (${contacto.cargo})` : ''}. Saludalo por su nombre.` : '- No tenemos el nombre de una persona: usá un saludo general para la empresa.'}

Quien escribe: ${perfil.nombre || '[tu nombre]'}, de ${(c.comercial?.respuestas as Dic)?.empresa || perfil.estudio || '[tu empresa]'}${c.comercial ? `. Qué ofrecemos: ${oferta(c)}${(c.comercial.respuestas as Dic)?.diferencial ? `. Diferencial: ${(c.comercial.respuestas as Dic).diferencial}` : ''}` : ' (estudio de diseño web)'}.
Firma de email (cerrá el email con esta firma, tal cual): ${perfil.firma || perfil.nombre || ''}${c.firmaImagen ? `\nDebajo de la firma el email lleva sola una imagen (logo): no la menciones.` : ''}${textoAdjuntos(c)}
${perfil.portfolio_url ? `Portfolio (mencionalo sólo si suma): ${perfil.portfolio_url}` : ''}
${perfil.instrucciones_ia ? `Indicaciones del usuario para todos sus mensajes: ${perfil.instrucciones_ia}` : ''}`
}

export async function claude(c: Contexto, prompt: string, maxTokens = TOKENS): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: c.modelo, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
  })
  if (!r.ok) throw new Error(`IA ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const data = await r.json()
  const texto = data.content?.map((x: { text?: string }) => x.text ?? '').join('') ?? ''
  if (!texto.includes('{')) console.error('IA sin JSON', data.stop_reason, texto.slice(0, 300))
  return texto
}

// Lee el JSON aunque la IA ponga saltos de línea crudos dentro de los textos o lo envuelva en ```json
export function extraerJSON(texto: string) {
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

const PERSONALIZADO = `"personalizado": [{"frase": "frase EXACTA del email que usa un dato de la ficha", "dato": "qué dato usaste", "fuente": "de qué línea de la ficha sale (ej. Rubro, Por qué es buen prospecto, Notas)"}]`
const limpiarPers = (v: unknown) => (Array.isArray(v) ? v : []).map((x: Dic) => ({ frase: String(x?.frase ?? '').slice(0, 300), dato: String(x?.dato ?? '').slice(0, 200), fuente: String(x?.fuente ?? '').slice(0, 120) })).filter(x => x.frase).slice(0, 6)

/** Los tres borradores de primer contacto (WhatsApp, email y seguimiento) */
export async function borradores(c: Contexto, p: Dic, contacto?: Dic | null) {
  const prompt = `Escribí borradores para contactar a UN negocio${c.comercial ? '' : ' y ofrecerle una página web'}. Los revisa y envía una persona.

${ficha(c, p, contacto)}

${tono(c, p)}
- WhatsApp: 3 a 5 oraciones, máximo 600 caracteres, sin emojis o como mucho uno.
${reglasEmail(c)}
- Seguimiento (para quien no respondió en unos días): 1 a 3 oraciones, amable, ofrece algo concreto y deja la puerta abierta a decir que no.

Respondé SOLO con JSON válido, sin texto antes ni después:
{"whatsapp": "...", "email": {"asunto": "...", "cuerpo": "..."${c.adjuntos.length ? ', "adjuntos": [números de los archivos que adjuntás, o vacío]' : ''}}, "seguimiento": "...", ${PERSONALIZADO}}`
  const b = extraerJSON(await claude(c, prompt))
  if (!b.whatsapp || !b.email?.cuerpo || !b.seguimiento) throw new Error('JSON incompleto')
  const nums = Array.isArray(b.email.adjuntos) ? b.email.adjuntos : []
  b.email.adjuntos = [...new Set([...fijos(c).map(a => a.id), ...nums.map((n: unknown) => c.adjuntos[Number(n) - 1]?.id).filter(Boolean)])].slice(0, 4)
  b.personalizado = limpiarPers(b.personalizado)
  return b as { whatsapp: string, email: { asunto: string, cuerpo: string, adjuntos: string[] }, seguimiento: string, personalizado: Dic[] }
}

export async function reescribir(c: Contexto, p: Dic, tipo: string, cuerpo: string, asunto: string, instruccion: string) {
  const canal = tipo === 'email' || tipo === 'respuesta' ? 'un email' : tipo === 'seguimiento' ? 'un mensaje de seguimiento' : 'un mensaje de WhatsApp'
  const prompt = `Reescribí ${canal} para un negocio, siguiendo la indicación de la persona que lo va a enviar.

${ficha(c, p)}

Texto actual:
"""
${(tipo === 'email' || tipo === 'respuesta') && asunto ? `Asunto: ${asunto}\n` : ''}${cuerpo}
"""

Indicación: ${instruccion}

${tono(c, p)}
- Mantené lo que esté bien y cambiá sólo lo que pide la indicación.
${tipo === 'email' || tipo === 'respuesta' ? '- Devolvé también el asunto.' : '- Máximo 600 caracteres.'}

Respondé SOLO con JSON válido: {"cuerpo": "..."${tipo === 'email' || tipo === 'respuesta' ? ', "asunto": "..."' : ''}}`
  const r = extraerJSON(await claude(c, prompt))
  if (!r.cuerpo) throw new Error('La IA no devolvió el texto')
  return { cuerpo: String(r.cuerpo), asunto: r.asunto ? String(r.asunto) : asunto }
}

const LIMITES_CANAL: Record<string, string> = {
  whatsapp: 'WhatsApp: 1 a 3 oraciones, máximo 400 caracteres, cercano.',
  linkedin_conexion: 'Nota de solicitud de conexión de LinkedIn: máximo 280 caracteres (límite de LinkedIn), sin vender, sólo motivo para conectar.',
  linkedin_mensaje: 'Mensaje de LinkedIn: máximo 600 caracteres, conversacional.',
  linkedin_visita: 'Nota interna corta para la persona: qué mirar del perfil antes de escribir (máximo 200 caracteres).',
  llamada: 'Guion corto para la llamada: apertura en una frase, una pregunta para descubrir necesidad y el pedido concreto (máximo 500 caracteres).',
}

/** Un paso de una secuencia: mail de seguimiento en el mismo hilo, o el texto de una tarea (WhatsApp, LinkedIn, llamada) */
export async function pasoSecuencia(c: Contexto, p: Dic, paso: Dic, o: { numero: number, total: number, historial: string, asuntoHilo?: string, contacto?: Dic | null }) {
  const esEmail = paso.tipo === 'email'
  const prompt = `Escribí el paso ${o.numero + 1} de ${o.total} de una secuencia de contacto a un negocio que todavía NO respondió.
Qué tiene que hacer este paso: ${paso.indicacion || (o.numero === 0 ? 'Primer contacto.' : 'Seguimiento.')}

${ficha(c, p, o.contacto)}

Lo que ya le mandamos (no repitas lo mismo, usá otro ángulo):
${o.historial || '(nada todavía: es el primer contacto)'}

${tono(c, p)}
${esEmail ? `${o.numero === 0 ? reglasEmail(c) : '- Email de seguimiento: va en el mismo hilo que el anterior, 40 a 90 palabras, con saludo y la firma. Sin reproches por no haber respondido.'}` : `- ${LIMITES_CANAL[paso.tipo] ?? LIMITES_CANAL.whatsapp}`}

Respondé SOLO con JSON válido: {${esEmail ? '"asunto": "...", ' : ''}"cuerpo": "..."}`
  const r = extraerJSON(await claude(c, prompt))
  if (!r.cuerpo) throw new Error('La IA no devolvió el texto')
  return { asunto: esEmail ? (o.numero > 0 && o.asuntoHilo ? `Re: ${o.asuntoHilo.replace(/^(re:\s*)+/i, '')}` : String(r.asunto || 'Hola')) : '', cuerpo: String(r.cuerpo) }
}

/** Reemplaza las variables de una plantilla: {{nombre}}, {{empresa}}, {{rubro}}, {{zona}}, {{mi_nombre}}, {{mi_empresa}}, {{link_agenda}} */
export function aplicarPlantilla(texto: string, p: Dic, c: Contexto, contacto?: Dic | null) {
  const v: Record<string, string> = {
    nombre: contacto?.nombre?.split(' ')[0] || '', empresa: p.nombre ?? '', rubro: p.rubro ?? '', zona: p.zona ?? '',
    mi_nombre: c.perfil.nombre ?? '', mi_empresa: (c.comercial?.respuestas as Dic)?.empresa || c.perfil.estudio || '',
    link_agenda: c.perfil.link_agenda ?? '', firma: c.perfil.firma ?? '',
  }
  return String(texto ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => v[k] ?? '').replace(/Hola ,/g, 'Hola,').replace(/[ \t]{2,}/g, ' ')
}

/** Clasifica una respuesta recibida por mail */
export async function clasificarRespuesta(c: Contexto, texto: string, asunto: string, p: Dic) {
  const hoy = new Date().toISOString().slice(0, 10)
  const prompt = `Clasificá la respuesta que mandó una empresa (${p.nombre}) a un mail comercial de prospección. Hoy es ${hoy}.

Asunto: ${asunto}
Respuesta:
"""
${texto.slice(0, 4000)}
"""

Clases posibles:
- interesado: muestra interés o ganas de seguir.
- pide_info: pide precio, catálogo, más información o condiciones.
- reunion: propone o acepta una reunión o llamada, o pasa un horario.
- no_interesado: dice que no le interesa, que ya tiene proveedor, que no es el momento.
- derivar: te deriva a otra persona (si da nombre, cargo o email, extraelos).
- fuera_oficina: respuesta automática de ausencia o vacaciones (si dice la fecha de vuelta, extraela en formato AAAA-MM-DD).
- baja: pide que no le escriban más.
- otro: cualquier otra cosa.

Respondé SOLO con JSON válido:
{"clasificacion": "...", "motivo": "por qué, en una frase corta en español", "resumen": "qué dijo, en una frase", "contacto": {"nombre": "", "cargo": "", "email": ""} o null, "vuelve": "AAAA-MM-DD" o null}`
  const r = extraerJSON(await claude(c, prompt, 6000))
  const validas = ['interesado', 'pide_info', 'reunion', 'no_interesado', 'derivar', 'fuera_oficina', 'baja', 'otro']
  return {
    clasificacion: validas.includes(r.clasificacion) ? r.clasificacion : 'otro',
    motivo: String(r.motivo ?? '').slice(0, 300), resumen: String(r.resumen ?? '').slice(0, 300),
    contacto: r.contacto?.email || r.contacto?.nombre ? { nombre: String(r.contacto.nombre ?? ''), cargo: String(r.contacto.cargo ?? ''), email: String(r.contacto.email ?? '').toLowerCase() } : null,
    vuelve: /^\d{4}-\d{2}-\d{2}$/.test(String(r.vuelve ?? '')) ? r.vuelve : null,
  }
}

/** Borrador de respuesta a lo que dijo el prospecto */
export async function responder(c: Contexto, p: Dic, r: Dic, historial: string) {
  const prompt = `Una empresa respondió a nuestro mail. Escribí la respuesta que le mandaríamos, para que la persona la revise.

${ficha(c, p)}

Conversación hasta ahora:
${historial || '(sin historial)'}

Lo que respondió (${r.clasificacion ?? 'respuesta'}):
Asunto: ${r.asunto}
"""
${String(r.texto ?? '').slice(0, 4000)}
"""

${tono(c, p)}
- Respondé exactamente lo que pregunta o propone. Si pide precio o información que no está en la ficha ni en lo que ofrecemos, no la inventes: dejá un [COMPLETAR: qué falta] para que la persona lo complete.
- Si propone reunión, confirmá y proponé dos horarios concretos en días hábiles${c.perfil.link_agenda ? ` o pasale el link para agendar: ${c.perfil.link_agenda}` : ''}.
- 40 a 120 palabras, con saludo y la firma.

Respondé SOLO con JSON válido: {"asunto": "Re: ...", "cuerpo": "..."}`
  const x = extraerJSON(await claude(c, prompt))
  if (!x.cuerpo) throw new Error('La IA no devolvió el texto')
  return { asunto: String(x.asunto || `Re: ${String(r.asunto ?? '').replace(/^(re:\s*)+/i, '')}`), cuerpo: String(x.cuerpo) }
}
