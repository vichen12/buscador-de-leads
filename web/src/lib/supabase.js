import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(url && key)
export const supabase = configurado ? createClient(url, key) : null

/** Llama a una Edge Function con la sesión del usuario */
export async function llamarFuncion(nombre, body) {
  const { data, error } = await supabase.functions.invoke(nombre, { body })
  if (error) {
    let detalle = error.message
    try { detalle = (await error.context.json()).error || detalle } catch { /* sin cuerpo */ }
    throw new Error(detalle)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
