// Descarga una lista de objetos como .xlsx (Excel de verdad: abre bien en cualquier configuración regional).
// La librería se carga recién al descargar, así no pesa en el resto de la app.
export async function descargarExcel(nombreArchivo, filas, hoja = 'Empresas') {
  if (!filas.length) return
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  const cols = Object.keys(filas[0])
  const datos = [
    cols.map(c => ({ value: c, fontWeight: 'bold', backgroundColor: '#FFE7DF' })),
    ...filas.map(f => cols.map(c => {
      const v = f[c]
      if (v === null || v === undefined || v === '') return null
      if (typeof v === 'number') return { value: v, type: Number }
      return { value: String(v), type: String }
    })),
  ]
  const anchos = cols.map(c => ({ width: Math.min(48, Math.max(c.length + 2, ...filas.slice(0, 200).map(f => String(f[c] ?? '').length + 1))) }))
  const blob = await writeExcelFile(datos, { columns: anchos, stickyRowsCount: 1, sheet: hoja }).toBlob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombreArchivo
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1500)
}

const limpiarUrl = u => (u ? String(u) : '')

/** Fila de Excel para una empresa (prospecto o de la bandeja) */
export const filaEmpresa = (p, extra = {}) => ({
  Empresa: p.nombre,
  Tipo: p.rubro || '',
  Zona: p.zona || '',
  Dirección: p.direccion || '',
  Teléfono: p.telefono || '',
  Email: p.email || '',
  Web: limpiarUrl(p.web ?? p.web_actual),
  'Google Maps': limpiarUrl(p.google_maps_url),
  Instagram: limpiarUrl(p.instagram),
  Facebook: limpiarUrl(p.facebook),
  LinkedIn: limpiarUrl(p.linkedin),
  'Por qué encaja': p.encaje || '',
  'Encaje (1-5)': p.puntaje ?? '',
  ...extra,
  Fuente: limpiarUrl(p.fuente_url),
})
