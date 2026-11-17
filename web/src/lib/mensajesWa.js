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

// Para la búsqueda libre (proveedores, aliados, lo que sea): otro tono, no le vendés nada.
const INICIALES_LIBRE = [
  {
    titulo: 'Tiene web', para: 'con_web',
    texto: `Hola, ¿cómo están? Soy {{mi_nombre}} de {{mi_empresa}}. Vi la página de {{empresa}} ({{web}}) y me interesa saber más de lo que hacen.

¿Me podrían pasar información o decirme con quién puedo hablar?`,
  },
  {
    titulo: 'No tiene web', para: 'sin_web',
    texto: `Hola, ¿cómo están? Soy {{mi_nombre}} de {{mi_empresa}}. Encontré a {{empresa}} buscando {{rubro}} en {{zona}}.

¿Me podrían pasar más información de lo que ofrecen?`,
  },
]

/** De qué lado es la empresa: «libre» (búsqueda libre) o «negocio» (clientes para mi negocio) */
export const mundoDe = p => (p?.libre ? 'libre' : 'negocio')
const CLAVE = { negocio: 'whatsapp_mensajes', libre: 'whatsapp_mensajes_libre' }
export const CLAVE_MUNDO_WA = CLAVE

/** Los mensajes guardados de ese lado (si nunca guardó, los dos de ejemplo para arrancar) */
export function mensajesWa(perfil, mundo = 'negocio') {
  const l = perfil?.config_email?.[CLAVE[mundo] ?? CLAVE.negocio]
  if (Array.isArray(l) && l.length) return l
  return (mundo === 'libre' ? INICIALES_LIBRE : INICIALES).map(m => ({ ...m }))
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

/**
 * Quién escribe, sacado solo de tu cuenta: tu nombre (el primero) y tu empresa (la de Mi cuenta,
 * Mi negocio, tu equipo o, si no hay nada, el nombre de tu web).
 */
export function quienSoy({ perfil, comercial, acceso, session } = {}) {
  const r = comercial?.respuestas ?? {}
  const deWeb = String(r.web ?? '').replace(/^https?:\/\/(www\.)?/i, '').split(/[./]/)[0]
  const mail = String(session?.user?.email ?? '').split('@')[0].split(/[._-]/)[0]
  const nombre = String(perfil?.nombre || mail || '').trim().split(/\s+/)[0]
  // Lo que escribiste en «Quién escribe» (pantalla de Mensajes de WhatsApp) manda
  const propio = perfil?.config_email?.whatsapp_yo ?? {}
  if (propio.mi_nombre?.trim() || propio.mi_empresa?.trim()) {
    const auto = quienSoy({ perfil: { ...perfil, config_email: {} }, comercial, acceso, session })
    return { mi_nombre: propio.mi_nombre?.trim() || auto.mi_nombre, mi_empresa: propio.mi_empresa?.trim() || auto.mi_empresa }
  }
  return {
    mi_nombre: nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : '',
    mi_empresa: String(perfil?.estudio || r.empresa || acceso?.empresa || (deWeb ? deWeb.charAt(0).toUpperCase() + deWeb.slice(1) : '')).trim(),
  }
}

/** Completa las {{variables}} con los datos de la empresa (p) y los tuyos (yo = quienSoy(...)) */
export function rellenarWa(texto, p, yo = {}) {
  const web = String(p?.web_actual ?? '').replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  const v = {
    empresa: nombreParaMensaje(p?.nombre), rubro: p?.rubro ?? '', zona: String(p?.zona ?? '').split(',')[0].trim(), web,
    mi_nombre: yo.mi_nombre ?? '', mi_empresa: yo.mi_empresa ?? '',
  }
  return String(texto ?? '')
    .replace(/\s*\(\{\{\s*web\s*\}\}\)/g, web ? ` (${web})` : '') // «(su web)» se saca si no tiene
    .replace(/\s+de \{\{\s*mi_empresa\s*\}\}/g, v.mi_empresa ? ` de ${v.mi_empresa}` : '') // «Soy Vicente de» sin empresa
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k) => v[k] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
}

/** El que corresponde a esta empresa según tenga web o no (índice, o -1 si no hay uno marcado) */
export function sugeridoWa(lista, p) {
  const tiene = Boolean(String(p?.web_actual ?? '').trim())
  return lista.findIndex(m => m.texto?.trim() && m.para === (tiene ? 'con_web' : 'sin_web'))
}
