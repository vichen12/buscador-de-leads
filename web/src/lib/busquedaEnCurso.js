// Búsqueda en segundo plano: corre en el servidor aunque cierres la pestaña o cambies de pantalla.
// La web guarda cuál está en curso (en este navegador) y consulta la fila de `busquedas` hasta que
// termina: Buscar muestra el avance y el resultado; desde cualquier otra pantalla llega un aviso.
import { supabase } from './supabase.js'

const CLAVE = 'prospecta-busqueda-en-curso'
const TOPE_MS = 10 * 60_000 // más que esto «buscando» = se cortó

export function guardarEnCurso(id, info = {}) {
  try { localStorage.setItem(CLAVE, JSON.stringify({ id, desde: Date.now(), ...info })) } catch { /* sin almacenamiento */ }
}
export function leerEnCurso() {
  try {
    const e = JSON.parse(localStorage.getItem(CLAVE) || 'null')
    return e?.id ? e : null
  } catch { return null }
}
export function limpiarEnCurso(id) {
  try { if (!id || leerEnCurso()?.id === id) localStorage.removeItem(CLAVE) } catch { /* sin almacenamiento */ }
}

/** Una consulta: { estado: 'buscando' | 'lista' | 'error', resultado } (o null si no se pudo leer). */
export async function estadoBusqueda(id, desde = 0) {
  const { data, error } = await supabase.from('busquedas').select('estado, resultado, created_at').eq('id', id).maybeSingle()
  if (error) return null
  if (!data) return { estado: 'error', resultado: { error: 'No encontré la búsqueda.' } }
  const inicio = desde || new Date(data.created_at).getTime()
  if (data.estado === 'buscando' && Date.now() - inicio > TOPE_MS) return { estado: 'error', resultado: { error: 'La búsqueda se cortó. Probá de nuevo.' } }
  return data
}

/**
 * Espera a que termine. Devuelve el resultado (lo mismo que devolvía la búsqueda directa) o tira
 * el error. `sigue()` en false corta la espera sin error (por ejemplo, si la pantalla se cerró).
 */
export async function esperarBusqueda(id, { desde = Date.now(), sigue = () => true, cada = 3000 } = {}) {
  while (sigue()) {
    const e = await estadoBusqueda(id, desde)
    if (e && e.estado !== 'buscando') {
      if (e.estado === 'error' || e.resultado?.error) throw new Error(e.resultado?.error || 'La búsqueda falló.')
      return e.resultado ?? { resultados: [] }
    }
    await new Promise(r => setTimeout(r, cada))
  }
  return null
}
