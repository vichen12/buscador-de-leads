import { PGlite } from '@electric-sql/pglite'
import fs from 'fs'

const db = new PGlite()
const ok = (c, m) => { if (!c) { console.error('FALLA:', m); process.exitCode = 1 } else console.log('ok -', m) }

// --- stub mínimo de Supabase (auth.users, auth.uid(), rol authenticated)
await db.exec(`
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{"alta_admin": true}', last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated; create role anon; create role service_role bypassrls;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
`)
for (const f of fs.readdirSync(new URL('../../supabase/migrations', import.meta.url).pathname).sort()) await db.exec(fs.readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url).pathname, 'utf8'))
await db.exec(`grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on schema public to service_role; grant all on all tables in schema public to service_role;`)

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users (id, email) values ('${A}', 'a@x.com'), ('${B}', 'b@x.com');`)
ok((await db.query('select count(*)::int c from perfiles')).rows[0].c === 2, 'perfiles creados por trigger')

const as = async (uid, sql, params) => {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role;') }
}

// normalizar teléfono
const n = async t => (await db.query('select normalizar_telefono($1) n', [t])).rows[0].n
ok(await n('0261 15-555-1234') === '2615551234', '0261 15-555-1234')
ok(await n('+54 9 261 555-1234') === '2615551234', '+54 9 261 555-1234')
ok(await n('02613606058') === '2613606058', '02613606058')
ok(await n('0262215555125') === '2622555125', '02622 15 555125')

// importar con dedupe
const filas = [
  { nombre: 'Barbería Uno', telefono: '0261 15-555-1234', direccion: 'Calle 1' },
  { nombre: 'Barbería Uno bis', telefono: '+54 9 261 555 1234', direccion: 'Otra' }, // dup tel
  { nombre: 'Estética Dos', telefono: '', direccion: 'San Martín 100' },
  { nombre: 'ESTÉTICA DOS', telefono: '', direccion: 'San Martin 100' },              // dup nombre+dir
  { nombre: '', telefono: '123' },                                                     // inválido
  { nombre: 'Pilates Tres', telefono: '0261 423-4567', rating: '4,8', resenas: '120 reseñas' },
]
let r = (await as(A, 'select importar_prospectos($1::jsonb) r', [JSON.stringify(filas)])).rows[0].r
ok(r.insertados === 3 && r.duplicados === 2 && r.invalidos === 1, 'importar: ' + JSON.stringify(r))
r = (await as(A, 'select importar_prospectos($1::jsonb) r', [JSON.stringify(filas)])).rows[0].r
ok(r.insertados === 0 && r.duplicados === 5, 'reimportar no duplica')

// aislamiento entre cuentas
ok((await as(B, 'select count(*)::int c from prospectos')).rows[0].c === 0, 'B no ve prospectos de A')
r = (await as(B, 'select importar_prospectos($1::jsonb) r', [JSON.stringify(filas.slice(0, 1))])).rows[0].r
ok(r.insertados === 1, 'B puede tener el mismo negocio (dedupe es por cuenta)')
const pA = (await as(A, "select id from prospectos where nombre = 'Barbería Uno'")).rows[0].id
const upd = await as(B, `update prospectos set notas = 'hack' where id = '${pA}'`)
ok(upd.affectedRows === 0, 'B no puede modificar prospectos de A')
let err = null
try { await as(B, `insert into interacciones (prospecto_id, tipo) values ('${pA}', 'enviado')`) } catch (e) { err = e.message }
ok(err, 'B no puede registrar interacciones en prospectos de A')

// mensajes + envío
const ids = (await as(A, 'select id, nombre from prospectos order by nombre')).rows
const m1 = (await as(A, `insert into mensajes (prospecto_id, tipo, cuerpo) values ('${ids[0].id}', 'whatsapp', 'Hola A') returning id`)).rows[0].id
const m2 = (await as(A, `insert into mensajes (prospecto_id, tipo, cuerpo) values ('${ids[1].id}', 'whatsapp', 'Hola A') returning id`)).rows[0].id
await as(A, `insert into interacciones (prospecto_id, mensaje_id, tipo, canal) values ('${ids[0].id}', '${m1}', 'enviado', 'whatsapp')`)
let p = (await as(A, `select estado, proximo_seguimiento - (now() at time zone 'America/Argentina/Mendoza')::date d from prospectos where id = '${ids[0].id}'`)).rows[0]
ok(p.estado === 'contactado' && p.d === 5, 'envío -> contactado y seguimiento a 5 días')
err = null
try { await as(A, `insert into interacciones (prospecto_id, mensaje_id, tipo) values ('${ids[1].id}', '${m2}', 'enviado')`) } catch (e) { err = e.message }
ok(err && err.includes('TEXTO_REPETIDO'), 'bloquea texto idéntico: ' + err)

// respuesta
await as(A, `insert into interacciones (prospecto_id, tipo) values ('${ids[0].id}', 'respuesta')`)
p = (await as(A, `select estado, proximo_seguimiento from prospectos where id = '${ids[0].id}'`)).rows[0]
ok(p.estado === 'respondio' && p.proximo_seguimiento === null, 'respuesta -> respondio, sin seguimiento')

// opt-out
await as(A, `update prospectos set estado = 'no_interesado' where id = '${ids[1].id}'`)
err = null
try { await as(A, `insert into interacciones (prospecto_id, tipo) values ('${ids[1].id}', 'enviado')`) } catch (e) { err = e.message }
ok(err && err.includes('OPT_OUT'), 'opt-out bloquea envíos')

// límite diario
await as(A, `update perfiles set limite_diario = 2 where id = '${A}'`)
await as(A, `insert into interacciones (prospecto_id, tipo) values ('${ids[2].id}', 'enviado')`)
err = null
try { await as(A, `insert into interacciones (prospecto_id, tipo) values ('${ids[2].id}', 'enviado')`) } catch (e) { err = e.message }
ok(err && err.includes('LIMITE_DIARIO'), 'límite diario: ' + err)

// historial inmutable
const del = await as(A, `delete from interacciones`)
ok(del.affectedRows === 0, 'no se puede borrar el historial')

// tablero
const t = (await as(A, 'select tablero() t')).rows[0].t
ok(t.total === 3 && t.enviados_hoy === 2 && t.contactados === 2 && t.respondieron === 1 && t.envios_7_dias.length === 7, 'tablero ' + JSON.stringify(t))
const tB = (await as(B, 'select tablero() t')).rows[0].t
ok(tB.total === 1 && tB.enviados_hoy === 0, 'tablero de B aislado')

// ---------- Super admin, empresas y claves ----------
const S = '33333333-3333-3333-3333-333333333333', C = '44444444-4444-4444-4444-444444444444'
await db.exec(`insert into auth.users (id, email) values ('${S}', 'super@x.com');
update perfiles set es_admin = true where id = '${S}';`)
let e2 = null
try { await as(A, 'select * from admin_empresas()') } catch (e) { e2 = e.message }
ok(e2 && e2.includes('SOLO_ADMIN'), 'una cuenta común no puede usar funciones de super admin')
const emp = (await as(S, `select admin_guardar_empresa(null, 'Agencia Sur', 'sur@x.com', '', true) id`)).rows[0].id
await as(S, `insert into codigos_invitacion (codigo, empresa_id, usos_max) values ('SUR-1', '${emp}', 2)`)
const asSR = async sql => { await db.exec('set role service_role;'); try { return await db.query(sql) } finally { await db.exec('reset role;') } }
let can = (await asSR(`select canjear_codigo('SUR-1') r`)).rows[0].r
ok(can.ok && can.empresa_id === emp, 'canjear código devuelve la empresa')
await db.exec(`insert into auth.users (id, email, raw_app_meta_data) values ('${C}', 'c@x.com', '{"alta_admin": true, "empresa_id": "${emp}"}')`)
ok((await db.query(`select empresa_id from perfiles where id = '${C}'`)).rows[0].empresa_id === emp, 'alta por el admin: el perfil queda en su empresa')
// Registro por cuenta propia (sin pasar por el admin): nace sin acceso, aunque mande una empresa en sus metadatos
const X = '55555555-5555-5555-5555-555555555555'
await db.exec(`insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values ('${X}', 'intruso@x.com', '{"empresa_id": "${emp}"}', '{}')`)
const px = (await db.query(`select activo, empresa_id from perfiles where id = '${X}'`)).rows[0]
ok(px.activo === false && px.empresa_id === null, 'registro por fuera del admin: la cuenta nace sin acceso ni empresa')
ok((await as(X, 'select mi_acceso() a')).rows[0].a.habilitado === false, 'y ve la pantalla de cuenta suspendida')
let ex = null; try { await as(X, `select importar_prospectos('[{"nombre":"Intruso"}]'::jsonb)`) } catch (e) { ex = e.message }
ok((await as(X, 'select count(*)::int c from prospectos')).rows[0].c === 0, 'y no puede cargar ni ver datos')
await as(C, `select importar_prospectos('[{"nombre":"Negocio de C","telefono":"0261 15-111-2222"}]'::jsonb)`)
ok((await as(C, 'select count(*)::int c from prospectos')).rows[0].c === 1, 'C opera normalmente')
await as(C, `update perfiles set activo = false, empresa_id = null, es_admin = true where id = '${C}'`)
const pc = (await db.query(`select activo, empresa_id, es_admin from perfiles where id = '${C}'`)).rows[0]
ok(pc.activo === true && pc.empresa_id === emp && pc.es_admin === false, 'un usuario no puede cambiarse empresa, estado ni rol')
await as(S, `select admin_guardar_empresa('${emp}', 'Agencia Sur', 'sur@x.com', '', false)`)
ok((await as(C, 'select count(*)::int c from prospectos')).rows[0].c === 0, 'empresa suspendida: no ve sus datos')
err = null; try { await as(C, `insert into prospectos (nombre) values ('x')`) } catch (e) { err = e.message }
ok(err, 'empresa suspendida: no puede cargar datos')
can = (await asSR(`select canjear_codigo('SUR-1') r`)).rows[0].r
ok(!can.ok && can.motivo === 'empresa', 'empresa suspendida: sus códigos no sirven para registrarse')
ok((await as(C, 'select mi_acceso() a')).rows[0].a.habilitado === false, 'mi_acceso informa la suspensión')
await as(S, `select admin_guardar_empresa('${emp}', 'Agencia Sur', 'sur@x.com', '', true)`)
ok((await as(C, 'select count(*)::int c from prospectos')).rows[0].c === 1, 'empresa reactivada: vuelve a ver sus datos')
await as(S, `select admin_actualizar_usuario('${C}', false, '${emp}')`)
ok((await as(C, 'select count(*)::int c from prospectos')).rows[0].c === 0, 'usuario suspendido: no ve sus datos')
await as(S, `select admin_actualizar_usuario('${C}', true, '${emp}')`)
const emps = (await as(S, 'select * from admin_empresas()')).rows
ok(emps.find(x => x.id === emp)?.usuarios === 1 && emps.find(x => x.id === emp)?.prospectos === 1, 'admin_empresas cuenta usuarios y prospectos')
ok((await as(S, 'select count(*)::int c from admin_usuarios()')).rows[0].c >= 4, 'admin_usuarios lista todas las cuentas')
await as(S, `select admin_guardar_clave('anthropic', 'sk-ant-prueba-1234')`)
const ec = (await as(S, `select * from admin_estado_claves() where nombre = 'anthropic'`)).rows[0]
ok(ec.configurada && ec.final === '1234', 'clave guardada; el panel sólo ve los últimos 4')
ok((await as(S, 'select count(*)::int c from config_claves')).rows[0].c === 0, 'ni el super admin puede leer la clave desde el navegador')
ok((await asSR(`select valor from config_claves where nombre = 'anthropic'`)).rows[0].valor === 'sk-ant-prueba-1234', 'las funciones del servidor sí la leen')
err = null; try { await as(S, `select admin_actualizar_usuario('${S}', false, null)`) } catch (e) { err = e.message }
ok(err, 'el super admin no puede suspenderse a sí mismo')

// ---------- Asistente IA ----------
const cupo = async u => (await as(u, 'select mi_cupo_chat() c')).rows[0].c
ok((await cupo(C)).limite === 30 && (await cupo(C)).usados === 0, 'asistente: límite por defecto 30 por día')
await as(S, `select admin_guardar_clave('limite_chat', '5')`)
ok((await cupo(C)).limite === 5, 'el super admin cambia el límite general')
await as(S, `select admin_limite_chat('${C}', 2)`)
ok((await cupo(C)).limite === 2, 'y el límite propio de un usuario')
err = null; try { await as(C, `update perfiles set limite_chat = 999 where id = '${C}'`) } catch (e) { err = e.message }
ok((await cupo(C)).limite === 2, 'un usuario no puede subirse su propio límite')
await asSR(`insert into chat_uso (owner_id) values ('${C}'), ('${C}')`)
ok((await cupo(C)).usados === 2, 'cuenta el uso de hoy')
const conv = (await as(C, `insert into chat_conversaciones (titulo) values ('Prueba') returning id`)).rows[0].id
err = null; try { await as(C, `insert into chat_mensajes (conversacion_id, rol, contenido) values ('${conv}', 'user', 'hola')`) } catch (e) { err = e.message }
ok(err, 'los mensajes del chat sólo los escribe el servidor')
await asSR(`insert into chat_mensajes (conversacion_id, owner_id, rol, contenido) values ('${conv}', '${C}', 'user', 'hola')`)
ok((await as(C, 'select count(*)::int c from chat_mensajes')).rows[0].c === 1, 'el dueño lee sus mensajes')
ok((await as(S, 'select count(*)::int c from chat_mensajes')).rows[0].c === 0 && (await as(S, 'select count(*)::int c from chat_conversaciones')).rows[0].c === 0, 'nadie más los ve (ni el admin)')
await as(C, `delete from chat_conversaciones where id = '${conv}'`)
ok((await cupo(C)).usados === 2, 'borrar conversaciones no devuelve el cupo')
err = null; try { await as(C, `delete from chat_uso`) ; } catch (e) { err = e.message }
ok((await cupo(C)).usados === 2, 'el uso no se puede borrar desde el navegador')
err = null; try { await as(C, `select cupo_chat('${S}')`) } catch (e) { err = e.message }
ok(err, 'no se puede consultar el cupo de otro')
const uso = (await as(S, 'select * from admin_uso_chat()')).rows.find(r => r.id === C)
ok(uso?.usados_hoy === 2 && uso?.limite === 2 && uso?.limite_propio === 2, 'admin_uso_chat muestra uso y límites')
err = null; try { await as(C, 'select * from admin_uso_chat()') } catch (e) { err = e.message }
ok(err, 'sólo el super admin ve el uso de todos')
