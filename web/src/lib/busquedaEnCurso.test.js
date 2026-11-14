import { describe, expect, it, vi, beforeEach } from 'vitest'

let fila = null
vi.mock('./supabase.js', () => ({
  supabase: { from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: fila, error: null }) }; return q } },
}))
const mem = new Map()
globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) }
const { guardarEnCurso, leerEnCurso, limpiarEnCurso, esperarBusqueda, estadoBusqueda } = await import('./busquedaEnCurso.js')

describe('búsqueda en segundo plano', () => {
  beforeEach(() => { mem.clear(); fila = null })
  it('recuerda cuál está en curso y la olvida al terminar (sólo si es esa)', () => {
    guardarEnCurso('b1', { rubro: 'ferreterías' })
    expect(leerEnCurso()).toMatchObject({ id: 'b1', rubro: 'ferreterías' })
    limpiarEnCurso('otra')
    expect(leerEnCurso()?.id).toBe('b1')
    limpiarEnCurso('b1')
    expect(leerEnCurso()).toBeNull()
  })
  it('espera mientras está «buscando» y devuelve el resultado cuando termina', async () => {
    fila = { estado: 'buscando', created_at: new Date().toISOString() }
    setTimeout(() => { fila = { estado: 'lista', resultado: { resultados: [{ id: 'h1' }], creditos: 6 }, created_at: new Date().toISOString() } }, 30)
    const r = await esperarBusqueda('b1', { cada: 10 })
    expect(r.creditos).toBe(6)
    expect(r.resultados).toHaveLength(1)
  })
  it('un error del servidor llega como error', async () => {
    fila = { estado: 'error', resultado: { error: 'Claude está saturado' }, created_at: new Date().toISOString() }
    await expect(esperarBusqueda('b1', { cada: 10 })).rejects.toThrow('Claude está saturado')
  })
  it('si quedó «buscando» más de 10 minutos, se da por cortada', async () => {
    fila = { estado: 'buscando', created_at: new Date(Date.now() - 11 * 60_000).toISOString() }
    const e = await estadoBusqueda('b1')
    expect(e.estado).toBe('error')
  })
  it('si la pantalla se cerró, deja de esperar sin error', async () => {
    fila = { estado: 'buscando', created_at: new Date().toISOString() }
    let vivo = true
    setTimeout(() => { vivo = false }, 25)
    expect(await esperarBusqueda('b1', { cada: 10, sigue: () => vivo })).toBeNull()
  })
})
