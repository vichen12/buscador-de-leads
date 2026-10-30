// El registro abierto está desactivado: las cuentas las crea el super admin (función admin-usuarios).
import { cors, json } from '../_shared/supabase.ts'

Deno.serve(req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  return json({ error: 'El registro está cerrado. Pedile una cuenta al administrador.' }, 403)
})
