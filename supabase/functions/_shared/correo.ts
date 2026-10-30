// Núcleo del correo conectado, compartido por la función "correo" (acciones de la persona) y por el
// "trabajador" (cola de envíos, secuencias y lectura de casillas en segundo plano).
// SMTP 465 con TLS directo e IMAP 993 (Supabase no deja salir por 25/587).
type Dic = Record<string, any>
export const enc = new TextEncoder(), dec = new TextDecoder()
export const b64 = (s: string) => btoa(String.fromCharCode(...enc.encode(s)))

export const PROVEEDORES: [RegExp, { smtp: string, imap: string }][] = [
  [/@(gmail|googlemail)\.com$/i, { smtp: 'smtp.gmail.com', imap: 'imap.gmail.com' }],
  [/@yahoo\.(com|com\.ar)$/i, { smtp: 'smtp.mail.yahoo.com', imap: 'imap.mail.yahoo.com' }],
  [/@zoho(mail)?\.com$/i, { smtp: 'smtp.zoho.com', imap: 'imap.zoho.com' }],
  [/@(outlook|hotmail|live|msn)\./i, { smtp: '', imap: '' }],
  [/@(icloud|me)\.com$/i, { smtp: '', imap: '' }],
]

// ---------- Conexión de texto sobre TLS ----------
export class Linea {
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
export async function smtpSesion(cfg: Dic, clave: string, fn?: (l: Linea) => Promise<void>) {
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
export type Archivo = { nombre: string, mime: string, datos: Uint8Array }
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
function html(cuerpo: string, conFirma: boolean, baja = '') {
  const parrafos = escapar(cuerpo).split(/\n{2,}/).map(p => `<p style="margin:0 0 14px">${enlazar(p).replace(/\n/g, '<br>')}</p>`).join('')
  const pie = baja ? `<p style="margin:22px 0 0;font-size:11px;line-height:1.4;color:#8a8a8a">Si no querés recibir más mensajes, respondé BAJA o <a href="${baja}" style="color:#8a8a8a">hacé clic acá</a>.</p>` : ''
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:0"><div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#222">${parrafos}${conFirma ? '<img src="cid:firma@prospecta" alt="" style="display:block;max-width:360px;height:auto;margin-top:6px">' : ''}${pie}</div></body></html>`
}
export function armarMail(o: { de: string, nombre: string, para: string, asunto: string, cuerpo: string, firma?: Archivo | null, adjuntos?: Archivo[], baja?: string, messageId?: string, enRespuestaA?: string }) {
  const dominio = o.de.split('@')[1] || 'prospecta.app'
  const texto = (o.cuerpo + (o.baja ? `\n\n--\nSi no querés recibir más mensajes, respondé BAJA o entrá acá: ${o.baja}` : '')).replace(/\r?\n/g, '\r\n')
  const cab = [
    `From: ${o.nombre ? `${palabra(o.nombre)} ` : ''}<${o.de}>`, `To: <${o.para}>`, `Subject: ${palabra(o.asunto)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`, `Message-ID: ${o.messageId || `<${crypto.randomUUID()}@${dominio}>`}`,
    ...(o.enRespuestaA ? [`In-Reply-To: ${o.enRespuestaA}`, `References: ${o.enRespuestaA}`] : []),
    // Baja: Gmail y Yahoo lo valoran y evita que marquen "spam" para cortar
    `List-Unsubscribe: ${o.baja ? `<${o.baja}>, ` : ''}<mailto:${o.de}?subject=${encodeURIComponent('Baja')}>`, 'Content-Language: es', 'MIME-Version: 1.0',
  ]
  const adj = o.adjuntos ?? []
  const parteQp = (tipo: string, datos: string) => [`Content-Type: ${tipo}`, 'Content-Transfer-Encoding: quoted-printable', '', qp(datos)].join('\r\n')
  const f = () => 'b' + crypto.randomUUID().replace(/-/g, '')
  const [bMix, bRel, bAlt] = [f(), f(), f()]
  const parte = (tipo: string, datos: string, extra: string[] = []) => [`Content-Type: ${tipo}`, 'Content-Transfer-Encoding: base64', ...extra, '', datos].join('\r\n')
  const alternativa = [`Content-Type: multipart/alternative; boundary="${bAlt}"`, '',
    `--${bAlt}`, parteQp('text/plain; charset=UTF-8', texto),
    `--${bAlt}`, parteQp('text/html; charset=UTF-8', html(o.cuerpo, !!o.firma, o.baja)), `--${bAlt}--`, ''].join('\r\n')
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
export async function enviarMail(cfg: Dic, clave: string, para: string, asunto: string, cuerpo: string, extra: { firma?: Archivo | null, adjuntos?: Archivo[], baja?: string, messageId?: string, enRespuestaA?: string } = {}) {
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
export async function guardarEnEnviados(cfg: Dic, clave: string, msg: string) {
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
export async function archivosDe(db: any, owner: string, ids: string[]) {
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
export class Imap {
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
export function decodificarAsunto(s: string) {
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, cs, t, txt) => {
    try {
      const bytes = t.toUpperCase() === 'B' ? Uint8Array.from(atob(txt), c => c.charCodeAt(0))
        : Uint8Array.from(txt.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (_m: string, h: string) => String.fromCharCode(parseInt(h, 16))), (c: string) => c.charCodeAt(0))
      return new TextDecoder(cs).decode(bytes)
    } catch { return txt }
  }).replace(/\s+/g, ' ').trim()
}

/** Pasa el cuerpo crudo (MIME, base64 o quoted-printable, HTML) a texto legible */
export function textoLegible(raw: string) {
  let t = raw
  // Partes en base64: decodificarlas
  t = t.replace(/Content-Transfer-Encoding:\s*base64[^\n]*\n(?:[^\n]*\n)*?\s*\n([A-Za-z0-9+/=\r\n]{20,})/gi, (_m, datos: string) => {
    try { return '\n' + new TextDecoder().decode(Uint8Array.from(atob(datos.replace(/\s+/g, '')), c => c.charCodeAt(0))) + '\n' } catch { return '\n' }
  })
  if (/=\r?\n|=[0-9A-F]{2}/i.test(t)) {
    const bytes = t.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    try { t = new TextDecoder().decode(Uint8Array.from(bytes, c => c.charCodeAt(0) & 255)) } catch { t = bytes }
  }
  return t.replace(/\r\n?/g, '\n').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/^--\S+$/gm, '').replace(/^Content-[\w-]+:.*$/gim, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}
/** Lo que escribió la persona, sin la parte citada del mail anterior */
export function sinCita(t: string) {
  const corte = t.search(/\n\s*(El .{2,160} escribió:|On .{2,160} wrote:|-{2,}\s*(Mensaje original|Original Message)|De:\s.+\n|From:\s.+\n|Enviado desde mi|Sent from my)/i)
  return (corte > 0 ? t.slice(0, corte) : t).split('\n').filter(l => !l.trim().startsWith('>')).join('\n').trim()
}
export const PIDE_BAJA = /\b(dar(me|nos)? de baja|no (me|nos) (escriban|escribas|escriba|contacten|contactes|env[ií]en|manden|mandes)( m[aá]s)?|no (quiero|queremos|deseo|deseamos) recibir|sacame|s[aá]quenme|elimin(en|ar)(me)? de (su|la|tu) lista|remove me|unsubscribe|stop emailing|do not contact)\b/i
export const ES_REBOTE_DE = /mailer-daemon|postmaster|mail delivery|maildelivery/i
export const ES_REBOTE_ASUNTO = /undeliver|delivery status notification|delivery failure|failure notice|returned mail|mail delivery failed|no se pudo entregar|no entregado|devuelto|rebot|message not delivered|address not found/i

// ---------- Salud del dominio (SPF, DKIM, DMARC) con DNS público ----------
async function txt(nombre: string): Promise<string[]> {
  for (const base of ['https://dns.google/resolve', 'https://cloudflare-dns.com/dns-query']) {
    try {
      const r = await fetch(`${base}?name=${encodeURIComponent(nombre)}&type=TXT`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(6000) })
      if (!r.ok) continue
      const d = await r.json()
      return (d.Answer ?? []).filter((a: Dic) => a.type === 16).map((a: Dic) => String(a.data).replace(/"\s*"/g, '').replace(/^"|"$/g, ''))
    } catch { /* probar el otro */ }
  }
  return []
}
const SELECTORES = ['default', 'google', 'selector1', 'selector2', 'zmail', 'zoho', 'k1', 'mail', 'dkim', 's1', 's2', 'smtp', 'hostingermail1', 'mxvault']
export async function saludDominio(email: string, smtp: string) {
  const dominio = email.split('@')[1]?.toLowerCase() ?? ''
  if (/^(gmail|googlemail|yahoo|hotmail|outlook|zoho)\./.test(dominio)) return { dominio, gestionado: true }
  const [raiz, dmarc] = await Promise.all([txt(dominio), txt(`_dmarc.${dominio}`)])
  const spf = raiz.find(t => /^v=spf1/i.test(t)) ?? ''
  const dmarcReg = dmarc.find(t => /^v=DMARC1/i.test(t)) ?? ''
  let dkimSel = ''
  const pruebas = await Promise.all(SELECTORES.map(async s => ({ s, r: await txt(`${s}._domainkey.${dominio}`) })))
  dkimSel = pruebas.find(x => x.r.some(t => /v=DKIM1|k=rsa|p=/i.test(t)))?.s ?? ''
  const proveedor = /privateemail/i.test(smtp) ? 'privateemail' : /gmail|google/i.test(smtp) ? 'google' : /zoho/i.test(smtp) ? 'zoho' : /hostinger/i.test(smtp) ? 'hostinger' : 'otro'
  return {
    dominio, gestionado: false, proveedor,
    spf: { ok: !!spf, valor: spf, duro: /-all/.test(spf) },
    dkim: { ok: !!dkimSel, selector: dkimSel },
    dmarc: { ok: !!dmarcReg, valor: dmarcReg, politica: dmarcReg.match(/p=(\w+)/i)?.[1] ?? '' },
  }
}

export function explicar(e: unknown, cfg?: Dic) {
  const m = e instanceof Error ? e.message : String(e)
  if (/^AUTH/.test(m) || /535|534|AUTHENTICATIONFAILED|Invalid credentials/i.test(m))
    return /gmail/i.test(cfg?.smtp_host ?? '') ? 'Gmail rechazó la contraseña. Tiene que ser una contraseña de aplicación (16 letras), no tu contraseña normal, y la cuenta necesita la verificación en 2 pasos activada.'
      : 'El servidor rechazó el email o la contraseña. Revisá que el email esté completo y la contraseña sea la de esa casilla (o una contraseña de aplicación si tenés verificación en 2 pasos).'
  if (/No pude conectar|no responde|cerró/i.test(m)) return m + '. Revisá el servidor y el puerto.'
  return m.replace(/^Error:\s*/, '')
}


// ---------- Leer la casilla ----------
export type Entrante = { email: string, asunto: string, texto: string, rebote: boolean, messageId: string, enRespuestaA: string, fecha: string }
export type Clasificacion = { clasificacion: string, motivo: string, contacto?: Dic | null, vuelve?: string | null, resumen?: string }

/** Trae de la bandeja de entrada los mails nuevos desde la última revisión (hasta 150) */
export async function leerEntrantes(cfg: Dic, clave: string) {
  const im = await Imap.abrir(cfg, clave)
  try {
    const sel = await im.cmd('SELECT INBOX')
    const validez = Number(sel.join(' ').match(/UIDVALIDITY (\d+)/i)?.[1] ?? 0)
    const desde = validez === Number(cfg.uid_validez) ? Number(cfg.ultimo_uid) : 0
    let uids: number[]
    if (desde > 0) {
      const r = await im.cmd(`UID SEARCH UID ${desde + 1}:*`)
      uids = (r.find(x => x.startsWith('* SEARCH')) ?? '').replace('* SEARCH', '').trim().split(/\s+/).filter(Boolean).map(Number).filter(u => u > desde)
    } else {
      const d = new Date(Date.now() - 14 * 86400000)
      const r = await im.cmd(`UID SEARCH SINCE ${d.getUTCDate()}-${MESES[d.getUTCMonth()]}-${d.getUTCFullYear()}`)
      uids = (r.find(x => x.startsWith('* SEARCH')) ?? '').replace('* SEARCH', '').trim().split(/\s+/).filter(Boolean).map(Number)
    }
    uids = uids.slice(-150)
    const maxUid = Math.max(desde, ...uids)
    const encontrados: Entrante[] = []
    if (uids.length) {
      const r = await im.cmd(`UID FETCH ${uids.join(',')} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT MESSAGE-ID IN-REPLY-TO DATE)] BODY.PEEK[TEXT]<0.12000>)`)
      for (const bloque of r) {
        const [cab, ...resto] = bloque.split(/BODY\[TEXT\](?:<\d+>)?\s*\{\d+\}\n/)
        const campo = (n: string) => cab.match(new RegExp(`^${n}:([\\s\\S]*?)(?:\\r?\\n\\S|$)`, 'im'))?.[1]?.trim() ?? ''
        const from = campo('From')
        const email = (from.match(/<([^>]+)>/)?.[1] ?? from.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? '').trim().toLowerCase()
        const asunto = decodificarAsunto(campo('Subject'))
        const texto = textoLegible(resto.join('\n'))
        const rebote = ES_REBOTE_DE.test(from) || ES_REBOTE_ASUNTO.test(asunto)
        if (email) encontrados.push({ email, asunto, texto, rebote, messageId: campo('Message-ID'), enRespuestaA: campo('In-Reply-To'), fecha: campo('Date') })
      }
    }
    return { validez, maxUid, encontrados, revisados: uids.length }
  } finally { im.cerrar() }
}

const ESTADO_POR_CLASE: Record<string, string> = { interesado: 'respondio', pide_info: 'respondio', reunion: 'reunion', no_interesado: 'perdido', derivar: 'respondio', otro: 'respondio' }
const ETIQUETA: Record<string, string> = { interesado: 'Interesado', pide_info: 'Pide info o precio', reunion: 'Quiere una reunión', no_interesado: 'No interesado', derivar: 'Deriva a otra persona', fuera_oficina: 'Fuera de la oficina', baja: 'Pidió la baja', rebote: 'Rebotó', otro: 'Respondió' }

/**
 * Procesa lo que llegó: rebotes (email inválido), bajas (lista de "No contactar"), fuera de oficina (reprograma
 * la secuencia) y respuestas (bandeja de Respuestas + estado según la clasificación de Claude). Todo filtrado por owner.
 */
export async function procesarEntrantes(db: any, owner: string, encontrados: Entrante[], clasificar?: (m: Entrante, p: Dic) => Promise<Clasificacion | null>) {
  const marcados: string[] = [], rebotes: string[] = [], bajas: string[] = []
  if (!encontrados.length) return { respondieron: marcados, rebotes, bajas }
  const { data: ps } = await db.from('prospectos').select('id, nombre, email, estado').eq('owner_id', owner).neq('email', '')
  const porEmail = new Map((ps ?? []).map((p: Dic) => [String(p.email).trim().toLowerCase(), p]))
  let clasificadas = 0
  for (const m of encontrados) {
    if (m.rebote) {
      const destinatarios = [
        ...[...m.texto.matchAll(/(?:Final|Original)-Recipient:\s*(?:rfc822;)?\s*<?([^\s>;]+@[^\s>;]+)/gi)].map(x => x[1]),
        ...[...m.texto.matchAll(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g)].map(x => x[0]),
      ].map(x => x.toLowerCase())
      const p = destinatarios.map(d => porEmail.get(d) as Dic | undefined).find(Boolean)
      if (p && !rebotes.includes(p.nombre)) {
        const { error } = await db.from('interacciones').insert({ owner_id: owner, prospecto_id: p.id, tipo: 'rebote', canal: 'email', detalle: `El mail a ${p.email} rebotó: la dirección no existe o no recibe correo` })
        if (!error) rebotes.push(p.nombre)
      }
      continue
    }
    const p = porEmail.get(m.email) as Dic | undefined
    if (!p) continue
    // Ya registrada (por ejemplo, si la casilla se revisó dos veces)
    if (m.messageId) {
      const { data: ya } = await db.from('respuestas').select('id').eq('owner_id', owner).eq('message_id', m.messageId).maybeSingle()
      if (ya) continue
    }
    const propio = sinCita(m.texto)
    const pideBaja = /^\s*(re:\s*)*baja\s*$/i.test(m.asunto) || /^\s*baja[\s.!]*$/i.test(propio.slice(0, 40)) || PIDE_BAJA.test(propio.slice(0, 600))
    let c: Clasificacion | null = pideBaja ? { clasificacion: 'baja', motivo: 'Pidió no recibir más mensajes' } : null
    if (!c && clasificar && clasificadas < 25) { clasificadas++; c = await clasificar({ ...m, texto: propio }, p).catch(() => null) }
    c = c ?? { clasificacion: 'otro', motivo: '' }
    const fecha = Date.parse(m.fecha)
    await db.from('respuestas').insert({
      owner_id: owner, prospecto_id: p.id, de: m.email, asunto: m.asunto.slice(0, 300), texto: propio.slice(0, 8000),
      recibida_at: Number.isFinite(fecha) ? new Date(fecha).toISOString() : new Date().toISOString(),
      message_id: m.messageId || null, en_respuesta_a: m.enRespuestaA || null,
      clasificacion: c.clasificacion, motivo: c.motivo?.slice(0, 400) ?? '', datos: { contacto: c.contacto ?? null, vuelve: c.vuelve ?? null, resumen: c.resumen ?? '' },
      leida: c.clasificacion === 'fuera_oficina',
    })
    const etiqueta = ETIQUETA[c.clasificacion] ?? 'Respondió'
    if (c.clasificacion === 'baja') {
      await db.rpc('suprimir_email', { p_owner: owner, p_email: m.email, p_origen: 'respuesta', p_motivo: 'Respondió pidiendo no recibir más mensajes' })
      await db.from('interacciones').insert({ owner_id: owner, prospecto_id: p.id, tipo: 'baja', canal: 'email', detalle: `Pidió no recibir más mensajes${m.asunto ? ` ("${m.asunto.slice(0, 120)}")` : ''}` })
      bajas.push(p.nombre); continue
    }
    if (c.clasificacion === 'fuera_oficina') {
      // No es una respuesta: el próximo paso de la secuencia se corre a después de la vuelta
      const vuelve = c.vuelve && Number.isFinite(Date.parse(c.vuelve)) ? new Date(Date.parse(c.vuelve) + 86400000) : new Date(Date.now() + 7 * 86400000)
      await db.from('inscripciones').update({ proximo_at: vuelve.toISOString() }).eq('prospecto_id', p.id).eq('estado', 'activa')
      await db.from('interacciones').insert({ owner_id: owner, prospecto_id: p.id, tipo: 'nota', canal: 'email', detalle: `Respuesta automática: fuera de la oficina${c.vuelve ? ` hasta el ${c.vuelve}` : ''}. El próximo seguimiento se reprogramó.` })
      continue
    }
    if (marcados.includes(p.nombre)) continue
    const { error } = await db.from('interacciones').insert({ owner_id: owner, prospecto_id: p.id, tipo: 'respuesta', canal: 'email', detalle: `${etiqueta}${c.motivo ? `: ${c.motivo}` : ''}${m.asunto ? ` ("${m.asunto.slice(0, 120)}")` : ''}` })
    if (!error) marcados.push(p.nombre)
    // El estado cambia solo según lo que respondió
    const nuevo = ESTADO_POR_CLASE[c.clasificacion]
    if (nuevo === 'perdido' && !['cliente', 'no_contactar', 'perdido'].includes(p.estado)) {
      await db.from('prospectos').update({ estado: 'perdido', perdido_motivo: 'no_interesado', perdido_detalle: (c.motivo ?? '').slice(0, 200) }).eq('id', p.id)
      await db.from('interacciones').insert({ owner_id: owner, prospecto_id: p.id, tipo: 'cambio_estado', detalle: `Pasó a "Perdido" (motivo: no interesado${c.motivo ? `: ${c.motivo}` : ''})` })
    }
    if (nuevo === 'reunion' && ['pendiente', 'contactado', 'respondio'].includes(p.estado)) {
      await db.from('prospectos').update({ estado: 'reunion' }).eq('id', p.id)
      await db.from('interacciones').insert({ owner_id: owner, prospecto_id: p.id, tipo: 'cambio_estado', detalle: 'Pasó a "Reunión agendada" (propuso o aceptó una reunión en su respuesta)' })
    }
    if (c.clasificacion === 'reunion') {
      await db.from('tareas').insert({ owner_id: owner, prospecto_id: p.id, tipo: 'reunion', titulo: `Coordinar la reunión con ${p.nombre}`, texto: c.motivo ?? '', origen: 'respuesta' })
    }
    if (c.clasificacion === 'derivar' && c.contacto?.email) {
      await db.from('interacciones').insert({ owner_id: owner, prospecto_id: p.id, tipo: 'nota', detalle: `Derivó a ${[c.contacto.nombre, c.contacto.cargo].filter(Boolean).join(', ')} (${c.contacto.email})` })
      await db.from('contactos').insert({ owner_id: owner, prospecto_id: p.id, nombre: c.contacto.nombre ?? '', cargo: c.contacto.cargo ?? '', email: c.contacto.email, fuente: 'Lo pasó en su respuesta por mail' }).then(() => {}, () => {})
    }
  }
  return { respondieron: marcados, rebotes, bajas }
}

/** Revisa la casilla de una persona de punta a punta y guarda dónde quedó */
export async function revisarCasilla(db: any, owner: string, cfg: Dic, clave: string, clasificar?: (m: Entrante, p: Dic) => Promise<Clasificacion | null>) {
  const leido = await leerEntrantes(cfg, clave)
  const r = await procesarEntrantes(db, owner, leido.encontrados, clasificar)
  await db.from('conexiones_correo').update({ ultimo_uid: leido.maxUid, uid_validez: leido.validez, ultima_revision: new Date().toISOString(), ultimo_error: '' }).eq('owner_id', owner)
  return { revisados: leido.revisados, ...r }
}

// ---------- Enviar un mail (individual, masivo o de secuencia) con todas las protecciones ----------
export class ErrorEnvio extends Error {
  constructor(msg: string, public codigo: string, public temporal = false) { super(msg) }
}

/**
 * Manda un mail desde la casilla de la persona. Verifica: no contactar, email inválido, límite de la casilla y
 * texto repetido. Agrega el link de baja, sigue el hilo si hay, guarda la copia en Enviados y registra el envío.
 */
export async function enviarUno(db: any, owner: string, o: { prospecto_id: string, asunto: string, cuerpo: string, adjuntos?: string[], mensaje_id?: string | null, hilo?: string | null, base?: string }) {
  const [{ data: cfg }, { data: p }, { data: perfil }] = await Promise.all([
    db.from('conexiones_correo').select('*').eq('owner_id', owner).maybeSingle(),
    db.from('prospectos').select('*').eq('id', o.prospecto_id).eq('owner_id', owner).maybeSingle(),
    db.from('perfiles').select('nombre').eq('id', owner).maybeSingle(),
  ])
  if (!cfg) throw new ErrorEnvio('Todavía no conectaste tu email. Hacelo en Email.', 'SIN_CORREO')
  if (!p) throw new ErrorEnvio('No encontré la empresa.', 'NO_ENCONTRADO')
  const para = String(p.email ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) throw new ErrorEnvio('La empresa no tiene un email válido.', 'SIN_EMAIL')
  if (['no_interesado', 'no_contactar'].includes(p.estado)) throw new ErrorEnvio('Esta empresa pidió no ser contactada.', 'OPT_OUT')
  const [{ data: lim }, { data: bloqueo }, { data: clave }] = await Promise.all([
    db.rpc('limite_email', { p_owner: owner }),
    db.rpc('motivo_supresion', { p_owner: owner, p_email: para }),
    db.rpc('correo_leer_secreto', { p_owner: owner }),
  ])
  if (bloqueo) throw new ErrorEnvio(`No se puede enviar: ${bloqueo}. Está en tu lista de "No contactar".`, 'SUPRIMIDO')
  if (p.email_estado === 'invalido') throw new ErrorEnvio(`No se puede enviar: ${p.email_motivo || 'el email no es válido'}. Corregí el email en la ficha.`, 'EMAIL_INVALIDO')
  if (lim && lim.enviados_hoy >= lim.limite_hoy) throw new ErrorEnvio(`LIMITE_EMAIL: ya enviaste ${lim.enviados_hoy} de ${lim.limite_hoy} emails hoy`, 'LIMITE_EMAIL', true)
  if (!clave) throw new ErrorEnvio('Falta la contraseña del email: volvé a conectarlo.', 'SIN_CORREO')
  if (o.mensaje_id) {
    const { data: m } = await db.from('mensajes').select('id, enviado_at, cuerpo').eq('id', o.mensaje_id).eq('owner_id', owner).maybeSingle()
    if (m?.enviado_at && m.cuerpo === o.cuerpo) throw new ErrorEnvio('Este mail ya se envió.', 'YA_ENVIADO')
    const { data: iguales } = await db.from('mensajes').select('id').eq('owner_id', owner).eq('cuerpo', o.cuerpo).not('enviado_at', 'is', null).neq('id', o.mensaje_id).limit(1)
    if (iguales?.length) throw new ErrorEnvio('TEXTO_REPETIDO', 'TEXTO_REPETIDO')
  }

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const { data: urlCfg } = await db.from('config_claves').select('valor').eq('nombre', 'url_app').maybeSingle()
  const base = String(o.base || urlCfg?.valor || Deno.env.get('URL_APP') || 'https://web-puce-mu-10.vercel.app').replace(/\/$/, '')
  const { error: eTok } = await db.from('bajas_tokens').insert({ token, owner_id: owner, prospecto_id: p.id, email: para.toLowerCase() })
  if (eTok) console.error('token de baja', eTok)
  const extra = await archivosDe(db, owner, o.adjuntos ?? [])
  const messageId = `<${crypto.randomUUID()}@${String(cfg.email).split('@')[1]}>`
  const remitente = { ...cfg, nombre_remitente: cfg.nombre_remitente || perfil?.nombre || '' }
  let copia = ''
  try { copia = await enviarMail(remitente, clave, para, o.asunto || 'Hola', o.cuerpo, { ...extra, baja: eTok ? '' : `${base}/baja/${token}`, messageId, enRespuestaA: o.hilo || '' }) }
  catch (e) {
    const msg = explicar(e, cfg)
    // Errores 4xx de SMTP o de conexión son temporales: se reintenta más tarde. 5xx y credenciales, no.
    const temporal = /SMTP 4\d\d|No pude conectar|no responde|cerró/i.test((e as Error).message ?? '')
    throw new ErrorEnvio('No se pudo enviar: ' + msg, 'SMTP', temporal)
  }
  let enEnviados = true
  try { await guardarEnEnviados(cfg, clave, copia) } catch (e) { enEnviados = false; console.error('copia en Enviados', e) }
  if (o.mensaje_id) await db.from('mensajes').update({ message_id: messageId, asunto: o.asunto, cuerpo: o.cuerpo }).eq('id', o.mensaje_id)
  const { error } = await db.from('interacciones').insert({
    owner_id: owner, prospecto_id: p.id, mensaje_id: o.mensaje_id ?? null, tipo: 'enviado', canal: 'email',
    detalle: `Email "${(o.asunto || 'Hola').slice(0, 120)}" enviado desde ${cfg.email} a ${para}${extra.adjuntos.length ? ` con ${extra.adjuntos.map(a => a.nombre).join(', ')}` : ''}`,
  })
  if (error) console.error('registrar envío', error)
  return { ok: true, para, en_enviados: enEnviados, message_id: messageId }
}

/**
 * B2C: manda un email de campaña a UN cliente propio. Sólo si aceptó recibir emails, no se dio de baja ni está en
 * "No contactar", y si queda cupo en la casilla. Lleva link de baja y queda registrado en campana_envios.
 */
export async function enviarACliente(db: any, owner: string, o: { cliente_id: string, campana_id: string, asunto: string, cuerpo: string, base?: string }) {
  const [{ data: cfg }, { data: cl }, { data: perfil }] = await Promise.all([
    db.from('conexiones_correo').select('*').eq('owner_id', owner).maybeSingle(),
    db.from('clientes').select('*').eq('id', o.cliente_id).eq('owner_id', owner).maybeSingle(),
    db.from('perfiles').select('nombre').eq('id', owner).maybeSingle(),
  ])
  if (!cfg) throw new ErrorEnvio('Todavía no conectaste tu email. Hacelo en Email.', 'SIN_CORREO')
  if (!cl) throw new ErrorEnvio('No encontré el cliente.', 'NO_ENCONTRADO')
  const para = String(cl.email ?? '').trim()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(para)) throw new ErrorEnvio('El cliente no tiene un email válido.', 'SIN_EMAIL')
  if (cl.baja_at || !cl.acepta_email) throw new ErrorEnvio('Este cliente no aceptó recibir emails.', 'SIN_PERMISO')
  const [{ data: lim }, { data: bloqueo }, { data: clave }] = await Promise.all([
    db.rpc('limite_email', { p_owner: owner }),
    db.rpc('motivo_supresion', { p_owner: owner, p_email: para }),
    db.rpc('correo_leer_secreto', { p_owner: owner }),
  ])
  if (bloqueo) throw new ErrorEnvio(`No se puede enviar: ${bloqueo}.`, 'SUPRIMIDO')
  if (lim && lim.enviados_hoy >= lim.limite_hoy) throw new ErrorEnvio(`LIMITE_EMAIL: ya enviaste ${lim.enviados_hoy} de ${lim.limite_hoy} emails hoy`, 'LIMITE_EMAIL', true)
  if (!clave) throw new ErrorEnvio('Falta la contraseña del email: volvé a conectarlo.', 'SIN_CORREO')
  const { data: ya } = await db.from('campana_envios').select('id').eq('campana_id', o.campana_id).eq('cliente_id', cl.id).maybeSingle()
  if (ya) throw new ErrorEnvio('A este cliente ya le salió esta campaña.', 'YA_ENVIADO')

  const nombre = String(cl.nombre ?? '').trim().split(/\s+/)[0] || ''
  const poner = (t: string) => t.replace(/\{\{\s*nombre\s*\}\}/gi, nombre).replace(/\s+,/g, ',')
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const { data: urlCfg } = await db.from('config_claves').select('valor').eq('nombre', 'url_app').maybeSingle()
  const base = String(o.base || urlCfg?.valor || Deno.env.get('URL_APP') || 'https://web-puce-mu-10.vercel.app').replace(/\/$/, '')
  const { error: eTok } = await db.from('bajas_tokens').insert({ token, owner_id: owner, prospecto_id: null, email: para.toLowerCase() })
  const extra = await archivosDe(db, owner, [])
  const messageId = `<${crypto.randomUUID()}@${String(cfg.email).split('@')[1]}>`
  const remitente = { ...cfg, nombre_remitente: cfg.nombre_remitente || perfil?.nombre || '' }
  let copia = ''
  try { copia = await enviarMail(remitente, clave, para, poner(o.asunto || 'Hola'), poner(o.cuerpo), { firma: extra.firma, baja: eTok ? '' : `${base}/baja/${token}`, messageId }) }
  catch (e) {
    const temporal = /SMTP 4\d\d|No pude conectar|no responde|cerró/i.test((e as Error).message ?? '')
    throw new ErrorEnvio('No se pudo enviar: ' + explicar(e, cfg), 'SMTP', temporal)
  }
  try { await guardarEnEnviados(cfg, clave, copia) } catch (e) { console.error('copia en Enviados', e) }
  const { error } = await db.from('campana_envios').insert({ owner_id: owner, campana_id: o.campana_id, cliente_id: cl.id, canal: 'email', estado: 'enviado' })
  if (error) console.error('registrar envío a cliente', error)
  return { ok: true, para }
}
