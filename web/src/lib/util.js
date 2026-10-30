import Papa from 'papaparse'

export const ESTADOS = {
  pendiente: { label: 'Pendiente', color: '#52525b', fondo: '#f0ece5', borde: '#e2e2e7', barra: '#a8a196', ayuda: 'Todavía no le escribiste' },
  contactado: { label: 'Contactado', color: '#1d4ed8', fondo: '#ebf1ff', borde: '#d3e0fd', barra: '#3b82f6', ayuda: 'Ya le mandaste el primer mensaje' },
  respondio: { label: 'Respondió', color: '#b45309', fondo: '#fdf4e4', borde: '#f5ddb2', barra: '#f59e0b', ayuda: 'Hay conversación en curso' },
  cliente: { label: 'Cliente', color: '#15803d', fondo: '#e9f7ee', borde: '#c6eacf', barra: '#22c55e', ayuda: 'Cerraste el trabajo' },
  no_interesado: { label: 'No interesado', color: '#c0262d', fondo: '#fdeceb', borde: '#f6cac6', barra: '#ef4444', ayuda: 'No se le escribe más (opt-out)' },
  no_contactar: { label: 'No contactar', color: '#7f1d1d', fondo: '#f6e9e9', borde: '#e7c9c9', barra: '#991b1b', ayuda: 'Pidió la baja o está en tu lista de "No contactar": no se le puede escribir' },
}

// Estado del email del prospecto (verificación antes de enviar)
export const ESTADO_EMAIL = {
  valido: { label: 'Email válido', corto: 'Válido', color: '#15803d', fondo: '#e9f7ee' },
  dudoso: { label: 'Email dudoso', corto: 'Dudoso', color: '#b45309', fondo: '#fdf4e4' },
  invalido: { label: 'Email inválido', corto: 'Inválido', color: '#c0262d', fondo: '#fdeceb' },
}

/** Traduce los errores de las reglas de la base a mensajes para la persona */
export function mensajeError(e) {
  const m = e?.message || String(e)
  if (m.includes('LIMITE_DIARIO')) return 'Llegaste al límite de envíos de hoy. Es a propósito: de a pocos se cuida el número y la reputación. Seguí mañana o subí el límite en Ajustes.'
  if (m.includes('OPT_OUT')) return 'Este negocio pidió no ser contactado ("No interesado" o "No contactar"): no se le puede escribir más.'
  if (m.includes('SUPRIMIDO')) return m.replace(/^.*SUPRIMIDO:\s*/, 'No se puede enviar: ') + (m.includes('No contactar') ? '' : '. Está en tu lista de "No contactar".')
  if (m.includes('LIMITE_EMAIL')) return 'Llegaste al límite de emails de hoy para tu casilla. Es para cuidar que tus mails no caigan en spam. Seguí mañana.'
  if (m.includes('EMAIL_INVALIDO')) return m.replace(/^.*EMAIL_INVALIDO:\s*/, '')
  if (m.includes('TEXTO_REPETIDO')) return 'Ese texto es idéntico a uno que ya enviaste a otro negocio. Personalizalo un poco antes de enviarlo.'
  if (m.includes('duplicate key')) return 'Ya existe un prospecto con ese teléfono o con ese nombre y dirección.'
  return m
}

export function descargarCSV(nombreArchivo, filas) {
  const csv = '﻿' + Papa.unparse(filas)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombreArchivo
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// Las fechas sin hora (YYYY-MM-DD) se interpretan como día local, no como medianoche UTC
export const fecha = d => (d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T12:00' : d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : '—')
export const fechaHora = d =>
  d ? new Date(d).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

export const handleIG = u => (u ? '@' + u.replace(/\/+$/, '').split('/').pop() : '')

// Fecha de hoy (YYYY-MM-DD) en la hora local del navegador, no en UTC
export const hoyLocal = () => new Date().toLocaleDateString('en-CA')

export const saludoHora = () => {
  const h = new Date().getHours()
  return h < 6 ? 'Buenas noches' : h < 13 ? 'Buen día' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}
