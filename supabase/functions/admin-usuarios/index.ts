// Altas y contraseñas de usuarios: sólo el super admin.
// - crear: { modo: 'crear', email, nombre, empresa_id } → crea la cuenta confirmada con una contraseña inicial
// - restablecer: { modo: 'restablecer', id } → genera una contraseña nueva
// La contraseña se devuelve UNA vez para que el admin se la pase a la persona; no se guarda en ningún lado.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, cors, json } from '../_shared/supabase.ts'

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
function contrasena() {
  const b = crypto.getRandomValues(new Uint8Array(12))
  const base = Array.from(b, x => CHARS[x % CHARS.length]).join('')
  return `${base.slice(0, 4)}-${base.slice(4, 8)}-${base.slice(8, 12)}`
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let usuario
  try { usuario = await clienteDelUsuario(req) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const { data: esAdmin } = await usuario.supabase.rpc('es_admin')
  if (!esAdmin) return json({ error: 'Sólo el super admin puede gestionar usuarios' }, 403)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))

  if (body.modo === 'crear') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const nombre = String(body.nombre ?? '').trim().slice(0, 80)
    const empresa = body.empresa_id ? String(body.empresa_id) : null
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Email inválido' }, 400)
    if (!nombre) return json({ error: 'Poné el nombre de la persona' }, 400)
    if (empresa) {
      const { data: e } = await admin.from('empresas').select('activa').eq('id', empresa).maybeSingle()
      if (!e) return json({ error: 'Esa empresa no existe' }, 400)
      if (!e.activa) return json({ error: 'Esa empresa está suspendida: habilitala primero' }, 400)
    }
    const password = contrasena()
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { nombre },
      app_metadata: { alta_admin: true, empresa_id: empresa },
    })
    if (error) {
      const existe = /already|registered|exists/i.test(error.message)
      return json({ error: existe ? 'Ya existe una cuenta con ese email' : error.message }, existe ? 409 : 400)
    }
    return json({ id: data.user.id, email, password })
  }

  if (body.modo === 'restablecer') {
    const id = String(body.id ?? '')
    if (!id) return json({ error: 'Falta el usuario' }, 400)
    const password = contrasena()
    const { data, error } = await admin.auth.admin.updateUserById(id, { password })
    if (error) return json({ error: error.message }, 400)
    return json({ id, email: data.user.email, password })
  }

  return json({ error: 'Modo desconocido' }, 400)
})
