// Convierte el formulario "Mi negocio" en una estrategia de prospección con Claude (modelo barato):
// rubros a buscar, zonas, filtros propios del negocio, criterios para calificar y el ángulo de los mensajes.
// Guarda respuestas + estrategia en perfil_comercial (como el usuario, con RLS). La persona después la edita.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'

type Dic = Record<string, any>
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const txt = (v: unknown, max = 800) => String(v ?? '').trim().slice(0, max)
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)

// Filtros que la búsqueda puede verificar sola con los datos (los demás los evalúa Claude al buscar)
const FILTROS_BASE = [
  { id: 'con_telefono', titulo: 'Con teléfono o WhatsApp', descripcion: 'Que tenga un número para escribirle o llamarlo.' },
  { id: 'con_email', titulo: 'Con email', descripcion: 'Que tenga un email de contacto público.' },
  { id: 'con_instagram', titulo: 'Con Instagram', descripcion: 'Que tenga perfil de Instagram activo.' },
  { id: 'sin_web', titulo: 'Sin página web propia', descripcion: 'Que hoy no tenga un sitio con dominio propio.' },
]

function prompt(r: Dic) {
  return `Sos un experto en prospección comercial B2B y B2C en Argentina. Una empresa te contó qué hace para que la ayudes a encontrar clientes potenciales buscando en la web (Google Maps, redes, directorios).

Lo que contó (puede ser una sola frase: deducí vos lo que falte, como el cliente ideal, el tamaño y las señales):
- Qué vende y a quién: ${txt(r.que_vende) || 's/d'}
- Empresa: ${txt(r.empresa) || 's/d'}
- Cliente ideal: ${txt(r.cliente_ideal) || 'deducilo'}
- Tamaño de cliente que busca: ${[].concat(r.tamanos ?? []).join(', ') || 's/d'}
- Zonas donde trabaja: ${[].concat(r.zonas ?? []).join(', ') || 's/d'}
- Señales de que alguien necesita lo que vende: ${txt(r.senales) || 's/d'}
- A quién NO le quiere vender: ${txt(r.no_quiere) || 's/d'}
- Cómo contacta a los clientes: ${[].concat(r.canales ?? []).join(', ') || 's/d'}
- Qué la diferencia / por qué le compran: ${txt(r.diferencial) || 's/d'}
- Web o redes de la empresa: ${txt(r.web, 200) || 's/d'}

Armá su estrategia de prospección. Pensá en qué tipos de negocio u organización concretos (rubros buscables en Google Maps) son sus mejores clientes, incluso los que no son obvios. Los filtros tienen que ser cosas verificables mirando la presencia pública de un negocio (web, redes, fichas, reseñas, tamaño aparente, si tiene flota, sucursales, horarios, si vende online, etc.), específicas para ESTE negocio.

Filtros estándar que podés incluir si sirven (usá exactamente estos id): ${FILTROS_BASE.map(f => f.id).join(', ')}. "sin_web" sólo si lo que vende tiene que ver con tener o no tener web.

Respondé SOLO con JSON válido, sin texto antes ni después:
{
 "resumen": "una o dos frases: qué vende y a quién, en segunda persona (vos)",
 "cliente_ideal": "una frase concreta",
 "rubros": [{"nombre": "rubro corto en minúscula como se buscaría en Google Maps", "grupo": "categoría corta", "por_que": "por qué es buen cliente, en pocas palabras"}],
 "zonas": ["zona o ciudad"],
 "filtros": [{"id": "id_corto", "titulo": "título corto", "descripcion": "qué tiene que cumplir, en una frase", "activo": true}],
 "criterios": ["señal concreta de que es buen prospecto"],
 "descartar": ["a quién descartar"],
 "angulo": "cómo conviene entrarle en el primer mensaje: qué valor ofrecer, en dos frases",
 "tono": "tono recomendado para los mensajes"
}
Entre 12 y 20 rubros en 3 a 6 grupos, ordenados de mejor a peor. Entre 4 y 7 filtros (marcá activo=true los 2 o 3 más importantes). Entre 3 y 6 criterios. Zonas: las que dijo, o las más lógicas si no dijo; si dijo una región amplia (ej. "Gran Mendoza", "Valle de Uco", "Todo el país"), devolvé las ciudades o departamentos concretos donde conviene buscar (máximo 8).`
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let usuario
  try { usuario = await clienteDelUsuario(req) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const { supabase, user } = usuario
  const body = await req.json().catch(() => ({}))
  const respuestas = body.respuestas ?? {}
  if (txt(respuestas.que_vende).length < 8) return json({ error: 'Contanos en una frase qué vendés y a quién.' }, 400)

  const db = admin()
  const { data: cupo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  if (cupo && cupo.usados >= cupo.limite) return json({ error: `Llegaste al límite de ${cupo.limite} consultas de IA de hoy.` }, 429)
  const key = await claveServicio('anthropic')
  if (!key) return json({ error: 'Falta la clave de Claude: la carga el super admin en Super admin → Claves.' }, 503)
  const modelo = (await claveServicio('modelo_resumen')) || 'claude-haiku-5-5'

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: modelo, max_tokens: 8000, messages: [{ role: 'user', content: prompt(respuestas) }] }),
  })
  if (!r.ok) { console.error('anthropic', r.status, (await r.text()).slice(0, 300)); return json({ error: `Claude respondió con un error (${r.status}). Probá de nuevo.` }, 502) }
  const data = await r.json()
  await db.from('chat_uso').insert({ owner_id: user.id, tokens_in: data.usage?.input_tokens ?? 0, tokens_out: data.usage?.output_tokens ?? 0 })
  const texto = (data.content ?? []).map((c: Dic) => c.text ?? '').join('')
  let e: Dic
  const crudo = (texto.match(/```json\s*([\s\S]*?)```/)?.[1] ?? texto.match(/\{[\s\S]*\}/)?.[0] ?? '').replace(/,\s*([}\]])/g, '$1')
  try { e = JSON.parse(crudo) } catch {
    console.error('estrategia sin JSON', data.stop_reason, texto.slice(0, 200), '…', texto.slice(-300))
    return json({ error: 'Claude no devolvió una estrategia válida. Probá de nuevo.' }, 502)
  }

  // Normalizar lo que vino
  const vistos = new Set<string>()
  const estrategia = {
    resumen: txt(e.resumen, 400),
    cliente_ideal: txt(e.cliente_ideal, 300),
    rubros: (Array.isArray(e.rubros) ? e.rubros : []).map((x: Dic) => ({ nombre: txt(x.nombre ?? x, 60).toLowerCase(), grupo: txt(x.grupo, 40) || 'Otros', por_que: txt(x.por_que, 160) }))
      .filter((x: Dic) => x.nombre && !vistos.has(x.nombre) && vistos.add(x.nombre)).slice(0, 30),
    zonas: (Array.isArray(e.zonas) ? e.zonas : []).map((z: unknown) => txt(z, 60)).filter(Boolean).slice(0, 12),
    filtros: (Array.isArray(e.filtros) ? e.filtros : []).map((f: Dic) => {
      const base = FILTROS_BASE.find(b => b.id === f.id)
      return { id: base?.id ?? (slug(txt(f.id) || txt(f.titulo)) || crypto.randomUUID().slice(0, 8)), titulo: txt(f.titulo, 60) || base?.titulo || '', descripcion: txt(f.descripcion, 200) || base?.descripcion || '', activo: f.activo !== false }
    }).filter((f: Dic) => f.titulo).slice(0, 10),
    criterios: (Array.isArray(e.criterios) ? e.criterios : []).map((c: unknown) => txt(c, 200)).filter(Boolean).slice(0, 10),
    descartar: (Array.isArray(e.descartar) ? e.descartar : []).map((c: unknown) => txt(c, 200)).filter(Boolean).slice(0, 10),
    angulo: txt(e.angulo, 500),
    tono: txt(e.tono, 200),
  }
  // Siempre ofrecer "con teléfono" para poder contactarlos
  if (!estrategia.filtros.some((f: Dic) => f.id === 'con_telefono')) estrategia.filtros.push({ ...FILTROS_BASE[0], activo: true })

  if (body.guardar !== false) {
    const { error } = await supabase.from('perfil_comercial').upsert({ owner_id: user.id, respuestas, estrategia })
    if (error) { console.error('perfil_comercial', error); return json({ error: 'No pude guardar tu perfil: ' + error.message }, 500) }
  }
  return json({ estrategia, modelo })
})
