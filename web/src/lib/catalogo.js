// Rubros y zonas sugeridos para buscar e importar.
export const RUBROS = [
  { grupo: 'Belleza', items: ['barbería', 'peluquería', 'centro de estética', 'manicuría y uñas', 'estudio de tatuajes', 'spa', 'depilación', 'cosmetología', 'maquilladora', 'pestañas y cejas'] },
  { grupo: 'Salud', items: ['consultorio odontológico', 'kinesiología', 'psicología', 'nutricionista', 'dermatología', 'óptica', 'fonoaudiología', 'podología', 'laboratorio de análisis'] },
  { grupo: 'Mascotas', items: ['veterinaria', 'peluquería canina', 'petshop', 'guardería de perros', 'adiestrador canino'] },
  { grupo: 'Deporte', items: ['gimnasio', 'estudio de pilates', 'yoga', 'crossfit', 'escuela de danza', 'artes marciales', 'escuela de natación', 'pádel'] },
  { grupo: 'Profesionales', items: ['estudio contable', 'estudio jurídico', 'estudio de arquitectura', 'inmobiliaria', 'escribanía', 'productor de seguros', 'agrimensor', 'diseño de interiores'] },
  { grupo: 'Gastronomía', items: ['restaurante', 'cafetería', 'pastelería', 'panadería', 'cervecería', 'rotisería', 'heladería', 'catering', 'food truck', 'dietética'] },
  { grupo: 'Comercio', items: ['tienda de indumentaria', 'mueblería', 'ferretería', 'librería', 'vivero', 'florería', 'joyería', 'regalería', 'bicicletería', 'casa de deportes'] },
  { grupo: 'Turismo', items: ['cabañas', 'hostel', 'bodega boutique', 'agencia de viajes', 'turismo aventura', 'alquiler de autos', 'posada'] },
  { grupo: 'Hogar y oficios', items: ['electricista', 'plomero', 'gasista', 'cerrajería', 'mudanzas', 'limpieza', 'pintor', 'carpintería', 'herrería', 'climatización'] },
  { grupo: 'Autos', items: ['taller mecánico', 'lavadero de autos', 'gomería', 'chapa y pintura', 'escuela de manejo', 'polarizados'] },
  { grupo: 'Educación y eventos', items: ['instituto de idiomas', 'apoyo escolar', 'escuela de música', 'fotógrafo', 'salón de eventos', 'organizador de eventos', 'DJ', 'cotillón'] },
]

export const ZONAS = [
  { grupo: 'Gran Mendoza', items: ['Ciudad de Mendoza', 'Godoy Cruz', 'Guaymallén', 'Las Heras', 'Luján de Cuyo', 'Maipú', 'Chacras de Coria', 'Lavalle'] },
  { grupo: 'Este', items: ['San Martín', 'Rivadavia', 'Junín', 'Santa Rosa'] },
  { grupo: 'Valle de Uco', items: ['Tunuyán', 'Tupungato', 'San Carlos'] },
  { grupo: 'Sur', items: ['San Rafael', 'General Alvear', 'Malargüe'] },
]

// Sólo los departamentos de Mendoza llevan ", Mendoza"; cualquier otra zona se busca tal cual (Neuquén, Córdoba, todo el país…)
const MENDOZA = new Set(ZONAS.flatMap(g => g.items).map(z => z.toLowerCase()))
export const zonaCompleta = z => (/,/.test(z) || !MENDOZA.has(z.trim().toLowerCase()) ? z.trim() : `${z.trim()}, Mendoza`)
