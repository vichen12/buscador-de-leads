// Busca negocios por rubro + zona usando Claude con búsqueda web (fuentes públicas).
// Devuelve candidatos SIN web propia para revisar; no guarda nada: el usuario elige cuáles importar.
// Cada búsqueda descuenta 1 del cupo diario de IA del usuario (el mismo del Asistente).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'
import { clasificarWeb, instagramDe } from '../_shared/clasificar.js'

type Dic = Record<string, any>
const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

const PROMPT = (rubro: string, zona: string, cantidad: number, excluir: string[]) => `Buscá en la web negocios del rubro "${rubro}" en "${zona}" (Argentina) que estén activos y que NO tengan página web propia.

Objetivo: son prospectos para ofrecerles una página web. Sirven los que hoy sólo tienen Instagram, Facebook, WhatsApp, una ficha de Google Maps, un perfil en un directorio o un link de reservas (Fresha, AgendaPro, Booksy, Linktree, etc.). Descartá los que tienen un dominio propio (ej. minegocio.com.ar).

Cómo buscar: hacé varias búsquedas distintas (por ejemplo "${rubro} ${zona} instagram", "${rubro} ${zona} whatsapp", "mejores ${rubro} ${zona}", directorios y guías locales). Usá sólo información pública. No inventes datos: si no encontrás el teléfono o el Instagram, dejalo vacío.
${excluir.length ? `Ya los tengo cargados, no los repitas: ${excluir.slice(0, 80).join('; ')}.` : ''}

Buscá hasta ${cantidad} negocios. Al final respondé SOLO con un bloque JSON (sin texto después) con este formato:
\`\`\`json
[{"nombre": "", "direccion": "", "telefono": "", "instagram": "https://www.instagram.com/usuario/", "web": "", "que_tiene_hoy": "Sólo Instagram | Instagram + WhatsApp | Facebook | Link de reservas | Sin web", "fuente": "url donde lo encontraste", "nota": "por qué es buen prospecto, en una frase"}]
\`\`\`
En "web" poné la URL que figure como sitio del negocio (aunque sea Instagram o un link de reservas), o vacío si no tiene.`

function extraerLista(texto: string): Dic[] {
  const bloque = texto.match(/```json\s*([\s\S]*?)```/)?.[1] ?? texto.match(/\[[\s\S]*\]/)?.[0]
  if (!bloque) return []
  try { const v = JSON.parse(bloque); return Array.isArray(v) ? v : [] } catch { return [] }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let usuario
  try { usuario = await clienteDelUsuario(req) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const { supabase, user } = usuario
  const db = admin()
  const body = await req.json().catch(() => ({}))

  const { data: acceso } = await supabase.rpc('mi_acceso')
  if (acceso && acceso.habilitado === false) return json({ error: 'Tu cuenta o tu empresa está suspendida.' }, 403)

  const rubro = String(body.rubro ?? '').trim().slice(0, 80)
  const zona = String(body.zona ?? '').trim().slice(0, 80)
  const cantidad = Math.min(Math.max(Number(body.cantidad) || 10, 5), 20)
  if (!rubro || !zona) return json({ error: 'Indicá rubro y zona' }, 400)

  const { data: cupo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  if (cupo && cupo.usados >= cupo.limite) return json({ error: `Llegaste al límite de ${cupo.limite} consultas de IA de hoy. Mañana se renueva.`, codigo: 'LIMITE_CHAT', cupo }, 429)
  const key = await claveServicio('anthropic')
  if (!key) return json({ error: 'Falta la clave de Claude: la carga el super admin en Super admin → Claves.', codigo: 'SIN_CLAVE' }, 503)
  const modelo = (await claveServicio('modelo_ia')) || 'claude-sonnet-5-5'

  // Lo que ya tiene cargado, para no repetir
  const { data: ya } = await supabase.from('prospectos').select('nombre').ilike('rubro', `%${rubro.split(' ')[0]}%`).limit(80)
  const excluir = (ya ?? []).map((p: Dic) => p.nombre)

  const messages: Dic[] = [{ role: 'user', content: PROMPT(rubro, zona, cantidad, excluir) }]
  let texto = '', usoIn = 0, usoOut = 0, busquedas = 0
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: modelo, max_tokens: 8000, messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6,
                  user_location: { type: 'approximate', country: 'AR', region: 'Mendoza', timezone: 'America/Argentina/Mendoza' } }],
      }),
    })
    if (!r.ok) {
      const detalle = (await r.text()).slice(0, 300)
      console.error('anthropic', r.status, detalle)
      const msg = r.status === 401 ? 'La clave de Claude no es válida: revisala en Super admin → Claves.'
        : /web.search|not enabled|permission/i.test(detalle) ? 'La búsqueda web no está habilitada en la cuenta de Anthropic: activala en console.anthropic.com → Settings → Privacy / Web search.'
        : /credit/i.test(detalle) ? 'La cuenta de Anthropic se quedó sin crédito.'
        : r.status === 429 || r.status === 529 ? 'Claude está saturado. Probá en un minuto.'
        : `Claude respondió con un error (${r.status}).`
      return json({ error: msg }, 502)
    }
    const data = await r.json()
    usoIn += data.usage?.input_tokens ?? 0; usoOut += data.usage?.output_tokens ?? 0
    busquedas += data.usage?.server_tool_use?.web_search_requests ?? 0
    texto += (data.content ?? []).filter((c: Dic) => c.type === 'text').map((c: Dic) => c.text).join('')
    if (data.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: data.content }) // búsqueda larga: seguir donde quedó
  }

  await db.from('chat_uso').insert({ owner_id: user.id, tokens_in: usoIn, tokens_out: usoOut })

  const vistos = new Set<string>()
  const resultados = extraerLista(texto).map((n, i) => {
    const web = String(n.web ?? '').trim()
    const { esProspecto, queTiene } = clasificarWeb(web)
    const ig = String(n.instagram ?? '').trim() || instagramDe(web)
    const handle = ig.match(/instagram\.com\/([A-Za-z0-9._]+)/)?.[1] ?? (/^@?[A-Za-z0-9._]+$/.test(ig) ? ig.replace('@', '') : '')
    return {
      id: `ia-${i}`,
      nombre: String(n.nombre ?? '').trim(),
      rubro, zona,
      direccion: String(n.direccion ?? '').trim(),
      telefono: String(n.telefono ?? '').trim(),
      instagram: handle ? `https://www.instagram.com/${handle}/` : '',
      que_tiene_hoy: web ? queTiene : (n.que_tiene_hoy || 'Sin web'),
      web_actual: esProspecto ? (queTiene === 'Sin web' ? '' : web) : web,
      fuente: String(n.fuente ?? ''),
      nota: String(n.nota ?? ''),
      es_prospecto: esProspecto,
    }
  }).filter(n => {
    const k = n.nombre.toLowerCase()
    if (!n.nombre || vistos.has(k)) return false
    vistos.add(k); return true
  })

  const { data: cupoNuevo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  return json({ resultados, busquedas, cupo: cupoNuevo })
})
