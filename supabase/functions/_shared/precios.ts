// Precios de Claude y créditos: lo usan Buscar y el Asistente. Módulo sin npm (se puede compartir).
type Dic = Record<string, any>

// Cuánto cuesta un uso de IA de verdad (una búsqueda, un mensaje al asistente) y cuántos créditos se cobran por eso.
// Regla del negocio: lo que se cobra es, como mínimo, el DOBLE de lo que cuesta. Un crédito se vende a
// VALOR_CREDITO dólares, así que una búsqueda que cuesta C dólares descuenta ceil(C × MARGEN / VALOR_CREDITO).
// Los precios se pueden corregir sin tocar código: config_claves → nombre «precios_ia», valor JSON con
// las mismas claves que PRECIOS (dólares por millón de tokens; por búsqueda web; por consulta a Maps).
export const PRECIOS: Dic = {
  modelos: { haiku: { in: 1, out: 5 }, sonnet: { in: 3, out: 15 }, opus: { in: 5, out: 25 } },
  busqueda_web: 0.01, places: 0.035, valor_credito: 0.10, margen: 2, tope_creditos: 80,
}
export function costoUsd(uso: { por: Record<string, { in: number, out: number }>, busquedasWeb: number }, consultasPlaces: number, precios: Dic = PRECIOS) {
  const pm = { ...PRECIOS.modelos, ...(precios.modelos ?? {}) }
  let total = 0
  for (const [modelo, t] of Object.entries(uso.por)) {
    const fam = /opus/.test(modelo) ? 'opus' : /sonnet/.test(modelo) ? 'sonnet' : 'haiku'
    const pr = pm[modelo] ?? pm[fam]
    total += (t.in * pr.in + t.out * pr.out) / 1e6
  }
  total += uso.busquedasWeb * Number(precios.busqueda_web ?? PRECIOS.busqueda_web)
  total += consultasPlaces * Number(precios.places ?? PRECIOS.places)
  return total
}
export function creditosPorCosto(costo: number, precios: Dic = PRECIOS) {
  const valor = Number(precios.valor_credito ?? PRECIOS.valor_credito) || PRECIOS.valor_credito
  const margen = Math.max(1, Number(precios.margen ?? PRECIOS.margen) || PRECIOS.margen)
  const tope = Number(precios.tope_creditos ?? PRECIOS.tope_creditos) || PRECIOS.tope_creditos
  return Math.min(tope, Math.max(1, Math.ceil((costo * margen) / valor - 1e-9)))
}

/** Precios vigentes: los de config_claves «precios_ia» si están cargados, si no los de arriba. */
export async function leerPrecios(db: any): Promise<Dic> {
  try {
    const { data } = await db.from('config_claves').select('valor').eq('nombre', 'precios_ia').maybeSingle()
    if (data?.valor) return { ...PRECIOS, ...JSON.parse(data.valor) }
  } catch { /* precios por defecto */ }
  return PRECIOS
}
