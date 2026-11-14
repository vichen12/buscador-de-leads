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
    expect(html).toContain('Cantidad:')
    expect(html).toContain('value="20"')
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

describe('el menú', () => {
  it('es simple: las 7 secciones y «Más y configuración», sin la tarjeta de uso', async () => {
    const { default: Layout } = await import('../../components/Layout.jsx')
    const html = renderToString(<MemoryRouter initialEntries={['/buscar']}><Layout><div /></Layout></MemoryRouter>)
    for (const t of ['Buscar', 'Por revisar', 'Tu lista', 'Seguimientos', 'Respuestas', 'Envíos', 'Informe', 'Más y configuración']) expect(html).toContain(t)
    expect(html).not.toContain('Emails de hoy')
    expect(html).not.toContain('Achicar menú')
  })
})

describe('modo B2C', () => {
  it.each([
    ['/', () => import('../TableroB2C.jsx')],
    ['/clientes', () => import('../Clientes.jsx')],
    ['/interesados', () => import('../Interesados.jsx')],
    ['/campanas', () => import('../Campanas.jsx')],
    ['/mas', () => import('../Mas.jsx')],
  ])('%s se dibuja', async (ruta, cargar) => {
    app.perfil.modo = 'b2c'
    try { expect((await dibujar(ruta, cargar)).length).toBeGreaterThan(50) } finally { app.perfil.modo = 'b2b' }
  })
  it('Aliados y Creadores se dibujan', async () => {
    app.perfil.modo = 'b2c'
    try {
      const m = await import('../AliadosCreadores.jsx')
      for (const P of [m.Aliados, m.Creadores]) expect(renderToString(<MemoryRouter><P /></MemoryRouter>).length).toBeGreaterThan(50)
    } finally { app.perfil.modo = 'b2b' }
  })
  it('el menú B2C es simple, igual que el B2B, y Más no trae cosas de empresas', async () => {
    app.perfil.modo = 'b2c'
    try {
      const { default: Layout } = await import('../../components/Layout.jsx')
      const html = renderToString(<MemoryRouter initialEntries={['/clientes']}><Layout><div /></Layout></MemoryRouter>)
      for (const t of ['Inicio', 'Clientes', 'Interesados', 'Campañas', 'Aliados', 'Creadores', 'Más y configuración']) expect(html).toContain(t)
      expect(html).not.toContain('Mis clientes')
      expect(html).not.toContain('Crecer')
      const mas = await dibujar('/mas', () => import('../Mas.jsx'))
      expect(mas).not.toContain('Rechazadas')
      expect(mas).not.toContain('Secuencias')
      expect(mas).toContain('Asistente IA')
    } finally { app.perfil.modo = 'b2b' }
  })
})
