// Prueba de interfaz de punta a punta contra el Supabase real.
// Uso: APP_URL=http://localhost:4173 [TEST_UI=email] node ui.test.mjs
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')

const APP = process.env.APP_URL || 'http://localhost:4173'
import { prepararCuenta } from './cuentas.mjs'
const EMAIL = process.env.TEST_UI || 'prospecta.ui.1793330981106@example.com'
const CLAVES = ['Prueba-Interfaz-2026!', 'Prueba-Interfaz-2027!']
const PASS = await prepararCuenta(EMAIL, CLAVES, { nombre: 'Vincenzo UI' })
const PASS2 = CLAVES.find(c => c !== PASS) // la prueba cambia la contraseña a la otra
const CSV = new URL('../../datos/prospectos_mendoza.csv', import.meta.url).pathname
const SHOTS = process.env.SHOTS || '/tmp'
let fallas = 0
const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FALLA- ') + m); if (!c) fallas++ }
const errores = []

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
page.on('pageerror', e => errores.push(e.message))
page.on('console', m => { if (m.type() === 'error' && !/40[0-9]|Failed to load resource/.test(m.text())) errores.push(m.text()) })
const shot = n => page.screenshot({ path: `${SHOTS}/ui_${n}.png` })
const ver = async (t, timeout = 15000) => page.getByText(t, { exact: false }).first().waitFor({ timeout }).then(() => true).catch(() => false)
const nav = name => page.locator('nav').getByRole('link', { name })
const pass = () => page.locator('input[autocomplete$=password]')
const estadoSel = () => page.locator('.selector-estado')
const estadoActual = () => estadoSel().getAttribute('data-valor')

// 1. Login (el registro está cerrado: no hay "Crear una")
await page.goto(APP)
ok(await ver('Hola de nuevo'), 'pantalla de ingreso')
ok(await page.getByRole('button', { name: 'Crear una' }).count() === 0 && await page.getByText('Las cuentas las crea el administrador').count() === 1, 'no se puede crear una cuenta desde el login')
await page.getByLabel('Email').fill(EMAIL)
await pass().fill('Contraseña-Mala-123')
await page.getByRole('button', { name: 'Entrar' }).click()
ok(await ver('Email o contraseña incorrectos'), 'contraseña incorrecta rechazada')
await page.getByRole('button', { name: '¿Olvidaste tu contraseña?' }).click()
ok(await ver('Pedile al administrador'), 'olvido de contraseña: explica que la genera el admin')
await pass().fill(PASS)
await page.getByRole('button', { name: 'Entrar' }).click()
ok(await ver('Todavía no cargaste prospectos'), 'login OK → tablero vacío')
ok(await ver('Buenas'), 'saludo con el nombre')
await page.goto(APP + '/equipo')
ok(await ver('Todavía no cargaste prospectos'), 'una cuenta común no entra a Equipo (vuelve al tablero)')
await page.goto(APP + '/admin')
ok(await ver('Todavía no cargaste prospectos') && !(await page.getByText('Super admin').count()), 'una cuenta común no ve ni entra al Super admin')

// 2. Mi cuenta
await nav('Mi cuenta').click()
await page.getByLabel('Estudio').fill('Estudio UI')
await page.getByLabel('Límite diario de envíos').fill('3')
await page.getByRole('button', { name: 'Guardar cambios' }).click()
ok(await ver('Cambios guardados'), 'perfil guardado (toast)')
ok(await ver('0 / 3'), 'el cupo del menú refleja el nuevo límite')
ok(await ver('Sin clave de Claude') || await ver('Claude conectado'), 'muestra el estado de Claude')
await page.getByLabel('Nueva contraseña').fill(PASS2)
await page.getByLabel('Repetir').fill(PASS2)
await page.getByRole('button', { name: 'Actualizar contraseña' }).click()
ok(await ver('Contraseña actualizada'), 'cambio de contraseña')

// 3. Importar
await nav('Importar').click()
await page.setInputFiles('input[type=file]', CSV)
ok(await ver('50 filas'), 'lee el CSV (50 filas)')
await page.getByRole('button', { name: 'Revisar duplicados' }).click()
ok(await ver('Nuevo: 50'), 'detecta 50 nuevos')
await page.getByRole('button', { name: 'Importar 50' }).click()
ok(await ver('Se cargaron 50 prospectos'), '50 prospectos importados')

// 4. Listado, búsqueda, borradores
await page.getByRole('link', { name: /Ver prospectos y generar borradores/ }).click()
ok(await ver('50 de 50'), 'listado con 50')
await page.getByPlaceholder('Buscar nombre').fill('tattoo'); await page.waitForTimeout(300)
const nT = await page.locator('tbody tr').count()
ok(nT >= 3 && nT < 10, `búsqueda filtra (${nT})`)
await page.getByPlaceholder('Buscar nombre').fill('')
await page.getByLabel('Estado').selectOption('pendiente'); await page.waitForTimeout(300)
const checks = page.locator('tbody input[type=checkbox]')
for (let i = 0; i < 5; i++) await checks.nth(i).check()
await page.getByRole('button', { name: 'Generar borradores' }).click()
ok(await ver('Borradores listos para 5', 30000), 'genera borradores para 5 (toast)')
await shot('lista')

// 5. Pipeline: arrastrar una tarjeta a "Respondió"
await page.getByRole('button', { name: 'Pipeline', exact: true }).click()
await page.locator('.kanban-col').first().locator('.kcard').first().waitFor()
const tarjeta = page.locator('.kanban-col').nth(0).locator('.kcard').last()
const nombreArr = (await tarjeta.locator('b').innerText()).trim()
await tarjeta.dragTo(page.locator('.kanban-col').nth(2))
ok(await ver(`${nombreArr}: Respondió`), `drag & drop: "${nombreArr}" pasa a Respondió`)
ok(await page.locator('.kanban-col').nth(2).getByText(nombreArr).count() === 1, 'la tarjeta queda en la columna Respondió')
await shot('pipeline')
await page.getByRole('button', { name: 'Lista', exact: true }).click()

// 6. Detalle y envío confirmado x3 (límite 3)
await page.getByLabel('Estado').selectOption('')
await page.waitForFunction(() => document.querySelectorAll('tbody tr').length >= 50, null, { timeout: 15000 }).catch(async () => { await shot('falla_lista'); console.log('URL', page.url(), 'filas', await page.locator('tbody tr').count()) })
const filasWA = []
const filas = await page.locator('tbody tr').all()
for (let i = 0; i < filas.length && filasWA.length < 4; i++) {
  const tel = (await filas[i].locator('td').nth(2).innerText()).replace(/\D/g, '')
  const nombre = await filas[i].locator('a.fuerte').innerText()
  if (tel && !/^02614/.test(tel) && nombre !== nombreArr) filasWA.push(nombre)
}
const enviar = async nombre => {
  await nav('Prospectos').click()
  await page.getByPlaceholder('Buscar nombre').fill(nombre)
  await page.locator('tbody tr a.fuerte', { hasText: nombre }).first().click()
  const gen = page.getByRole('button', { name: /Regenerar|Generar borradores/ })
  await gen.waitFor()
  if ((await gen.innerText()).includes('Generar')) { await gen.click(); await page.getByRole('button', { name: 'Regenerar' }).waitFor({ timeout: 30000 }) }
  await page.waitForFunction(() => document.querySelector('textarea.editor')?.value.length > 50)
  const cuerpo = await page.locator('textarea.editor').inputValue()
  const btn = page.getByRole('button', { name: 'Abrir WhatsApp' })
  if (await btn.isDisabled()) return { nombre, cuerpo, deshabilitado: true }
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), btn.click()])
  const url = popup ? popup.url() : ''
  if (popup) await popup.close()
  await page.getByText('¿Enviaste el mensaje?').waitFor({ timeout: 8000 })
  await page.getByRole('button', { name: 'Sí, lo envié' }).click()
  await page.getByText('Envío registrado').first().waitFor({ timeout: 8000 })
  return { nombre, cuerpo, url }
}
const r1 = await enviar(filasWA[0])
ok(/wa\.me|whatsapp\.com/.test(r1.url) && r1.url.includes('text='), `abre WhatsApp con el texto (${r1.nombre})`)
ok(r1.cuerpo.includes('Estudio UI'), 'el borrador usa la firma de Mi cuenta')
ok(await ver('Mensaje enviado'), 'el envío aparece en el historial')
ok(await estadoActual() === 'contactado', 'queda como Contactado')
ok(await page.locator('.burbuja').count() === 1, 'vista previa estilo WhatsApp')
await shot('detalle')
ok(!!(await enviar(filasWA[1])).url, 'segundo envío')
ok(!!(await enviar(filasWA[2])).url, 'tercer envío')
ok(await ver('3 / 3'), 'cupo del día 3/3')
const r4 = await enviar(filasWA[3])
ok(r4.deshabilitado, 'con el cupo lleno, "Abrir WhatsApp" queda deshabilitado')
ok(await ver('Llegaste al límite de hoy'), 'avisa el límite')

// 7. Claude: reescribir (si no hay clave, lo explica)
const conIA = await page.locator('.rapidos').count()
if (conIA) {
  const antes = await page.locator('textarea.editor').inputValue()
  await page.getByRole('button', { name: 'Más corto' }).click()
  ok(await ver('Revisalo y guardalo', 40000), 'Claude reescribe el mensaje')
  ok((await page.locator('textarea.editor').inputValue()) !== antes, 'el texto cambió')
} else {
  ok(await ver('falta cargar la clave de Claude'), 'sin clave: explica cómo activar Claude')
}

// 8. Opt-out con modal
await page.getByRole('button', { name: 'No interesado', exact: true }).click()
ok(await ver('¿Marcar como no interesado?'), 'pide confirmación con un modal')
await page.getByRole('button', { name: 'Sí, marcar' }).click()
ok(await ver('fuera de toda secuencia'), 'banner de opt-out')
ok(await page.getByRole('button', { name: 'Regenerar' }).isDisabled(), 'ya no se puede generar ni enviar')

// 9. Respuesta y nota
await enviarA(r1.nombre)
async function enviarA(nombre) {
  await nav('Prospectos').click()
  await page.getByPlaceholder('Buscar nombre').fill(nombre)
  await page.locator('tbody tr a.fuerte', { hasText: nombre }).first().click()
  await page.getByRole('button', { name: 'Respondió', exact: true }).waitFor()
}
await page.getByRole('button', { name: 'Respondió', exact: true }).click()
ok(await page.waitForFunction(() => document.querySelector('.selector-estado')?.dataset.valor === 'respondio', null, { timeout: 10000 }).then(() => true).catch(() => false), 'registrar respuesta → Respondió')
// selector de estado con colores
await estadoSel().locator('> button').click()
ok(await page.locator('.selector-estado [role=option]').count() === 5, 'el selector de estado muestra los 5 estados')
await page.locator('.selector-estado [data-estado=cliente]').click()
ok(await page.waitForFunction(() => document.querySelector('.selector-estado')?.dataset.valor === 'cliente', null, { timeout: 10000 }).then(() => true).catch(() => false), 'selector de estado → Cliente')
await estadoSel().locator('> button').click()
await page.locator('.selector-estado [data-estado=respondio]').click()
ok(await page.waitForFunction(() => document.querySelector('.selector-estado')?.dataset.valor === 'respondio', null, { timeout: 10000 }).then(() => true).catch(() => false), 'y vuelve a Respondió')
await page.getByPlaceholder('Agregar una nota').fill('Pidió presupuesto para la semana que viene')
await page.getByRole('button', { name: 'Agregar' }).click()
ok(await ver('Pidió presupuesto'), 'nota en el historial')

// 10. Tablero
await nav('Tablero').click()
ok(await ver('Embudo'), 'tablero')
await page.waitForTimeout(1200) // los números suben animados
const kpis = (await page.locator('.kpi').allInnerTexts()).join(' | ')
ok(kpis.includes('50') && kpis.includes('3 / 3') && kpis.includes('%'), 'KPIs: ' + kpis.replace(/\n/g, ' '))
await shot('tablero')

// 11. Exportar
await nav('Prospectos').click(); await page.waitForSelector('tbody tr')
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar CSV' }).click()])
const csv = fs.readFileSync(await dl.path(), 'utf8')
ok(csv.trim().split('\n').length === 51 && csv.includes('No interesado') && csv.includes('Respondió'), 'CSV exportado con 50 filas y estados')

// 12. Seguimientos, Buscar, reimportar
await nav('Seguimientos').click()
ok(await ver('Próximos'), 'seguimientos con próximos agendados')
await nav('Buscar').click()
ok(await ver('Claude busca en la web negocios') && await page.getByRole('button', { name: 'Buscar con Claude' }).count() === 1, 'Buscar negocios usa Claude')
await nav('Importar').click()
await page.setInputFiles('input[type=file]', CSV)
await page.getByRole('button', { name: 'Revisar duplicados' }).click()
ok(await ver('Duplicado: 50'), 'reimportar: 50 duplicados')

// 13. Salir y entrar con la contraseña nueva
await page.getByRole('button', { name: 'Menú de la cuenta' }).click()
await page.getByRole('button', { name: 'Salir' }).click()
ok(await ver('Hola de nuevo'), 'cerrar sesión')
await page.getByLabel('Email').fill(EMAIL)
await pass().fill(PASS)
await page.getByRole('button', { name: 'Entrar' }).click()
ok(await ver('Email o contraseña incorrectos'), 'la contraseña vieja ya no sirve')
await pass().fill(PASS2)
await page.getByRole('button', { name: 'Entrar' }).click()
ok(await ver('Envíos de hoy'), 'entra con la contraseña nueva')

// 14. Celular
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(APP); await ver('Embudo')
const anchoDoc = await page.evaluate(() => document.documentElement.scrollWidth)
ok(anchoDoc <= 392, `en celular no hay scroll horizontal (${anchoDoc}px)`)
await shot('celular')

ok(errores.length === 0, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.slice(0, 3).join(' | ') : ''))
console.log('usuario de prueba:', EMAIL)
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
await b.close()
process.exit(fallas ? 1 : 0)
