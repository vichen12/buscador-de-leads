import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configurado = Boolean(url && key)
export const supabase = configurado ? createClient(url, key) : null

/** Llama a una Edge Function con la sesión del usuario */
export async function llamarFuncion(nombre, body) {
  const { data, error } = await supabase.functions.invoke(nombre, { body })
  if (error) {
    // 546: Supabase cortó la función por tiempo (150 s) y la respuesta no trae nada útil
    if (error.context?.status === 546) throw new Error(nombre === 'buscar-negocios'
      ? 'La búsqueda tardó más de lo permitido y se cortó. Probá de nuevo con menos resultados o una zona más chica.'
      : 'Tardó más de lo permitido y se cortó. Probá de nuevo en un momento.')
    let detalle = error.message
    try { detalle = (await error.context.json()).error || detalle } catch { /* sin cuerpo */ }
    throw new Error(detalle)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
