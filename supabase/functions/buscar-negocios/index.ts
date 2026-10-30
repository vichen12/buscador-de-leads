// Busca negocios con Claude y búsqueda web (la lógica vive en _shared/buscar.ts).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { buscar } from '../_shared/buscar.ts'

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

Deno.serve(req => req.method === 'OPTIONS' ? new Response('ok', { headers: cors }) : buscar(req, { clienteDelUsuario, claveServicio, json, admin }))
