// Altas y contraseñas de usuarios: el super admin (cualquier empresa) o el Admin de una empresa cliente (sólo su equipo,
// dentro del límite de usuarios de su plan).
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
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const body = await req.json().catch(() => ({}))
  // Admin de una empresa cliente: sólo gestiona su propio equipo
  let empresaPropia: string | null = null
  if (!esAdmin) {
    const { data: yo } = await admin.from('perfiles').select('rol, empresa_id, activo').eq('id', usuario.user.id).single()
    if (!yo?.empresa_id || yo.rol !== 'admin' || !yo.activo) return json({ error: 'Sólo el admin de tu empresa puede sumar usuarios' }, 403)
    empresaPropia = yo.empresa_id
    if (body.modo === 'crear') {
      body.empresa_id = empresaPropia
      const [{ data: e }, { count }] = await Promise.all([
        admin.from('empresas').select('usuarios_max').eq('id', empresaPropia).single(),
        admin.from('perfiles').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaPropia).eq('activo', true),
      ])
      if ((count ?? 0) >= (e?.usuarios_max ?? 5)) return json({ error: `Tu plan permite ${e?.usuarios_max ?? 5} usuarios activos. Desactivá a alguien o pedí ampliar el plan.`, codigo: 'LIMITE_USUARIOS' }, 400)
    }
    if (body.modo === 'restablecer') {
      const { data: otro } = await admin.from('perfiles').select('empresa_id').eq('id', String(body.id ?? '')).maybeSingle()
      if (otro?.empresa_id !== empresaPropia) return json({ error: 'Esa persona no es de tu equipo' }, 403)
    }
  }

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
      return json({ error: existe ? 'Ya existe una cuenta con ese email. Buscala en la lista de usuarios: con ↻ le generás una contraseña nueva.' : error.message }, existe ? 409 : 400)
    }
    // Activar el perfil y asignarlo a la empresa sin depender del orden en que Auth guarda los metadatos
    const rol = body.rol === 'admin' ? 'admin' : (empresaPropia ? 'vendedor' : 'admin')
    const { error: ep } = await admin.from('perfiles').upsert({ id: data.user.id, nombre, email_contacto: email, empresa_id: empresa, activo: true, rol }, { onConflict: 'id' })
    if (ep) console.error('activar perfil', ep)
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
