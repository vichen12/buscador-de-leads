import { describe, expect, it } from 'vitest'
import { limpiarTelefono, numeroWhatsApp } from '@shared/clasificar.js'

describe('teléfonos', () => {
  it('se queda con un solo número creíble', () => {
    expect(limpiarTelefono('0261 423-1234 / 261 15 555-1234')).toBe('0261 423-1234')
    expect(limpiarTelefono('(0351) 481-2233 int. 23')).toBe('(0351) 481-2233')
    expect(limpiarTelefono('011 4567-8901 y 011 4567-8902')).toBe('011 4567-8901')
    expect(limpiarTelefono('011 1234-567')).toBe('')
    expect(limpiarTelefono('0800 1111111')).toBe('')
    expect(limpiarTelefono('555')).toBe('')
    expect(limpiarTelefono('+54 9 261 555-1234')).toBe('+54 9 261 555-1234')
    expect(limpiarTelefono('+56 9 8765 4321')).toBe('+56 9 8765 4321')
  })
  it('WhatsApp de otro país va con su código', () => {
    expect(numeroWhatsApp('+56 9 8765 4321')).toBe('56987654321')
    expect(numeroWhatsApp('0351 15 481-2233')).toBe('5493514812233')
  })
})

describe('WhatsApp con números guardados mezclados', () => {
  it('usa el primero y descarta los inventados', () => {
    expect(numeroWhatsApp('0351 15 481-2233 / 0351 422-1111')).toBe('5493514812233')
    expect(numeroWhatsApp('011 1234-567')).toBe('')
  })
})
