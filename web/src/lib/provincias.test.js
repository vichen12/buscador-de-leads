import { describe, expect, it } from 'vitest'
import { provinciaDe, provinciasEn, deProvincia, NOMBRES_PROVINCIAS } from './provincias.js'

describe('provinciaDe', () => {
  it('son 24 jurisdicciones', () => expect(NOMBRES_PROVINCIAS).toHaveLength(24))
  it('casos de dirección y zona', () => {
    expect(provinciaDe({ direccion: 'Av. Bartolomé Mitre 1154, B1604 Florida Oeste, Provincia de Buenos Aires' })).toBe('Buenos Aires')
    expect(provinciaDe({ zona: 'Godoy Cruz, Mendoza, Argentina' })).toBe('Mendoza')
    expect(provinciaDe({ zona: 'CABA' })).toBe('CABA')
    expect(provinciaDe({ zona: 'Capital Federal, Argentina' })).toBe('CABA')
    expect(provinciaDe({ zona: 'Ciudad Autónoma de Buenos Aires' })).toBe('CABA')
    expect(provinciaDe({ zona: 'Rosario, Argentina' })).toBe('Santa Fe')
    expect(provinciaDe({ zona: 'Santiago, Chile' })).toBe('')
    expect(provinciaDe({ zona: 'Montevideo, Uruguay' })).toBe('')
    expect(provinciaDe({ zona: 'Buenos Aires, Argentina' })).toBe('Buenos Aires')
    expect(provinciaDe({ zona: 'Santiago del Estero, Argentina' })).toBe('Santiago del Estero')
    expect(provinciaDe({ zona: 'Neuquen' })).toBe('Neuquén')
    expect(provinciaDe({ zona: 'Mar del Plata' })).toBe('Buenos Aires')
    expect(provinciaDe({ zona: '', direccion: 'Ruta 40 km 3, M5500 Mendoza, Argentina' })).toBe('Mendoza')
    expect(provinciaDe({})).toBe('')
  })
  it('cuenta y filtra', () => {
    const l = [{ zona: 'Mendoza' }, { zona: 'Godoy Cruz, Mendoza' }, { zona: 'Rosario' }, { zona: 'Lima, Perú' }]
    expect(provinciasEn(l)).toEqual([['Mendoza', 2], ['Santa Fe', 1], ['', 1]])
    expect(l.filter(x => deProvincia(x, 'Mendoza'))).toHaveLength(2)
    expect(l.filter(x => deProvincia(x, '_sin'))).toHaveLength(1)
    expect(l.filter(x => deProvincia(x, ''))).toHaveLength(4)
  })
})
