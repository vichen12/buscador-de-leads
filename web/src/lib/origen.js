import { supabase } from './supabase.js'

/**
 * Los dos mundos de Prospecta: lo que se buscó «para mi negocio» y lo que se buscó «libre».
 * La marca está en la columna `libre` de la empresa; si la base todavía no la tiene (o la fila es
 * vieja), se deduce de la búsqueda de la que vino.
 */
export const ORIGENES = [
  ['', 'Todo'],
  ['negocio', 'De mi negocio'],
  ['libre', 'Búsqueda libre'],
]

/** Ids de las búsquedas libres de la cuenta (para filas sin la columna `libre`). */
export async function busquedasLibres() {
  const { data } = await supabase.from('busquedas').select('id').contains('requisitos', { libre: true }).limit(1000)
  return new Set((data ?? []).map(b => b.id))
}

/** ¿Esta empresa (hallazgo o prospecto) vino de una búsqueda libre? */
export const esLibre = (fila, libres) => fila?.libre === true || (!!fila?.busqueda_id && !!libres?.has(fila.busqueda_id))

/** Filtro por origen: '' = todo. */
export const delOrigen = (fila, origen, libres) => !origen || (origen === 'libre') === esLibre(fila, libres)
