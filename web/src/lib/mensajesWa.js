// Tus mensajes de WhatsApp: los escribís vos (por ejemplo uno para empresas con web vieja y otro
// para las que no tienen web) y en cada empresa elegís cuál mandar. Se guardan en tu perfil.

export const MAX_MENSAJES_WA = 4

export const VARIABLES_WA = [
  ['empresa', 'nombre de la empresa'],
  ['rubro', 'rubro'],
  ['zona', 'zona'],
  ['web', 'su web'],
  ['mi_nombre', 'tu nombre'],
  ['mi_empresa', 'tu empresa'],
]

const INICIALES = [
  { titulo: 'Tiene web (vieja)', para: 'con_web', texto: '' },
  { titulo: 'No tiene web', para: 'sin_web', texto: '' },
]

/** Los mensajes guardados (si nunca guardó, los dos lugares vacíos para completar) */
export function mensajesWa(perfil) {
  const l = perfil?.config_email?.whatsapp_mensajes
  return Array.isArray(l) && l.length ? l : INICIALES.map(m => ({ ...m }))
}

/** Completa las {{variables}} con los datos de la empresa y los tuyos */
export function rellenarWa(texto, p, perfil, comercial) {
  const v = {
    empresa: p?.nombre ?? '', rubro: p?.rubro ?? '', zona: String(p?.zona ?? '').split(',')[0].trim(),
    web: String(p?.web_actual ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''),
    mi_nombre: perfil?.nombre ?? '', mi_empresa: comercial?.respuestas?.empresa || perfil?.estudio || '',
  }
  return String(texto ?? '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => v[k] ?? '').replace(/[ \t]{2,}/g, ' ')
}

/** El que corresponde a esta empresa según tenga web o no (índice, o -1 si no hay uno marcado) */
export function sugeridoWa(lista, p) {
  const tiene = Boolean(String(p?.web_actual ?? '').trim())
  return lista.findIndex(m => m.texto?.trim() && m.para === (tiene ? 'con_web' : 'sin_web'))
}
