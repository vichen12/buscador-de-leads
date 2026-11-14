// Que cada pantalla principal se dibuje sin romperse (una pantalla en blanco ya pasó una vez).
// Se renderizan en el servidor con datos de mentira: si el código de la pantalla tira un error, falla.
import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'

const consulta = () => {
  const q = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'not', 'is', 'gt', 'lte', 'neq', 'contains', 'or', 'maybeSingle', 'single', 'update', 'insert', 'delete', 'upsert'])
    q[m] = () => q
  q.then = ok => ok({ data: [], error: null, count: 0 })
  return q
}
vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: () => consulta(), rpc: async () => ({ data: null, error: null }), auth: { getSession: async () => ({ data: {} }) }, storage: { from: () => ({}) }, channel: () => ({ on: () => ({ subscribe: () => ({}) }) }), removeChannel: () => {} },
  llamarFuncion: async () => ({}),
}))
const app = {
  perfil: { id: 'u1', pais: 'AR', region: 'Buenos Aires', nombre: 'Vichen', modo: 'b2b', rol: 'admin' },
  session: { user: { id: 'u1', email: 'a@b.com' } },
  servicios: { ia: true, places: true }, comercial: { estrategia: { rubros: [{ nombre: 'distribuidoras' }, { nombre: 'operadores logísticos' }], zonas: [], filtros: [] } },
  tablero: { total: 0, email: null }, refrescar: () => {}, setPorRevisar: () => {}, porRevisar: 0, contadores: {}, correo: null, acceso: {},
  setComercial: () => {},
}
vi.mock('../../App.jsx', () => ({ useApp: () => app }))
vi.mock('../../components/ui.jsx', async orig => ({ ...(await orig()), useToast: () => () => {}, useConfirmar: () => async () => true }))

const dibujar = async (ruta, cargar) => {
  const { default: Pantalla } = await cargar()
  return renderToString(<MemoryRouter initialEntries={[ruta]}><Pantalla /></MemoryRouter>)
}

describe('las pantallas se dibujan', () => {
  it('Buscar (mi negocio): hero, opciones y atajos de tu estrategia', async () => {
    const html = await dibujar('/buscar', () => import('../BuscarPlaces.jsx'))
    expect(html).toContain('Encontrá tu próximo cliente.')
    expect(html).toContain('Cantidad: 20')
    expect(html).toContain('Modo: Rápida')
    expect(html).toContain('¿Por dónde empezamos?')
    expect(html).toContain('Distribuidoras')
  })
  it('Buscar con algo escrito desde la home no muestra los atajos', async () => {
    const html = await dibujar('/buscar?q=ferreterias', () => import('../BuscarPlaces.jsx'))
    expect(html).not.toContain('¿Por dónde empezamos?')
  })
  it.each([
    ['/revisar', () => import('../Revisar.jsx')],
    ['/prospectos', () => import('../Prospectos.jsx')],
    ['/seguimientos', () => import('../Seguimientos.jsx')],
    ['/envios', () => import('../Envios.jsx')],
    ['/mas', () => import('../Mas.jsx')],
    ['/negocio', () => import('../MiNegocio.jsx')],
  ])('%s', async (ruta, cargar) => {
    const html = await dibujar(ruta, cargar)
    expect(html.length).toBeGreaterThan(50)
  })
})
