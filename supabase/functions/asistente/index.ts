// Asistente IA: chat con Claude que conoce los datos de la cuenta (prospectos, envíos, seguimientos).
// - Cada consulta descuenta del cupo diario del usuario (lo fija el super admin).
// - Puede leer un PDF adjunto en la consulta.
// - Los mensajes y el uso los escribe sólo esta función (con service role); el navegador sólo lee.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { clienteDelUsuario, claveServicio, cors, json } from '../_shared/supabase.ts'

type Dic = Record<string, any>
const MAX_PDF_BYTES = 8 * 1024 * 1024
const HISTORIAL = 20

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

async function contexto(supabase: any, perfil: Dic, userId: string) {
  const [{ data: t }, { data: ps }, { data: ints }, { data: com }] = await Promise.all([
    supabase.rpc('tablero'),
    supabase.from('prospectos')
      .select('id, nombre, rubro, zona, estado, telefono, email, instagram, que_tiene_hoy, rating, resenas, ultimo_contacto, proximo_seguimiento, notas, encaje, puntaje')
      .order('updated_at', { ascending: false }).limit(300),
    supabase.from('interacciones').select('tipo, detalle, created_at, prospecto_id').order('created_at', { ascending: false }).limit(40),
    supabase.from('perfil_comercial').select('respuestas, estrategia').eq('owner_id', userId).maybeSingle(),
  ])
  const e = (com?.estrategia ?? {}) as Dic, resp = (com?.respuestas ?? {}) as Dic
  const nombre = new Map((ps ?? []).map((p: Dic) => [p.id, p.nombre]))
  const filas = (ps ?? []).map((p: Dic) =>
    [p.nombre, p.rubro, p.zona, p.estado, p.puntaje ? `encaje ${p.puntaje}/5` : '', p.encaje ? `por qué: ${String(p.encaje).slice(0, 120)}` : '', p.que_tiene_hoy, p.resenas ? `${p.resenas} reseñas ${p.rating ?? ''}★` : '', p.telefono ? 'tel' : '', p.email ? 'email' : '',
     p.instagram ? 'IG' : '', p.ultimo_contacto ? `últ. contacto ${String(p.ultimo_contacto).slice(0, 10)}` : '',
     p.proximo_seguimiento ? `seguir ${p.proximo_seguimiento}` : '', p.notas ? `notas: ${String(p.notas).slice(0, 120)}` : '']
      .filter(Boolean).join(' | '))
  const actividad = (ints ?? []).map((i: Dic) => `${String(i.created_at).slice(0, 16).replace('T', ' ')} · ${i.tipo} · ${nombre.get(i.prospecto_id) ?? '?'}${i.detalle ? ' · ' + String(i.detalle).slice(0, 100) : ''}`)
  return `## Quién usa el sistema
${perfil.nombre || 'Usuario'}${resp.empresa || perfil.estudio ? `, de ${resp.empresa || perfil.estudio}` : ''}.
${e.resumen ? `Qué vende y a quién: ${e.resumen}\nCliente ideal: ${e.cliente_ideal || ''}\nRubros que busca: ${(e.rubros ?? []).map((r: Dic) => r.nombre).join(', ')}\nZonas: ${(e.zonas ?? []).join(', ')}\nCómo conviene escribirles: ${e.angulo || ''}` : 'Todavía no completó "Mi negocio" (qué vende y a quién). Si hace falta, sugerile completarlo.'}
Límite diario de envíos: ${perfil.limite_diario}. Seguimiento a los ${perfil.dias_seguimiento} días.
${perfil.instrucciones_ia ? `Indicaciones propias: ${perfil.instrucciones_ia}` : ''}

## Métricas actuales (JSON del tablero)
${JSON.stringify(t ?? {})}

## Prospectos (${filas.length}${filas.length === 300 ? ', los 300 más recientes' : ''}): nombre | rubro | zona | estado | qué tiene hoy | reseñas | canales | fechas | notas
${filas.join('\n') || '(todavía no cargó prospectos)'}

## Actividad reciente
${actividad.join('\n') || '(sin actividad)'}`
}

const SISTEMA = (ctx: string, hoy: string, pagina: string) => `Sos el asistente de Prospecta, un sistema para conseguir clientes para cualquier tipo de empresa: busca negocios que encajan con lo que vende el usuario y los contacta de a uno, con mensajes revisados por una persona.
Hoy es ${hoy} (hora de Argentina). Respondé en español rioplatense, claro y directo, con tuteo/voseo natural.

Podés ayudar con cualquier cosa: dudas generales, estrategia comercial, redactar mensajes, precios, objeciones, analizar sus datos, armar planes o reportes, leer PDFs que te adjunten (por ejemplo, el perfil de la empresa) y lo que te pidan.
- Usá los datos de abajo cuando la pregunta sea sobre su cuenta. Citá nombres y números concretos. Si algo no está en los datos, decilo; no inventes.
- Formato: Markdown (títulos ##, listas, **negritas**, tablas cuando ayuden). Cuando te pidan un informe o reporte, armalo completo y prolijo, con título, resumen y secciones, porque el usuario lo va a exportar a PDF.
- No propongas envíos masivos automáticos, compra de bases de datos ni scraping: el sistema contacta de a pocos y cada mensaje lo revisa una persona.
- Sé breve si la pregunta es breve.

${ctx}
${pagina ? `\n## Lo que el usuario está mirando ahora en la app\n${pagina}` : ''}`

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  let usuario
  try { usuario = await clienteDelUsuario(req) } catch { return json({ error: 'Iniciá sesión de nuevo' }, 401) }
  const { supabase, user } = usuario
  const body = await req.json().catch(() => ({}))
  const db = admin()

  const { data: acceso } = await supabase.rpc('mi_acceso')
  if (acceso && acceso.habilitado === false) return json({ error: 'Tu cuenta o tu empresa está suspendida.' }, 403)

  const { data: cupo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  if (body.modo === 'cupo') return json({ cupo, ia: !!(await claveServicio('anthropic')) })

  const mensaje = String(body.mensaje ?? '').trim()
  const pdf = body.pdf as { nombre?: string; base64?: string } | undefined
  if (!mensaje && !pdf?.base64) return json({ error: 'Escribí una pregunta' }, 400)
  if (mensaje.length > 8000) return json({ error: 'El mensaje es muy largo (máximo 8.000 caracteres)' }, 400)
  if (pdf?.base64 && pdf.base64.length * 0.75 > MAX_PDF_BYTES) return json({ error: 'El PDF es muy pesado (máximo 8 MB)' }, 400)
  if (cupo && cupo.usados >= cupo.limite) return json({ error: `Llegaste al límite de ${cupo.limite} consultas de hoy. Mañana se renueva.`, codigo: 'LIMITE_CHAT', cupo }, 429)

  const key = await claveServicio('anthropic')
  if (!key) return json({ error: 'Falta la clave de Claude: la carga el super admin en Super admin → Claves.', codigo: 'SIN_CLAVE' }, 503)
  const modelo = (await claveServicio('modelo_ia')) || 'claude-haiku-5-5'
  const pagina = String(body.pagina ?? '').slice(0, 3000)

  // Conversación (nueva o existente y propia)
  let convId: string | null = body.conversacion_id ?? null
  if (convId) {
    const { data } = await supabase.from('chat_conversaciones').select('id').eq('id', convId).maybeSingle()
    if (!data) return json({ error: 'Conversación no encontrada' }, 404)
  } else {
    const titulo = (mensaje || `PDF: ${pdf?.nombre ?? 'documento'}`).replace(/\s+/g, ' ').slice(0, 60)
    const { data, error } = await supabase.from('chat_conversaciones').insert({ titulo }).select('id').single()
    if (error) return json({ error: error.message }, 400)
    convId = data.id
  }

  const [{ data: previos }, { data: perfil }] = await Promise.all([
    supabase.from('chat_mensajes').select('rol, contenido, adjunto').eq('conversacion_id', convId).order('created_at', { ascending: false }).limit(HISTORIAL),
    supabase.from('perfiles').select('*').eq('id', user.id).single(),
  ])
  const historial = (previos ?? []).reverse().map((m: Dic) => ({
    role: m.rol,
    content: m.adjunto ? `[Había adjuntado el PDF "${m.adjunto}"]\n${m.contenido}` : m.contenido,
  }))
  const contenido: Dic[] = []
  if (pdf?.base64) contenido.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.base64 }, title: pdf.nombre ?? 'documento.pdf' })
  contenido.push({ type: 'text', text: mensaje || 'Leé el PDF adjunto y contame qué hace esta empresa, sus puntos clave y cómo podría aprovecharlo para conseguir clientes.' })

  const hoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Mendoza', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: modelo, max_tokens: 4000,
      system: SISTEMA(await contexto(supabase, perfil ?? {}, user.id), hoy, pagina),
      messages: [...historial, { role: 'user', content: contenido }],
    }),
  })
  if (!r.ok) {
    const detalle = (await r.text()).slice(0, 300)
    console.error('anthropic', r.status, detalle)
    const msg = r.status === 401 ? 'La clave de Claude no es válida: revisala en Super admin → Claves.'
      : r.status === 429 ? 'Claude está saturado o se alcanzó el límite de la cuenta de Anthropic. Probá en un minuto.'
      : r.status === 400 && /credit/i.test(detalle) ? 'La cuenta de Anthropic se quedó sin crédito.'
      : `Claude respondió con un error (${r.status}).`
    if (!body.conversacion_id) await db.from('chat_conversaciones').delete().eq('id', convId)
    return json({ error: msg }, 502)
  }
  const data = await r.json()
  const respuesta = (data.content ?? []).map((c: Dic) => c.text ?? '').join('').trim() || '(sin respuesta)'

  await db.from('chat_mensajes').insert([
    { conversacion_id: convId, owner_id: user.id, rol: 'user', contenido: mensaje || '(PDF adjunto)', adjunto: pdf?.nombre ?? null },
    { conversacion_id: convId, owner_id: user.id, rol: 'assistant', contenido: respuesta },
  ])
  await db.from('chat_uso').insert({ owner_id: user.id, tokens_in: data.usage?.input_tokens ?? 0, tokens_out: data.usage?.output_tokens ?? 0 })
  await db.from('chat_conversaciones').update({ updated_at: new Date().toISOString() }).eq('id', convId)
  const { data: cupoNuevo } = await db.rpc('cupo_chat', { p_usuario: user.id })
  return json({ conversacion_id: convId, respuesta, cupo: cupoNuevo })
})
