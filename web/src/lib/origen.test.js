import { describe, expect, it, vi } from 'vitest'
vi.mock('./supabase.js', () => ({ supabase: {} }))
import { esLibre, delOrigen } from './origen.js'

describe('de qué búsqueda vino una empresa', () => {
  const libres = new Set(['b-libre'])
  it('manda la columna; si no está, la búsqueda de origen', () => {
    expect(esLibre({ libre: true }, libres)).toBe(true)
    expect(esLibre({ busqueda_id: 'b-libre' }, libres)).toBe(true)
    expect(esLibre({ libre: false, busqueda_id: 'b-negocio' }, libres)).toBe(false)
    expect(esLibre({}, libres)).toBe(false) // cargada a mano o importada: es de mi negocio
  })
  it('el filtro separa los dos mundos y «todo» no filtra', () => {
    const a = { libre: true }, b = { busqueda_id: 'b-negocio' }
    expect([a, b].filter(x => delOrigen(x, '', libres))).toHaveLength(2)
    expect([a, b].filter(x => delOrigen(x, 'libre', libres))).toEqual([a])
    expect([a, b].filter(x => delOrigen(x, 'negocio', libres))).toEqual([b])
  })
})
