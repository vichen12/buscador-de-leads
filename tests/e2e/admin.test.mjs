// Prueba de interfaz del panel de Super admin.
// La cuenta de prueba es común: para no darle permisos reales, las respuestas de admin se simulan
// (las reglas reales de la base se prueban en tests/sql y tests/e2e/backend.test.mjs).
// Uso: APP_URL=http://localhost:4173 CODIGO_INVITACION=... node admin.test.mjs
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')

const APP = process.env.APP_URL || 'http://localhost:4173'
const CODIGO = process.env.CODIGO_INVITACION
const SHOTS = process.env.SHOTS || '/tmp'
let fallas = 0
const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FALLA- ') + m); if (!c) fallas++ }
const errores = []

const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => errores.push(e.message))
const ver = async (t, timeout = 10000) => page.getByText(t, { exact: false }).first().waitFor({ timeout }).then(() => true).catch(() => false)

// 1. Alta real de una cuenta común
await page.goto(APP)
await page.getByRole('button', { name: 'Crear una' }).click()
await page.getByLabel('Tu nombre').fill('Admin UI')
await page.getByLabel('Código de invitación').fill(CODIGO)
await page.getByLabel('Email').fill(`prospecta.admin.${Date.now()}@example.com`)
await page.locator('input[autocomplete$=password]').fill('Prueba-Admin-2026!')
await page.getByRole('button', { name: 'Crear cuenta' }).click()
ok(await ver('Todavía no cargaste prospectos', 20000), 'cuenta creada')
const miId = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.endsWith('-auth-token')))).user.id)

// 2. Simulación del backend de admin
const E1 = '11111111-1111-1111-1111-111111111111', E2 = '22222222-2222-2222-2222-222222222222'
const estado = {
  empresas: [
    { id: E1, nombre: 'Estudio Andes', contacto: 'Laura', notas: '', activa: true, creada: '2026-10-01', usuarios: 3, prospectos: 120, enviados: 40, clientes: 4, codigos_activos: 1 },
    { id: E2, nombre: 'Agencia Cuyo', contacto: '', notas: 'Debe noviembre', activa: false, creada: '2026-09-15', usuarios: 1, prospectos: 30, enviados: 5, clientes: 0, codigos_activos: 0 },
  ],
  usuarios: [
    { id: miId, nombre: 'Admin UI', email: 'yo@x.com', empresa_id: E1, empresa: 'Estudio Andes', es_admin: true, activo: true, creado: '2026-10-01', ultimo_ingreso: '2026-10-29T12:00:00Z', prospectos: 0, enviados: 0, clientes: 0 },
    { id: 'u2', nombre: 'Marta Vendedora', email: 'marta@x.com', empresa_id: E1, empresa: 'Estudio Andes', es_admin: false, activo: true, creado: '2026-10-02', ultimo_ingreso: null, prospectos: 60, enviados: 20, clientes: 2 },
  ],
  codigos: [{ codigo: 'MZA-ANDES001', descripcion: 'equipo', usos: 2, usos_max: 10, activo: true, created_at: '2026-10-01', empresa_id: E1 }],
  claves: [{ nombre: 'anthropic', configurada: false, final: null, actualizado: null }, { nombre: 'google_places', configurada: false, final: null, actualizado: null }, { nombre: 'modelo_ia', configurada: false, final: null, actualizado: null }, { nombre: 'limite_chat', configurada: false, final: null, actualizado: null }],
  usoChat: [{ id: 'u2', limite_propio: null, limite: 30, usados_hoy: 7, usados_mes: 40 }],
}
const llamadas = []
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/rest/v1/perfiles*', async route => {
  const r = await route.fetch(); const body = await r.json()
  json(route, Array.isArray(body) ? body.map(p => ({ ...p, es_admin: true })) : { ...body, es_admin: true })
})
await page.route('**/rest/v1/rpc/**', async route => {
  const fn = route.request().url().split('/rpc/')[1].split('?')[0]
  const args = route.request().postDataJSON() ?? {}
  if (fn === 'mi_acceso') return json(route, { activo: true, es_admin: true, empresa: 'Estudio Andes', empresa_activa: true, habilitado: estado.suspendido ? false : true })
  if (!fn.startsWith('admin_')) return route.continue()
  llamadas.push({ fn, args })
  if (fn === 'admin_empresas') return json(route, estado.empresas)
  if (fn === 'admin_usuarios') return json(route, estado.usuarios)
  if (fn === 'admin_estado_claves') return json(route, estado.claves)
  if (fn === 'admin_uso_chat') return json(route, estado.usoChat)
  if (fn === 'admin_limite_chat') { const u = estado.usoChat.find(x => x.id === args.p_id); if (u) Object.assign(u, { limite_propio: args.p_limite, limite: args.p_limite ?? 30 }); return json(route, null) }
  if (fn === 'admin_guardar_empresa') {
    if (!args.p_id) { const id = '33333333-3333-3333-3333-333333333333'; estado.empresas.unshift({ id, nombre: args.p_nombre, contacto: args.p_contacto, notas: args.p_notas, activa: true, creada: '2026-10-30', usuarios: 0, prospectos: 0, enviados: 0, clientes: 0, codigos_activos: 0 }); return json(route, id) }
    const e = estado.empresas.find(x => x.id === args.p_id); Object.assign(e, { nombre: args.p_nombre, activa: args.p_activa }); return json(route, e.id)
  }
  if (fn === 'admin_actualizar_usuario') { const u = estado.usuarios.find(x => x.id === args.p_id); Object.assign(u, { activo: args.p_activo, empresa_id: args.p_empresa }); return json(route, null) }
  if (fn === 'admin_guardar_clave') {
    const c = estado.claves.find(x => x.nombre === args.p_nombre)
    Object.assign(c, args.p_valor ? { configurada: true, final: args.p_nombre === 'modelo_ia' ? args.p_valor : args.p_valor.slice(-4), actualizado: new Date().toISOString() } : { configurada: false, final: null })
    estado.ia = estado.claves[0].configurada
    return json(route, null)
  }
  json(route, null)
})
await page.route('**/rest/v1/codigos_invitacion*', async route => {
  const req = route.request()
  if (req.method() === 'GET') return json(route, estado.codigos)
  if (req.method() === 'POST') { const fila = req.postDataJSON(); llamadas.push({ fn: 'insert_codigo', args: fila }); estado.codigos.unshift({ usos: 0, activo: true, created_at: '2026-10-30', ...fila }); return route.fulfill({ status: 201, body: '' }) }
  if (req.method() === 'PATCH') { const c = estado.codigos.find(x => req.url().includes(x.codigo)); Object.assign(c, req.postDataJSON()); return route.fulfill({ status: 204, body: '' }) }
  route.continue()
})
await page.route('**/functions/v1/generar-mensajes', async route => {
  const args = route.request().postDataJSON() ?? {}
  if (args.modo === 'estado') return json(route, { ia: !!estado.ia, modelo: estado.ia ? (estado.claves[2].final || 'claude-sonnet-5-5') : null, places: false })
  route.continue()
})

// 3. Panel
await page.reload()
await page.locator('nav').getByRole('link', { name: 'Super admin' }).waitFor({ timeout: 10000 }).catch(() => {})
ok(await page.locator('nav').getByRole('link', { name: 'Super admin' }).count() === 1, 'el admin ve "Super admin" en el menú')
await page.locator('nav').getByRole('link', { name: 'Super admin' }).click()
ok(await ver('Dás de alta empresas'), 'abre el panel de Super admin')
await page.waitForTimeout(900)
const resumen = (await page.locator('.resumen-admin').innerText()).replace(/\s+/g, ' ')
ok(/Empresas activas 1 de 2/.test(resumen) && /Prospectos 150/.test(resumen) && /Sin clave/.test(resumen), 'resumen: ' + resumen)
ok(await page.locator('.empresa').count() === 2 && await page.locator('.empresa.suspendida').count() === 1, 'muestra las empresas y marca la suspendida')
await page.screenshot({ path: `${SHOTS}/admin_empresas.png` })

// Nueva empresa → invitación
await page.getByRole('button', { name: 'Nueva empresa' }).click()
await page.getByLabel('Nombre').fill('Inmobiliaria Sol')
await page.getByLabel('Contacto').fill('Pedro 261 555')
await page.getByRole('button', { name: 'Crear empresa' }).click()
ok(await ver('Invitación lista para Inmobiliaria Sol'), 'crear empresa ofrece la invitación')
const insert = llamadas.find(l => l.fn === 'insert_codigo')
ok(insert?.args.empresa_id === '33333333-3333-3333-3333-333333333333' && /^MZA-[A-Z2-9]{8}$/.test(insert.args.codigo), 'el código queda atado a la empresa nueva')
ok((await page.getByLabel('Link').inputValue()).endsWith('/?invitacion=' + insert.args.codigo), 'muestra el link de invitación')
await page.getByRole('dialog').getByRole('button', { name: 'Cerrar' }).click()
ok(await page.locator('.empresa').count() === 3, 'la empresa nueva aparece en la grilla')

// Suspender con confirmación
await page.getByRole('switch', { name: 'Suspender Estudio Andes' }).click()
ok(await ver('¿Suspender a Estudio Andes?'), 'suspender pide confirmación')
await page.getByRole('button', { name: 'Suspender', exact: true }).click()
await page.waitForTimeout(500)
ok(llamadas.some(l => l.fn === 'admin_guardar_empresa' && l.args.p_id === E1 && l.args.p_activa === false), 'suspende la empresa (p_activa=false)')
ok(await page.locator('.empresa.suspendida').count() === 2, 'queda marcada como suspendida')
await page.getByRole('switch', { name: 'Habilitar Agencia Cuyo' }).click()
await page.waitForTimeout(500)
ok(llamadas.some(l => l.fn === 'admin_guardar_empresa' && l.args.p_id === E2 && l.args.p_activa === true), 'habilitar es directo, sin confirmación')

// Usuarios
await page.getByRole('tab', { name: /Usuarios/ }).click()
ok(await ver('Marta Vendedora'), 'lista de usuarios')
ok(await page.getByRole('switch', { name: 'Suspender a Admin UI' }).isDisabled(), 'no te podés suspender a vos mismo')
await page.getByLabel('Empresa de Marta Vendedora').selectOption(E2)
await page.waitForTimeout(400)
ok(llamadas.some(l => l.fn === 'admin_actualizar_usuario' && l.args.p_id === 'u2' && l.args.p_empresa === E2), 'mover usuario de empresa')
ok(await ver('7 / 30'), 'muestra el uso del asistente de cada usuario')
await page.getByLabel('Límite del asistente de Marta Vendedora').fill('50')
await page.getByLabel('Límite del asistente de Marta Vendedora').press('Enter')
await page.waitForTimeout(400)
ok(llamadas.some(l => l.fn === 'admin_limite_chat' && l.args.p_id === 'u2' && l.args.p_limite === 50), 'pone un límite propio del asistente a un usuario')
ok(await ver('7 / 50'), 'el límite nuevo se refleja')
await page.getByRole('switch', { name: 'Suspender a Marta Vendedora' }).click()
await page.getByRole('button', { name: 'Suspender', exact: true }).click()
await page.waitForTimeout(400)
ok(llamadas.some(l => l.fn === 'admin_actualizar_usuario' && l.args.p_id === 'u2' && l.args.p_activo === false), 'suspender usuario')

// Invitaciones
await page.getByRole('tab', { name: /Invitaciones/ }).click()
ok(await ver('MZA-ANDES001'), 'lista de códigos con su empresa')
await page.getByRole('button', { name: 'Nueva invitación' }).click()
await page.getByLabel('Empresa de la invitación').selectOption({ label: 'Agencia Cuyo' })
await page.getByLabel('Usos máximos').fill('3')
await page.getByRole('button', { name: 'Crear invitación' }).click()
await page.waitForTimeout(400)
ok(llamadas.some(l => l.fn === 'insert_codigo' && l.args.empresa_id === E2 && l.args.usos_max === 3), 'crea invitación para la empresa elegida')

// Claves
await page.getByRole('tab', { name: /Claves/ }).click()
ok(await ver('Claude (Anthropic)'), 'pestaña de claves')
await page.getByLabel('Clave de Claude (Anthropic)').fill('mala-clave')
ok(await ver('suelen empezar con'), 'avisa si la clave no parece de Claude')
await page.getByLabel('Clave de Claude (Anthropic)').fill('sk-ant-api03-PRUEBA-abcd1234')
ok(await page.getByLabel('Clave de Claude (Anthropic)').getAttribute('type') === 'password', 'la clave se escribe oculta')
await page.locator('[data-clave=anthropic]').getByRole('button', { name: 'Guardar' }).click()
ok(await ver('Clave de Claude (Anthropic) guardada'), 'guarda la clave de Claude')
ok(llamadas.some(l => l.fn === 'admin_guardar_clave' && l.args.p_nombre === 'anthropic' && l.args.p_valor === 'sk-ant-api03-PRUEBA-abcd1234'), 'manda la clave al backend')
ok(await ver('termina en …1234'), 'después sólo muestra los últimos 4')
ok(await page.getByLabel('Clave de Claude (Anthropic)').inputValue() === '', 'el campo se vacía (no queda la clave en pantalla)')
ok(await ver('Claude: conectado'), 'el estado en vivo pasa a conectado')
ok(await page.locator('.ia-pill.on').count() === 1, 'el menú lateral muestra "Claude conectado"')
await page.getByLabel('Modelo de Claude').selectOption('claude-opus-5-5')
await page.getByRole('button', { name: 'Guardar modelo' }).click()
await page.waitForTimeout(400)
ok(llamadas.some(l => l.fn === 'admin_guardar_clave' && l.args.p_nombre === 'modelo_ia' && l.args.p_valor === 'claude-opus-5-5'), 'cambia el modelo')
await page.getByLabel('Límite diario del asistente').fill('20')
await page.getByRole('button', { name: 'Guardar límite' }).click()
await page.waitForTimeout(400)
ok(llamadas.some(l => l.fn === 'admin_guardar_clave' && l.args.p_nombre === 'limite_chat' && l.args.p_valor === '20'), 'cambia el límite general del asistente')
ok(await ver('20 consultas por día por usuario'), 'muestra el límite general nuevo')
await page.screenshot({ path: `${SHOTS}/admin_claves.png` })
await page.locator('[data-clave=anthropic]').getByRole('button', { name: 'Quitar' }).click()
await page.getByRole('button', { name: 'Quitar', exact: true }).last().click()
await page.waitForTimeout(400)
ok(llamadas.some(l => l.fn === 'admin_guardar_clave' && l.args.p_nombre === 'anthropic' && l.args.p_valor === ''), 'quitar la clave')

// 4. Pantalla de cuenta suspendida
estado.suspendido = true
await page.reload()
ok(await ver('Tu cuenta está suspendida') || await ver('Tu empresa está suspendida'), 'una cuenta suspendida ve la pantalla de suspensión')
await page.screenshot({ path: `${SHOTS}/admin_suspendido.png` })

// 5. Celular
await page.setViewportSize({ width: 390, height: 844 })
estado.suspendido = false
await page.goto(APP + '/admin')
await page.getByText('Dás de alta empresas').waitFor()
const ancho = await page.evaluate(() => document.documentElement.scrollWidth)
ok(ancho <= 392, `panel sin desborde horizontal en celular (${ancho}px)`)
await page.screenshot({ path: `${SHOTS}/admin_movil.png`, fullPage: true })

ok(!errores.length, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''))
await b.close()
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
