// Lo que gasta Prospecta. Dos destinos, a propósito:
//   · chat_uso: cada FILA es una unidad del cupo de IA (cupo_chat cuenta filas). Va UNA por uso que
//     descuenta cupo, con el total de tokens reales, el modelo y las búsquedas web.
//   · consumo_uso: lo que nunca descontó cupo (interpretar, preguntar, reescribir, responder,
//     clasificar, Google Places) y lo que falló. Medirlo no le cobra nada a nadie.
// Nada de esto tira: registrar el uso no puede romper la función principal. Módulo sin npm: recibe
// el cliente de service_role ya armado (así se puede importar desde GitHub).
type Dic = Record<string, any>

export type UsoIA = { por: Record<string, { in: number, out: number }>, busquedasWeb: number }

export const nuevoUso = (): UsoIA => ({ por: {}, busquedasWeb: 0 })

/** Suma el `usage` de una respuesta de Claude. El modelo es el pedido: es el que tiene precio cargado. */
export function sumarUso(u: UsoIA, modelo: string, usage: Dic | null | undefined) {
  const m = (u.por[modelo] ??= { in: 0, out: 0 })
  m.in += Number(usage?.input_tokens) || 0
  m.out += Number(usage?.output_tokens) || 0
  u.busquedasWeb += Number(usage?.server_tool_use?.web_search_requests) || 0
}

export function sumarTokens(u: UsoIA, modelo: string, entrada: number, salida: number) {
  sumarUso(u, modelo, { input_tokens: entrada, output_tokens: salida })
}

const conTokens = (u: UsoIA) => Object.entries(u.por).filter(([, t]) => t.in + t.out > 0)
export const hayUso = (u: UsoIA) => conTokens(u).length > 0 || u.busquedasWeb > 0
const vaciar = (u: UsoIA) => { u.por = {}; u.busquedasWeb = 0 }

/** La fila de chat_uso: una sola aunque haya pasado por dos modelos (si no, descontaría dos del cupo). */
export function filaChatUso(owner: string, funcion: string, u: UsoIA, modeloSinTokens?: string) {
  const usados = conTokens(u).sort((a, b) => b[1].in + b[1].out - a[1].in - a[1].out)
  return {
    owner_id: owner, funcion,
    tokens_in: usados.reduce((n, [, t]) => n + t.in, 0),
    tokens_out: usados.reduce((n, [, t]) => n + t.out, 0),
    modelo: usados[0]?.[0] ?? modeloSinTokens ?? null,
    por_modelo: usados.length > 1 ? usados.map(([modelo, t]) => ({ modelo, in: t.in, out: t.out })) : null,
    busquedas_web: u.busquedasWeb,
  }
}

const nombreError = (e: unknown) => e instanceof Error ? e.name : 'Error'

/** Una unidad de cupo con su uso real. Deja `u` en cero para que no se vuelva a anotar. */
export async function anotarChatUso(db: any, owner: string, funcion: string, u: UsoIA, modeloSinTokens?: string) {
  const fila = filaChatUso(owner, funcion, u, modeloSinTokens)
  vaciar(u)
  try {
    const { error } = await db.from('chat_uso').insert(fila)
    if (!error) return
    console.error('uso: chat_uso', funcion, error.code)
    // Base sin las columnas nuevas (falta correr la migración): igual se descuenta el cupo
    const { error: e2 } = await db.from('chat_uso').insert({ owner_id: fila.owner_id, tokens_in: fila.tokens_in, tokens_out: fila.tokens_out })
    if (e2) console.error('uso: chat_uso (básico)', funcion, e2.code)
  } catch (e) { console.error('uso: chat_uso', funcion, nombreError(e)) }
}

async function anotar(db: any, fila: Dic) {
  try {
    const { error } = await db.from('consumo_uso').insert(fila)
    if (error) console.error('uso: consumo_uso', fila.funcion, error.code)
  } catch (e) { console.error('uso: consumo_uso', fila.funcion, nombreError(e)) }
}

/** Claude sin descontar cupo: una fila por modelo en el registro común. Deja `u` en cero. */
export async function anotarSinCupo(db: any, o: { funcion: string, usuario: string | null, uso: UsoIA, ok?: boolean }) {
  if (!hayUso(o.uso)) return
  const usados = conTokens(o.uso)
  const busquedas = o.uso.busquedasWeb
  vaciar(o.uso)
  const filas = usados.length ? usados : [['', { in: 0, out: 0 }] as [string, { in: number, out: number }]]
  await Promise.all(filas.map(([modelo, t], i) => anotar(db, {
    servicio: 'claude', funcion: o.funcion, modelo: modelo || null, tokens_entrada: t.in, tokens_salida: t.out,
    busquedas_web: i === 0 ? busquedas : 0, ok: o.ok ?? true, usuario: o.usuario,
  })))
}

/** Consultas a Google Places: solo las que Google contestó bien (`fallidas` va aparte, sin contar uso). */
export async function anotarPlaces(db: any, o: { funcion: string, usuario: string | null, consultas: number, fallidas?: number }) {
  if (o.consultas > 0) await anotar(db, { servicio: 'google_places', funcion: o.funcion, unidades: o.consultas, unidad: 'consultas', usuario: o.usuario })
  if (o.fallidas) await anotar(db, { servicio: 'google_places', funcion: o.funcion, unidades: 0, unidad: 'consultas', ok: false, usuario: o.usuario })
}
