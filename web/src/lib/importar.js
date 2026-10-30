import Papa from 'papaparse'
import { normalizarTelefono, clasificarWeb, instagramDe } from '@shared/clasificar.js'

// Campos del prospecto que se pueden mapear desde un archivo
export const CAMPOS = [
  { key: 'nombre', label: 'Nombre', obligatorio: true },
  { key: 'rubro', label: 'Rubro' },
  { key: 'zona', label: 'Zona' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'email', label: 'Email' },
  { key: 'instagram', label: 'Instagram / red' },
  { key: 'que_tiene_hoy', label: 'Qué tiene hoy en vez de web' },
  { key: 'web_actual', label: 'Web / link actual' },
  { key: 'rating', label: 'Puntaje (rating)' },
  { key: 'resenas', label: 'Reseñas' },
  { key: 'google_maps_url', label: 'Link de Google Maps' },
  { key: 'notas', label: 'Notas' },
]

// Sinónimos para el mapeo automático (se comparan sin acentos ni signos)
const SINONIMOS = {
  nombre: ['nombre', 'negocio', 'name', 'razonsocial', 'empresa', 'local', 'comercio', 'title', 'titulo'],
  rubro: ['rubro', 'categoria', 'category', 'tipo', 'actividad', 'industria'],
  zona: ['zona', 'barrio', 'localidad', 'ciudad', 'departamento', 'city', 'area'],
  direccion: ['direccion', 'domicilio', 'address', 'calle', 'ubicacion'],
  telefono: ['telefono', 'tel', 'celular', 'whatsapp', 'phone', 'movil', 'contacto', 'numero'],
  email: ['email', 'mail', 'correo', 'correoelectronico'],
  instagram: ['instagram', 'ig', 'redsocial', 'red', 'redes', 'perfil'],
  que_tiene_hoy: ['quetienehoy', 'quetienehoyenlugardeweb', 'enlugardeweb', 'situacion', 'tipodeweb'],
  web_actual: ['web', 'website', 'sitio', 'sitioweb', 'url', 'link', 'linkquefiguracomowebengoogle', 'websiteuri'],
  rating: ['rating', 'puntaje', 'estrellas', 'calificacion', 'stars'],
  resenas: ['resenas', 'resenasgoogle', 'reviews', 'opiniones', 'cantidadderesenas', 'userratingcount'],
  google_maps_url: ['googlemaps', 'maps', 'linkgooglemaps', 'linkdegooglemaps', 'googlemapsuri', 'mapa'],
  notas: ['notas', 'nota', 'observaciones', 'comentarios', 'notes'],
}

export const limpiar = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

/** Lee un CSV o Excel. Devuelve { columnas: string[], filas: object[] } */
export async function leerArchivo(file) {
  const nombre = file.name.toLowerCase()
  if (nombre.endsWith('.xlsx') || nombre.endsWith('.xls')) {
    const { readSheet } = await import('read-excel-file/browser')
    const datos = await readSheet(file)
    return desdeMatriz(datos)
  }
  const texto = await file.text()
  return leerCSV(texto)
}

export function leerCSV(texto) {
  const r = Papa.parse(texto.replace(/^﻿/, ''), { header: false, skipEmptyLines: 'greedy' })
  return desdeMatriz(r.data)
}

function desdeMatriz(m) {
  const [encabezado = [], ...resto] = m
  const columnas = encabezado.map((c, i) => String(c ?? '').trim() || `Columna ${i + 1}`)
  const filas = resto
    .filter(f => f.some(v => String(v ?? '').trim() !== ''))
    .map(f => Object.fromEntries(columnas.map((c, i) => [c, f[i] == null ? '' : String(f[i]).trim()])))
  return { columnas, filas }
}

/** Sugiere { campo: columna } a partir de los encabezados */
export function autoMapeo(columnas) {
  const mapeo = {}
  const usadas = new Set()
  for (const { key } of CAMPOS) {
    const sin = SINONIMOS[key]
    // 1) coincidencia exacta  2) el encabezado empieza con un sinónimo
    let col = columnas.find(c => !usadas.has(c) && sin.includes(limpiar(c)))
    if (!col) col = columnas.find(c => !usadas.has(c) && sin.some(s => s.length > 3 && limpiar(c).startsWith(s)))
    if (col) { mapeo[key] = col; usadas.add(col) }
  }
  return mapeo
}

/** Aplica el mapeo y completa datos derivados (instagram desde la web, qué tiene hoy) */
export function aplicarMapeo(filas, mapeo) {
  return filas.map(f => {
    const p = {}
    for (const { key } of CAMPOS) p[key] = mapeo[key] ? String(f[mapeo[key]] ?? '').trim() : ''
    if (p.instagram && !p.instagram.includes('instagram.com') && /^@?[A-Za-z0-9._]+$/.test(p.instagram)) {
      p.instagram = `https://www.instagram.com/${p.instagram.replace('@', '')}/`
    }
    if (!p.instagram && p.web_actual) p.instagram = instagramDe(p.web_actual)
    if (!p.que_tiene_hoy) p.que_tiene_hoy = clasificarWeb(p.web_actual).queTiene
    return p
  })
}

export const claveNombreDir = p => limpiar(p.nombre) + '|' + limpiar(p.direccion)

/**
 * Marca duplicados dentro del archivo y contra los prospectos ya cargados.
 * Mismo criterio que la base: teléfono normalizado, o nombre + dirección.
 * Devuelve las filas con { _estado: 'nuevo' | 'duplicado' | 'invalido' | 'con_web', _motivo }
 */
export function marcarDuplicados(filas, existentes = []) {
  const tels = new Map(), claves = new Map()
  for (const e of existentes) {
    const t = normalizarTelefono(e.telefono)
    if (t) tels.set(t, `ya existe: ${e.nombre}`)
    claves.set(claveNombreDir(e), `ya existe: ${e.nombre}`)
  }
  return filas.map((p, i) => {
    if (!p.nombre) return { ...p, _estado: 'invalido', _motivo: 'sin nombre' }
    const t = normalizarTelefono(p.telefono)
    const k = claveNombreDir(p)
    const motivo = (t && tels.get(t)) || claves.get(k)
    if (motivo) return { ...p, _estado: 'duplicado', _motivo: motivo }
    if (t) tels.set(t, `repetido en el archivo (fila ${i + 2})`)
    claves.set(k, `repetido en el archivo (fila ${i + 2})`)
    if (p.que_tiene_hoy === 'Dominio propio') return { ...p, _estado: 'con_web', _motivo: 'tiene dominio propio' }
    return { ...p, _estado: 'nuevo', _motivo: '' }
  })
}
