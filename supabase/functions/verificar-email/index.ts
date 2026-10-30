// Verifica los emails de los prospectos antes de enviar: formato, que el dominio reciba correo (registros MX
// por DNS público) y que no sea un dominio descartable. Guarda el resultado en el prospecto:
// email_estado = valido | dudoso | invalido, con el motivo en palabras simples.
// Body: { ids: uuid[] } (hasta 60) o { todos_sin_verificar: true } (los próximos 60 sin verificar).
import { clienteDelUsuario, cors, json } from '../_shared/supabase.ts'

type Dic = Record<string, any>

const DESCARTABLES = new Set(['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'temp-mail.io', 'tempmailo.com', 'yopmail.com', 'yopmail.net', 'getnada.com', 'nada.email', 'trashmail.com',
  'trashmail.de', 'dispostable.com', 'maildrop.cc', 'mintemail.com', 'throwawaymail.com', 'fakeinbox.com', 'mohmal.com', 'emailondeck.com',
  'mailnesia.com', 'mailcatch.com', 'spamgourmet.com', 'tempinbox.com', 'burnermail.io', 'mytemp.email', 'tmail.ws', 'moakt.com', 'tempr.email',
  'discard.email', 'mailpoof.com', 'inboxkitten.com', 'spambox.us', 'emailfake.com', 'fakemail.net', 'mail.tm', 'tmpmail.org', 'tmpmail.net',
  'byom.de', 'mailforspam.com', 'mvrht.com', 'einrot.com', 'cuvox.de', 'armyspy.com', 'dayrep.com', 'fleckens.hu', 'gustr.com', 'jourrapide.com',
  'rhyta.com', 'superrito.com', 'teleworm.us', 'mailexpire.com', 'incognitomail.org', 'anonbox.net', 'spam4.me', 'grr.la', 'guerrillamailblock.com'])
const ROLES = /^(no-?reply|noreply|donotreply|do-not-reply|mailer-daemon|postmaster|abuse|bounce|bounces)@/i
const FORMATO = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i

async function dns(nombre: string, tipo: 'MX' | 'A'): Promise<{ ok: boolean, registros: string[], nx: boolean }> {
  for (const base of ['https://dns.google/resolve', 'https://cloudflare-dns.com/dns-query']) {
    try {
      const r = await fetch(`${base}?name=${encodeURIComponent(nombre)}&type=${tipo}`, { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) })
      if (!r.ok) continue
      const d = await r.json()
      const t = tipo === 'MX' ? 15 : 1
      return { ok: true, registros: (d.Answer ?? []).filter((a: Dic) => a.type === t).map((a: Dic) => String(a.data)), nx: d.Status === 3 }
    } catch { /* probar el otro */ }
  }
  return { ok: false, registros: [], nx: false }
}

async function verificarDominio(dominio: string) {
  if (DESCARTABLES.has(dominio)) return { estado: 'invalido', motivo: 'Es un correo descartable (temporal): no sirve para contactar' }
  const mx = await dns(dominio, 'MX')
  if (!mx.ok) return { estado: 'dudoso', motivo: 'No pude comprobar el dominio ahora. Se vuelve a revisar más tarde' }
  if (mx.registros.some(r => !/^0 \.?$/.test(r.trim()))) return { estado: 'valido', motivo: 'El dominio recibe correo' }
  if (mx.registros.length) return { estado: 'invalido', motivo: 'El dominio indica que no recibe correo' }
  if (mx.nx) return { estado: 'invalido', motivo: 'El dominio no existe' }
  const a = await dns(dominio, 'A')
  if (a.registros.length) return { estado: 'dudoso', motivo: 'El dominio existe pero no tiene configurado el correo: puede rebotar' }
  return { estado: 'invalido', motivo: 'El dominio no recibe correo' }
}

export async function verificar(email: string, cache = new Map<string, Promise<{ estado: string, motivo: string }>>()) {
  const e = String(email ?? '').trim().toLowerCase()
  if (!e) return { estado: 'invalido', motivo: 'No tiene email' }
  if (!FORMATO.test(e)) return { estado: 'invalido', motivo: 'El email está mal escrito' }
  const dominio = e.split('@')[1]
  if (!cache.has(dominio)) cache.set(dominio, verificarDominio(dominio))
  const r = await cache.get(dominio)!
  if (r.estado === 'valido' && ROLES.test(e)) return { estado: 'dudoso', motivo: 'Es una casilla automática (no-reply): casi nunca la lee una persona' }
  return r
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let usuario
  try { usuario = await clienteDelUsuario(req) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const { supabase } = usuario
  const body = await req.json().catch(() => ({}))

  let q = supabase.from('prospectos').select('id, email, email_estado').neq('email', '').not('email', 'is', null)
  if (Array.isArray(body.ids) && body.ids.length) q = q.in('id', body.ids.slice(0, 60).map(String))
  else q = q.is('email_verificado_at', null).limit(60)
  const { data, error } = await q
  if (error) return json({ error: 'No pude leer los prospectos: ' + error.message }, 500)

  const cache = new Map()
  const resultados: Dic[] = []
  await Promise.all((data ?? []).map(async (p: Dic) => {
    // Un rebote real manda sobre cualquier verificación
    if (p.email_estado === 'invalido' && !body.forzar) { resultados.push({ id: p.id, estado: 'invalido' }); return }
    const r = await verificar(p.email, cache)
    await supabase.from('prospectos').update({ email_estado: r.estado, email_motivo: r.motivo, email_verificado_at: new Date().toISOString() }).eq('id', p.id)
    resultados.push({ id: p.id, ...r })
  }))
  return json({ ok: true, resultados })
})
