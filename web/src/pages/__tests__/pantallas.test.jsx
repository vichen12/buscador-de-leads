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
      for (const t of ['Buscar', 'Por revisar', 'Inicio', 'Clientes', 'Campañas', 'Aliados', 'Creadores', 'Más y configuración']) expect(html).toContain(t)
      expect(html).not.toContain('>Interesados<')
      expect(html).not.toContain('Mis clientes')
      expect(html).not.toContain('Crecer')
      const mas = await dibujar('/mas', () => import('../Mas.jsx'))
      expect(mas).not.toContain('Rechazadas')
      expect(mas).not.toContain('Secuencias')
      expect(mas).toContain('Asistente IA')
    } finally { app.perfil.modo = 'b2b' }
  })
})

describe('Buscar en B2C', () => {
  it('es la pantalla principal: busca aliados, sin el selector de «mi negocio», con atajos de B2C', async () => {
    app.perfil.modo = 'b2c'
    try {
      const html = await dibujar('/buscar', () => import('../BuscarPlaces.jsx'))
      expect(html).toContain('Encontrá aliados para crecer.')
      expect(html).not.toContain('Clientes para mi negocio')
      expect(html).toContain('Creadores de contenido de mi zona')
    } finally { app.perfil.modo = 'b2b' }
  })
  it('la tarjeta de un resultado ofrece «Sumar como aliado»', async () => {
    const { default: Tarjeta } = await import('../../components/TarjetaHallazgo.jsx')
    const h = { id: 'h1', nombre: 'Café Central', estado: 'por_revisar', rubro: 'cafetería' }
    const html = renderToString(<MemoryRouter><Tarjeta h={h} onAliado={() => {}} onDescartar={() => {}} /></MemoryRouter>)
    expect(html).toContain('Sumar como aliado')
    expect(html).not.toContain('Sumar a mi lista')
    const hecho = renderToString(<MemoryRouter><Tarjeta h={{ ...h, estado: 'aprobado', aliado: true }} /></MemoryRouter>)
    expect(hecho).toContain('En tus aliados')
  })
})

describe('Directorio', () => {
  it('se dibuja con el filtro inteligente y el acceso a publicar tu empresa', async () => {
    const html = await dibujar('/directorio', () => import('../Directorio.jsx'))
    expect(html).toContain('Directorio de empresas.')
    expect(html).toContain('Filtro inteligente')
  })
  it('tu ficha se dibuja (B2B y B2C)', async () => {
    expect(await dibujar('/directorio/mi-empresa', () => import('../DirectorioMiEmpresa.jsx'))).toBeTruthy()
    app.perfil.modo = 'b2c'
    try { expect(await dibujar('/directorio/mi-empresa', () => import('../DirectorioMiEmpresa.jsx'))).toBeTruthy() } finally { app.perfil.modo = 'b2b' }
  })
  it('está en el menú de los dos modos', async () => {
    const { default: Layout } = await import('../../components/Layout.jsx')
    for (const modo of ['b2b', 'b2c']) {
      app.perfil.modo = modo
      try { expect(renderToString(<MemoryRouter initialEntries={['/buscar']}><Layout><div /></Layout></MemoryRouter>)).toContain('Directorio') } finally { app.perfil.modo = 'b2b' }
    }
  })
})

describe('Mensajes de WhatsApp', () => {
  it('rellena las variables y sugiere según tenga web o no', async () => {
    const { rellenarWa, sugeridoWa, mensajesWa } = await import('../../lib/mensajesWa.js')
    const p = { nombre: 'La Espiga', zona: 'Godoy Cruz, Mendoza', web_actual: 'https://www.laespiga.com/' }
    expect(rellenarWa('Hola {{empresa}} de {{zona}}, vi {{web}}. Soy {{mi_nombre}}', p, { mi_nombre: 'Vicente' })).toBe('Hola La Espiga de Godoy Cruz, vi laespiga.com. Soy Vicente')
    const lista = [{ titulo: 'A', para: 'con_web', texto: 'x' }, { titulo: 'B', para: 'sin_web', texto: 'y' }]
    expect(sugeridoWa(lista, p)).toBe(0)
    expect(sugeridoWa(lista, { nombre: 'Otra' })).toBe(1)
    expect(mensajesWa({}).length).toBe(2)
    expect(mensajesWa({ config_email: { whatsapp_mensajes: [{ titulo: 'Mío', texto: 'hola' }] } })[0].titulo).toBe('Mío')
  })
})

describe('Nombre de la empresa en el mensaje', () => {
  it('saca S.R.L. y baja las mayúsculas', async () => {
    const { nombreParaMensaje, mensajesWa, rellenarWa, quienSoy } = await import('../../lib/mensajesWa.js')
    expect(nombreParaMensaje('PANADERIA LA ESPIGA S.R.L.')).toBe('Panaderia la Espiga')
    expect(nombreParaMensaje('Bombas Cuyo SA')).toBe('Bombas Cuyo')
    expect(nombreParaMensaje('Café Martínez - Sucursal Centro')).toBe('Café Martínez')
    const [conWeb, sinWeb] = mensajesWa({})
    expect(conWeb.texto).toContain('{{empresa}}')
    const yo = quienSoy({ perfil: { nombre: 'Vicente Dalla' }, comercial: { respuestas: { empresa: 'Estudio Web' } } })
    expect(yo).toEqual({ mi_nombre: 'Vicente', mi_empresa: 'Estudio Web' })
    expect(rellenarWa(mensajesWa({}, 'libre')[1].texto, { nombre: 'TALLER RUIZ' }, yo)).toContain('Soy Vicente de Estudio Web. Busqué Taller Ruiz en Google')
    expect(quienSoy({ perfil: {}, comercial: { respuestas: { web: 'https://www.bombascuyo.com' } } }).mi_empresa).toBe('Bombascuyo')
    expect(rellenarWa('Soy {{mi_nombre}} de {{mi_empresa}}. Hola', {}, { mi_nombre: 'Ana' })).toBe('Soy Ana. Hola')
  })
})

describe('Pantalla de Mensajes de WhatsApp', () => {
  it('se dibuja con «Quién escribe», las pestañas y la vista previa', async () => {
    const html = await dibujar('/mensajes-whatsapp', () => import('../MensajesWhatsapp.jsx'))
    expect(html).toContain('Quién escribe')
    expect(html).toContain('Tiene web')
    expect(html).toContain('No tiene web')
    expect(html).toContain('Panadería la Espiga'.replace('la', 'La'))
  })
  it('lo que escribís en «Quién escribe» manda sobre lo detectado', async () => {
    const { quienSoy } = await import('../../lib/mensajesWa.js')
    const perfil = { nombre: 'Vicente Dalla', estudio: 'Viejo SRL', config_email: { whatsapp_yo: { mi_nombre: 'Vicho', mi_empresa: '' } } }
    expect(quienSoy({ perfil })).toEqual({ mi_nombre: 'Vicho', mi_empresa: 'Viejo SRL' })
  })
})

describe('Mensajes de WhatsApp por lado', () => {
  it('libre y mi negocio tienen su propio juego', async () => {
    const { mensajesWa, mundoDe } = await import('../../lib/mensajesWa.js')
    expect(mundoDe({ libre: true })).toBe('libre')
    expect(mundoDe({})).toBe('negocio')
    expect(mensajesWa({}, 'libre')[0].texto).not.toBe(mensajesWa({}, 'negocio')[0].texto)
    const perfil = { config_email: { whatsapp_mensajes: [{ titulo: 'N', texto: 'n' }], whatsapp_mensajes_libre: [{ titulo: 'L', texto: 'l' }] } }
    expect(mensajesWa(perfil, 'negocio')[0].titulo).toBe('N')
    expect(mensajesWa(perfil, 'libre')[0].titulo).toBe('L')
  })
})
