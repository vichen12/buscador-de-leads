// Busca negocios por rubro + zona con Claude y búsqueda web (fuentes públicas).
// Corre varias búsquedas en paralelo, cada una con un enfoque distinto (fichas de Google, redes,
// directorios, barrios), junta y deduplica los resultados y los deja en la bandeja "Por revisar"
// (tabla hallazgos) del usuario. Antes de buscar, Claude interpreta el pedido (qué entra y qué NO) y
// al final revisa los resultados contra esa interpretación. Nunca trae empresas que el usuario o su
// equipo ya tienen o descartaron. Usa el perfil comercial (qué vende y a quién), sirve para cualquier negocio.
// Cada búsqueda descuenta 1 del cupo de IA (diario del usuario y mensual de su empresa). Interpretar no descuenta.
import { clasificarWeb, instagramDe, normalizarTelefono } from './clasificar.js'

type Dic = Record<string, any>
// Lo que necesita del entorno se lo pasa la función (así este módulo no importa nada de npm y se puede compartir)
type Ayudas = { clienteDelUsuario: (req: Request) => Promise<{ supabase: any, user: any }>, claveServicio: (n: any) => Promise<string>, json: (d: unknown, s?: number) => Response, admin: () => any }
let claveServicio: Ayudas['claveServicio'], json: Ayudas['json']
const clave = (s: string) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

// Lo que busca puede ser un rubro ("barbería") o una descripción libre ("empresas grandes con depósito", "locales que venden iPhone")
// País de la búsqueda según lo que escribió en "Dónde" (por defecto Argentina)
const PAISES: [string, string, string][] = [
  ['argentina', 'AR', 'America/Argentina/Buenos_Aires'],
  ['chile', 'CL', 'America/Santiago'], ['uruguay', 'UY', 'America/Montevideo'], ['paraguay', 'PY', 'America/Asuncion'],
  ['bolivia', 'BO', 'America/La_Paz'], ['peru', 'PE', 'America/Lima'], ['colombia', 'CO', 'America/Bogota'],
  ['ecuador', 'EC', 'America/Guayaquil'], ['mexico', 'MX', 'America/Mexico_City'], ['brasil', 'BR', 'America/Sao_Paulo'],
  ['venezuela', 'VE', 'America/Caracas'], ['costa rica', 'CR', 'America/Costa_Rica'], ['panama', 'PA', 'America/Panama'],
  ['guatemala', 'GT', 'America/Guatemala'], ['republica dominicana', 'DO', 'America/Santo_Domingo'], ['espana', 'ES', 'Europe/Madrid'],
  ['estados unidos', 'US', 'America/New_York'],
  ['el salvador', 'SV', 'America/El_Salvador'],
  ['honduras', 'HN', 'America/Tegucigalpa'],
  ['nicaragua', 'NI', 'America/Managua'],
  ['puerto rico', 'PR', 'America/Puerto_Rico'],
  ['canada', 'CA', 'America/Toronto'],
  ['portugal', 'PT', 'Europe/Lisbon'],
  ['italia', 'IT', 'Europe/Rome'],
  ['francia', 'FR', 'Europe/Paris'],
  ['alemania', 'DE', 'Europe/Berlin'],
  ['reino unido', 'GB', 'Europe/London'],
  ['irlanda', 'IE', 'Europe/Dublin'],
  ['paises bajos', 'NL', 'Europe/Amsterdam'],
  ['belgica', 'BE', 'Europe/Brussels'],
  ['suiza', 'CH', 'Europe/Zurich'],
  ['austria', 'AT', 'Europe/Vienna'],
  ['suecia', 'SE', 'Europe/Stockholm'],
  ['polonia', 'PL', 'Europe/Warsaw'],
  ['australia', 'AU', 'Australia/Sydney'],
  ['nueva zelanda', 'NZ', 'Pacific/Auckland'],
  ['emiratos arabes', 'AE', 'Asia/Dubai'],
  ['israel', 'IL', 'Asia/Jerusalem'],
  ['sudafrica', 'ZA', 'Africa/Johannesburg'],
  ['japon', 'JP', 'Asia/Tokyo'],
  [' india ', 'IN', 'Asia/Kolkata'],
  ['eeuu', 'US', 'America/New_York'], ['ee.uu', 'US', 'America/New_York'], ['inglaterra', 'GB', 'Europe/London'], ['holanda', 'NL', 'Europe/Amsterdam'], ['emiratos', 'AE', 'Asia/Dubai'],
]
const NOMBRE_PAIS: Record<string, string> = { AR: 'Argentina', CL: 'Chile', UY: 'Uruguay', PY: 'Paraguay', BO: 'Bolivia', PE: 'Perú', CO: 'Colombia', EC: 'Ecuador', MX: 'México', BR: 'Brasil', VE: 'Venezuela', CR: 'Costa Rica', PA: 'Panamá', GT: 'Guatemala', DO: 'República Dominicana', ES: 'España', US: 'Estados Unidos', SV: 'El Salvador', HN: 'Honduras', NI: 'Nicaragua', PR: 'Puerto Rico', CA: 'Canadá', PT: 'Portugal', IT: 'Italia', FR: 'Francia', DE: 'Alemania', GB: 'Reino Unido', IE: 'Irlanda', NL: 'Países Bajos', BE: 'Bélgica', CH: 'Suiza', AT: 'Austria', SE: 'Suecia', PL: 'Polonia', AU: 'Australia', NZ: 'Nueva Zelanda', AE: 'Emiratos Árabes', IL: 'Israel', ZA: 'Sudáfrica', JP: 'Japón', IN: 'India' }
const REGIONES = ['latinoamerica', 'latam', 'sudamerica', 'america latina', 'america del sur', 'cono sur', 'centroamerica', 'hispanoamerica', 'iberoamerica', 'mercosur', 'andinos', 'internacional', 'europa', 'union europea', 'norteamerica', 'america del norte']
type Ubic = { code: string, tz: string, nombre: string, multi: boolean }
// Un país (ubica la búsqueda web ahí) o varios / una región como Latinoamérica (busca sin ubicar en un país).
function paisDe(zona: string): Ubic {
  const z = ' ' + zona.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') + ' '
  const hits = PAISES.filter(([n]) => z.includes(n)).filter((h, i, a) => a.findIndex(x => x[1] === h[1]) === i)
  const region = REGIONES.some(r => z.includes(r))
  if (region || hits.length > 1) return { code: '', tz: '', nombre: region ? zona : hits.map(h => NOMBRE_PAIS[h[1]]).join(', '), multi: true }
  const p = hits[0]
  return p ? { code: p[1], tz: p[2], nombre: NOMBRE_PAIS[p[1]], multi: false } : { code: 'AR', tz: 'America/Argentina/Buenos_Aires', nombre: 'Argentina', multi: false }
}


// ---- Lugares: el tipo de empresa se entiende SIN lugares; el lugar sale sólo del selector "Dónde" ----
const LUGARES = [
  // Argentina: provincias, Gran Mendoza y ciudades grandes
  'Buenos Aires', 'CABA', 'Capital Federal', 'GBA', 'Conurbano', 'Córdoba', 'Santa Fe', 'Rosario', 'Mendoza', 'Gran Mendoza', 'San Juan', 'San Luis', 'Neuquén', 'Río Negro',
  'Chubut', 'Santa Cruz', 'Tierra del Fuego', 'La Pampa', 'Entre Ríos', 'Corrientes', 'Misiones', 'Chaco', 'Formosa', 'Santiago del Estero', 'Tucumán', 'Salta', 'Jujuy',
  'Catamarca', 'La Rioja', 'Godoy Cruz', 'Guaymallén', 'Las Heras', 'Luján de Cuyo', 'Maipú', 'Lavalle', 'San Rafael', 'Mar del Plata', 'Bahía Blanca', 'La Plata', 'Bariloche',
  'Comodoro Rivadavia', 'Paraná', 'Rafaela', 'Villa María', 'Río Cuarto',
  // Otros países y sus ciudades grandes
  'Santiago de Chile', 'Valparaíso', 'Concepción', 'Antofagasta', 'Montevideo', 'Canelones', 'Maldonado', 'Asunción', 'Lima', 'Arequipa', 'Bogotá', 'Medellín', 'Cali',
  'Quito', 'Guayaquil', 'Ciudad de México', 'CDMX', 'Monterrey', 'Guadalajara', 'São Paulo', 'Sao Paulo', 'Río de Janeiro', 'Rio de Janeiro', 'Porto Alegre', 'Curitiba',
  'Argentina', 'Chile', 'Uruguay', 'Paraguay', 'Bolivia', 'Perú', 'Colombia', 'Ecuador', 'México', 'Brasil', 'Venezuela', 'Latinoamérica',
]
const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Saca de un texto los lugares que NO son parte de la zona elegida (con su "de", "del Gran", "en"...) */
function sinLugares(texto: string, zona: string) {
  if (!texto) return texto
  const z = sinTildes(zona)
  let t = texto
  for (const l of [...LUGARES].sort((a, b) => b.length - a.length)) {
    if (z.includes(sinTildes(l))) continue
    const variantes = [...new Set([l, l.normalize('NFD').replace(/[\u0300-\u036f]/g, '')])].map(escapar).join('|')
    t = t.replace(new RegExp(`(?:,\\s*)?(?:\\s+(?:del|de la|de|en|en el|en la|zona|provincia de|ciudad de)\\s+)?(?:\\s*\\bGran\\s+)?(?<![\\p{L}])(?:${variantes})(?![\\p{L}])`, 'giu'), '')
  }
  return t.replace(/[ \t]+([,.;:])/g, '$1').replace(/\([ \t]*\)/g, '').replace(/,[ \t]*,/g, ',').replace(/[ \t]{2,}/g, ' ').replace(/^[ \t,]+|[ \t,]+$/gm, '').trim()
}
/** Divide la zona elegida en partes para buscar en paralelo y que los resultados queden repartidos */
const REGIONES_BUSQUEDA: Record<string, string[]> = {
  AR: ['Buenos Aires, CABA y GBA, Argentina', 'Córdoba, Argentina', 'Santa Fe y Rosario, Argentina', 'Mendoza, San Juan y San Luis, Argentina', 'Tucumán, Salta y el NOA, Argentina', 'Neuquén, Río Negro y la Patagonia, Argentina', 'Entre Ríos, Corrientes y el Litoral, Argentina', 'Bahía Blanca y el interior de Buenos Aires, Argentina'],
  CL: ['Santiago (Región Metropolitana), Chile', 'Valparaíso y Viña del Mar, Chile', 'Concepción y Biobío, Chile', 'Antofagasta y el norte, Chile', 'Puerto Montt y el sur, Chile'],
  UY: ['Montevideo, Uruguay', 'Canelones, Uruguay', 'Maldonado y Punta del Este, Uruguay', 'Colonia, Salto y Paysandú, Uruguay'],
  BR: ['São Paulo, Brasil', 'Rio de Janeiro, Brasil', 'Minas Gerais, Brasil', 'Paraná e Santa Catarina, Brasil', 'Rio Grande do Sul, Brasil'],
  MX: ['Ciudad de México y Estado de México, México', 'Monterrey (Nuevo León), México', 'Guadalajara (Jalisco), México', 'Querétaro y el Bajío, México', 'Puebla, México'],
  CO: ['Bogotá, Colombia', 'Medellín (Antioquia), Colombia', 'Cali (Valle del Cauca), Colombia', 'Barranquilla y la costa Caribe, Colombia'],
  PE: ['Lima y Callao, Perú', 'Arequipa, Perú', 'Trujillo y La Libertad, Perú', 'Piura y el norte, Perú'],
  PY: ['Asunción y Central, Paraguay', 'Ciudad del Este (Alto Paraná), Paraguay', 'Encarnación (Itapúa), Paraguay'],
}
function partesDeZona(zona: string, maximo: number): { zona: string, code: string, tz: string }[] {
  const z = ' ' + sinTildes(zona) + ' '
  const paises = PAISES.filter(([n]) => z.includes(n)).filter((h, i, a) => a.findIndex(x => x[1] === h[1]) === i)
  // Zona = sólo nombres de países (uno o varios): se reparte por país y, si sobra lugar, por regiones de cada país
  const resto = paises.reduce((t, [n]) => t.replace(n, ' '), z).replace(/[,y\s]+/g, '')
  if (paises.length && !resto) {
    const porPais = paises.map(([, code, tz]) => ({ code, tz, regiones: [...(REGIONES_BUSQUEDA[code] ?? [NOMBRE_PAIS[code]])].sort(() => Math.random() - 0.5) }))
    const partes: { zona: string, code: string, tz: string }[] = []
    for (let vuelta = 0; partes.length < maximo && vuelta < 8; vuelta++)
      for (const p of porPais) if (partes.length < maximo && p.regiones[vuelta]) partes.push({ zona: p.regiones[vuelta], code: p.code, tz: p.tz })
    return partes
  }
  const u = paisDe(zona)
  return [{ zona, code: u.code, tz: u.tz }]
}


// ---- Google Maps (Places API oficial): trae muchas fichas reales por tipo de empresa; Claude las evalúa ----
const CAMPOS_MAPS = ['places.id', 'places.displayName', 'places.formattedAddress', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.googleMapsUri', 'places.businessStatus', 'places.rating', 'places.userRatingCount', 'places.primaryTypeDisplayName'].join(',')
let errorMaps = ''
async function desdeMaps(clavePlaces: string, terminos: string[], zona: string, code: string): Promise<Dic[]> {
  errorMaps = ''
  const listas = await Promise.all(terminos.map(async t => {
    try {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': clavePlaces, 'X-Goog-FieldMask': CAMPOS_MAPS },
        body: JSON.stringify({ textQuery: `${t} en ${zona}`, languageCode: 'es', pageSize: 20, ...(code ? { regionCode: code } : {}) }),
      })
      if (!r.ok) { const t = (await r.text()).slice(0, 200); console.error('places', r.status, t); errorMaps = `${r.status} ${t}`; return [] }
      const d = await r.json()
      return (d.places ?? []).filter((p: Dic) => !p.businessStatus || p.businessStatus === 'OPERATIONAL').map((p: Dic) => ({
        nombre: p.displayName?.text ?? '', tipo: p.primaryTypeDisplayName?.text ?? '', direccion: p.formattedAddress ?? '',
        telefono: p.nationalPhoneNumber || p.internationalPhoneNumber || '', web: p.websiteUri ?? '', google_maps: p.googleMapsUri ?? '',
        rating: p.rating ?? '', resenas: p.userRatingCount ?? '', fuente: p.googleMapsUri ?? '', termino: t,
      }))
    } catch (e) { console.error('places', e); return [] }
  }))
  const vistos = new Set<string>()
  return listas.flat().filter(p => { const k = clave(p.nombre); if (!k || vistos.has(k)) return false; vistos.add(k); return true })
}
/** Claude mira cada ficha de Maps y decide si sirve como cliente, con qué puntaje y por qué */
async function evaluarFichas(key: string, modelo: string, brief: Brief, fichas: Dic[], contexto: string, aprendido: string, filtros: Dic[]): Promise<{ items: Dic[], usoIn: number, usoOut: number }> {
  if (!fichas.length) return { items: [], usoIn: 0, usoOut: 0 }
  const lotes: Dic[][] = []
  for (let i = 0; i < fichas.length; i += 20) lotes.push(fichas.slice(i, i + 20))
  const partes = await Promise.all(lotes.map(async lote => {
    try {
      const r = await llamarClaude(key, modelo, `${contexto || ''}
Buscamos: ${brief.interpretacion}
${brief.incluir.length ? `Tipos que entran: ${brief.incluir.join('; ')}\n` : ''}${brief.excluir.length ? `NO entran: ${brief.excluir.join('; ')}\n` : ''}${filtros.length ? `Requisitos (marcá false SÓLO si por lo que se ve claramente no cumple; si no se sabe, null): ${filtros.map(f => `${f.id} = ${f.titulo}`).join('; ')}\n` : ''}${aprendido ? aprendido + '\n' : ''}
Estas son fichas de Google Maps. Para cada una decidí si es un cliente potencial razonable de quien busca (no competencia, no proveedores del mismo rubro). Ante la duda, que entre con puntaje bajo. Usá lo que sabés de la empresa si la conocés.
Respondé SOLO con JSON: {"items": [{"i": índice, "entra": true, "puntaje": 1-5, "segmento": "cuál de los tipos que entran es", "que_es": "qué es en una frase", "encaje": "por qué le serviría a quien busca, concreto", "a_favor": ["..."], "en_contra": ["..."], "cumple": {${filtros.map(f => `"${f.id}": null`).join(', ')}}}]}

${lote.map((f, i) => `${i}. ${f.nombre} — ${f.tipo || 's/d'} — ${f.direccion}${f.web ? ` — ${f.web}` : ''}${f.resenas ? ` — ${f.rating}★ (${f.resenas} reseñas)` : ''} — encontrada buscando "${f.termino}"`).join('\n')}`, 16000)
      const o = extraerObjeto(r.texto)
      const crudos = Array.isArray(o?.items) ? o!.items : objetosDe(r.texto, Math.max(0, r.texto.indexOf('"items"')))
      if (!crudos.length) console.error('evaluar fichas: respuesta sin items', r.texto.slice(0, 200))
      const items = crudos.filter((x: Dic) => x && x.entra !== false && lote[Number(x.i)]).map((x: Dic) => {
        const f = lote[Number(x.i)]
        return { ...f, puntaje: x.puntaje, segmento: x.segmento, que_es: x.que_es, encaje: x.encaje, cumple: x.cumple, razones: { a_favor: x.a_favor ?? [], en_contra: x.en_contra ?? [] }, evaluado: true }
      })
      return { items, usoIn: r.usoIn, usoOut: r.usoOut }
    } catch (e) { console.error('evaluar fichas', e); return { items: [], usoIn: 0, usoOut: 0 } }
  }))
  return { items: partes.flatMap(p => p.items), usoIn: partes.reduce((a, p) => a + p.usoIn, 0), usoOut: partes.reduce((a, p) => a + p.usoOut, 0) }
}

/** La zona elegida en la búsqueda manda sobre cualquier lugar del perfil, la estrategia o las empresas de ejemplo */
const reglaZona = (zona: string) => `ZONA OBLIGATORIA: ${zona}. La eligió la persona para ESTA búsqueda y manda sobre cualquier ciudad, provincia o país que aparezca en su perfil, su cliente ideal, su estrategia o en las empresas de ejemplo (esas sirven para saber QUÉ TIPO de empresa le sirve, nunca DÓNDE buscar). No la cambies ni la achiques a la ciudad de quien busca. Si la zona es un país o varios, repartí los resultados entre distintas provincias, regiones y ciudades (nunca más de un tercio de la misma provincia o ciudad).`
const enfoqueParecidas = (ejemplos: string[], z: string) => ({ nombre: 'parecidas', texto: () => `Enfoque: empresas PARECIDAS a las que ya le sirven a esta persona: ${ejemplos.join('; ')}. Buscá en cualquier parte de ${z} (no sólo cerca de esas empresas) otras con las mismas características (tamaño, forma de operar, necesidad), del mismo rubro o de otros: sus competidores en otras ciudades, empresas del mismo rubro en otros polos industriales, las que aparecen junto a ellas en directorios y en "empresas similares". No traigas esas mismas.` })
const ENFOQUES = [
  { nombre: 'mapas', texto: (r: string, z: string) => `Enfoque: Google Maps y fichas de negocios. Buscá cada término útil + "${z}" (ej. "${r} ${z}").` },
  { nombre: 'directorios', texto: (r: string, z: string) => `Enfoque: directorios de empresas, parques industriales, cámaras empresariales y del sector, guías comerciales y listados ("${r} ${z}", "empresas de <rubro> ${z}", "parque industrial ${z}", "cámara de <rubro> ${z}").` },
  { nombre: 'web', texto: (r: string, z: string) => `Enfoque: webs propias, LinkedIn, noticias y redes (Instagram, Facebook) de empresas que encajan con "${r}" en ${z}: notas de prensa sobre aperturas, ampliaciones, nuevas plantas o sucursales.` },
  { nombre: 'zonas', texto: (r: string, z: string) => `Enfoque: recorré las distintas ciudades, barrios, rutas o polos comerciales/industriales dentro de ${z} para encontrar empresas que encajan con "${r}" y que no aparecen primeras en Google.` },
]


function contextoEmpresa(c: Dic | null) {
  const e = c?.estrategia ?? {}, r = c?.respuestas ?? {}
  if (!e.resumen && !r.que_vende) return ''
  return `Quién busca clientes: ${r.empresa ? r.empresa + '. ' : ''}${e.resumen || String(r.que_vende).slice(0, 600)}
Cliente ideal: ${e.cliente_ideal || r.cliente_ideal || 's/d'}
${e.criterios?.length ? `Señales de buen prospecto: ${e.criterios.join('; ')}\n` : ''}${e.descartar?.length ? `Descartá: ${e.descartar.join('; ')}\n` : ''}${r.no_quiere ? `NO quiere: ${String(r.no_quiere).slice(0, 300)}\n` : ''}${r.ejemplos ? `Empresas que ya son sus clientes o que le encantaría tener (buscá parecidas): ${String(r.ejemplos).slice(0, 400)}\n` : ''}`
}

function prompt(o: { tipos?: string[], pais: string, multi?: boolean, rubro: string, zona: string, cuantos: number, enfoque: string, filtros: Dic[], pedido: string, excluir: string[], contexto: string, brief: Brief, aprendido: string }) {
  const reglas = o.filtros.length
    ? o.filtros.map(f => `${f.titulo}${f.descripcion ? ` (${f.descripcion})` : ''}`)
    : []
  const b = o.brief
  return `Buscá en la web empresas reales y activas en "${o.zona}"${o.zona.toLowerCase().includes(o.pais.toLowerCase()) ? '' : ` (${o.pais})`} que sean clientes potenciales: empresas que COMPRARÍAN lo que vende quien busca, nunca competencia, integradores ni proveedores de lo mismo.
${o.multi ? `La zona abarca varios países: repartí los resultados entre los principales mercados de esa zona (no todos del mismo país) y poné el país en la dirección.\n` : ''}${reglaZona(o.zona)}
Pedido original: "${o.rubro}".
Qué buscamos exactamente (el TIPO de empresa; el lugar es ${o.zona}): ${b.interpretacion}
${b.incluir.length ? `Tipos de empresa que SÍ entran: ${b.incluir.join('; ')}.
` : ''}${b.excluir.length ? `NO incluyas (aunque aparezcan con palabras parecidas): ${b.excluir.join('; ')}.
` : ''}${o.tipos?.length ? `En ESTA búsqueda concentrate en estos tipos de empresa (traé de cada uno, no de uno solo): ${o.tipos.join('; ')}.\n` : ''}Términos útiles para buscar: ${b.buscar.map(t => `"${t}"`).join(', ')}.

${o.contexto || 'Objetivo: armar una lista de prospectos comerciales para contactar.'}
${o.aprendido}
${o.enfoque}

${reglas.length ? `Requisitos que tienen que cumplir (si no lo podés comprobar pero es probable, incluila igual y poné null en "cumple"; dejá afuera sólo las que claramente no cumplen):\n- ${reglas.join('\n- ')}\nEn cada empresa completá "cumple" con cada requisito: true si lo comprobaste, false si claramente no lo cumple, null si no se sabe.\n` : ''}
Reglas:
- Si de un negocio encontraste el nombre pero no el teléfono, hacé una búsqueda más con su nombre para completarlo.
- Usá sólo información pública. No inventes datos: si no encontrás algo, dejalo vacío.
${o.pedido ? `- Pedido especial del usuario (respetalo): ${o.pedido}\n` : ''}${o.excluir.length ? `- Ya los tengo cargados, NO los repitas: ${o.excluir.join('; ')}.\n` : ''}
Traé ${o.cuantos} negocios o más (cuantos más reales y que encajen, mejor; hacé varias búsquedas distintas para llegar). Al final respondé SOLO con un bloque JSON (sin texto después) con este formato:
\`\`\`json
[{"nombre": "nombre comercial tal como lo conoce la gente", "tipo": "qué es, en 2-4 palabras", "direccion": "calle y número, localidad", "telefono": "", "email": "", "web": "https://...", "google_maps": "https://maps.google.com/... o https://maps.app.goo.gl/...", "instagram": "https://www.instagram.com/usuario/", "facebook": "https://www.facebook.com/...", "linkedin": "https://www.linkedin.com/company/...", "rating": "", "resenas": "", "fuente": "url donde lo encontraste", "segmento": "cuál de los tipos de empresa pedidos es (copialo tal cual)", "que_es": "qué es la empresa en una o dos frases concretas: qué hace o vende, a quién, tamaño aproximado y dónde opera", "encaje": "por qué LE SERVIRÍA a quien busca: conectá lo que vende quien busca con algo concreto que viste de esta empresa (qué viste de la empresa → por qué eso la hace candidata para lo que vende quien busca)", "puntaje": 4, "razones": {"a_favor": ["razón concreta y verificable que viste", "otra razón"], "en_contra": ["señal en contra si la hay"]}, "senales": "novedad reciente que da motivo para escribir ahora (está contratando, abrió sucursal, salió en noticias), o vacío", "decisor": {"nombre": "", "cargo": "", "linkedin": "", "fuente": "url donde lo viste"}, "nota": "dato útil para el primer contacto (opcional)"${o.filtros.length ? `, "cumple": {${o.filtros.map(f => `"${f.id}": true`).join(', ')}}` : ''}}]
\`\`\`
"nombre": el nombre comercial limpio, sin sufijos como "- Inicio" o "| Facebook". "web": la URL del sitio propio del negocio (aunque sea un link de reservas), o vacío. "google_maps", "instagram", "facebook" y "linkedin": sólo si viste el link real, si no vacío. "rating" y "resenas" sólo si los viste. "puntaje": de 1 a 5, qué tan buen prospecto es según lo que buscamos; "razones": las razones concretas de ese puntaje (a favor y en contra), sólo cosas que viste. "decisor": la persona que decide la compra de lo que vendemos (dueño, gerente comercial, compras, logística, según el rubro) si aparece en su web, en LinkedIn público o en notas de prensa, con la url donde lo viste; si no lo encontraste, dejalo vacío (no inventes nombres). "senales": sólo novedades reales y recientes que hayas visto.`
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

/** Lo que la persona (y su equipo) ya juzgó: qué empresas le sirvieron y cuáles descartó y por qué */
async function aprendizaje(db: any, owner: string, equipo: string[]) {
  const [{ data: pros }, { data: aprob }, { data: malos }] = await Promise.all([
    db.from('prospectos').select('nombre, rubro, encaje, calificacion, estado, owner_id, perdido_motivo').in('owner_id', equipo)
      .order('calificacion', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false }).limit(120),
    db.from('hallazgos').select('nombre, rubro, encaje').in('owner_id', equipo).eq('estado', 'aprobado').order('revisado_at', { ascending: false, nullsFirst: false }).limit(30),
    db.from('hallazgos').select('nombre, rubro, motivo').in('owner_id', equipo).eq('estado', 'descartado').order('revisado_at', { ascending: false, nullsFirst: false }).limit(30),
  ])
  const linea = (p: Dic) => `${p.nombre}${p.rubro ? ` (${p.rubro})` : ''}${p.encaje ? ` — ${String(p.encaje).slice(0, 90)}` : ''}`
  const todos = (pros ?? []) as Dic[]
  const fuerte = (p: Dic) => p.calificacion === 3 || ['respondio', 'reunion', 'propuesta', 'cliente'].includes(p.estado)
  const malo = (p: Dic) => p.calificacion === 1 || ['no_interesado', 'no_contactar', 'perdido'].includes(p.estado)
  const muy = todos.filter(fuerte).slice(0, 15)
  const vistos = new Set(muy.map(p => String(p.nombre).toLowerCase()))
  // Las que sumó a su lista (desde la bandeja o a mano): le sirven
  const si = [...todos.filter(p => !fuerte(p) && !malo(p)), ...((aprob ?? []) as Dic[])]
    .filter(p => { const k = String(p.nombre).toLowerCase(); if (vistos.has(k)) return false; vistos.add(k); return true }).slice(0, 20)
  const flojos = todos.filter(malo).slice(0, 10)
  const no = (malos ?? []) as Dic[]
  const total = muy.length + si.length + flojos.length + no.length
  // Sólo las que de verdad funcionaron (respondieron, reunión, cliente o calificadas con 3) disparan la búsqueda de parecidas
  const ejemplos = muy.slice(0, 8).map(p => `${p.nombre}${p.rubro ? ` (${p.rubro})` : ''}`)
  if (!total) return { texto: '', sirven: 0, noSirven: 0, ejemplos }
  const texto = `Lo que aprendimos de esta persona por las empresas que ya eligió y las que descartó. Usalo para entender QUÉ CARACTERÍSTICAS hacen buena a una empresa para ella (tamaño, forma de operar, necesidad) y cuáles no, NO para quedarte en el mismo rubro: buscá esas características también en otras industrias. Si casi todas son del mismo rubro, es porque es lo que se le mostró hasta ahora, no porque sólo quiera eso:
${muy.length ? `- Le sirven MUCHO (respondieron, tienen reunión o son clientes): ${muy.map(linea).join('; ')}\n` : ''}${si.length ? `- Le sirven (las sumó a su lista): ${si.map(linea).join('; ')}\n` : ''}${flojos.length ? `- NO le sirvieron después de contactarlas: ${flojos.map(p => `${linea(p)}${p.perdido_motivo ? ` — motivo: ${p.perdido_motivo}` : ''}`).join('; ')}\n` : ''}${no.length ? `- Descartadas (NO le sirven): ${no.map(p => `${p.nombre}${p.rubro ? ` (${p.rubro})` : ''}${p.motivo ? ` — motivo: ${p.motivo}` : ''}`).join('; ')}\n` : ''}`
  return { texto, sirven: muy.length + si.length, noSirven: no.length + flojos.length, ejemplos }
}

/** Filtros de contacto se comprueban con los datos; el resto los evalúa Claude con lo que ve públicamente */
function tipoFiltro(f: Dic) {
  const t = `${f.id} ${f.titulo}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (/sin_web|sin (pagina )?web|no tiene (pagina )?web/.test(t)) return 'sin_web'
  if (/telefono|whatsapp|celular/.test(t)) return 'telefono'
  if (/e-?mail|correo/.test(t)) return 'email'
  if (/instagram/.test(t)) return 'instagram'
  return 'ia'
}

type Brief = { interpretacion: string, buscar: string[], incluir: string[], excluir: string[], especifica?: boolean, opciones?: string[] }

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
async function interpretar(key: string, modelo: string, rubro: string, zona: string, contexto: string, aprendido = '', pais = 'Argentina', multi = false): Promise<{ brief: Brief, usoIn: number, usoOut: number }> {
  const base: Brief = { interpretacion: rubro, buscar: [rubro], incluir: [], excluir: [] }
  try {
    const r = await llamarClaude(key, modelo, `Sos analista comercial B2B ${multi ? 'en Latinoamérica' : `en ${pais}`}. Una persona quiere encontrar clientes potenciales y escribió: "${rubro}".
${contexto ? `\nQuién busca y qué vende:\n${contexto}\n` : ''}${aprendido ? `\n${aprendido}\n` : ''}
IMPORTANTE: describí sólo el TIPO de empresa, sin ningún lugar. En "interpretacion", "incluir", "excluir" y "buscar" NO pongas países, provincias, ciudades ni barrios (el lugar lo elige la persona aparte y se agrega solo).

Interpretá qué empresas le sirven COMO CLIENTES, pensando en lo que vende quien busca. Primero preguntate QUÉ NECESIDAD o característica hace que una empresa le compre (por ejemplo: tener mucho stock, una flota, muchos empleados, atención al público, un local grande, exportar), y después pensá en TODAS las industrias donde aparece esa necesidad. Las palabras ambiguas se resuelven por lo que vende (si vende algo para depósitos y escribe "depósito", son empresas que TIENEN depósito propio, no las que alquilan bauleras o hacen mudanzas). Si no hay contexto, elegí la lectura comercial más probable.
VARIEDAD (obligatorio): en "incluir" poné de 5 a 8 tipos de empresa de industrias DISTINTAS entre sí (no cinco variantes del mismo rubro, por ejemplo no alimentos + bebidas + golosinas + almacén). No te quedes en el rubro más obvio ni en el rubro de las empresas de ejemplo: esas muestran qué características sirven, no el único rubro posible. Sólo si la persona pidió un rubro puntual (ej.: "bodegas", "farmacias"), quedate en ese rubro.
Nunca incluyas como clientes a empresas que venden o instalan lo mismo que quien busca (competencia, integradores, revendedores) ni a sus proveedores: van siempre en "excluir".

${multi ? `La búsqueda abarca varios países (${pais}): incluí términos con las variantes de vocabulario de cada país (ej.: "depósito" en Argentina, "bodega" en Chile, "almacén" en México).` : `Los términos de búsqueda tienen que estar en el vocabulario de ${pais} (ej.: en Chile "bodega" es depósito; en México "almacén").`}

Respondé SOLO con JSON:
{"especifica": true o false (false si el pedido es tan general que puede ser casi cualquier empresa, como "empresas", "empresas con depósito", "negocios grandes"; true si ya dice un tipo de empresa concreto o una característica clara), "opciones": ["si especifica es false: 4 a 6 búsquedas CONCRETAS que la persona podría elegir, cada una con un tipo de empresa + una característica verificable, cortas, en minúscula y sin lugares (ej.: 'operadores logísticos con depósito propio', 'laboratorios que están ampliando su planta'); si es true, 2 o 3 variantes más específicas"], "interpretacion": "una frase clara en español de qué empresas vamos a buscar", "buscar": ["6 a 10 términos concretos como aparecen en Google Maps o directorios, repartidos entre los distintos tipos de "incluir""], "incluir": ["5 a 8 tipos de empresa de industrias distintas que sí entran, del que más encaja al que menos"], "excluir": ["3 a 6 tipos de empresa que NO entran aunque aparezcan con palabras parecidas"]}`, 8000)
    const o = extraerObjeto(r.texto)
    if (!o) return { brief: base, usoIn: r.usoIn, usoOut: r.usoOut }
    return {
      brief: { ...limpiarBrief({ interpretacion: String(o.interpretacion ?? rubro).slice(0, 300), buscar: lista(o.buscar, 10).length ? lista(o.buscar, 10) : [rubro], incluir: lista(o.incluir, 8), excluir: lista(o.excluir, 8) }, zona),
        especifica: o.especifica !== false, opciones: lista(o.opciones, 6).map(x => sinLugares(x, zona)).filter(x => x.length > 3) },
      usoIn: r.usoIn, usoOut: r.usoOut,
    }
  } catch (e) { console.error('interpretar', e); return { brief: base, usoIn: 0, usoOut: 0 } }
}

/** El brief describe el tipo de empresa: se le sacan los lugares que no son la zona elegida */
function limpiarBrief(b: Brief, zona: string): Brief {
  const l = (x: string) => sinLugares(x, zona)
  const terminos = (v: string[]) => [...new Set(v.map(l).filter(t => t.length > 2))]
  return { interpretacion: l(b.interpretacion) || b.interpretacion, buscar: terminos(b.buscar).length ? terminos(b.buscar) : b.buscar.map(l), incluir: terminos(b.incluir), excluir: terminos(b.excluir) }
}
function briefDesde(b: unknown, rubro: string): Brief | null {
  if (!b || typeof b !== 'object') return null
  const o = b as Dic
  return { interpretacion: String(o.interpretacion ?? rubro).slice(0, 300), buscar: lista(o.buscar, 10).length ? lista(o.buscar, 10) : [rubro], incluir: lista(o.incluir, 10), excluir: lista(o.excluir, 10) }
}

/** Segunda mirada: descarta lo que no es el tipo de empresa pedido o no cumple los filtros, y marca las más parecidas a las que le sirven */
async function verificar(key: string, modelo: string, brief: Brief, items: Dic[], aprendido = '', requisitos: Dic[] = [], zona = '') {
  const todos = new Set(items.map((_, i) => i))
  if (!items.length) return { quedan: todos, parecidas: new Set<number>(), noCumplen: 0, usoIn: 0, usoOut: 0 }
  try {
    const r = await llamarClaude(key, modelo, `Buscamos: ${brief.interpretacion}
${brief.incluir.length ? `Entran: ${brief.incluir.join('; ')}\n` : ''}${brief.excluir.length ? `NO entran: ${brief.excluir.join('; ')}\n` : ''}${requisitos.length ? `Requisitos OBLIGATORIOS (si por lo que dice de la empresa claramente no cumple alguno, no entra): ${requisitos.map(f => `${f.titulo}${f.descripcion ? ` (${f.descripcion})` : ''}`).join('; ')}\n` : ''}${aprendido ? `${aprendido}\n` : ''}
${zona ? `Zona pedida: ${zona}. Las que claramente están fuera de esa zona no entran.\n` : ''}Para cada empresa decidí si entra como CLIENTE. No entran: competencia (venden o instalan lo mismo que quien busca), integradores, revendedores o proveedores del mismo rubro, ni las que no cumplen los requisitos. Ante la duda razonable sobre el tipo de empresa, que entre.${aprendido ? ' Además marcá en "parecidas" las que más se parecen a las que le sirven a esta persona.' : ''}
Respondé SOLO con JSON: {"no_entran": [índices], "no_cumplen": [índices de las que no entran por un requisito]${aprendido ? ', "parecidas": [índices]' : ''}}

${items.map((n, i) => `${i}. ${n.nombre} — ${n.rubro}${n.encaje ? ` — ${n.encaje}` : ''}${n.razones?.a_favor?.length ? ` — a favor: ${n.razones.a_favor.join(', ')}` : ''}${n.razones?.en_contra?.length ? ` — en contra: ${n.razones.en_contra.join(', ')}` : ''}${n.direccion ? ` — ${n.direccion}` : ''}${n.web_actual ? ` — ${n.web_actual}` : ''}`).join('\n')}`, 8000)
    const o = extraerObjeto(r.texto)
    const nums = (v: unknown) => new Set((Array.isArray(v) ? v : []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < items.length))
    const fuera = nums(o?.no_entran), noCumplen = nums(o?.no_cumplen)
    for (const n of noCumplen) fuera.add(n)
    // Si quiere sacar casi todo por el tipo de empresa, probablemente entendió mal: sólo se aplican los requisitos
    if (fuera.size > items.length * 0.8) { fuera.clear(); for (const n of noCumplen) fuera.add(n) }
    return { quedan: new Set([...todos].filter(i => !fuera.has(i))), parecidas: nums(o?.parecidas), noCumplen: noCumplen.size, usoIn: r.usoIn, usoOut: r.usoOut }
  } catch (e) { console.error('verificar', e); return { quedan: todos, parecidas: new Set<number>(), noCumplen: 0, usoIn: 0, usoOut: 0 } }
}

/** Saca los objetos {...} de una lista JSON aunque venga cortada (si la respuesta se cortó por largo, no se pierde todo) */
function objetosDe(texto: string, desde = 0): Dic[] {
  const out: Dic[] = []
  let prof = 0, enTexto = false, escape = false, inicio = -1, base = -1
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i]
    if (enTexto) { if (escape) escape = false; else if (c === '\\') escape = true; else if (c === '"') enTexto = false; continue }
    if (c === '"') { enTexto = true; continue }
    if (c === '[' || c === '{') {
      if (c === '{' && base >= 0 && prof === base) inicio = i
      if (c === '[' && base < 0) base = prof + 1
      prof++
    } else if (c === ']' || c === '}') {
      prof--
      if (c === '}' && prof === base && inicio >= 0) {
        try { out.push(JSON.parse(texto.slice(inicio, i + 1).replace(/,\s*([}\]])/g, '$1'))) } catch { /* objeto roto: se saltea */ }
        inicio = -1
      }
      if (prof < base) break
    }
  }
  return out
}
function extraerLista(texto: string): Dic[] {
  const bloques = [...texto.matchAll(/```json\s*([\s\S]*?)```/g)].map(m => m[1])
  const bloque = bloques.at(-1) ?? texto.match(/\[[\s\S]*\]/)?.[0]
  if (bloque) { try { const v = JSON.parse(bloque); if (Array.isArray(v)) return v } catch { /* sigue abajo */ } }
  // Respuesta cortada o con basura: rescatar empresa por empresa
  const ini = texto.lastIndexOf('```json')
  return objetosDe(texto, ini >= 0 ? ini : Math.max(0, texto.indexOf('[')))
}

async function unaBusqueda(key: string, modelo: string, texto: string, limiteMs: number, ubic: { code: string, tz: string } = { code: 'AR', tz: 'America/Argentina/Buenos_Aires' }) {
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
          model: modelo, max_tokens: 16000, messages,
          tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 8,
                    ...(ubic.code ? { user_location: { type: 'approximate', country: ubic.code, timezone: ubic.tz } } : {}) }],
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

export async function buscar(req: Request, h: Ayudas) {
  claveServicio = h.claveServicio; json = h.json
  let usuario
  try { usuario = await h.clienteDelUsuario(req) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const { supabase, user } = usuario
  const db = h.admin()
  const body = await req.json().catch(() => ({}))

  const { data: acceso } = await supabase.rpc('mi_acceso')
  if (acceso && acceso.habilitado === false) return json({ error: 'Tu cuenta o tu empresa está suspendida.' }, 403)

  const rubroCrudo = String(body.rubro ?? '').trim().slice(0, 500)
  const zonaCruda = String(body.zona ?? '').trim().slice(0, 80)
  // "neuquen" → "Neuquen": si viene todo en minúsculas, mayúscula en cada palabra (salvo de/del/la…)
  const zona = zonaCruda === zonaCruda.toLowerCase()
    ? zonaCruda.replace(/(^|[\s,(])([a-záéíóúñ])([a-záéíóúñ]*)/g, (m, a, b, c) => ['de', 'del', 'la', 'las', 'los', 'el', 'y'].includes(b + c) && a !== '' ? m : a + b.toUpperCase() + c)
    : zonaCruda
  const pais = paisDe(zona)
  // El lugar sale SOLO del selector "Dónde": si escribió un lugar en "Qué buscás" o en el pedido especial, se ignora
  const rubro = sinLugares(rubroCrudo, zona) || rubroCrudo
  const pedido = sinLugares(String(body.pedido ?? '').trim().slice(0, 400), zona)
  const cantidad = Math.min(Math.max(Number(body.cantidad) || 10, 5), 40)
  // Filtros elegidos: [{id, titulo, descripcion}]. Compatibilidad con la versión anterior ({requisitos: {sin_web, ...}}).
  let filtros: Dic[] = Array.isArray(body.filtros) ? body.filtros.slice(0, 12).map((f: Dic) => ({ id: String(f.id ?? '').slice(0, 40), titulo: String(f.titulo ?? '').slice(0, 80), descripcion: String(f.descripcion ?? '').slice(0, 220) })).filter((f: Dic) => f.titulo) : []
  if (!Array.isArray(body.filtros) && body.requisitos) {
    const T: Dic = { sin_web: 'Sin página web propia', con_telefono: 'Con teléfono o WhatsApp', con_instagram: 'Con Instagram' }
    filtros = Object.keys(T).filter(k => k === 'sin_web' ? body.requisitos.sin_web !== false : !!body.requisitos[k]).map(k => ({ id: k, titulo: T[k], descripcion: '' }))
  }
  const ids = new Set(filtros.map(f => f.id))
  const tipos = new Set(filtros.map(tipoFiltro))
  const filtrosIA = filtros.filter(f => tipoFiltro(f) === 'ia')
  const guardar = body.guardar !== false
  if ((!rubro && body.modo !== 'preguntar') || !zona) return json({ error: 'Escribí qué buscás y dónde.' }, 400)

  const { data: cupo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  if (cupo && cupo.usados >= cupo.limite) return json({ error: cupo.mensaje || `Llegaste al límite de ${cupo.limite} consultas de IA de hoy. Mañana se renueva.`, codigo: 'LIMITE_CHAT', cupo }, 429)
  const key = await claveServicio('anthropic')
  if (!key) return json({ error: 'Falta la clave de Claude: la carga el super admin en Super admin → Claves.', codigo: 'SIN_CLAVE' }, 503)
  const modelo = (await claveServicio('modelo_busqueda')) || 'claude-haiku-5-5' // barato y rinde bien para buscar

  const { data: comercial } = await supabase.from('perfil_comercial').select('respuestas, estrategia').eq('owner_id', user.id).maybeSingle()
  const contexto = sinLugares(contextoEmpresa(comercial), zona)
  const modeloRapido = (await claveServicio('modelo_resumen')) || 'claude-haiku-5-5'

  // Paso 1: entender qué quiere (y qué NO). Con modo "interpretar" sólo devuelve esto para que la persona lo ajuste.
  let usoIn = 0, usoOut = 0
  const { data: yo } = await db.from('perfiles').select('empresa_id').eq('id', user.id).maybeSingle()
  let equipo = [user.id]
  if (yo?.empresa_id) {
    const { data: comp } = await db.from('perfiles').select('id').eq('empresa_id', yo.empresa_id).limit(200)
    equipo = [...new Set([user.id, ...(comp ?? []).map((c: Dic) => c.id)])]
  }
  const aprCrudo = await aprendizaje(db, user.id, equipo)
  // Las empresas que le sirven enseñan el TIPO de empresa, no el lugar
  const apr = { ...aprCrudo, texto: sinLugares(aprCrudo.texto, zona), ejemplos: aprCrudo.ejemplos.map(e => sinLugares(e, zona)) }
  // Guía: preguntas para que la búsqueda quede concreta (pensadas para este negocio y este pedido)
  if (body.modo === 'preguntar') {
    try {
      const r = await llamarClaude(key, modeloRapido, `Sos un asistente que ayuda a una persona a armar una búsqueda de clientes potenciales (empresas) que sea CONCRETA, porque las búsquedas generales traen resultados malos.
${contexto ? `Quién busca y qué vende:\n${contexto}\n` : 'No sabemos qué vende: la PRIMERA pregunta tiene que ser qué vende (con opciones variadas de productos y servicios) y las otras, a quién se lo vende.\n'}${apr.texto ? `${apr.texto}\n` : ''}
Lo que escribió: "${rubro || '(todavía nada)'}"

Hacé de 2 a 3 preguntas cortas para concretar QUÉ TIPO de empresa le conviene buscar, desde el punto de vista de LO QUE VENDE esta persona. Las preguntas y las respuestas cambian totalmente según el negocio; nunca uses preguntas de otro rubro. Ejemplos de cómo cambian (sólo para que veas la idea, no los copies):
- Si vende pasta de maní: "¿A quién se la querés vender?" → dietéticas, gimnasios, cafeterías de especialidad, supermercados chicos, distribuidoras de alimentos saludables; "¿En qué formato?" → para revender, para usar en su cocina, marca propia.
- Si es una empresa de camiones o fletes: "¿Qué carga querés mover?" → granos, materiales de construcción, alimentos refrigerados, mudanzas corporativas; "¿Qué cliente?" → fábricas que despachan todos los días, acopios, corralones, e-commerce.
- Si automatiza depósitos: "¿Qué operación?" → operadores logísticos, e-commerce, laboratorios, frigoríficos; "¿Qué señal?" → está contratando operarios, amplió el depósito.
La primera pregunta casi siempre es a qué tipo de comprador o industria le quiere vender, con opciones pensadas para su producto. La segunda o tercera, una característica visible o un momento que indique que necesita lo que vende (tamaño, si tiene tal cosa, si está creciendo, qué problema tiene). Cada pregunta con 4 a 6 respuestas posibles, cortas (2 a 6 palabras), concretas y distintas entre sí, de industrias variadas cuando corresponda. NO preguntes por el lugar ni pongas lugares (eso ya lo eligió aparte).
Respondé SOLO con JSON: {"preguntas": [{"pregunta": "...", "opciones": ["...", "..."], "varias": true o false}]}`, 2000)
      usoIn += r.usoIn; usoOut += r.usoOut
      const o = extraerObjeto(r.texto)
      const preguntas = (Array.isArray(o?.preguntas) ? o!.preguntas : []).slice(0, 3).map((q: Dic) => ({
        pregunta: String(q.pregunta ?? '').slice(0, 140), varias: !!q.varias,
        opciones: lista(q.opciones, 6).map(x => sinLugares(x, zona).slice(0, 60)).filter(Boolean),
      })).filter((q: Dic) => q.pregunta && q.opciones.length >= 2)
      return json({ preguntas })
    } catch (e) { console.error('preguntar', e); return json({ preguntas: [] }) }
  }
  let brief = briefDesde(body.brief, rubro)
  if (brief) brief = limpiarBrief(brief, zona)
  if (!brief) {
    const it = await interpretar(key, modeloRapido, rubro, zona, contexto, apr.texto, pais.nombre, pais.multi)
    brief = it.brief; usoIn += it.usoIn; usoOut += it.usoOut
  }
  if (body.modo === 'interpretar') return json({ brief, zona, pais: pais.nombre, aprendizaje: { sirven: apr.sirven, no_sirven: apr.noSirven, ejemplos: apr.ejemplos.slice(0, 5) } }) // no descuenta cupo: es una consulta chiquita

  // Lo que ya conoce la cuenta y su equipo (en la lista, en la bandeja o descartado): no se vuelve a traer
  const [{ data: hs }, { data: ps }] = await Promise.all([
    db.from('hallazgos').select('nombre, telefono_norm, zona, estado, web').in('owner_id', equipo).order('created_at', { ascending: false }).limit(5000),
    db.from('prospectos').select('nombre, telefono_norm, zona, dominio_norm').in('owner_id', equipo).order('created_at', { ascending: false }).limit(5000),
  ])
  const conocidos = [...(hs ?? []), ...(ps ?? [])] as Dic[]
  const nomConocidos = new Set(conocidos.map(c => clave(c.nombre)))
  const dominio = (w: string) => { try { return new URL(/^https?:/.test(w) ? w : 'https://' + w).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
  const domConocidos = new Set([...(ps ?? []).map((c: Dic) => c.dominio_norm), ...(hs ?? []).map((h: Dic) => h.web ? dominio(h.web) : '')].filter(Boolean))
  const telConocidos = new Set(conocidos.map(c => c.telefono_norm).filter(Boolean))
  const nomDescartados = new Set((hs ?? []).filter((h: Dic) => h.estado === 'descartado').map((h: Dic) => clave(h.nombre)))
  const zonaClave = clave(zona)
  const excluir = conocidos.filter(c => !zonaClave || clave(c.zona ?? '').includes(zonaClave) || zonaClave.includes(clave(c.zona ?? '') || '~')).map(c => c.nombre).slice(0, 150)

  // Paso 2: varias búsquedas en paralelo, cada una con otro enfoque
  // Con empresas que ya le sirven, una de las búsquedas va siempre a buscar parecidas a esas
  // Si la zona es uno o varios países, cada búsqueda va a una parte distinta (país o región): así no se amontonan en un solo lugar
  const partes = partesDeZona(zona, 4)
  const lotes = Math.min(4, Math.max(apr.ejemplos.length ? 2 : 1, Math.ceil(cantidad / 10), partes.length))
  const cuantos = Math.ceil(cantidad / lotes) + 2
  const tareas = Array.from({ length: lotes }, (_, i) => {
    const parte = partes[i % partes.length]
    const e = i === 0 && apr.ejemplos.length ? enfoqueParecidas(apr.ejemplos, parte.zona) : ENFOQUES[(i - (apr.ejemplos.length ? 1 : 0) + ENFOQUES.length) % ENFOQUES.length]
    return { parte, e }
  })
  // Cada búsqueda recorre tipos de empresa distintos (así no se van todas al rubro más obvio)
  const tiposDe = (i: number) => {
    const t = brief!.incluir
    if (t.length <= 2 || lotes === 1) return t
    const mios = t.filter((_, k) => k % lotes === i % lotes)
    return mios.length ? mios : t
  }
  // Google Maps en paralelo: muchas fichas reales por cada término, evaluadas por Claude
  const mapsPromesa = (async () => {
    const clavePlaces = await claveServicio('google_places')
    if (!clavePlaces) return { items: [] as Dic[], usoIn: 0, usoOut: 0, fichas: 0, estado: 'sin_clave' }
    const u = partes.length === 1 ? { code: partes[0].code, zona: partes[0].zona } : { code: '', zona }
    const terminos = [...new Set([...brief!.buscar, ...brief!.incluir])].slice(0, 8)
    const fichas = (await desdeMaps(clavePlaces, terminos, u.zona, u.code)).filter(f => !nomConocidos.has(clave(f.nombre)))
    const ev = await evaluarFichas(key, modeloRapido, brief!, fichas.slice(0, 120), contexto, apr.texto, filtrosIA)
    return { ...ev, fichas: fichas.length, estado: errorMaps ? 'error: ' + errorMaps.slice(0, 120) : 'ok' }
  })().catch(e => { console.error('maps', e); return { items: [] as Dic[], usoIn: 0, usoOut: 0, fichas: 0, estado: 'error: ' + String(e).slice(0, 120) } })
  const corridas = await Promise.all(tareas.map(({ parte, e }, i) => {
    const u = paisDe(parte.zona)
    return unaBusqueda(key, modelo, prompt({ tipos: tiposDe(i), pais: u.multi ? pais.nombre : u.nombre, multi: false, rubro, zona: parte.zona, cuantos, enfoque: e.texto(brief!.buscar.filter((_, k) => k % lotes === i % lotes).slice(0, 4).join('", "') || brief!.buscar.slice(0, 3).join('", "'), parte.zona), filtros, pedido, excluir, contexto, brief: brief!, aprendido: apr.texto }), 110_000, { code: parte.code, tz: parte.tz })
  }))
  usoIn += corridas.reduce((a, c) => a + c.usoIn, 0); usoOut += corridas.reduce((a, c) => a + c.usoOut, 0)
  const deMaps = await mapsPromesa
  usoIn += deMaps.usoIn; usoOut += deMaps.usoOut
  const crudos = [...deMaps.items, ...corridas.flatMap(c => extraerLista(c.salida))]
  console.log('busqueda', JSON.stringify({ zona, maps: deMaps.estado, fichas: deMaps.fichas, sirven: deMaps.items.length, web: corridas.map(c => extraerLista(c.salida).length), largo: corridas.map(c => c.salida.length) }))
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
      descripcion: String(n.que_es ?? '').trim().slice(0, 400),
      segmento: String(n.segmento ?? '').trim().toLowerCase().slice(0, 80),
      puntaje: puntaje >= 1 && puntaje <= 5 ? puntaje : null,
      razones: { a_favor: (Array.isArray(n.razones?.a_favor) ? n.razones.a_favor : []).map(String).filter(Boolean).slice(0, 5), en_contra: (Array.isArray(n.razones?.en_contra) ? n.razones.en_contra : []).map(String).filter(Boolean).slice(0, 4) },
      senales: String(n.senales ?? '').slice(0, 300),
      decisor: n.decisor?.nombre ? { nombre: String(n.decisor.nombre).slice(0, 80), cargo: String(n.decisor.cargo ?? '').slice(0, 80), linkedin: linkDe(n.decisor.linkedin, /linkedin\.com\//i), fuente: /^https?:\/\//.test(String(n.decisor.fuente ?? '')) ? String(n.decisor.fuente) : '' } : null,
      es_prospecto: esProspecto,
      no_cumple: filtrosIA.some(f => n.cumple && typeof n.cumple === 'object' && n.cumple[f.id] === false),
      evaluado: !!n.evaluado,
    }
  }).filter(n => {
    const k = clave(n.nombre), t = normalizarTelefono(n.telefono)
    if (!n.nombre || vistosNom.has(k) || (t && vistosTel.has(t))) return false
    vistosNom.add(k); if (t) vistosTel.add(t)
    const dom = n.web_actual && !/facebook|instagram|linktr|wa\.me/i.test(n.web_actual) ? dominio(n.web_actual) : ''
    if (nomConocidos.has(k) || (t && telConocidos.has(t)) || (dom && domConocidos.has(dom))) { yaConocidos++; if (nomDescartados.has(k)) yaDescartados++; return false }
    if ((tipos.has('telefono') && !n.telefono) || (tipos.has('email') && !n.email) || (tipos.has('instagram') && !n.instagram) || (tipos.has('sin_web') && !n.es_prospecto) || n.no_cumple) { descartados++; return false }
    return true
  })

  // Paso 3: segunda mirada contra lo que se pidió
  const web = candidatos.filter(c => !c.evaluado)
  const ver = await verificar(key, modeloRapido, brief, web, apr.texto, filtrosIA, zona)
  usoIn += ver.usoIn; usoOut += ver.usoOut
  const noEncajan = web.length - ver.quedan.size - ver.noCumplen + Math.max(0, deMaps.fichas - deMaps.items.length)
  descartados += ver.noCumplen
  const quedanWeb = new Set(web.filter((_, i) => ver.quedan.has(i)))
  const parecida = new Set(web.filter((_, i) => ver.parecidas.has(i)).map(c => c.nombre))
  const resultados = candidatos.filter(c => c.evaluado || quedanWeb.has(c))
    .map(c => parecida.has(c.nombre) ? { ...c, nota: c.nota ? c.nota : 'Parecida a las que te sirven', razones: { ...c.razones, a_favor: ['Parecida a empresas que ya te sirven', ...c.razones.a_favor].slice(0, 5) } } : c)
    .sort((a, b) => Number(parecida.has(b.nombre)) - Number(parecida.has(a.nombre)) || (b.puntaje ?? 0) - (a.puntaje ?? 0) || Number(!!b.telefono) - Number(!!a.telefono) || Number(!!b.email) - Number(!!a.email))
    // Variedad: ningún tipo de empresa se lleva más de un tercio de los resultados (salvo que haya pocos tipos)
    .filter(((cuenta: Record<string, number>) => (c: Dic) => {
      if (brief!.incluir.length <= 2 || !c.segmento) return true
      const tope = Math.max(3, Math.ceil(cantidad / 2.5))
      cuenta[c.segmento] = (cuenta[c.segmento] ?? 0) + 1
      return cuenta[c.segmento] <= tope
    })({}))
    .slice(0, cantidad + 5)
  if (usoIn) await db.from('chat_uso').insert({ owner_id: user.id, tokens_in: usoIn, tokens_out: usoOut })

  // Guardar en la bandeja "Por revisar"
  let busquedaId: string | null = null
  let salida: Dic[] = resultados.map(({ es_prospecto, no_cumple, segmento, evaluado, ...r }) => ({ ...r, id: null, estado: 'no_guardado' }))
  if (guardar && resultados.length) {
    const { data: b } = await db.from('busquedas').insert({ owner_id: user.id, rubro, zona, pedido, requisitos: { filtros: [...ids], brief }, cantidad, encontrados: resultados.length }).select('id').single()
    busquedaId = b?.id ?? null
    const filas = resultados.map(({ es_prospecto, no_cumple, segmento, evaluado, web_actual, ...r }) => ({ ...r, web: web_actual, busqueda_id: busquedaId, owner_id: user.id,
      google_maps_url: r.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([r.nombre, r.direccion, zona].filter(Boolean).join(' '))}` }))
    const { data: ins, error } = await supabase.from('hallazgos').upsert(filas, { onConflict: 'owner_id,clave_nombre', ignoreDuplicates: true }).select('*')
    if (error) console.error('hallazgos', error)
    salida = (ins ?? []) as Dic[]
    if (busquedaId) await db.from('busquedas').update({ guardados: salida.length, ya_estaban: yaConocidos }).eq('id', busquedaId)
  }

  const { data: cupoNuevo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  return json({
    resultados: salida, busqueda_id: busquedaId, brief, descartados, no_encajan: noEncajan, ya_conocidos: yaConocidos, ya_descartados: yaDescartados, cupo: cupoNuevo,
    diagnostico: { maps: deMaps.estado, maps_fichas: deMaps.fichas, maps_sirven: deMaps.items.length, web: corridas.map(c => extraerLista(c.salida).length), web_errores: corridas.filter(c => c.error).map(c => String(c.error).slice(0, 80)) },
    busquedas: corridas.reduce((a, c) => a + c.busquedas, 0), enfoques: lotes, modelo, aprendizaje: { sirven: apr.sirven, no_sirven: apr.noSirven, parecidas: parecida.size },
    aviso: corridas.some(c => c.error) ? 'Una de las búsquedas no terminó; te mostramos lo que encontró el resto.' : '',
  })
}
