// Borradores de respaldo (sin IA). Se usan si no hay API key de IA configurada
// o si la IA falla. Varían por prospecto para que no salgan textos idénticos.

export const BENEFICIO_POR_RUBRO = {
  barberia: 'que la gente vea servicios y precios y saque turno sin escribirte por DM',
  peluqueria: 'mostrar trabajos, servicios y que reserven turno directo, sin ida y vuelta por mensaje',
  estetica: 'tener cada tratamiento explicado, con precios orientativos y reserva integrada',
  tatuajes: 'un portfolio ordenado por estilo, con formulario para pedir presupuesto con referencia',
  pilates: 'mostrar horarios y planes, y que reserven una clase de prueba en dos clics',
  gimnasio: 'mostrar planes y horarios, y que se anoten a una clase de prueba sin escribir',
  odontologia: 'explicar tratamientos y obras sociales y dar turnos online, que en salud genera mucha confianza',
  dermatologia: 'explicar tratamientos y obras sociales y dar turnos online, que en salud genera mucha confianza',
  kinesiologia: 'que los pacientes derivados te encuentren, vean obras sociales y pidan turno fácil',
  veterinaria: 'que el dueño de una mascota encuentre rápido horarios, guardias y turnos',
  arquitectura: 'mostrar las obras bien fotografiadas, con una ficha por proyecto',
  contable: 'mostrar servicios y trayectoria con una web sobria, porque casi todos googlean antes de llamar',
  juridico: 'mostrar áreas de práctica y trayectoria, porque en lo legal casi todos googlean antes de llamar',
  inmobiliaria: 'tener las propiedades en fichas propias con buscador, sin depender de los portales',
  alojamiento: 'recibir reservas directas sin pagar comisión a Booking o Airbnb en cada estadía',
  bodega: 'vender visitas y degustaciones con reserva directa, en español e inglés',
  gastronomia: 'tener la carta, horarios y reservas en una web rápida que aparezca en Google',
  indumentaria: 'tener una tienda online propia, para vender sin responder cada consulta a mano',
  optica: 'mostrar armazones, obras sociales y turnos para control visual',
  default: 'tener una web propia donde la gente que te busca en Google te encuentre y te contacte',
}

export function claveRubro(rubro = '') {
  const r = rubro.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const pares = [
    ['barber', 'barberia'], ['pelu', 'peluqueria'], ['estilist', 'peluqueria'], ['estetic', 'estetica'], ['spa', 'estetica'],
    ['tatu', 'tatuajes'], ['tattoo', 'tatuajes'], ['pilates', 'pilates'], ['gim', 'gimnasio'], ['gym', 'gimnasio'], ['fitness', 'gimnasio'],
    ['odonto', 'odontologia'], ['dental', 'odontologia'], ['dermat', 'dermatologia'], ['kines', 'kinesiologia'], ['fisio', 'kinesiologia'],
    ['veter', 'veterinaria'], ['arquit', 'arquitectura'], ['contab', 'contable'], ['contador', 'contable'], ['juri', 'juridico'], ['abogad', 'juridico'],
    ['inmobil', 'inmobiliaria'], ['caban', 'alojamiento'], ['hoster', 'alojamiento'], ['posada', 'alojamiento'], ['hotel', 'alojamiento'],
    ['bodega', 'bodega'], ['resto', 'gastronomia'], ['restaur', 'gastronomia'], ['gastro', 'gastronomia'], ['cafe', 'gastronomia'],
    ['indument', 'indumentaria'], ['ropa', 'indumentaria'], ['showroom', 'indumentaria'], ['optic', 'optica'],
  ]
  for (const [k, v] of pares) if (r.includes(k)) return v
  return 'default'
}

export function situacionHoy(queTiene = '') {
  const q = queTiene.toLowerCase()
  if (!q || q.includes('sin web')) return 'cuando alguien te busca en Google no encuentra una web tuya'
  if (q.includes('instagram')) return 'el botón de "sitio web" en Google te manda al Instagram'
  if (q.includes('facebook')) return 'el botón de "sitio web" en Google lleva a Facebook'
  if (q.includes('whatsapp')) return 'en Google el link de web abre directamente un WhatsApp'
  if (q.includes('turnos') || q.includes('reservas')) return 'la web que figura en Google es la plataforma de turnos, no una web tuya'
  if (q.includes('gratuito')) return 'la web que figura está en una dirección gratuita, sin dominio propio'
  if (q.includes('linktree')) return 'en Google el link de web es un Linktree'
  return 'no tenés una web propia donde la gente te encuentre'
}

const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

export function nombreCorto(n = '') {
  let s = n.split(/ [|\-–(]| \/ |,/)[0].replace(/^["#\s]+|["#\s]+$/g, '').trim()
  if (s && s === s.toUpperCase()) s = s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase())
  return s || n
}

/** Genera { whatsapp, email: {asunto, cuerpo}, seguimiento } sin IA */
export function borradoresPlantilla(p, perfil = {}) {
  const h = hash(p.nombre + (p.telefono || ''))
  const nom = nombreCorto(p.nombre)
  const yo = perfil.nombre || '[tu nombre]'
  const estudio = perfil.estudio || '[tu estudio]'
  const beneficio = BENEFICIO_POR_RUBRO[claveRubro(p.rubro)]
  const situacion = situacionHoy(p.que_tiene_hoy)
  const ig = p.instagram ? 'Estuve viendo el Instagram' : 'Los estuve viendo en Google'
  const elogio = ['está buenísimo', 'se nota el laburo que le ponen', 'está muy bien cuidado'][h % 3]
  const resenas = p.resenas >= 40 ? ` y las ${p.resenas} reseñas en Google hablan solas` : ''
  const saludo = ['¡Hola! ¿Cómo va?', '¡Hola, buen día!', '¡Hola! ¿Qué tal?'][(h >>> 2) % 3]
  const cierre = [
    `Si te interesa, te armo sin compromiso un boceto de cómo podría quedar la de ${nom}. ¿Te lo mando?`,
    `¿Te gustaría que te muestre una idea de cómo quedaría, sin compromiso?`,
    `Si querés te paso un par de ejemplos y una idea para ${nom}, sin compromiso. ¿Te sirve?`,
  ][(h >>> 4) % 3]
  const portfolio = perfil.portfolio_url ? ` Podés ver trabajos nuestros en ${perfil.portfolio_url}.` : ''

  const whatsapp = `${saludo} Soy ${yo}, de ${estudio}, hacemos webs para negocios de Mendoza. ${ig} de ${nom} y ${elogio}${resenas}. Vi que ${situacion}, y pensé que les vendría bien una web propia para ${beneficio}.${portfolio} ${cierre}`

  const email = {
    asunto: [`Una web para ${nom}`, `Idea para ${nom}`, `${nom}: web propia`][h % 3],
    cuerpo: `Hola, ¿cómo están?\n\nSoy ${yo}, de ${estudio}: diseñamos páginas web para negocios de Mendoza.\n\n${ig} de ${nom} y ${elogio}${resenas}. Vi que ${situacion}, y creo que una web propia les ayudaría a ${beneficio}.\n\nLes propongo armarles, sin compromiso, un boceto de cómo podría verse la de ${nom}, para que lo vean tranquilos.${portfolio}\n\n¿Les interesa?\n\nSaludos,\n${perfil.firma || yo}`,
  }

  const seguimiento = [
    `¡Hola! Te escribí hace unos días por lo de la web de ${nom}. Si te sirve, te mando en 2 o 3 imágenes cómo podría verse, sin compromiso. Y si no es momento, no hay drama. ¡Gracias!`,
    `¡Hola de nuevo! Retomo lo de la web para ${nom}: si te interesa, te armo una muestra rápida para que la veas. Si no, avisame y no te molesto más. ¡Saludos!`,
    `¡Hola! ¿Pudiste ver mi mensaje sobre la web de ${nom}? Te puedo mostrar una idea concreta en cinco minutos. Si no te interesa, tranqui, no insisto.`,
  ][(h >>> 6) % 3]

  return { whatsapp, email, seguimiento }
}
