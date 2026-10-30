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
 * Número para wa.me (549 + área + número) si parece celular; '' si parece fijo.
 * En Argentina los fijos de 7 dígitos locales suelen empezar con 4 (ej. 0261 4xx-xxxx).
 * Un número escrito con "15" o con "+54 9" es siempre celular.
 */
export function numeroWhatsApp(t) {
  const crudo = String(t || '').replace(/\D/g, '')
  const n = normalizarTelefono(t)
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
