// Lógica compartida entre el frontend (Vite) y las Edge Functions (Deno).
// Sin dependencias: se importa igual desde los dos lados.

// Dominios que NO cuentan como "web propia" → etiqueta para "qué tiene hoy"
export const NO_ES_WEB_PROPIA = [
  [/(^|\.)instagram\.com$|(^|\.)instagr\.am$/, 'Instagram'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)fb\.me$/, 'Facebook'],
  [/(^|\.)wa\.me$|(^|\.)wa\.link$|(^|\.)whatsapp\.com$|^w\.app$/, 'Link de WhatsApp'],
  [/(^|\.)linktr\.ee$|(^|\.)linkin\.bio$|(^|\.)beacons\.ai$|(^|\.)taplink\.|(^|\.)bio\.link$|(^|\.)lnk\.bio$/, 'Linktree / link en bio'],
  [/(^|\.)fresha\.com$/, 'Fresha (turnos)'],
  [/(^|\.)agendapro\.com$/, 'AgendaPro (turnos)'],
  [/(^|\.)booksy\.com$/, 'Booksy (turnos)'],
  [/(^|\.)wonoma\.com$/, 'Wonoma (turnos)'],
  [/(^|\.)reservo\.|(^|\.)turnito\.|(^|\.)weturno\.|(^|\.)calendly\.com$|(^|\.)setmore\.com$|(^|\.)simplybook\.|(^|\.)reservadirecto\.com$/, 'Plataforma de turnos/reservas'],
  [/(^|\.)doctoralia\./, 'Doctoralia'],
  [/(^|\.)gurugo\.|(^|\.)paginasamarillas\.|(^|\.)guiaoleo\.|(^|\.)cylex\.|(^|\.)tripadvisor\.|(^|\.)booking\.com$|(^|\.)airbnb\./, 'Directorio / portal'],
  [/(^|\.)pedidosya\.|(^|\.)rappi\.|(^|\.)mercadolibre\.|(^|\.)mercadoshops\./, 'Marketplace / delivery'],
  [/\.wixsite\.com$|\.business\.site$|\.negocio\.site$|^sites\.google\.com$|\.blogspot\.|\.wordpress\.com$|\.mitiendanube\.com$|\.empretienda\.com\.ar$|\.webnode\.|\.web\.app$|\.vercel\.app$|\.netlify\.app$|\.canva\.site$|\.my\.canva\.site$/, 'Sitio gratuito sin dominio propio'],
]

/** Clasifica el websiteUri de Google Places. Devuelve { esProspecto, queTiene } */
export function clasificarWeb(uri) {
  if (!uri) return { esProspecto: true, queTiene: 'Sin web' }
  let host = ''
  try {
    let u = uri
    const redir = u.match(/[?&](?:url|q)=([^&]+)/)
    if (/google\.[a-z.]+\/url/.test(u) && redir) u = decodeURIComponent(redir[1])
    host = new URL(u.includes('://') ? u : 'http://' + u).hostname.toLowerCase()
  } catch {
    return { esProspecto: true, queTiene: 'Link inválido' }
  }
  host = host.replace(/^(www|m)\./, '')
  for (const [re, etiqueta] of NO_ES_WEB_PROPIA) if (re.test(host)) return { esProspecto: true, queTiene: etiqueta }
  return { esProspecto: false, queTiene: 'Dominio propio' }
}

/** Extrae el perfil de Instagram si el link es de Instagram */
export function instagramDe(uri) {
  const m = (uri || '').match(/instagram\.com\/([A-Za-z0-9._]+)/)
  if (!m || ['p', 'reel', 'reels', 'explore', 'stories'].includes(m[1].toLowerCase())) return ''
  return `https://www.instagram.com/${m[1]}/`
}

/** Normaliza un teléfono argentino a área+número (10 dígitos). Igual que normalizar_telefono() en SQL. */
export function normalizarTelefono(t) {
  let d = String(t || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('54') && d.length >= 12) d = d.slice(2)
  if (d.startsWith('9') && d.length === 11) d = d.slice(1)
  if (d.startsWith('0')) d = d.slice(1)
  if (d.length === 12) {
    for (const a of [2, 3, 4]) if (d.slice(a, a + 2) === '15') return d.slice(0, a) + d.slice(a + 2)
  }
  return d.slice(-10)
}

/**
 * Deja un solo teléfono creíble, o '' si no hay ninguno:
 * - si vienen varios («0261 423-1234 / 261 15 555-1234», «… y …») se queda con el primero que tenga
 *   suficientes dígitos (antes se mezclaban y salía un número cualquiera);
 * - saca internos («int. 23», «ext 4»);
 * - descarta los inventados (todos iguales, 1234567…, 5555555) y los que no tienen la cantidad de
 *   dígitos de un teléfono (en Argentina, área + número = 10).
 * Los de otros países (con + y otro código) se dejan tal cual si tienen entre 8 y 15 dígitos.
 */
export function limpiarTelefono(t) {
  const texto = String(t ?? '').replace(/\b(int(erno)?|ext(ension)?|interno)\.?\s*\d+/gi, ' ')
  const partes = texto.split(/\s*(?:\/|\||;|,|\by\b|\bo\b|\n)\s*/i).map(x => x.trim()).filter(x => x.replace(/\D/g, '').length >= 7)
  for (const p of partes) {
    const d = p.replace(/\D/g, '')
    // Inventados: los últimos 7 dígitos todos iguales o en escalera (1234567), o una tira de 7 iguales
    const local = d.slice(-7)
    if (/^(\d)\1+$/.test(local) || ['0123456', '1234567', '2345678', '3456789', '4567890'].includes(local) || /(\d)\1{6,}/.test(d)) continue
    const internacional = /^\s*(\+|00)/.test(p) && !/^\s*(\+|00)\s*54/.test(p)
    if (internacional) { if (d.length >= 8 && d.length <= 15) return p.replace(/\s+/g, ' ').trim(); continue }
    if (normalizarTelefono(p).length === 10 && d.length <= 13) return p.replace(/\s+/g, ' ').trim()
  }
  return ''
}

/**
 * Número para wa.me (549 + área + número) si parece celular; '' si parece fijo.
 * Si es de otro país (empieza con + y otro código), va tal cual.
 * En Argentina los fijos de 7 dígitos locales suelen empezar con 4 (ej. 0261 4xx-xxxx).
 * Un número escrito con "15" o con "+54 9" es siempre celular.
 */
export function numeroWhatsApp(t) {
  // Si el número viene mezclado («0261 423-1234 / 15 …»), con interno o inventado, se limpia acá mismo:
  // así sirve también para las empresas que ya estaban guardadas
  const texto = (limpiarTelefono(t) || '').trim()
  if (!texto) return ''
  if (/^(\+|00)/.test(texto) && !/^(\+|00)\s*54/.test(texto)) {
    const d = texto.replace(/\D/g, '').replace(/^00/, '')
    return d.length >= 8 && d.length <= 15 ? d : ''
  }
  const crudo = texto.replace(/\D/g, '')
  const n = normalizarTelefono(texto)
  if (n.length !== 10) return ''
  const esCelularExplicito = crudo.startsWith('549') || /^0\d{2,4}15/.test(crudo)
  if (esCelularExplicito) return '549' + n
  // Gran Mendoza (261): los fijos empiezan con 4. Para otras áreas asumimos celular
  // (el usuario siempre ve el número antes de abrir WhatsApp).
  if (n.startsWith('261') && n[3] === '4') return ''
  return '549' + n
}

export const linkWhatsApp = (tel, texto) => {
  const n = numeroWhatsApp(tel)
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto || '')}` : ''
}

export const linkEmail = (email, asunto, cuerpo) =>
  `mailto:${encodeURIComponent(email || '')}?subject=${encodeURIComponent(asunto || '')}&body=${encodeURIComponent(cuerpo || '')}`

export const linkGmail = (email, asunto, cuerpo) =>
  `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email || '')}&su=${encodeURIComponent(asunto || '')}&body=${encodeURIComponent(cuerpo || '')}`
