// Provincias argentinas: para filtrar la lista y Por revisar. La provincia se deduce de la zona y la
// dirección de cada empresa («Godoy Cruz, Mendoza, Argentina», «…, Provincia de Buenos Aires»).

const limpiar = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Las 24 jurisdicciones con las formas en que suelen aparecer escritas. */
const PROVINCIAS = [
  ['CABA', ['caba', 'capital federal', 'ciudad autonoma de buenos aires', 'ciudad de buenos aires', 'c a b a', 'autonomous city of buenos aires']],
  ['Buenos Aires', ['provincia de buenos aires', 'buenos aires province', 'gran buenos aires', 'gba', 'buenos aires', 'pba']],
  ['Catamarca', ['catamarca']],
  ['Chaco', ['chaco']],
  ['Chubut', ['chubut']],
  ['Córdoba', ['cordoba']],
  ['Corrientes', ['corrientes']],
  ['Entre Ríos', ['entre rios']],
  ['Formosa', ['formosa']],
  ['Jujuy', ['jujuy']],
  ['La Pampa', ['la pampa']],
  ['La Rioja', ['la rioja']],
  ['Mendoza', ['mendoza']],
  ['Misiones', ['misiones']],
  ['Neuquén', ['neuquen']],
  ['Río Negro', ['rio negro']],
  ['Salta', ['salta']],
  ['San Juan', ['san juan']],
  ['San Luis', ['san luis']],
  ['Santa Cruz', ['santa cruz']],
  ['Santa Fe', ['santa fe']],
  ['Santiago del Estero', ['santiago del estero']],
  ['Tierra del Fuego', ['tierra del fuego']],
  ['Tucumán', ['tucuman']],
]
export const NOMBRES_PROVINCIAS = PROVINCIAS.map(([n]) => n)

/** Ciudades grandes que suelen venir sin la provincia. */
const CIUDADES = {
  rosario: 'Santa Fe', rafaela: 'Santa Fe', 'venado tuerto': 'Santa Fe', reconquista: 'Santa Fe',
  'mar del plata': 'Buenos Aires', 'la plata': 'Buenos Aires', 'bahia blanca': 'Buenos Aires', tandil: 'Buenos Aires', quilmes: 'Buenos Aires',
  'lomas de zamora': 'Buenos Aires', lanus: 'Buenos Aires', 'la matanza': 'Buenos Aires', 'san isidro': 'Buenos Aires', pilar: 'Buenos Aires',
  'tigre': 'Buenos Aires', 'moron': 'Buenos Aires', 'avellaneda': 'Buenos Aires', 'florida oeste': 'Buenos Aires', 'vicente lopez': 'Buenos Aires',
  'godoy cruz': 'Mendoza', 'san rafael': 'Mendoza', 'guaymallen': 'Mendoza', 'lujan de cuyo': 'Mendoza', maipu: 'Mendoza', 'las heras': 'Mendoza',
  'villa maria': 'Córdoba', 'rio cuarto': 'Córdoba', 'villa carlos paz': 'Córdoba',
  'san miguel de tucuman': 'Tucumán', 'mar de ajo': 'Buenos Aires', 'parana': 'Entre Ríos', concordia: 'Entre Ríos',
  'comodoro rivadavia': 'Chubut', 'puerto madryn': 'Chubut', trelew: 'Chubut', bariloche: 'Río Negro', 'san carlos de bariloche': 'Río Negro',
  'general roca': 'Río Negro', 'rio gallegos': 'Santa Cruz', ushuaia: 'Tierra del Fuego', 'rio grande': 'Tierra del Fuego',
  resistencia: 'Chaco', posadas: 'Misiones', 'santa rosa': 'La Pampa', 'san salvador de jujuy': 'Jujuy', 'san fernando del valle de catamarca': 'Catamarca',
  palermo: 'CABA', belgrano: 'CABA', recoleta: 'CABA', caballito: 'CABA', 'villa crespo': 'CABA', microcentro: 'CABA', 'puerto madero': 'CABA',
}

// Países que no son Argentina: si la zona termina en uno de estos, no hay provincia argentina.
const OTROS_PAISES = ['chile', 'uruguay', 'paraguay', 'bolivia', 'brasil', 'brazil', 'peru', 'mexico', 'colombia', 'espana', 'spain', 'ecuador', 'venezuela', 'estados unidos', 'usa', 'united states']

/** Busca una provincia (o ciudad conocida) en un pedazo de texto ya limpio. */
function enTexto(t) {
  if (!t) return ''
  const conBordes = ` ${t} `
  for (const [nombre, formas] of PROVINCIAS) {
    if (formas.some(f => conBordes.includes(` ${f} `))) {
      // «Ciudad de Buenos Aires» manda sobre «Buenos Aires»; «Santiago del Estero» sobre «Santiago»
      return nombre
    }
  }
  for (const [ciudad, prov] of Object.entries(CIUDADES)) if (conBordes.includes(` ${ciudad} `)) return prov
  return ''
}

/**
 * La provincia argentina de una empresa (hallazgo o prospecto), o '' si no se sabe o no es de
 * Argentina. Mira primero la zona (de atrás para adelante: «Ciudad, Provincia, País») y después la
 * dirección.
 */
const cache = new Map()
export function provinciaDe(item) {
  const zona = String(item?.zona ?? '')
  const direccion = String(item?.direccion ?? '')
  // Se calcula una sola vez por zona + dirección (antes se recalculaba miles de veces por clic y la pantalla se trababa)
  const k = zona + '|' + direccion
  if (cache.has(k)) return cache.get(k)
  if (cache.size > 20000) cache.clear()
  const p = calcular(zona, direccion)
  cache.set(k, p)
  return p
}

function calcular(zona, direccion) {
  const partesZona = zona.split(',').map(limpiar).filter(Boolean)
  const ultimo = partesZona[partesZona.length - 1] ?? ''
  if (OTROS_PAISES.some(p => ultimo === p || ` ${limpiar(direccion)} `.endsWith(` ${p} `))) return ''
  // Zona: el segmento antes del país, después los anteriores
  const segmentos = [...partesZona].reverse().filter(s => s !== 'argentina')
  for (const s of segmentos) { const p = enTexto(s); if (p) return p }
  // Dirección: de atrás para adelante (el final suele ser «…, Provincia, Argentina»)
  const partesDir = direccion.split(',').map(limpiar).filter(s => s && s !== 'argentina').reverse()
  for (const s of partesDir) { const p = enTexto(s.replace(/\b[a-z]?\d{4}[a-z]{0,3}\b/g, ' ').trim()); if (p) return p }
  return ''
}

/** Provincias presentes en una lista, con cuántas empresas tiene cada una (las de más primero). */
export function provinciasEn(lista) {
  const cuenta = new Map()
  for (const x of lista) { const p = provinciaDe(x); cuenta.set(p, (cuenta.get(p) ?? 0) + 1) }
  return [...cuenta.entries()].sort((a, b) => (a[0] === '') - (b[0] === '') || b[1] - a[1])
}

/**
 * Las opciones del filtro: SIEMPRE las 24 provincias. Primero las que tienen empresas en lo que estás
 * viendo, después las que tienen en otro lado (otra búsqueda o el otro tipo de búsqueda) y al final
 * las que no tienen ninguna. Cada una: [nombre ('_sin' = sin provincia), en esta vista, en total].
 */
export function opcionesProvincias(vista, todas = vista) {
  const enVista = new Map(provinciasEn(vista)), enTodas = new Map(provinciasEn(todas))
  const fila = n => [n, enVista.get(n) ?? 0, enTodas.get(n) ?? 0]
  const filas = NOMBRES_PROVINCIAS.map(fila)
  filas.sort((a, b) => b[1] - a[1] || b[2] - a[2] || a[0].localeCompare(b[0], 'es'))
  if (enTodas.get('')) filas.push(['_sin', enVista.get('') ?? 0, enTodas.get('')])
  return filas
}
export const textoCuenta = (enVista, enTotal) =>
  enVista ? `${enVista} ${enVista === 1 ? 'empresa' : 'empresas'}` : enTotal ? `${enTotal} en otras búsquedas` : 'Sin empresas todavía'

/** Filtro: '' = todas; '_sin' = las que no tienen provincia. */
export const deProvincia = (item, prov) => !prov || (prov === '_sin' ? provinciaDe(item) === '' : provinciaDe(item) === prov)
