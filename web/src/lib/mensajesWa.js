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

// Vienen escritos para arrancar: se cambian como quieras. {{empresa}} y lo demás se completan solos.
const INICIALES = [
  {
    titulo: 'Tiene web (vieja)', para: 'con_web',
    texto: `Hola, ¿cómo están? Soy {{mi_nombre}} de {{mi_empresa}}. Estuve mirando la página de {{empresa}} ({{web}}) y en el celular se ve un poco desactualizada: cuesta encontrar el contacto y carga lento.

Les armamos una versión nueva, rápida y con botón de WhatsApp para que les escriban directo. ¿Les muestro cómo quedaría? Son 5 minutos.`,
  },
  {
    titulo: 'No tiene web', para: 'sin_web',
    texto: `Hola, ¿cómo están? Soy {{mi_nombre}} de {{mi_empresa}}. Busqué {{empresa}} en Google y no encontré una página web propia, solo la ficha del mapa.

Hoy mucha gente decide a quién comprarle por lo que ve online. Les podemos armar una web simple, con sus servicios, fotos y botón de WhatsApp, lista en pocos días. ¿Les paso un ejemplo?`,
  },
]

/** Los mensajes guardados (si nunca guardó, los dos de ejemplo para arrancar) */
export function mensajesWa(perfil) {
  const l = perfil?.config_email?.whatsapp_mensajes
  return Array.isArray(l) && l.length ? l : INICIALES.map(m => ({ ...m }))
}

/**
 * El nombre de la empresa como se diría en un mensaje: sin «S.R.L.», «S.A.» y similares, y si
 * viene todo en mayúsculas («PANADERIA LA ESPIGA») pasa a «Panaderia La Espiga».
 */
export function nombreParaMensaje(nombre) {
  let n = String(nombre ?? '').split(/\s[|·–—-]\s/)[0]
  n = n.replace(/[\s,]+(s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?s?\.?|s\.?\s?a\.?|sociedad an[oó]nima|ltda\.?|llc|inc\.?)\s*$/i, '').trim()
  if (n.length > 3 && n === n.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(n)) {
    n = n.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, e, l) => e + l.toUpperCase()).replace(/\s(De|Del|La|Las|Los|El|Y|E)\s/g, m => m.toLowerCase())
  }
  return n
}

/** Completa las {{variables}} con los datos de la empresa y los tuyos */
export function rellenarWa(texto, p, perfil, comercial) {
  const web = String(p?.web_actual ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const v = {
    empresa: nombreParaMensaje(p?.nombre), rubro: p?.rubro ?? '', zona: String(p?.zona ?? '').split(',')[0].trim(), web,
    mi_nombre: perfil?.nombre ?? '', mi_empresa: comercial?.respuestas?.empresa || perfil?.estudio || '',
  }
  return String(texto ?? '')
    .replace(/\s*\(\{\{\s*web\s*\}\}\)/g, web ? ` (${web})` : '') // «(su web)» se saca si no tiene
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => v[k] ?? '')
    .replace(/ de ([.,])/g, '$1').replace(/[ 	]{2,}/g, ' ')
}

/** El que corresponde a esta empresa según tenga web o no (índice, o -1 si no hay uno marcado) */
export function sugeridoWa(lista, p) {
  const tiene = Boolean(String(p?.web_actual ?? '').trim())
  return lista.findIndex(m => m.texto?.trim() && m.para === (tiene ? 'con_web' : 'sin_web'))
}
