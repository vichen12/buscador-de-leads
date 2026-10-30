import { supabase } from './supabase.js'

/** Pasa en limpio a la lista de prospectos. Devuelve { nuevos, ya_estaban } */
export async function aprobarHallazgos(ids) {
  const { data, error } = await supabase.rpc('aprobar_hallazgos', { p_ids: ids })
  if (error) throw error
  return data
}

/** "No sirve": queda guardada para que ninguna búsqueda la vuelva a traer */
export async function descartarHallazgos(ids, motivo = '') {
  const { error } = await supabase.from('hallazgos').update({ estado: 'descartado', motivo, revisado_at: new Date().toISOString() }).in('id', ids)
  if (error) throw error
}

export async function recuperarHallazgos(ids) {
  const { error } = await supabase.from('hallazgos').update({ estado: 'por_revisar', motivo: '', revisado_at: null }).in('id', ids)
  if (error) throw error
}

export const contarPorRevisar = async () => {
  const { count } = await supabase.from('hallazgos').select('id', { count: 'exact', head: true }).eq('estado', 'por_revisar')
  return count ?? 0
}
