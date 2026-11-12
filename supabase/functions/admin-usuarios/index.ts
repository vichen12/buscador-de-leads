// Altas y contraseñas de usuarios: la lógica vive en _shared/admin_usuarios.ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, cors, json } from '../_shared/supabase.ts'
import { manejar } from '../_shared/admin_usuarios.ts'

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(req => manejar(req, { clienteDelUsuario, cors, json, admin }))
