// Correo conectado: envía emails desde la cuenta del usuario (SMTP, puerto 465 con TLS) y revisa
// si los prospectos respondieron (IMAP, puerto 993). La contraseña vive cifrada en Vault.
// Modos: estado | conectar | probar | desconectar | enviar | revisar
// Nota: Supabase no deja salir por los puertos 25 y 587, por eso sólo SMTP con TLS directo (465).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, cors, json } from '../_shared/supabase.ts'

type Dic = Record<string, any>
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const enc = new TextEncoder(), dec = new TextDecoder()
const b64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s)))

const PROVEEDORES: [RegExp, { smtp: string, imap: string }][] = [
  [/@(gmail|googlemail)\.com$/i, { smtp: 'smtp.gmail.com', imap: 'imap.gmail.com' }],
  [/@yahoo\.(com|com\.ar)$/i, { smtp: 'smtp.mail.yahoo.com', imap: 'imap.mail.yahoo.com' }],
  [/@zoho(mail)?\.com$/i, { smtp: 'smtp.zoho.com', imap: 'imap.zoho.com' }],
  [/@(outlook|hotmail|live|msn)\./i, { smtp: '', imap: '' }],
  [/@(icloud|me)\.com$/i, { smtp: '', imap: '' }],
]

// ---------- Conexión de texto sobre TLS ----------
class Linea {
  private buf = new Uint8Array(0)
  constructor(private c: Deno.TlsConn) {}
  static async abrir(host: string, port: number) {
    const c = await Promise.race([
      Deno.connectTls({ hostname: host, port }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`No pude conectar con ${host}:${port}`)), 12000)),
    ])
    return new Linea(c)
  }
  private async llenar() {
    const t = new Uint8Array(16384)
    const n = await Promise.race([this.c.read(t), new Promise<null>((_, rej) => setTimeout(() => rej(new Error('El servidor de correo no responde')), 20000))])
    if (n === null) throw new Error('El servidor de correo cerró la conexión')
    const nuevo = new Uint8Array(this.buf.length + n); nuevo.set(this.buf); nuevo.set(t.subarray(0, n), this.buf.length); this.buf = nuevo
  }
  async linea(): Promise<string> {
    while (true) {
      const i = this.buf.findIndex((b, k) => b === 13 && this.buf[k + 1] === 10)
      if (i >= 0) { const l = dec.decode(this.buf.subarray(0, i)); this.buf = this.buf.subarray(i + 2); return l }
      await this.llenar()
    }
  }
  async bytes(n: number): Promise<string> {
    while (this.buf.length < n) await this.llenar()
    const s = dec.decode(this.buf.subarray(0, n)); this.buf = this.buf.subarray(n); return s
  }
  async escribir(s: string) { const d = enc.encode(s); let o = 0; while (o < d.length) o += await this.c.write(d.subarray(o)) }
  cerrar() { try { this.c.close() } catch { /* ya cerrada */ } }
}

// ---------- SMTP ----------
async function smtpRespuesta(l: Linea) {
  let linea = '', todo = ''
  do { linea = await l.linea(); todo += linea + '\n' } while (linea[3] === '-')
  return { codigo: Number(linea.slice(0, 3)), texto: todo.trim() }
}
async function smtpCmd(l: Linea, cmd: string, espera: number[]) {
  await l.escribir(cmd + '\r\n')
  const r = await smtpRespuesta(l)
  if (!espera.includes(r.codigo)) throw new Error(`SMTP ${r.codigo}: ${r.texto.slice(0, 200)}`)
  return r
}
async function smtpSesion(cfg: Dic, clave: string, fn?: (l: Linea) => Promise<void>) {
  const l = await Linea.abrir(cfg.smtp_host, cfg.smtp_puerto)
  try {
    const hola = await smtpRespuesta(l); if (hola.codigo !== 220) throw new Error('SMTP: ' + hola.texto)
    await smtpCmd(l, `EHLO ${String(cfg.email ?? '').split('@')[1] || 'localhost'}`, [250])
    await smtpCmd(l, 'AUTH LOGIN', [334]); await smtpCmd(l, b64(cfg.email), [334])
    try { await smtpCmd(l, b64(clave), [235]) } catch (e) { throw new Error('AUTH: ' + (e as Error).message) }
    if (fn) await fn(l)
    await l.escribir('QUIT\r\n')
  } finally { l.cerrar() }
}
const palabra = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`
type Archivo = { nombre: string, mime: string, datos: Uint8Array }
/** base64 de binario en tramos (un spread de un archivo grande revienta la pila) */
function b64Bytes(d: Uint8Array) {
  let s = ''
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000))
  return btoa(s)
}
const lineas76 = (s: string) => s.replace(/.{1,76}/g, m => m + '\r\n')
/** quoted-printable (RFC 2045): lo que usan Gmail y Outlook para el texto. El texto en base64 suma puntos de spam. */
function qp(s: string) {
  const out: string[] = []
  for (const linea of s.replace(/\r?\n/g, '\n').split('\n')) {
    let l = ''
    for (const b of enc.encode(linea)) {
      const c = String.fromCharCode(b)
      l += (b >= 33 && b <= 126 && b !== 61) || b === 32 ? c : '=' + b.toString(16).toUpperCase().padStart(2, '0')
    }
    l = l.replace(/ $/, '=20')
    let resto = l
    while (resto.length > 75) {
      let corte = 75
      const i = resto.lastIndexOf('=', corte - 1); if (i > corte - 3) corte = i
      out.push(resto.slice(0, corte) + '='); resto = resto.slice(corte)
    }
    out.push(resto)
  }
  return out.join('\r\n')
}
const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const enlazar = (s: string) => s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
function html(cuerpo: string, conFirma: boolean) {
  const parrafos = escapar(cuerpo).split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${enlazar(p).replace(/\n/g, '<br>')}</p>`).join('')
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0"><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">${parrafos}${conFirma ? '<img src="cid:firma@prospecta" alt="" style="display:block;max-width:360px;height:auto;margin-top:6px">' : ''}</div></body></html>`
}
function armarMail(o: { de: string, nombre: string, para: string, asunto: string, cuerpo: string, firma?: Archivo | null, adjuntos?: Archivo[] }) {
  const dominio = o.de.split('@')[1] || 'prospecta.app'
  const texto = o.cuerpo.replace(/\r?\n/g, '\r\n')
  const cab = [
    `From: ${o.nombre ? `${palabra(o.nombre)} ` : ''}<${o.de}>`, `To: <${o.para}>`, `Subject: ${palabra(o.asunto)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`, `Message-ID: <${crypto.randomUUID()}@${dominio}>`,
    // Baja con un clic por mail: Gmail y Yahoo lo valoran y evita que marquen "spam" para cortar
    `List-Unsubscribe: <mailto:${o.de}?subject=${encodeURIComponent('Baja')}>`, 'Content-Language: es', 'MIME-Version: 1.0',
  ]
  const adj = o.adjuntos ?? []
  const parteQp = (tipo: string, datos: string) => [`Content-Type: ${tipo}`, 'Content-Transfer-Encoding: quoted-printable', '', qp(datos)].join('\r\n')
  const f = () => 'b' + crypto.randomUUID().replace(/-/g, '')
  const [bMix, bRel, bAlt] = [f(), f(), f()]
  const parte = (tipo: string, datos: string, extra: string[] = []) => [`Content-Type: ${tipo}`, 'Content-Transfer-Encoding: base64', ...extra, '', datos].join('\r\n')
  const alternativa = [`Content-Type: multipart/alternative; boundary="${bAlt}"`, '',
    `--${bAlt}`, parteQp('text/plain; charset=UTF-8', texto),
    `--${bAlt}`, parteQp('text/html; charset=UTF-8', html(o.cuerpo, !!o.firma)), `--${bAlt}--`, ''].join('\r\n')
  const cuerpo = o.firma
    ? [`Content-Type: multipart/related; boundary="${bRel}"`, '', `--${bRel}`, alternativa,
       `--${bRel}`, parte(`${o.firma.mime}; name="${palabra(o.firma.nombre)}"`, lineas76(b64Bytes(o.firma.datos)), ['Content-ID: <firma@prospecta>', `Content-Disposition: inline; filename="${palabra(o.firma.nombre)}"`]),
       `--${bRel}--`, ''].join('\r\n')
    : alternativa
  if (!adj.length) return [...cab, cuerpo].join('\r\n')
  return [...cab, `Content-Type: multipart/mixed; boundary="${bMix}"`, '', `--${bMix}`, cuerpo,
    ...adj.flatMap(a => [`--${bMix}`, parte(`${a.mime}; name="${palabra(a.nombre)}"`, lineas76(b64Bytes(a.datos)), [`Content-Disposition: attachment; filename="${palabra(a.nombre)}"`])]),
    `--${bMix}--`, ''].join('\r\n')
}
async function enviarMail(cfg: Dic, clave: string, para: string, asunto: string, cuerpo: string, extra: { firma?: Archivo | null, adjuntos?: Archivo[] } = {}) {
  const msg = armarMail({ de: cfg.email, nombre: cfg.nombre_remitente, para, asunto, cuerpo, ...extra })
  await smtpSesion(cfg, clave, async l => {
    await smtpCmd(l, `MAIL FROM:<${cfg.email}>`, [250])
    await smtpCmd(l, `RCPT TO:<${para}>`, [250, 251])
    await smtpCmd(l, 'DATA', [354])
    await l.escribir(msg.replace(/\r\n\./g, '\r\n..') + '\r\n.\r\n')
    const r = await smtpRespuesta(l); if (r.codigo !== 250) throw new Error(`SMTP ${r.codigo}: ${r.texto.slice(0, 200)}`)
  })
  return msg
}

/** Guarda una copia en la carpeta Enviados (Gmail lo hace solo; Private Email, Zoho, Hostinger, etc. no) */
async function guardarEnEnviados(cfg: Dic, clave: string, msg: string) {
  if (/gmail/i.test(cfg.smtp_host ?? '') || !cfg.imap_host) return
  const im = await Imap.abrir(cfg, clave)
  try {
    const lista = await im.cmd('LIST "" "*"')
    const carpetas = lista.map(l => {
      const m = l.match(/^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (.+)$/i)
      return m ? { flags: m[1], nombre: m[2].trim().replace(/^"|"$/g, '') } : null
    }).filter(Boolean) as { flags: string, nombre: string }[]
    const enviados = carpetas.find(c => /\\Sent/i.test(c.flags))?.nombre
      ?? carpetas.find(c => /(^|[./])(sent|sent items|sent messages|enviados|elementos enviados)$/i.test(c.nombre))?.nombre ?? 'Sent'
    await im.append(enviados, msg)
  } finally { im.cerrar() }
}

/** Firma con imagen y adjuntos elegidos, leídos del storage (sólo los del propio usuario) */
async function archivosDe(db: ReturnType<typeof admin>, owner: string, ids: string[]) {
  const { data } = await db.from('archivos').select('*').eq('owner_id', owner)
  const leer = async (a: Dic): Promise<Archivo | null> => {
    const { data: blob, error } = await db.storage.from('archivos').download(a.path)
    if (error || !blob) { console.error('archivo', a.path, error); return null }
    return { nombre: a.nombre, mime: a.mime || 'application/octet-stream', datos: new Uint8Array(await blob.arrayBuffer()) }
  }
  const lista = (data ?? []) as Dic[]
  const firmaFila = lista.find(a => a.tipo === 'firma')
  const elegidos = lista.filter(a => a.tipo === 'adjunto' && ids.includes(a.id))
  const [firma, ...adjuntos] = await Promise.all([firmaFila ? leer(firmaFila) : Promise.resolve(null), ...elegidos.map(leer)])
  return { firma, adjuntos: adjuntos.filter(Boolean) as Archivo[] }
}

// ---------- IMAP (lo justo para leer remitentes nuevos) ----------
class Imap {
  private n = 0
  constructor(private l: Linea) {}
  static async abrir(cfg: Dic, clave: string) {
    const l = await Linea.abrir(cfg.imap_host, cfg.imap_puerto)
    const im = new Imap(l)
    const hola = await l.linea(); if (!/^\* (OK|PREAUTH)/i.test(hola)) throw new Error('IMAP: ' + hola)
    const q = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    try { await im.cmd(`LOGIN ${q(cfg.email)} ${q(clave)}`) } catch (e) { throw new Error('AUTH: ' + (e as Error).message) }
    return im
  }
  // Devuelve las líneas sin etiqueta; los literales {n} quedan pegados a su línea
  async cmd(c: string): Promise<string[]> {
    const tag = 'a' + (++this.n)
    await this.l.escribir(`${tag} ${c}\r\n`)
    const out: string[] = []
    while (true) {
      let linea = await this.l.linea()
      while (/\{(\d+)\}$/.test(linea)) {
        const n = Number(linea.match(/\{(\d+)\}$/)![1])
        linea += '\n' + await this.l.bytes(n) + await this.l.linea()
      }
      if (linea.startsWith(tag + ' ')) {
        if (!/^\S+ OK/i.test(linea)) throw new Error('IMAP: ' + linea.slice(tag.length + 1, 200))
        return out
      }
      out.push(linea)
    }
  }
  async append(carpeta: string, msg: string) {
    const tag = 'a' + (++this.n)
    const bytes = enc.encode(msg)
    await this.l.escribir(`${tag} APPEND "${carpeta.replace(/"/g, '\\"')}" (\\Seen) {${bytes.length}}\r\n`)
    const cont = await this.l.linea()
    if (!cont.startsWith('+')) throw new Error('IMAP APPEND: ' + cont.slice(0, 160))
    await this.l.escribir(msg + '\r\n')
    while (true) {
      const linea = await this.l.linea()
      if (linea.startsWith(tag + ' ')) { if (!/^\S+ OK/i.test(linea)) throw new Error('IMAP APPEND: ' + linea.slice(0, 160)); return }
    }
  }
  cerrar() { this.cmd('LOGOUT').catch(() => {}).finally(() => this.l.cerrar()) }
}
const MESES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function decodificarAsunto(s: string) {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, t, txt) => {
    try {
      const bytes = t.toUpperCase() === 'B' ? Uint8Array.from(atob(txt), c => c.charCodeAt(0))
        : Uint8Array.from(txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m: string, h: string) => String.fromCharCode(parseInt(h, 16))), (c: string) => c.charCodeAt(0))
      return new TextDecoder(cs).decode(bytes)
    } catch { return txt }
  }).replace(/\s+/g, ' ').trim()
}

async function revisar(db: any, supabase: any, userId: string, cfg: Dic, clave: string) {
  const im = await Imap.abrir(cfg, clave)
  try {
    const sel = await im.cmd('SELECT INBOX')
    const validez = Number(sel.join(' ').match(/UIDVALIDITY (\d+)/i)?.[1] ?? 0)
    let desde = validez === Number(cfg.uid_validez) ? Number(cfg.ultimo_uid) : 0
    let uids: number[]
    if (desde > 0) {
      const r = await im.cmd(`UID SEARCH UID ${desde + 1}:*`)
      uids = (r.find(x => x.startsWith('* SEARCH')) ?? '').replace('* SEARCH', '').trim().split(/\s+/).filter(Boolean).map(Number).filter(u => u > desde)
    } else {
      const d = new Date(Date.now() - 14 * 86400000)
      const r = await im.cmd(`UID SEARCH SINCE ${d.getUTCDate()}-${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()}`)
      uids = (r.find(x => x.startsWith('* SEARCH')) ?? '').replace('* SEARCH', '').trim().split(/\s+/).filter(Boolean).map(Number)
    }
    uids = uids.slice(-300)
    const maxUid = Math.max(desde, ...uids)
    const encontrados: { email: string, asunto: string }[] = []
    if (uids.length) {
      const r = await im.cmd(`UID FETCH ${uids.join(',')} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])`)
      for (const bloque of r) {
        const from = bloque.match(/^From:([\s\S]*?)(?:\r?\n\S|$)/im)?.[1] ?? ''
        const email = (from.match(/<([^>]+)>/)?.[1] ?? from.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? '').trim().toLowerCase()
        const asunto = decodificarAsunto(bloque.match(/^Subject:([\s\S]*?)(?:\r?\n\S|$)/im)?.[1] ?? '')
        if (email) encontrados.push({ email, asunto })
      }
    }
    // Cruzar con prospectos a los que ya les escribimos
    let marcados: string[] = []
    if (encontrados.length) {
      const { data: ps } = await supabase.from('prospectos').select('id, nombre, email, estado').neq('email', '').in('estado', ['contactado', 'pendiente'])
      const porEmail = new Map((ps ?? []).map((p: Dic) => [String(p.email).trim().toLowerCase(), p]))
      for (const m of encontrados) {
        const p = porEmail.get(m.email) as Dic | undefined
        if (!p || marcados.includes(p.id)) continue
        const { error } = await supabase.from('interacciones').insert({ prospecto_id: p.id, tipo: 'respuesta', canal: 'email', detalle: `Respondió por email${m.asunto ? `: "${m.asunto.slice(0, 140)}"` : ''}` })
        if (!error) marcados.push(p.nombre)
      }
    }
    await db.from('conexiones_correo').update({ ultimo_uid: maxUid, uid_validez: validez, ultima_revision: new Date().toISOString(), ultimo_error: '' }).eq('owner_id', userId)
    return { revisados: uids.length, respondieron: marcados }
  } finally { im.cerrar() }
}

function explicar(e: unknown, cfg?: Dic) {
  const m = e instanceof Error ? e.message : String(e)
  if (/^AUTH/.test(m) || /535|534|AUTHENTICATIONFAILED|Invalid credentials/i.test(m))
    return /gmail/i.test(cfg?.smtp_host ?? '') ? 'Gmail rechazó la contraseña. Tiene que ser una contraseña de aplicación (16 letras), no tu contraseña normal, y la cuenta necesita la verificación en 2 pasos activada.'
      : 'El servidor rechazó el email o la contraseña. Revisá que el email esté completo y la contraseña sea la de esa casilla (o una contraseña de aplicación si tenés verificación en 2 pasos).'
  if (/No pude conectar|no responde|cerró/i.test(m)) return m + '. Revisá el servidor y el puerto.'
  return m.replace(/^Error:\s*/, '')
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let usuario
  try { usuario = await clienteDelUsuario(req) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const { supabase, user } = usuario
  const db = admin()
  const body = await req.json().catch(() => ({}))
  const modo = String(body.modo ?? 'estado')

  const { data: cfg } = await db.from('conexiones_correo').select('*').eq('owner_id', user.id).maybeSingle()
  const sinSecreto = (c: Dic | null) => c && (({ secreto_id, ...r }) => r)(c)

  if (modo === 'estado') return json({ conexion: sinSecreto(cfg) })

  if (modo === 'desconectar') { await db.rpc('correo_borrar', { p_owner: user.id }); return json({ ok: true }) }

  if (modo === 'conectar') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const clave = String(body.clave ?? '').replace(/\s+/g, '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Escribí un email válido.' }, 400)
    if (clave.length < 6) return json({ error: 'Pegá la contraseña.' }, 400)
    const preset = PROVEEDORES.find(([re]) => re.test(email))?.[1]
    if (preset && !preset.smtp) return json({ error: 'Outlook, Hotmail e iCloud sólo permiten enviar por el puerto 587, que nuestro servidor no puede usar. Conectá Gmail, Private Email, Zoho, Yahoo o el correo de tu dominio.', codigo: 'NO_SOPORTADO' }, 400)
    const dominio = email.split('@')[1]
    const nuevo = {
      owner_id: user.id, email, nombre_remitente: String(body.nombre ?? '').slice(0, 80),
      smtp_host: String(body.smtp_host || preset?.smtp || `mail.${dominio}`).trim(), smtp_puerto: Number(body.smtp_puerto) || 465,
      imap_host: String(body.imap_host || preset?.imap || `mail.${dominio}`).trim(), imap_puerto: Number(body.imap_puerto) || 993,
    }
    if (nuevo.smtp_puerto === 587 || nuevo.smtp_puerto === 25) return json({ error: 'El puerto 587/25 no está disponible en nuestro servidor. Usá el 465 (SSL).' }, 400)
    try { await smtpSesion(nuevo, clave) } catch (e) { return json({ error: 'No pude entrar para enviar: ' + explicar(e, nuevo) }, 400) }
    let leer = true, avisoImap = ''
    try { (await Imap.abrir(nuevo, clave)).cerrar() } catch (e) { leer = false; avisoImap = 'Puede enviar, pero no pude entrar a la bandeja para leer respuestas (' + explicar(e, nuevo) + ').' }
    const { data: sid, error: e1 } = await db.rpc('correo_guardar_secreto', { p_owner: user.id, p_valor: clave })
    if (e1) return json({ error: 'No pude guardar la contraseña: ' + e1.message }, 500)
    const { error: e2 } = await db.from('conexiones_correo').upsert({ ...nuevo, secreto_id: sid, leer_respuestas: leer, ultimo_uid: 0, uid_validez: 0, ultimo_error: avisoImap })
    if (e2) return json({ error: e2.message }, 500)
    const { data: listo } = await db.from('conexiones_correo').select('*').eq('owner_id', user.id).single()
    return json({ ok: true, conexion: sinSecreto(listo), aviso: avisoImap })
  }

  if (!cfg) return json({ error: 'Todavía no conectaste tu email. Hacelo en Email.', codigo: 'SIN_CORREO' }, 400)
  const { data: clave } = await db.rpc('correo_leer_secreto', { p_owner: user.id })
  if (!clave) return json({ error: 'Falta la contraseña del email: volvé a conectarlo.', codigo: 'SIN_CORREO' }, 400)

  if (modo === 'probar') {
    try {
      const { firma } = await archivosDe(db, user.id, [])
      const copia = await enviarMail(cfg, clave, cfg.email, 'Prueba de Prospecta ✓', `¡Hola!\n\nSi te llegó este mail, tu cuenta ${cfg.email} quedó conectada a Prospecta y ya podés enviar emails a tus prospectos desde la app.${firma ? '\n\nAbajo vas a ver tu firma tal como la reciben tus clientes.' : ''}\n\nProspecta`, { firma })
      let enEnviados = true
      try { await guardarEnEnviados(cfg, clave, copia) } catch (e) { enEnviados = false; console.error('copia en Enviados', e) }
      return json({ ok: true, en_enviados: enEnviados })
    } catch (e) { return json({ error: explicar(e, cfg) }, 400) }
  }

  if (modo === 'enviar') {
    const { data: m } = await supabase.from('mensajes').select('*, prospectos(*)').eq('id', body.mensaje_id).maybeSingle()
    if (!m) return json({ error: 'No encontré el borrador. Guardalo y probá de nuevo.' }, 404)
    const p = m.prospectos as Dic
    const para = String(p?.email ?? '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) return json({ error: 'El prospecto no tiene un email válido.' }, 400)
    if (p.estado === 'no_interesado') return json({ error: 'Este negocio pidió no ser contactado.' }, 400)
    // Mismas reglas que la base (límite diario y texto repetido) ANTES de mandar
    const [{ data: perfil }, { data: t }] = await Promise.all([
      supabase.from('perfiles').select('nombre').eq('id', user.id).single(),
      supabase.rpc('tablero'),
    ])
    if ((t?.enviados_hoy ?? 0) >= (t?.limite_diario ?? 15)) return json({ error: 'LIMITE_DIARIO' }, 400)
    const { data: iguales } = await supabase.from('mensajes').select('id').eq('cuerpo', m.cuerpo).not('enviado_at', 'is', null).neq('id', m.id).limit(1)
    if (iguales?.length) return json({ error: 'TEXTO_REPETIDO' }, 400)
    const remitente = { ...cfg, nombre_remitente: cfg.nombre_remitente || perfil?.nombre || '' }
    const ids: string[] = Array.isArray(body.adjuntos) ? body.adjuntos.map(String) : (m.adjuntos ?? [])
    const extra = await archivosDe(db, user.id, ids)
    if (Array.isArray(body.adjuntos)) await supabase.from('mensajes').update({ adjuntos: ids }).eq('id', m.id)
    let copia = ''
    try { copia = await enviarMail(remitente, clave, para, m.asunto || 'Hola', m.cuerpo, extra) }
    catch (e) { return json({ error: 'No se pudo enviar: ' + explicar(e, cfg) }, 502) }
    let enEnviados = true
    try { await guardarEnEnviados(cfg, clave, copia) } catch (e) { enEnviados = false; console.error('copia en Enviados', e) }
    const { error } = await supabase.from('interacciones').insert({ prospecto_id: p.id, mensaje_id: m.id, tipo: 'enviado', canal: 'email', detalle: `Email enviado desde ${cfg.email} a ${para}${extra.adjuntos.length ? ` con ${extra.adjuntos.map(a => a.nombre).join(', ')}` : ''}` })
    if (error) console.error('registrar envío', error)
    return json({ ok: true, para, en_enviados: enEnviados })
  }

  if (modo === 'revisar') {
    if (!cfg.leer_respuestas || !cfg.imap_host) return json({ ok: true, revisados: 0, respondieron: [], aviso: 'La lectura de respuestas está desactivada.' })
    try { return json({ ok: true, ...(await revisar(db, supabase, user.id, cfg, clave)) }) }
    catch (e) {
      const msg = explicar(e, cfg)
      await db.from('conexiones_correo').update({ ultimo_error: msg, ultima_revision: new Date().toISOString() }).eq('owner_id', user.id)
      return json({ error: msg }, 502)
    }
  }

  return json({ error: 'Modo desconocido' }, 400)
})
