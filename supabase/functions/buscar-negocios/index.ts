// Busca negocios por rubro + zona con Claude y búsqueda web (fuentes públicas).
// Corre varias búsquedas en paralelo, cada una con un enfoque distinto (fichas de Google, redes,
// directorios, barrios), junta y deduplica los resultados y los GUARDA solos en los prospectos
// del usuario. Usa el perfil comercial (qué vende y a quién) y los filtros elegidos, sirve para cualquier negocio.
// Devuelve cada resultado con su estado (nuevo, ya_estaba o no_guardado), por qué encaja y un puntaje de 1 a 5.
// Cada búsqueda descuenta 1 del cupo diario de IA del usuario (el mismo del Asistente).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { clasificarWeb, instagramDe, normalizarTelefono } from '../_shared/clasificar.js'

type Dic = Record<string, any>
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const clave = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

// Lo que busca puede ser un rubro ("barbería") o una descripción libre ("empresas grandes con depósito", "locales que venden iPhone")
const ENFOQUES = [
  { nombre: 'mapas', texto: (r: string, z: string) => `Enfoque: Google Maps y fichas de negocios. Traducí el pedido a los rubros o palabras con que esas empresas aparecen en Google Maps (ej. "depósito", "centro logístico", "distribuidora", "venta de celulares") y buscá "<rubro> ${z}".` },
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

function prompt(o: { rubro: string, zona: string, cuantos: number, enfoque: string, filtros: Dic[], pedido: string, excluir: string[], contexto: string }) {
  const reglas = o.filtros.length
    ? o.filtros.map(f => `${f.titulo}${f.descripcion ? ` (${f.descripcion})` : ''}`)
    : []
  return `Buscá en la web empresas, negocios u organizaciones reales y activas que coincidan con este pedido: "${o.rubro}", en "${o.zona}" (Argentina). Interpretá el pedido con criterio comercial: si dice "empresas grandes con depósito" buscá centros logísticos, distribuidoras, mayoristas, fábricas, etc.; si dice "locales que venden iPhone" buscá tiendas de celulares y electrónica. Son clientes potenciales.

${o.contexto || 'Objetivo: armar una lista de prospectos comerciales para contactar.'}
${o.enfoque}

${reglas.length ? `Requisitos que TIENEN que cumplir (si no podés comprobarlo con lo que ves públicamente, no lo incluyas):\n- ${reglas.join('\n- ')}\n` : ''}
Reglas:
- Si de un negocio encontraste el nombre pero no el teléfono, hacé una búsqueda más con su nombre para completarlo.
- Usá sólo información pública. No inventes datos: si no encontrás algo, dejalo vacío.
${o.pedido ? `- Pedido especial del usuario (respetalo): ${o.pedido}\n` : ''}${o.excluir.length ? `- Ya los tengo cargados, NO los repitas: ${o.excluir.join('; ')}.\n` : ''}
Buscá hasta ${o.cuantos} negocios. Al final respondé SOLO con un bloque JSON (sin texto después) con este formato:
\`\`\`json
[{"nombre": "", "direccion": "", "telefono": "", "email": "", "instagram": "https://www.instagram.com/usuario/", "web": "", "rating": "", "resenas": "", "fuente": "url donde lo encontraste", "encaje": "por qué es buen cliente para quien busca, concreto, en una frase", "puntaje": 4, "nota": "dato útil para el primer contacto (opcional)"}]
\`\`\`
"web": la URL que figure como sitio del negocio (aunque sea Instagram o un link de reservas), o vacío. "rating" y "resenas" sólo si los viste. "puntaje": de 1 a 5, qué tan buen prospecto es según lo que buscamos.`
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
  const zona = String(body.zona ?? '').trim().slice(0, 80)
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
  if (cupo && cupo.usados >= cupo.limite) return json({ error: `Llegaste al límite de ${cupo.limite} consultas de IA de hoy. Mañana se renueva.`, codigo: 'LIMITE_CHAT', cupo }, 429)
  const key = await claveServicio('anthropic')
  if (!key) return json({ error: 'Falta la clave de Claude: la carga el super admin en Super admin → Claves.', codigo: 'SIN_CLAVE' }, 503)
  const modelo = (await claveServicio('modelo_busqueda')) || 'claude-haiku-5-5' // barato y rinde bien para buscar

  const { data: comercial } = await supabase.from('perfil_comercial').select('respuestas, estrategia').eq('owner_id', user.id).maybeSingle()
  const contexto = contextoEmpresa(comercial)

  // Lo que ya tiene cargado del mismo rubro, para no repetir
  const palabra = rubro.split(/\s+/).find(w => w.length > 3) ?? rubro
  const { data: ya } = await supabase.from('prospectos').select('nombre').ilike('rubro', `%${palabra.slice(0, -1)}%`).order('created_at', { ascending: false }).limit(120)
  const excluir = (ya ?? []).map((p: Dic) => p.nombre)

  // Varias búsquedas en paralelo, cada una con otro enfoque
  const lotes = Math.min(4, Math.max(1, Math.ceil(cantidad / 10)))
  const cuantos = Math.ceil(cantidad / lotes) + 3
  const corridas = await Promise.all(ENFOQUES.slice(0, lotes).map(e =>
    unaBusqueda(key, modelo, prompt({ rubro, zona, cuantos, enfoque: e.texto(rubro, zona), filtros, pedido, excluir, contexto }), 125_000)))

  const usoIn = corridas.reduce((a, c) => a + c.usoIn, 0), usoOut = corridas.reduce((a, c) => a + c.usoOut, 0)
  if (usoIn) await db.from('chat_uso').insert({ owner_id: user.id, tokens_in: usoIn, tokens_out: usoOut })
  const crudos = corridas.flatMap(c => extraerLista(c.salida))
  if (!crudos.length) {
    const falla = corridas.find(c => c.error)
    if (falla) return json({ error: mensajeDeError(falla.status, falla.error) }, 502)
  }

  // Normalizar, deduplicar y aplicar los requisitos
  const yaCargados = new Set(excluir.map(clave))
  const vistosNom = new Set<string>(), vistosTel = new Set<string>()
  let descartados = 0
  const resultados = crudos.map(n => {
    const web = String(n.web ?? '').trim()
    const { esProspecto, queTiene } = clasificarWeb(web)
    const ig = String(n.instagram ?? '').trim() || instagramDe(web)
    const handle = ig.match(/instagram\.com\/([A-Za-z0-9._]+)/)?.[1] ?? (/^@?[A-Za-z0-9._]+$/.test(ig) ? ig.replace('@', '') : '')
    const rating = Number(String(n.rating ?? '').replace(',', '.'))
    const puntaje = Math.round(Number(n.puntaje))
    return {
      nombre: String(n.nombre ?? '').trim(),
      rubro, zona,
      direccion: String(n.direccion ?? '').trim(),
      telefono: String(n.telefono ?? '').trim(),
      email: /@/.test(String(n.email ?? '')) ? String(n.email).trim() : '',
      instagram: handle && !['p', 'reel', 'explore'].includes(handle) ? `https://www.instagram.com/${handle}/` : '',
      que_tiene_hoy: web ? queTiene : (n.que_tiene_hoy || 'Sin web'),
      web_actual: esProspecto ? (queTiene === 'Sin web' ? '' : web) : web,
      rating: rating > 0 && rating <= 5 ? String(rating) : '',
      resenas: String(n.resenas ?? '').replace(/\D/g, ''),
      fuente: String(n.fuente ?? ''),
      nota: String(n.nota ?? ''),
      encaje: String(n.encaje ?? '').slice(0, 300),
      puntaje: puntaje >= 1 && puntaje <= 5 ? puntaje : null,
      es_prospecto: esProspecto,
    }
  }).filter(n => {
    const k = clave(n.nombre), t = normalizarTelefono(n.telefono)
    if (!n.nombre || vistosNom.has(k) || (t && vistosTel.has(t))) return false
    vistosNom.add(k); if (t) vistosTel.add(t)
    if ((ids.has('con_telefono') && !n.telefono) || (ids.has('con_email') && !n.email) || (ids.has('con_instagram') && !n.instagram) || (ids.has('sin_web') && !n.es_prospecto)) { descartados++; return false }
    return true
  }).sort((a, b) => (b.puntaje ?? 0) - (a.puntaje ?? 0) || Number(!!b.telefono) - Number(!!a.telefono) || Number(!!b.instagram) - Number(!!a.instagram))
    .slice(0, cantidad + 5)

  // Guardar solos los que sirven como prospectos
  let busquedaId: string | null = null
  const salida = resultados.map((r, i) => ({ ...r, id: `ia-${i}`, estado: 'no_guardado' as string, prospecto_id: null as string | null, ya_cargado: yaCargados.has(clave(r.nombre)) }))
  if (guardar && salida.length) {
    const { data: b } = await db.from('busquedas').insert({ owner_id: user.id, rubro, zona, pedido, requisitos: { filtros: [...ids] }, cantidad, encontrados: salida.length }).select('id').single()
    busquedaId = b?.id ?? null
    const aGuardar = salida.filter(r => r.es_prospecto || !ids.has('sin_web'))
    const filas = aGuardar.map(({ id, es_prospecto, fuente, nota, estado, prospecto_id, ya_cargado, ...r }) => ({
      ...r, puntaje: r.puntaje ? String(r.puntaje) : '', notas: [nota, fuente && `Fuente: ${fuente}`].filter(Boolean).join('\n'),
    }))
    const { data: det, error } = await supabase.rpc('importar_con_detalle', { filas, origen: 'busqueda_ia', p_busqueda: busquedaId })
    if (error) console.error('importar_con_detalle', error)
    for (const d of (det ?? []) as Dic[]) {
      const r = aGuardar[d.i]
      if (r) { r.estado = d.estado; r.prospecto_id = d.id ?? null }
    }
    const guardados = salida.filter(r => r.estado === 'nuevo').length, ya_estaban = salida.filter(r => r.estado === 'ya_estaba').length
    if (busquedaId) await db.from('busquedas').update({ guardados, ya_estaban }).eq('id', busquedaId)
  }

  const { data: cupoNuevo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  return json({
    resultados: salida, busqueda_id: busquedaId, descartados, cupo: cupoNuevo,
    busquedas: corridas.reduce((a, c) => a + c.busquedas, 0), enfoques: lotes, modelo,
    aviso: corridas.some(c => c.error) ? 'Una de las búsquedas no terminó; te mostramos lo que encontró el resto.' : '',
  })
})
