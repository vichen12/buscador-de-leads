import { describe, expect, it } from 'vitest'
import { costoUsd, creditosPorCosto } from '../../../supabase/functions/_shared/precios.ts'

// Un mensaje típico al asistente: ~15.000 tokens de contexto (los datos de la cuenta) y ~1.000 de respuesta
const mensaje = (modelo: string) => ({ por: { [modelo]: { in: 15_000, out: 1_000 } }, busquedasWeb: 0 })

describe('créditos del asistente según el modelo', () => {
  it('cobra según lo que usó y el modelo elegido: el más capaz cuesta más', () => {
    const rapida = creditosPorCosto(costoUsd(mensaje('claude-haiku-5-5'), 0))
    const mejor = creditosPorCosto(costoUsd(mensaje('claude-sonnet-5-5'), 0))
    const maxima = creditosPorCosto(costoUsd(mensaje('claude-opus-5-5'), 0))
    expect(rapida).toBe(1)
    expect(mejor).toBe(2) // 0,06 USD × 2 = 0,12 → 2 créditos de 10 centavos
    expect(maxima).toBeGreaterThanOrEqual(mejor)
  })
  it('una charla larga cobra más que una corta con el mismo modelo', () => {
    const corta = creditosPorCosto(costoUsd(mensaje('claude-sonnet-5-5'), 0))
    const larga = creditosPorCosto(costoUsd({ por: { 'claude-sonnet-5-5': { in: 60_000, out: 4_000 } }, busquedasWeb: 0 }, 0))
    expect(larga).toBeGreaterThan(corta)
  })
})
