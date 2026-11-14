// Busca negocios con Claude y búsqueda web (la lógica vive en _shared/buscar.ts).
// Con { segundo_plano: true } la búsqueda sigue en el servidor aunque la persona cierre la pestaña o
// cambie de pantalla: se devuelve enseguida el id de la búsqueda y el resultado queda en la tabla
// busquedas (estado: buscando → lista | error), que la web consulta hasta que termina.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { buscar } from '../_shared/buscar.ts'

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const ayudas = { clienteDelUsuario, claveServicio, json, admin }

declare const EdgeRuntime: { waitUntil: (p: Promise<unknown>) => void } | undefined

async function enSegundoPlano(req: Request, body: Record<string, unknown>) {
  let user
  try { ({ user } = await clienteDelUsuario(req)) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const db = admin()
  const { data: fila, error } = await db.from('busquedas').insert({
    owner_id: user.id, rubro: String(body.rubro ?? '').slice(0, 500), zona: String(body.zona ?? '').slice(0, 80),
    pedido: String(body.pedido ?? '').slice(0, 400), cantidad: Number(body.cantidad) || 0,
    requisitos: body.libre === true ? { libre: true } : {}, estado: 'buscando',
  }).select('id').single()
  // Base sin las columnas nuevas: se busca como antes (esperando la respuesta)
  if (error || !fila) return buscar(req, ayudas)
  const id = fila.id as string
  const pedido = new Request(req.url, { method: 'POST', headers: req.headers, body: JSON.stringify({ ...body, segundo_plano: false, busqueda_existente: id }) })
  const terminar = (estado: string, resultado: unknown) =>
    db.from('busquedas').update({ estado, resultado, terminada_at: new Date().toISOString() }).eq('id', id)
  const tarea = (async () => {
    try {
      const r = await buscar(pedido, ayudas)
      const d = await r.json().catch(() => ({ error: 'Respuesta inválida' }))
      await terminar(r.ok && !d?.error ? 'lista' : 'error', d)
    } catch (e) {
      await terminar('error', { error: 'La búsqueda falló: ' + String((e as Error)?.message ?? e).slice(0, 200) })
    }
  })()
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(tarea)
  else await tarea
  return json({ busqueda_id: id, en_curso: true })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const body = await req.clone().json().catch(() => ({}))
  if (body?.segundo_plano === true && !body.modo) return enSegundoPlano(req, body)
  return buscar(req, ayudas)
})
