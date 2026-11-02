// Altas y contraseñas de usuarios: la lógica vive en _shared/admin_usuarios.ts
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, cors, json } from '../_shared/supabase.ts'
import { manejar } from 'https://raw.githubusercontent.com/vichen12/buscador-de-leads/bb791a60df2a4cc2c9ff9d71149e9800a88352ed/supabase/functions/_shared/admin_usuarios.ts'

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(req => manejar(req, { clienteDelUsuario, cors, json, admin }))
