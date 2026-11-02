// Rubros y zonas sugeridos para buscar e importar.
export const RUBROS = [
  { grupo: 'Belleza', items: ['barbería', 'peluquería', 'centro de estética', 'manicuría y uñas', 'estudio de tatuajes', 'spa', 'depilación', 'cosmetología', 'maquilladora', 'pestañas y cejas'] },
  { grupo: 'Salud', items: ['consultorio odontológico', 'kinesiología', 'psicología', 'nutricionista', 'dermatología', 'óptica', 'fonoaudiología', 'podología', 'laboratorio de análisis'] },
  { grupo: 'Mascotas', items: ['veterinaria', 'peluquería canina', 'petshop', 'guardería de perros', 'adiestrador canino'] },
  { grupo: 'Deporte', items: ['gimnasio', 'estudio de pilates', 'yoga', 'crossfit', 'escuela de danza', 'artes marciales', 'escuela de natación', 'pádel'] },
  { grupo: 'Profesionales', items: ['estudio contable', 'estudio jurídico', 'estudio de arquitectura', 'inmobiliaria', 'escribanía', 'productor de seguros', 'agrimensor', 'diseño de interiores'] },
  { grupo: 'Gastronomía', items: ['restaurante', 'cafetería', 'pastelería', 'panadería', 'cervecería', 'rotisería', 'heladería', 'catering', 'food truck', 'dietética'] },
  { grupo: 'Comercio', items: ['tienda de indumentaria', 'mueblería', 'ferretería', 'librería', 'vivero', 'florería', 'joyería', 'regalería', 'bicicletería', 'casa de deportes'] },
  { grupo: 'Turismo', items: ['cabañas', 'hostel', 'bodega boutique', 'agencia de viajes', 'turismo aventura', 'alquiler de autos', 'posada'] },
  { grupo: 'Hogar y oficios', items: ['electricista', 'plomero', 'gasista', 'cerrajería', 'mudanzas', 'limpieza', 'pintor', 'carpintería', 'herrería', 'climatización'] },
  { grupo: 'Autos', items: ['taller mecánico', 'lavadero de autos', 'gomería', 'chapa y pintura', 'escuela de manejo', 'polarizados'] },
  { grupo: 'Educación y eventos', items: ['instituto de idiomas', 'apoyo escolar', 'escuela de música', 'fotógrafo', 'salón de eventos', 'organizador de eventos', 'DJ', 'cotillón'] },
]

export const ZONAS = [
  { grupo: 'Gran Mendoza', items: ['Ciudad de Mendoza', 'Godoy Cruz', 'Guaymallén', 'Las Heras', 'Luján de Cuyo', 'Maipú', 'Chacras de Coria', 'Lavalle'] },
  { grupo: 'Este', items: ['San Martín', 'Rivadavia', 'Junín', 'Santa Rosa'] },
  { grupo: 'Valle de Uco', items: ['Tunuyán', 'Tupungato', 'San Carlos'] },
  { grupo: 'Sur', items: ['San Rafael', 'General Alvear', 'Malargüe'] },
]

// Sólo los departamentos de Mendoza llevan ", Mendoza"; cualquier otra zona se busca tal cual (Neuquén, Córdoba, todo el país…)
const MENDOZA = new Set(ZONAS.flatMap(g => g.items).map(z => z.toLowerCase()))
export const zonaCompleta = z => (/,/.test(z) || !MENDOZA.has(z.trim().toLowerCase()) ? z.trim() : `${z.trim()}, Mendoza`)

// Países para buscar fuera de Argentina (código ISO para ubicar la búsqueda web)
export const PAISES = [
  ...[['Argentina', 'AR'], ['Chile', 'CL'], ['Uruguay', 'UY'], ['Paraguay', 'PY'], ['Bolivia', 'BO'], ['Perú', 'PE'], ['Colombia', 'CO'], ['Ecuador', 'EC'], ['Venezuela', 'VE'], ['México', 'MX'], ['Guatemala', 'GT'], ['El Salvador', 'SV'], ['Honduras', 'HN'], ['Nicaragua', 'NI'], ['Costa Rica', 'CR'], ['Panamá', 'PA'], ['República Dominicana', 'DO'], ['Puerto Rico', 'PR'], ['Brasil', 'BR']].map(([nombre, code]) => ({ nombre, code, grupo: 'Latinoamérica' })),
  ...[['Estados Unidos', 'US'], ['Canadá', 'CA']].map(([nombre, code]) => ({ nombre, code, grupo: 'Norteamérica' })),
]
export const GRUPOS_PAISES = ['Latinoamérica', 'Norteamérica']

// Para empresas que trabajan en varios países a la vez
export const REGIONES = ['Latinoamérica', 'Sudamérica', 'Cono Sur (Argentina, Chile, Uruguay, Paraguay)', 'Centroamérica', 'Argentina, Chile y Uruguay', 'México y Centroamérica']

export const PROVINCIAS_AR = ['Buenos Aires', 'CABA', 'Córdoba', 'Santa Fe', 'Mendoza', 'San Juan', 'San Luis', 'Neuquén', 'Río Negro',
  'Chubut', 'Santa Cruz', 'Tierra del Fuego', 'La Pampa', 'Entre Ríos', 'Corrientes', 'Misiones', 'Chaco', 'Formosa',
  'Santiago del Estero', 'Tucumán', 'Salta', 'Jujuy', 'Catamarca', 'La Rioja']

export const CIUDADES = [
  { pais: 'Argentina', items: ['Rosario', 'Mar del Plata', 'Bahía Blanca', 'La Plata', 'Gran Buenos Aires', 'Gran Mendoza', 'San Rafael', 'Rafaela', 'Villa María', 'Río Cuarto', 'Comodoro Rivadavia', 'Bariloche', 'Paraná'] },
  { pais: 'Chile', items: ['Santiago de Chile', 'Valparaíso', 'Concepción', 'Antofagasta', 'Puerto Montt'] },
  { pais: 'Uruguay', items: ['Montevideo', 'Canelones', 'Maldonado'] },
  { pais: 'Perú', items: ['Lima', 'Arequipa', 'Trujillo'] },
  { pais: 'Colombia', items: ['Bogotá', 'Medellín', 'Cali', 'Barranquilla'] },
  { pais: 'México', items: ['Ciudad de México', 'Monterrey', 'Guadalajara', 'Querétaro'] },
  { pais: 'Paraguay', items: ['Asunción', 'Ciudad del Este'] },
  { pais: 'Bolivia', items: ['Santa Cruz de la Sierra', 'La Paz', 'Cochabamba'] },
]

// ---------- País de la cuenta ----------
// Provincias / regiones / estados principales de cada país (para el alta y para sugerir zonas)
export const REGIONES_PAIS = {
  AR: PROVINCIAS_AR,
  CL: ['Región Metropolitana', 'Valparaíso', 'Biobío', 'Antofagasta', 'Maule', 'Los Lagos', 'La Araucanía', "O'Higgins", 'Coquimbo', 'Tarapacá'],
  UY: ['Montevideo', 'Canelones', 'Maldonado', 'Colonia', 'Salto', 'Paysandú'],
  PY: ['Asunción', 'Central', 'Alto Paraná', 'Itapúa'],
  BO: ['Santa Cruz', 'La Paz', 'Cochabamba', 'Tarija'],
  PE: ['Lima', 'Arequipa', 'La Libertad', 'Piura', 'Cusco', 'Lambayeque'],
  CO: ['Bogotá', 'Antioquia', 'Valle del Cauca', 'Atlántico', 'Santander', 'Cundinamarca'],
  EC: ['Pichincha', 'Guayas', 'Azuay', 'Manabí'],
  MX: ['Ciudad de México', 'Estado de México', 'Nuevo León', 'Jalisco', 'Querétaro', 'Puebla', 'Guanajuato', 'Baja California', 'Yucatán'],
  BR: ['São Paulo', 'Rio de Janeiro', 'Minas Gerais', 'Paraná', 'Rio Grande do Sul', 'Santa Catarina'],
  VE: ['Caracas', 'Zulia', 'Carabobo', 'Lara'],
  CR: ['San José', 'Alajuela', 'Heredia', 'Cartago'],
  PA: ['Panamá', 'Colón', 'Chiriquí'],
  GT: ['Guatemala', 'Quetzaltenango', 'Escuintla'],
  DO: ['Santo Domingo', 'Santiago', 'La Altagracia'],
  ES: ['Madrid', 'Cataluña', 'Andalucía', 'Comunidad Valenciana', 'País Vasco', 'Galicia'],
  US: ['Florida', 'Texas', 'California', 'Nueva York', 'Illinois'],
}
export const ZONA_HORARIA_PAIS = {
  AR: 'America/Argentina/Buenos_Aires',
  CL: 'America/Santiago',
  UY: 'America/Montevideo',
  PY: 'America/Asuncion',
  BO: 'America/La_Paz',
  PE: 'America/Lima',
  CO: 'America/Bogota',
  EC: 'America/Guayaquil',
  VE: 'America/Caracas',
  MX: 'America/Mexico_City',
  GT: 'America/Guatemala',
  SV: 'America/El_Salvador',
  HN: 'America/Tegucigalpa',
  NI: 'America/Managua',
  CR: 'America/Costa_Rica',
  PA: 'America/Panama',
  DO: 'America/Santo_Domingo',
  PR: 'America/Puerto_Rico',
  BR: 'America/Sao_Paulo',
  US: 'America/New_York',
  CA: 'America/Toronto',
}
export const nombrePais = code => PAISES.find(p => p.code === code)?.nombre ?? ''

/** Zonas para sugerir según el país y la provincia de la cuenta (la primera es la zona por defecto de las búsquedas) */
export function zonasDe(pais, region, otros = []) {
  const extra = (otros ?? []).map(nombrePais).filter(Boolean)
  return [...new Set([...zonasDePais(pais, region, extra.length ? 7 : 10), ...extra])]
}
function zonasDePais(pais, region, max = 10) {
  const nombre = nombrePais(pais)
  if (!nombre) return ['Argentina', 'Chile', 'Uruguay', 'Perú', 'México', 'Colombia']
  if (pais === 'AR' && region === 'Mendoza') return ['Gran Mendoza', 'Ciudad de Mendoza', 'Godoy Cruz', 'Guaymallén', 'Las Heras', 'Luján de Cuyo', 'Maipú', 'Todo Mendoza', 'Argentina'].slice(0, max)
  const conPais = z => (pais === 'AR' ? (z === 'CABA' ? 'CABA, Argentina' : `${z}, Argentina`) : `${z}, ${nombre}`)
  const ciudades = (CIUDADES.find(c => c.pais === nombre)?.items ?? []).map(c => (pais === 'AR' ? c : `${c}, ${nombre}`))
  const regiones = (REGIONES_PAIS[pais] ?? []).filter(r => r !== region).slice(0, 5).map(conPais)
  return [...new Set([...(region ? [conPais(region)] : []), ...ciudades.slice(0, 4), ...regiones, nombre])].slice(0, max)
}

/** Lugares concretos de un país para buscar (provincias/regiones y ciudades, sin el nombre del país) */
export function lugaresDe(pais, region) {
  const nombre = nombrePais(pais)
  const mza = pais === 'AR' && region === 'Mendoza' ? ['Gran Mendoza', ...ZONAS.flatMap(g => g.items)] : []
  const ciudades = CIUDADES.find(c => c.pais === nombre)?.items ?? []
  const regiones = REGIONES_PAIS[pais] ?? []
  // En Argentina sin provincia elegida arranca por las provincias (Buenos Aires primero); en el resto, por las ciudades
  const orden = pais === 'AR' && !region ? [...regiones, ...ciudades] : [...ciudades, ...regiones]
  return [...new Set([...(region ? [region] : []), ...mza, ...orden])].filter(l => l && l !== 'Todo Mendoza')
}
/** "Córdoba" + AR → "Córdoba, Argentina" (los departamentos de Mendoza llevan la provincia) */
export function zonaConPais(lugar, pais) {
  const nombre = nombrePais(pais), l = String(lugar ?? '').trim()
  if (!l) return nombre
  const conProv = pais === 'AR' ? zonaCompleta(l) : l
  return conProv.toLowerCase().includes(nombre.toLowerCase()) ? conProv : `${conProv}, ${nombre}`
}
/** "Córdoba, Argentina" → { pais: 'AR', lugar: 'Córdoba' } */
export function separarZona(zona, paisDefecto = 'AR') {
  const partes = String(zona ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const ultimo = partes.at(-1)
  const p = PAISES.find(x => x.nombre.toLowerCase() === ultimo?.toLowerCase())
  if (p) return { pais: p.code, lugar: partes.slice(0, -1).filter(x => x !== 'Mendoza' || partes.length === 2).join(', ') }
  return { pais: paisDefecto, lugar: partes.join(', ') }
}
