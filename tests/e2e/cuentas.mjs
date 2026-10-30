// Cuentas de prueba: el registro está cerrado, así que las pruebas usan cuentas existentes
// (creadas por el super admin) y las dejan en blanco antes de empezar.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(new URL('../../web/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')

const env = Object.fromEntries(fs.readFileSync(new URL('../../web/.env.production', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
export const SUPABASE_URL = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL
export const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY

/** Entra con la primera contraseña que funcione, borra los datos de la cuenta y devuelve la contraseña vigente */
export async function prepararCuenta(email, contrasenas, perfil = {}) {
  const c = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  let vigente = null
  for (const p of contrasenas) {
    const { error } = await c.auth.signInWithPassword({ email, password: p })
    if (!error) { vigente = p; break }
  }
  if (!vigente) throw new Error(`No se pudo entrar con la cuenta de prueba ${email}`)
  const { data: { user } } = await c.auth.getUser()
  await c.from('prospectos').delete().eq('owner_id', user.id)
  await c.from('chat_conversaciones').delete().eq('owner_id', user.id)
  await c.from('perfiles').update({ limite_diario: 15, dias_seguimiento: 5, estudio: '', firma: '', instrucciones_ia: '', ...perfil }).eq('id', user.id)
  await c.auth.signOut()
  return vigente
}
