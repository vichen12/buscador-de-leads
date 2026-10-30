// Prueba de punta a punta contra el proyecto Supabase real.
// Uso: SUPABASE_URL=... SUPABASE_ANON_KEY=... CODIGO_INVITACION=... node backend.test.mjs
import { createRequire } from 'module'
const require = createRequire(new URL('../../web/package.json', import.meta.url))
const { createClient } = require('@supabase/supabase-js')
const Papa = require('papaparse')
import fs from 'fs'

const URL_ = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_ANON_KEY
const PASS = 'Prueba-Prospecta-2026!'
const T = Date.now()
const A = `prospecta.a.${T}@example.com`, B = `prospecta.b.${T}@example.com`
const cliente = () => createClient(URL_, KEY, { auth: { persistSession: false } })
let fallas = 0
const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FALLA- ') + m); if (!c) fallas++ }

const CODIGO = process.env.CODIGO_INVITACION
const registrar = body => fetch(`${URL_}/functions/v1/registro`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: `Bearer ${KEY}` }, body: JSON.stringify(body) })
  .then(async r => ({ status: r.status, ...(await r.json()) }))

// registro con código de invitación
let reg = await registrar({ email: 'intruso@example.com', password: PASS, codigo: 'CUALQUIERA' })
ok(reg.status === 403, 'registro con código inválido rechazado')
reg = await registrar({ email: A, password: 'corta', codigo: CODIGO })
ok(reg.status === 400, 'registro con contraseña corta rechazado')
for (const email of [A, B]) {
  reg = await registrar({ email, password: PASS, nombre: email.split('@')[0], codigo: CODIGO })
  ok(reg.ok, `registro de ${email}: ${reg.ok ? 'creado' : reg.error}`)
}
reg = await registrar({ email: A, password: PASS, codigo: CODIGO })
ok(reg.status === 409, 'registro duplicado rechazado')

const login = async email => {
  const c = cliente()
  const { error } = await c.auth.signInWithPassword({ email, password: PASS })
  if (error) throw new Error(email + ': ' + error.message)
  return c
}
const sa = await login(A), sb = await login(B)
ok(true, 'login de los dos usuarios')

// perfil creado por trigger y editable
const { data: perfA } = await sa.from('perfiles').select('*').single()
ok(perfA?.limite_diario === 15, 'perfil creado automáticamente con límite 15')
await sa.from('perfiles').update({ nombre: 'Vincenzo', estudio: 'Estudio Prueba', limite_diario: 4 }).eq('id', perfA.id)

// importar los 50 prospectos reales (mismo mapeo que el front)
const csv = Papa.parse(fs.readFileSync(new URL('../../datos/prospectos_mendoza.csv', import.meta.url), 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data
const filas = csv.map(r => ({ nombre: r['Nombre'], rubro: r['Rubro'], direccion: r['Dirección'], telefono: r['Teléfono'], instagram: r['Instagram'],
  que_tiene_hoy: r['Qué tiene hoy en lugar de web'], web_actual: r['Link que figura como web en Google'], rating: r['Puntaje'], resenas: r['Reseñas Google'] }))
let { data: imp, error: eImp } = await sa.rpc('importar_prospectos', { filas, origen: 'csv' })
ok(!eImp && imp.insertados === 50, 'A importa 50 prospectos: ' + JSON.stringify(imp ?? eImp))
;({ data: imp } = await sa.rpc('importar_prospectos', { filas, origen: 'csv' }))
ok(imp.insertados === 0 && imp.duplicados === 50, 'reimportar: 0 nuevos, 50 duplicados')
const { error: eDup } = await sa.from('prospectos').insert({ nombre: 'Copia', telefono: '+54 9 261 553-2270' })
ok(eDup && eDup.message.includes('duplicate'), 'alta manual con teléfono repetido (otro formato) rechazada')

// aislamiento
const { count: cB } = await sb.from('prospectos').select('*', { count: 'exact', head: true })
ok(cB === 0, 'B no ve los prospectos de A')
const { data: pa } = await sa.from('prospectos').select('*').order('resenas', { ascending: false })
const { data: upd } = await sb.from('prospectos').update({ notas: 'hack' }).eq('id', pa[0].id).select()
ok(upd.length === 0, 'B no puede modificar prospectos de A')
const { error: eIntB } = await sb.from('interacciones').insert({ prospecto_id: pa[0].id, tipo: 'enviado' })
ok(eIntB, 'B no puede registrar envíos en prospectos de A')
const { error: eMsgB } = await sb.from('mensajes').insert({ prospecto_id: pa[0].id, tipo: 'whatsapp', cuerpo: 'x' })
ok(eMsgB, 'B no puede crear mensajes en prospectos de A')
const genB = await sb.functions.invoke('generar-mensajes', { body: { prospecto_ids: [pa[0].id] } })
const { count: cMsgA0 } = await sa.from('mensajes').select('*', { count: 'exact', head: true }).eq('prospecto_id', pa[0].id)
ok(cMsgA0 === 0, 'la función de B no genera nada sobre prospectos de A (' + JSON.stringify(genB.data?.resultados ?? genB.error?.message) + ')')

// Edge Function: generar borradores
const ids = pa.slice(0, 6).map(p => p.id)
const gen = await sa.functions.invoke('generar-mensajes', { body: { prospecto_ids: ids } })
ok(!gen.error && gen.data.ok, 'generar-mensajes responde: ' + JSON.stringify(gen.data ?? gen.error?.message).slice(0, 160))
const { data: msgs } = await sa.from('mensajes').select('*').in('prospecto_id', ids)
ok(msgs.length === 18, '3 borradores por prospecto (' + msgs.length + ')')
const wa = msgs.filter(m => m.tipo === 'whatsapp')
ok(wa.every(m => m.cuerpo.includes('Vincenzo') && m.cuerpo.includes('Estudio Prueba')), 'los borradores usan la firma del perfil')
ok(new Set(wa.map(m => m.cuerpo)).size === wa.length, 'no hay dos WhatsApp idénticos')
console.log('     ejemplo:', wa[0].cuerpo.slice(0, 220) + '…')
const sinAuth = await fetch(`${URL_}/functions/v1/generar-mensajes`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
ok(sinAuth.status === 401, 'la función rechaza llamadas sin sesión (' + sinAuth.status + ')')

// editar un borrador y regenerar sin forzar: no se pisa
const m0 = wa.find(m => m.prospecto_id === ids[0])
await sa.from('mensajes').update({ cuerpo: m0.cuerpo + ' (editado a mano)', editado: true }).eq('id', m0.id)
await sa.functions.invoke('generar-mensajes', { body: { prospecto_ids: [ids[0]] } })
const { data: m0b } = await sa.from('mensajes').select('cuerpo').eq('id', m0.id).single()
ok(m0b.cuerpo.endsWith('(editado a mano)'), 'regenerar no pisa un borrador editado')

// envío confirmado
const env = async (pid, mid) => sa.from('interacciones').insert({ prospecto_id: pid, mensaje_id: mid, tipo: 'enviado', canal: 'whatsapp' })
let r = await env(ids[0], m0.id)
ok(!r.error, 'registrar envío')
const { data: p0 } = await sa.from('prospectos').select('*').eq('id', ids[0]).single()
const hoyMza = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Mendoza' })
const esperado = new Date(new Date(hoyMza + 'T12:00Z').getTime() + 5 * 864e5).toISOString().slice(0, 10)
ok(p0.estado === 'contactado' && p0.proximo_seguimiento === esperado, `contactado y seguimiento ${p0.proximo_seguimiento} (esperado ${esperado})`)

// texto idéntico
const m1 = wa.find(m => m.prospecto_id === ids[1])
await sa.from('mensajes').update({ cuerpo: m0.cuerpo + ' (editado a mano)' }).eq('id', m1.id)
r = await env(ids[1], m1.id)
ok(r.error?.message.includes('TEXTO_REPETIDO'), 'bloquea texto idéntico a uno ya enviado')
await sa.from('mensajes').update({ cuerpo: m1.cuerpo }).eq('id', m1.id)
r = await env(ids[1], m1.id)
ok(!r.error, 'con texto propio sí se registra')

// opt-out
await sa.from('prospectos').update({ estado: 'no_interesado' }).eq('id', ids[2])
r = await env(ids[2], wa.find(m => m.prospecto_id === ids[2]).id)
ok(r.error?.message.includes('OPT_OUT'), 'opt-out bloquea envíos')
const g2 = await sa.functions.invoke('generar-mensajes', { body: { prospecto_ids: [ids[2]], forzar: true } })
ok(String(g2.data?.resultados?.[ids[2]]).includes('no interesado'), 'opt-out: no se generan más borradores')

// límite diario (4)
r = await env(ids[3], wa.find(m => m.prospecto_id === ids[3]).id); ok(!r.error, 'envío 3/4')
r = await env(ids[4], wa.find(m => m.prospecto_id === ids[4]).id); ok(!r.error, 'envío 4/4')
r = await env(ids[5], wa.find(m => m.prospecto_id === ids[5]).id)
ok(r.error?.message.includes('LIMITE_DIARIO'), 'el 5º envío del día se bloquea (límite 4)')

// respuesta y cliente
await sa.from('interacciones').insert({ prospecto_id: ids[1], tipo: 'respuesta', detalle: 'Le interesa' })
await sa.from('prospectos').update({ estado: 'cliente' }).eq('id', ids[3])
const { data: p1 } = await sa.from('prospectos').select('estado, proximo_seguimiento').eq('id', ids[1]).single()
ok(p1.estado === 'respondio' && p1.proximo_seguimiento === null, 'respuesta → respondió, sin seguimiento')

// historial inmutable
const { data: del } = await sa.from('interacciones').delete().eq('prospecto_id', ids[0]).select()
ok(del.length === 0, 'el historial no se puede borrar')

// tablero
const { data: t } = await sa.rpc('tablero')
ok(t.total === 50 && t.enviados_hoy === 4 && t.contactados === 4 && t.respondieron === 2 && t.clientes === 1 && t.por_estado.no_interesado === 1,
  'tablero: ' + JSON.stringify({ ...t, envios_7_dias: undefined }))
const { data: tB } = await sb.rpc('tablero')
ok(tB.total === 0 && tB.enviados_hoy === 0, 'tablero de B vacío')
const anon = await cliente().rpc('tablero')
ok(anon.error, 'sin sesión no se puede llamar al tablero')

// roles y equipo: una cuenta común no ve códigos ni equipo, ni puede hacerse admin
const { data: eq } = await sa.rpc('equipo')
ok(Array.isArray(eq) && eq.length === 0, 'una cuenta común no ve el equipo')
const { data: cods } = await sa.from('codigos_invitacion').select('*')
ok(cods.length === 0, 'una cuenta común no ve los códigos de invitación')
const { error: eIns } = await sa.from('codigos_invitacion').insert({ codigo: 'HACK-' + T })
ok(eIns, 'una cuenta común no puede crear códigos')
await sa.from('perfiles').update({ es_admin: true }).eq('id', perfA.id)
const { data: perfA2 } = await sa.from('perfiles').select('es_admin, codigo_invitacion').single()
ok(perfA2.es_admin === false, 'nadie puede darse rol de administrador')
ok(perfA2.codigo_invitacion === CODIGO, 'el perfil registra con qué código se dio de alta')

// estado de servicios y reescritura
const est = await sa.functions.invoke('generar-mensajes', { body: { modo: 'estado' } })
ok(est.data && typeof est.data.ia === 'boolean', 'estado de servicios: ' + JSON.stringify(est.data))
const re = await sa.functions.invoke('generar-mensajes', { body: { modo: 'reescribir', prospecto_id: ids[4], tipo: 'whatsapp', cuerpo: 'Hola', instruccion: 'Más corto' } })
let reMsg = re.data?.cuerpo ? 'reescrito' : re.data?.error; try { reMsg = reMsg || (await re.error.context.json()).error } catch {}
ok(est.data?.ia ? re.data?.cuerpo?.length > 0 : /ANTHROPIC_API_KEY/.test(reMsg), 'reescribir: ' + String(reMsg).slice(0, 90))

// Asistente IA
const errDe = async r => { let m = r.data?.error; try { m = m || (await r.error.context.json()).error } catch {} ; return m }
const cu = await sa.functions.invoke('asistente', { body: { modo: 'cupo' } })
ok(cu.data?.cupo?.limite > 0 && cu.data.cupo.usados === 0, 'asistente: cupo diario ' + JSON.stringify(cu.data?.cupo))
const vacio = await sa.functions.invoke('asistente', { body: { mensaje: '   ' } })
ok(/Escribí una pregunta/.test(await errDe(vacio)), 'asistente: rechaza mensaje vacío')
const largo = await sa.functions.invoke('asistente', { body: { mensaje: 'x'.repeat(8001) } })
ok(/muy largo/.test(await errDe(largo)), 'asistente: rechaza mensajes enormes')
const sinAuthIA = await fetch(URL_ + '/functions/v1/asistente', { method: 'POST', headers: { apikey: KEY, 'content-type': 'application/json' }, body: '{}' })
ok(sinAuthIA.status === 401, "asistente: sin sesión no responde")
const preg = await sa.functions.invoke('asistente', { body: { mensaje: '¿Cuántos prospectos tengo?' } })
if (cu.data?.ia) {
  ok(preg.data?.respuesta?.length > 0 && preg.data.cupo.usados === 1, 'asistente responde con Claude y descuenta 1 del cupo')
  const { data: ms } = await sa.from('chat_mensajes').select('rol').eq('conversacion_id', preg.data.conversacion_id)
  ok(ms?.length === 2, 'guarda la pregunta y la respuesta')
  const { data: ajenos } = await sb.from('chat_mensajes').select('id').eq('conversacion_id', preg.data.conversacion_id)
  ok(ajenos?.length === 0, 'otro usuario no ve esa conversación')
} else {
  ok(/clave de Claude/.test(await errDe(preg)), 'asistente sin clave: lo explica')
  const { data: convs } = await sa.from('chat_conversaciones').select('id')
  ok(convs?.length === 0, 'sin clave no deja conversaciones vacías ni gasta cupo')
}
const { error: insErr } = await sa.from('chat_mensajes').insert({ conversacion_id: '00000000-0000-0000-0000-000000000000', rol: 'user', contenido: 'trampa' })
ok(!!insErr, 'el navegador no puede escribir mensajes del asistente')

// buscar-places sin key → error claro
const bp = await sa.functions.invoke('buscar-places', { body: { rubro: 'barbería', zona: 'Godoy Cruz' } })
let bpMsg = bp.data?.error; try { bpMsg = bpMsg || (await bp.error.context.json()).error } catch {}
console.log('     buscar-places:', bp.data?.resultados ? `${bp.data.resultados.length} resultados` : bpMsg)

console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
