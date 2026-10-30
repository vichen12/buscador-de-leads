import { createClient } from 'npm:@supabase/supabase-js@2'

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/**
 * Cliente de Supabase que actúa COMO EL USUARIO (con su JWT), así RLS aplica
 * y una función nunca puede leer ni escribir datos de otra cuenta.
 */
export async function clienteDelUsuario(req: Request) {
  const auth = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
  })
  const { data, error } = await supabase.auth.getUser(auth.replace('Bearer ', ''))
  if (error || !data.user) throw new Error('NO_AUTH')
  return { supabase, user: data.user }
}

/**
 * Clave de un servicio externo: primero la cargada por el super admin desde el panel
 * (tabla config_claves, sólo legible con service role), si no, el secreto de entorno.
 */
const ENV: Record<string, string> = { anthropic: 'ANTHROPIC_API_KEY', google_places: 'GOOGLE_PLACES_API_KEY', modelo_ia: 'MODELO_IA', modelo_busqueda: 'MODELO_BUSQUEDA', modelo_resumen: 'MODELO_RESUMEN' }
export async function claveServicio(nombre: 'anthropic' | 'google_places' | 'modelo_ia' | 'modelo_busqueda' | 'modelo_resumen'): Promise<string> {
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const { data } = await admin.from('config_claves').select('valor').eq('nombre', nombre).maybeSingle()
    if (data?.valor) return data.valor
  } catch (e) { console.error('config_claves', e) }
  return Deno.env.get(ENV[nombre]) ?? ''
}
