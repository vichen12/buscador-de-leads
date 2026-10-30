// Busca negocios por rubro + zona con Claude y búsqueda web (fuentes públicas).
// Corre varias búsquedas en paralelo, cada una con un enfoque distinto (fichas de Google, redes,
// directorios, barrios), junta y deduplica los resultados y los deja en la bandeja "Por revisar"
// (tabla hallazgos) del usuario. Antes de buscar, Claude interpreta el pedido (qué entra y qué NO) y
// al final revisa los resultados contra esa interpretación. Nunca trae empresas que el usuario o su
// equipo ya tienen o descartaron. Usa el perfil comercial (qué vende y a quién), sirve para cualquier negocio.
// Cada búsqueda descuenta 1 del cupo de IA (diario del usuario y mensual de su empresa). Interpretar no descuenta.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { clasificarWeb, instagramDe, normalizarTelefono } from '../_shared/clasificar.js'

type Dic = Record<string, any>
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const clave = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

// Lo que busca puede ser un rubro ("barbería") o una descripción libre ("empresas grandes con depósito", "locales que venden iPhone")
const ENFOQUES = [
  { nombre: 'mapas', texto: (r: string, z: string) => `Enfoque: Google Maps y fichas de negocios. Buscá cada término útil + "${z}" (ej. "${r} ${z}").` },
  { nombre: 'directorios', texto: (r: string, z: string) => `Enfoque: directorios de empresas, parques industriales, cámaras empresariales y del sector, guías comerciales y listados ("${r} ${z}", "empresas de <rubro> ${z}", "parque industrial ${z}", "cámara de <rubro> ${z}").` },
  { nombre: 'web', texto: (r: string, z: string) => `Enfoque: webs propias, LinkedIn, noticias y redes (Instagram, Facebook) de empresas que encajan con "${r}" en ${z}: notas de prensa sobre aperturas, ampliaciones, nuevas plantas o sucursales.` },
  { nombre: 'zonas', texto: (r: string, z: string) => `Enfoque: recorré las distintas ciudades, barrios, rutas o polos comerciales/industriales dentro de ${z} para encontrar empresas que encajan con "${r}" y que no aparecen primeras en Google.` },
]


function contextoEmpresa(c: Dic | null) {
  const e = c?.estrategia ?? {}, r = c?.respuestas ?? {}
  if (!e.resumen && !r.que_vende) return ''
  return `Quién busca clientes: ${r.empresa ? r.empresa + '. ' : ''}${e.resumen || r.que_vende}
Cliente ideal: ${e.cliente_ideal || r.cliente_ideal || 's/d'}
${e.criterios?.length ? `Señales de buen prospecto: ${e.criterios.join('; ')}\n` : ''}${e.descartar?.length ? `Descartá: ${e.descartar.join('; ')}\n` : ''}`
}

function prompt(o: { rubro: string, zona: string, cuantos: number, enfoque: string, filtros: Dic[], pedido: string, excluir: string[], contexto: string, brief: Brief }) {
  const reglas = o.filtros.length
    ? o.filtros.map(f => `${f.titulo}${f.descripcion ? ` (${f.descripcion})` : ''}`)
    : []
  const b = o.brief
  return `Buscá en la web empresas reales y activas en "${o.zona}" (Argentina) que sean clientes potenciales.
Pedido original: "${o.rubro}".
Qué buscamos exactamente: ${b.interpretacion}
${b.incluir.length ? `Tipos de empresa que SÍ entran: ${b.incluir.join('; ')}.
` : ''}${b.excluir.length ? `NO incluyas (aunque aparezcan con palabras parecidas): ${b.excluir.join('; ')}.
` : ''}Términos útiles para buscar: ${b.buscar.map(t => `"${t}"`).join(', ')}.

${o.contexto || 'Objetivo: armar una lista de prospectos comerciales para contactar.'}
${o.enfoque}

${reglas.length ? `Requisitos que TIENEN que cumplir (si no podés comprobarlo con lo que ves públicamente, no lo incluyas):\n- ${reglas.join('\n- ')}\n` : ''}
Reglas:
- Si de un negocio encontraste el nombre pero no el teléfono, hacé una búsqueda más con su nombre para completarlo.
- Usá sólo información pública. No inventes datos: si no encontrás algo, dejalo vacío.
${o.pedido ? `- Pedido especial del usuario (respetalo): ${o.pedido}\n` : ''}${o.excluir.length ? `- Ya los tengo cargados, NO los repitas: ${o.excluir.join('; ')}.\n` : ''}
Buscá hasta ${o.cuantos} negocios. Al final respondé SOLO con un bloque JSON (sin texto después) con este formato:
\`\`\`json
[{"nombre": "nombre comercial tal como lo conoce la gente", "tipo": "qué es, en 2-4 palabras (ej.: Distribuidora mayorista)", "direccion": "calle y número, localidad", "telefono": "", "email": "", "web": "https://...", "google_maps": "https://maps.google.com/... o https://maps.app.goo.gl/...", "instagram": "https://www.instagram.com/usuario/", "facebook": "https://www.facebook.com/...", "linkedin": "https://www.linkedin.com/company/...", "rating": "", "resenas": "", "fuente": "url donde lo encontraste", "encaje": "por qué es buen cliente para quien busca, concreto, en una frase", "puntaje": 4, "nota": "dato útil para el primer contacto (opcional)"}]
\`\`\`
"nombre": el nombre comercial limpio, sin sufijos como "- Inicio" o "| Facebook". "web": la URL del sitio propio del negocio (aunque sea un link de reservas), o vacío. "google_maps", "instagram", "facebook" y "linkedin": sólo si viste el link real, si no vacío. "rating" y "resenas" sólo si los viste. "puntaje": de 1 a 5, qué tan buen prospecto es según lo que buscamos.`
}

function limpiarNombre(n: string) {
  return n.replace(/\s*[|·–—-]\s*(inicio|home|facebook|instagram|linkedin|p[aá]gina oficial|sitio oficial)\b.*$/i, '').replace(/\s+/g, ' ').trim()
}
function linkDe(v: unknown, patron: RegExp) {
  let u = String(v ?? '').trim()
  if (!u) return ''
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u.replace(/^\/+/, '')
  return patron.test(u) ? u : ''
}

type Brief = { interpretacion: string, buscar: string[], incluir: string[], excluir: string[] }

async function llamarClaude(key: string, modelo: string, texto: string, maxTokens = 1500) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelo, max_tokens: maxTokens, messages: [{ role: 'user', content: texto }] }),
  })
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  const d = await r.json()
  return { texto: (d.content ?? []).filter((c: Dic) => c.type === 'text').map((c: Dic) => c.text).join(''), usoIn: d.usage?.input_tokens ?? 0, usoOut: d.usage?.output_tokens ?? 0 }
}

function extraerObjeto(t: string): Dic | null {
  const b = t.match(/```json\s*([\s\S]*?)```/)?.[1] ?? t.match(/\{[\s\S]*\}/)?.[0]
  if (!b) return null
  try { return JSON.parse(b.replace(/,\s*([}\]])/g, '$1')) } catch { return null }
}

const lista = (v: unknown, n = 10) => Array.isArray(v) ? v.map(x => String(x ?? '').trim()).filter(Boolean).slice(0, n) : []

/** Traduce lo que escribió la persona a un pedido preciso: qué tipo de empresa entra, cómo buscarla y qué NO entra */
async function interpretar(key: string, modelo: string, rubro: string, zona: string, contexto: string): Promise<{ brief: Brief, usoIn: number, usoOut: number }> {
  const base: Brief = { interpretacion: rubro, buscar: [rubro], incluir: [], excluir: [] }
  try {
    const r = await llamarClaude(key, modelo, `Sos analista comercial B2B en Argentina. Una persona quiere encontrar clientes potenciales y escribió: "${rubro}" (zona: ${zona}).
${contexto ? `\nQuién busca y qué vende:\n${contexto}\n` : ''}
Interpretá qué empresas le sirven COMO CLIENTES, pensando en lo que vende. Las palabras ambiguas se resuelven por lo que vende: por ejemplo, si vende automatización de almacenes y escribe "depósito", busca empresas que TIENEN un depósito o centro de distribución propio (distribuidoras, mayoristas, fábricas, operadores logísticos, e-commerce grandes), NO empresas de mudanzas, guardamuebles, alquiler de bauleras o self storage. Si no hay contexto, elegí la lectura comercial más probable y descartá las lecturas que se confunden.

Respondé SOLO con JSON:
{"interpretacion": "una frase clara en español de qué empresas vamos a buscar", "buscar": ["5 a 8 términos concretos como aparecen en Google Maps o directorios"], "incluir": ["3 a 6 tipos de empresa que sí entran"], "excluir": ["3 a 6 tipos de empresa que NO entran aunque aparezcan con palabras parecidas"]}`, 900)
    const o = extraerObjeto(r.texto)
    if (!o) return { brief: base, usoIn: r.usoIn, usoOut: r.usoOut }
    return {
      brief: { interpretacion: String(o.interpretacion ?? rubro).slice(0, 300), buscar: lista(o.buscar, 8).length ? lista(o.buscar, 8) : [rubro], incluir: lista(o.incluir, 8), excluir: lista(o.excluir, 8) },
      usoIn: r.usoIn, usoOut: r.usoOut,
    }
  } catch (e) { console.error('interpretar', e); return { brief: base, usoIn: 0, usoOut: 0 } }
}

function briefDesde(b: unknown, rubro: string): Brief | null {
  if (!b || typeof b !== 'object') return null
  const o = b as Dic
  return { interpretacion: String(o.interpretacion ?? rubro).slice(0, 300), buscar: lista(o.buscar, 8).length ? lista(o.buscar, 8) : [rubro], incluir: lista(o.incluir, 10), excluir: lista(o.excluir, 10) }
}

/** Segunda mirada: descarta los resultados que no son el tipo de empresa pedido */
async function verificar(key: string, modelo: string, brief: Brief, items: Dic[]) {
  if (!items.length) return { quedan: new Set(items.map((_, i) => i)), usoIn: 0, usoOut: 0 }
  try {
    const r = await llamarClaude(key, modelo, `Buscamos: ${brief.interpretacion}
${brief.incluir.length ? `Entran: ${brief.incluir.join('; ')}\n` : ''}${brief.excluir.length ? `NO entran: ${brief.excluir.join('; ')}\n` : ''}
Para cada empresa decidí si entra. Ante la duda razonable, que entre. Respondé SOLO con JSON: {"no_entran": [índices]}

${items.map((n, i) => `${i}. ${n.nombre} — ${n.rubro}${n.encaje ? ` — ${n.encaje}` : ''}${n.web_actual ? ` — ${n.web_actual}` : ''}`).join('\n')}`, 600)
    const o = extraerObjeto(r.texto)
    const fuera = new Set((Array.isArray(o?.no_entran) ? o!.no_entran : []).map(Number))
    // Si quiere sacar casi todo, probablemente entendió mal: no filtrar
    if (fuera.size > items.length * 0.7) fuera.clear()
    return { quedan: new Set(items.map((_, i) => i).filter(i => !fuera.has(i))), usoIn: r.usoIn, usoOut: r.usoOut }
  } catch (e) { console.error('verificar', e); return { quedan: new Set(items.map((_, i) => i)), usoIn: 0, usoOut: 0 } }
}

function extraerLista(texto: string): Dic[] {
  const bloques = [...texto.matchAll(/```json\s*([\s\S]*?)```/g)].map(m => m[1])
  const bloque = bloques.at(-1) ?? texto.match(/\[[\s\S]*\]/)?.[0]
  if (!bloque) return []
  try { const v = JSON.parse(bloque); return Array.isArray(v) ? v : [] } catch { return [] }
}

async function unaBusqueda(key: string, modelo: string, texto: string, limiteMs: number) {
  const messages: Dic[] = [{ role: 'user', content: texto }]
  let salida = '', usoIn = 0, usoOut = 0, busquedas = 0
  const fin = Date.now() + limiteMs
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), Math.max(5000, fin - Date.now()))
    let r: Response
    try {
      r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: modelo, max_tokens: 8000, messages,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8,
                    user_location: { type: 'approximate', country: 'AR', timezone: 'America/Argentina/Buenos_Aires' } }],
        }),
      })
    } catch { clearTimeout(t); return { salida, usoIn, usoOut, busquedas, error: salida ? '' : 'timeout' } }
    clearTimeout(t)
    if (!r.ok) {
      const detalle = (await r.text()).slice(0, 300)
      console.error('anthropic', r.status, detalle)
      return { salida, usoIn, usoOut, busquedas, error: detalle, status: r.status }
    }
    const data = await r.json()
    usoIn += data.usage?.input_tokens ?? 0; usoOut += data.usage?.output_tokens ?? 0
    busquedas += data.usage?.server_tool_use?.web_search_requests ?? 0
    salida += (data.content ?? []).filter((c: Dic) => c.type === 'text').map((c: Dic) => c.text).join('')
    if (data.stop_reason !== 'pause_turn' || Date.now() > fin - 15000) break
    messages.push({ role: 'assistant', content: data.content }) // búsqueda larga: seguir donde quedó
  }
  return { salida, usoIn, usoOut, busquedas, error: '' }
}

function mensajeDeError(status: number | undefined, detalle: string) {
  return status === 401 ? 'La clave de Claude no es válida: revisala en Super admin → Claves.'
    : /web.search|not enabled|permission/i.test(detalle) ? 'La búsqueda web no está habilitada en la cuenta de Anthropic: activala en console.anthropic.com → Settings → Privacy / Web search.'
    : /credit/i.test(detalle) ? 'La cuenta de Anthropic se quedó sin crédito.'
    : status === 429 || status === 529 ? 'Claude está saturado. Probá en un minuto.'
    : detalle === 'timeout' ? 'La búsqueda tardó demasiado. Probá con menos resultados.'
    : `Claude respondió con un error (${status ?? '?'}).`
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let usuario
  try { usuario = await clienteDelUsuario(req) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const { supabase, user } = usuario
  const db = admin()
  const body = await req.json().catch(() => ({}))

  const { data: acceso } = await supabase.rpc('mi_acceso')
  if (acceso && acceso.habilitado === false) return json({ error: 'Tu cuenta o tu empresa está suspendida.' }, 403)

  const rubro = String(body.rubro ?? '').trim().slice(0, 160)
  const zonaCruda = String(body.zona ?? '').trim().slice(0, 80)
  // "neuquen" → "Neuquen": si viene todo en minúsculas, mayúscula en cada palabra (salvo de/del/la…)
  const zona = zonaCruda === zonaCruda.toLowerCase()
    ? zonaCruda.replace(/(^|[\s,(])([a-záéíóúñ])([a-záéíóúñ]*)/g, (m, a, b, c) => ['de', 'del', 'la', 'las', 'los', 'el', 'y'].includes(b + c) && a !== '' ? m : a + b.toUpperCase() + c)
    : zonaCruda
  const pedido = String(body.pedido ?? '').trim().slice(0, 400)
  const cantidad = Math.min(Math.max(Number(body.cantidad) || 10, 5), 40)
  // Filtros elegidos: [{id, titulo, descripcion}]. Compatibilidad con la versión anterior ({requisitos: {sin_web, ...}}).
  let filtros: Dic[] = Array.isArray(body.filtros) ? body.filtros.slice(0, 12).map((f: Dic) => ({ id: String(f.id ?? '').slice(0, 40), titulo: String(f.titulo ?? '').slice(0, 80), descripcion: String(f.descripcion ?? '').slice(0, 220) })).filter((f: Dic) => f.titulo) : []
  if (!Array.isArray(body.filtros) && body.requisitos) {
    const T: Dic = { sin_web: 'Sin página web propia', con_telefono: 'Con teléfono o WhatsApp', con_instagram: 'Con Instagram' }
    filtros = Object.keys(T).filter(k => k === 'sin_web' ? body.requisitos.sin_web !== false : !!body.requisitos[k]).map(k => ({ id: k, titulo: T[k], descripcion: '' }))
  }
  const ids = new Set(filtros.map(f => f.id))
  const guardar = body.guardar !== false
  if (!rubro || !zona) return json({ error: 'Escribí qué buscás y dónde.' }, 400)

  const { data: cupo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  if (cupo && cupo.usados >= cupo.limite) return json({ error: cupo.mensaje || `Llegaste al límite de ${cupo.limite} consultas de IA de hoy. Mañana se renueva.`, codigo: 'LIMITE_CHAT', cupo }, 429)
  const key = await claveServicio('anthropic')
  if (!key) return json({ error: 'Falta la clave de Claude: la carga el super admin en Super admin → Claves.', codigo: 'SIN_CLAVE' }, 503)
  const modelo = (await claveServicio('modelo_busqueda')) || 'claude-haiku-5-5' // barato y rinde bien para buscar

  const { data: comercial } = await supabase.from('perfil_comercial').select('respuestas, estrategia').eq('owner_id', user.id).maybeSingle()
  const contexto = contextoEmpresa(comercial)
  const modeloRapido = (await claveServicio('modelo_resumen')) || 'claude-haiku-5-5'

  // Paso 1: entender qué quiere (y qué NO). Con modo "interpretar" sólo devuelve esto para que la persona lo ajuste.
  let usoIn = 0, usoOut = 0
  let brief = briefDesde(body.brief, rubro)
  if (!brief) {
    const it = await interpretar(key, modeloRapido, rubro, zona, contexto)
    brief = it.brief; usoIn += it.usoIn; usoOut += it.usoOut
  }
  if (body.modo === 'interpretar') return json({ brief, zona }) // no descuenta cupo: es una consulta chiquita

  // Lo que ya conoce la cuenta y su equipo (en la lista, en la bandeja o descartado): no se vuelve a traer
  const { data: yo } = await db.from('perfiles').select('empresa_id').eq('id', user.id).maybeSingle()
  let equipo = [user.id]
  if (yo?.empresa_id) {
    const { data: comp } = await db.from('perfiles').select('id').eq('empresa_id', yo.empresa_id).limit(200)
    equipo = [...new Set([user.id, ...(comp ?? []).map((c: Dic) => c.id)])]
  }
  const [{ data: hs }, { data: ps }] = await Promise.all([
    db.from('hallazgos').select('nombre, telefono_norm, zona, estado').in('owner_id', equipo).order('created_at', { ascending: false }).limit(5000),
    db.from('prospectos').select('nombre, telefono_norm, zona').in('owner_id', equipo).order('created_at', { ascending: false }).limit(5000),
  ])
  const conocidos = [...(hs ?? []), ...(ps ?? [])] as Dic[]
  const nomConocidos = new Set(conocidos.map(c => clave(c.nombre)))
  const telConocidos = new Set(conocidos.map(c => c.telefono_norm).filter(Boolean))
  const nomDescartados = new Set((hs ?? []).filter((h: Dic) => h.estado === 'descartado').map((h: Dic) => clave(h.nombre)))
  const zonaClave = clave(zona)
  const excluir = conocidos.filter(c => !zonaClave || clave(c.zona ?? '').includes(zonaClave) || zonaClave.includes(clave(c.zona ?? '') || '~')).map(c => c.nombre).slice(0, 150)

  // Paso 2: varias búsquedas en paralelo, cada una con otro enfoque
  const lotes = Math.min(4, Math.max(1, Math.ceil(cantidad / 10)))
  const cuantos = Math.ceil(cantidad / lotes) + 3
  const corridas = await Promise.all(ENFOQUES.slice(0, lotes).map(e =>
    unaBusqueda(key, modelo, prompt({ rubro, zona, cuantos, enfoque: e.texto(brief!.buscar.slice(0, 3).join('", "'), zona), filtros, pedido, excluir, contexto, brief: brief! }), 110_000)))
  usoIn += corridas.reduce((a, c) => a + c.usoIn, 0); usoOut += corridas.reduce((a, c) => a + c.usoOut, 0)
  const crudos = corridas.flatMap(c => extraerLista(c.salida))
  if (!crudos.length) {
    if (usoIn) await db.from('chat_uso').insert({ owner_id: user.id, tokens_in: usoIn, tokens_out: usoOut })
    const falla = corridas.find(c => c.error)
    if (falla) return json({ error: mensajeDeError(falla.status, falla.error) }, 502)
  }

  // Normalizar, deduplicar, sacar los conocidos y aplicar los requisitos
  const vistosNom = new Set<string>(), vistosTel = new Set<string>()
  let descartados = 0, yaConocidos = 0, yaDescartados = 0
  const candidatos = crudos.map(n => {
    const web = String(n.web ?? '').trim()
    const { esProspecto, queTiene } = clasificarWeb(web)
    const ig = String(n.instagram ?? '').trim() || instagramDe(web)
    const handle = ig.match(/instagram\.com\/([A-Za-z0-9._]+)/)?.[1] ?? (/^@?[A-Za-z0-9._]+$/.test(ig) ? ig.replace('@', '') : '')
    const rating = Number(String(n.rating ?? '').replace(',', '.'))
    const puntaje = Math.round(Number(n.puntaje))
    const fuente = String(n.fuente ?? '').trim()
    return {
      nombre: limpiarNombre(String(n.nombre ?? '')),
      rubro: String(n.tipo ?? '').trim().slice(0, 60) || rubro, zona,
      direccion: String(n.direccion ?? '').trim(),
      telefono: String(n.telefono ?? '').trim(),
      email: /@/.test(String(n.email ?? '')) ? String(n.email).trim() : '',
      instagram: handle && !['p', 'reel', 'explore'].includes(handle) ? `https://www.instagram.com/${handle}/` : '',
      que_tiene_hoy: web ? queTiene : 'Sin web',
      web_actual: /facebook\.com|instagram\.com/i.test(web) ? '' : web,
      rating: rating > 0 && rating <= 5 ? rating : null,
      resenas: Number(String(n.resenas ?? '').replace(/\D/g, '')) || null,
      fuente_url: /^https?:\/\//.test(fuente) ? fuente : '',
      google_maps_url: linkDe(n.google_maps, /(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google\.)/i),
      facebook: linkDe(n.facebook, /facebook\.com\//i) || linkDe(web, /facebook\.com\//i),
      linkedin: linkDe(n.linkedin, /linkedin\.com\//i),
      nota: String(n.nota ?? '').slice(0, 500),
      encaje: String(n.encaje ?? '').slice(0, 300),
      puntaje: puntaje >= 1 && puntaje <= 5 ? puntaje : null,
      es_prospecto: esProspecto,
    }
  }).filter(n => {
    const k = clave(n.nombre), t = normalizarTelefono(n.telefono)
    if (!n.nombre || vistosNom.has(k) || (t && vistosTel.has(t))) return false
    vistosNom.add(k); if (t) vistosTel.add(t)
    if (nomConocidos.has(k) || (t && telConocidos.has(t))) { yaConocidos++; if (nomDescartados.has(k)) yaDescartados++; return false }
    if ((ids.has('con_telefono') && !n.telefono) || (ids.has('con_email') && !n.email) || (ids.has('con_instagram') && !n.instagram) || (ids.has('sin_web') && !n.es_prospecto)) { descartados++; return false }
    return true
  })

  // Paso 3: segunda mirada contra lo que se pidió
  const ver = await verificar(key, modeloRapido, brief, candidatos)
  usoIn += ver.usoIn; usoOut += ver.usoOut
  const noEncajan = candidatos.length - ver.quedan.size
  const resultados = candidatos.filter((_, i) => ver.quedan.has(i))
    .sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0) || Number(!!b.telefono) - Number(!!a.telefono) || Number(!!b.email) - Number(!!a.email))
    .slice(0, cantidad + 5)
  if (usoIn) await db.from('chat_uso').insert({ owner_id: user.id, tokens_in: usoIn, tokens_out: usoOut })

  // Guardar en la bandeja "Por revisar"
  let busquedaId: string | null = null
  let salida: Dic[] = resultados.map(({ es_prospecto, ...r }) => ({ ...r, id: null, estado: 'no_guardado' }))
  if (guardar && resultados.length) {
    const { data: b } = await db.from('busquedas').insert({ owner_id: user.id, rubro, zona, pedido, requisitos: { filtros: [...ids], brief }, cantidad, encontrados: resultados.length }).select('id').single()
    busquedaId = b?.id ?? null
    const filas = resultados.map(({ es_prospecto, web_actual, ...r }) => ({ ...r, web: web_actual, busqueda_id: busquedaId, owner_id: user.id,
      google_maps_url: r.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.nombre, r.direccion, zona].filter(Boolean).join(' '))}` }))
    const { data: ins, error } = await supabase.from('hallazgos').upsert(filas, { onConflict: 'owner_id,clave_nombre', ignoreDuplicates: true }).select('*')
    if (error) console.error('hallazgos', error)
    salida = (ins ?? []) as Dic[]
    if (busquedaId) await db.from('busquedas').update({ guardados: salida.length, ya_estaban: yaConocidos }).eq('id', busquedaId)
  }

  const { data: cupoNuevo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  return json({
    resultados: salida, busqueda_id: busquedaId, brief, descartados, no_encajan: noEncajan, ya_conocidos: yaConocidos, ya_descartados: yaDescartados, cupo: cupoNuevo,
    busquedas: corridas.reduce((a, c) => a + c.busquedas, 0), enfoques: lotes, modelo,
    aviso: corridas.some(c => c.error) ? 'Una de las búsquedas no terminó; te mostramos lo que encontró el resto.' : '',
  })
})
