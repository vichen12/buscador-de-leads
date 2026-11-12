// Uso y límites, explicados igual en todas las pantallas. Hay TRES límites distintos y cada uno
// tiene su nombre fijo:
//   · IA del plan      → consultas de IA de toda la empresa, por mes (se renueva el día 1).
//   · Emails de tu casilla → mails por día desde tu cuenta de email (se renueva a la medianoche).
//   · WhatsApp e Instagram → mensajes que mandás vos a mano, por día (lo elegís en Mi cuenta).

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** «el 1 de diciembre»: cuándo vuelve a cero la IA del plan. */
export function renuevaMes(hoy = new Date()) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)
  return `el 1 de ${MESES[d.getMonth()]}`
}

/**
 * La IA de quien mira, lista para mostrar (sale de la RPC mi_cupo_chat).
 * Devuelve null mientras carga. `sinTope` = plan sin límite.
 */
export function leerIA(cupo, hoy = new Date()) {
  if (!cupo) return null
  const porMes = cupo.periodo === 'mes'
  const limite = Number(porMes ? (cupo.empresa_limite ?? cupo.limite) : cupo.limite) || 0
  const usadas = Number(porMes ? (cupo.empresa_usados ?? cupo.usados) : cupo.usados) || 0
  const sinTope = !!cupo.sin_tope || !limite
  const quedan = sinTope ? null : Math.max(0, limite - usadas)
  return {
    porMes, limite, usadas, sinTope, quedan,
    pct: sinTope ? 0 : Math.min(100, (usadas / Math.max(1, limite)) * 100),
    renueva: porMes ? renuevaMes(hoy) : 'mañana',
    deQuien: porMes ? 'de tu empresa' : 'tuyas',
    agotada: !sinTope && quedan === 0,
  }
}

/** «Usa 1 consulta de IA · te quedan 315 (se renuevan el 1 de diciembre)». */
export function textoCosto(ia, consultas = 1) {
  if (!ia) return ''
  const usa = `Usa ${consultas} crédito${consultas === 1 ? '' : 's'}`
  if (ia.sinTope) return usa
  if (ia.agotada) return ia.porMes ? `Tu empresa ya usó todas las consultas de IA del mes (se renuevan ${ia.renueva})` : 'No te quedan consultas de IA hoy (se renuevan mañana)'
  return `${usa} · ${ia.porMes ? 'a tu empresa le quedan' : 'te quedan'} ${ia.quedan.toLocaleString('es-AR')} (se renuevan ${ia.renueva})`
}

/** Qué gasta cada cosa. Lo muestran «Uso y límites» y la Ayuda: tiene que ser una sola lista. */
export const COSTOS_IA = [
  ['Una búsqueda de empresas', '1, 3 o 5 créditos', 'Según con qué busques: Rápida 1, Mejor 3, Máxima 5. Da igual si pedís 10 o 40 empresas.'],
  ['Un mensaje al Asistente', '1 consulta', ''],
  ['Armar o rehacer «Mi negocio»', '1 consulta', ''],
  ['Guion de llamada o brief de reunión', '1 consulta', ''],
  ['Texto de una campaña', '1 consulta', ''],
  ['Borrador de mensaje desde la ficha de una empresa', '1 consulta', ''],
  ['Borradores desde «Tu lista»', '1 consulta cada 25 empresas', ''],
  ['Borradores en un envío masivo', '1 consulta cada 4 empresas', ''],
  ['Cada paso de una secuencia', '1 consulta por empresa', 'Una secuencia de 4 pasos a 30 empresas usa hasta 120.'],
]
export const GRATIS_IA = ['«Así lo entendí» antes de buscar', 'Las preguntas para afinar la búsqueda', 'Reescribir o acortar un mensaje', 'Sugerir una respuesta', 'Clasificar las respuestas que te llegan']
