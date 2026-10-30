// Prueba de interfaz del Asistente IA. La cuenta y la base son reales; las respuestas de Claude se simulan
// (para no depender de una clave ni gastar crédito). La función real se prueba en backend.test.mjs.
// Uso: APP_URL=http://localhost:4173 node asistente.test.mjs
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')
import { prepararCuenta } from './cuentas.mjs'

const APP = process.env.APP_URL || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || '/tmp'
let fallas = 0
const ok = (c, m) => { console.log((c ? 'ok   - ' : 'FALLA- ') + m); if (!c) fallas++ }
const errores = []

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
page.on('pageerror', e => errores.push(e.message))
const ver = async (t, timeout = 10000) => page.getByText(t, { exact: false }).first().waitFor({ timeout }).then(() => true).catch(() => false)

const EMAIL = process.env.TEST_EMAIL || 'prospecta.chat.1793330945945@example.com'
const PASS = await prepararCuenta(EMAIL, ['Prueba-Chat-2026!'], { nombre: 'Chat UI' })
await page.goto(APP)
await page.getByLabel('Email').fill(EMAIL)
await page.locator('input[autocomplete$=password]').fill(PASS)
await page.getByRole('button', { name: 'Entrar' }).click()
ok(await ver('Todavía no cargaste prospectos', 20000), 'login con la cuenta de prueba')

// Simulación de Claude y de lo que la función guardaría
const st = { cupo: { limite: 4, usados: 0 }, convs: [], msjs: {}, pedidos: [], falla: false }
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
await page.route('**/functions/v1/generar-mensajes', async r => (r.request().postDataJSON()?.modo === 'estado' ? json(r, { ia: true, modelo: 'claude-sonnet-5-5', places: false }) : r.continue()))
await page.route('**/functions/v1/asistente', async r => {
  const body = r.request().postDataJSON() ?? {}
  if (body.modo === 'cupo') return json(r, { cupo: st.cupo, ia: true })
  st.pedidos.push(body)
  await new Promise(res => setTimeout(res, 700))
  if (st.falla) return json(r, { error: 'Claude respondió con un error (529).' }, 502)
  if (st.cupo.usados >= st.cupo.limite) return json(r, { error: 'Llegaste al límite', codigo: 'LIMITE_CHAT' }, 429)
  let id = body.conversacion_id
  if (!id) { id = crypto.randomUUID(); st.convs.unshift({ id, titulo: (body.mensaje || 'PDF').slice(0, 60), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); st.msjs[id] = [] }
  const respuesta = body.pdf
    ? `## Qué hace la empresa\n**${body.pdf.nombre}** describe un estudio de diseño.\n\n- Servicio 1\n- Servicio 2`
    : `## Resumen de tu prospección\nTenés **0 prospectos** cargados.\n\n| Estado | Cantidad |\n|---|---|\n| Pendiente | 0 |\n| Cliente | 0 |\n\n<img src=x onerror="window.__xss=1">Próximo paso: importá tu CSV.`
  st.msjs[id].push({ id: crypto.randomUUID(), rol: 'user', contenido: body.mensaje || '(PDF adjunto)', adjunto: body.pdf?.nombre ?? null, created_at: new Date().toISOString() },
                   { id: crypto.randomUUID(), rol: 'assistant', contenido: respuesta, created_at: new Date().toISOString() })
  st.cupo = { ...st.cupo, usados: st.cupo.usados + 1 }
  json(r, { conversacion_id: id, respuesta, cupo: st.cupo })
})
await page.route('**/rest/v1/chat_conversaciones*', async r => {
  if (r.request().method() === 'GET') return json(r, st.convs)
  if (r.request().method() === 'DELETE') { const id = new URL(r.request().url()).searchParams.get('id').replace('eq.', ''); st.convs = st.convs.filter(c => c.id !== id); return r.fulfill({ status: 204, body: '' }) }
  r.continue()
})
await page.route('**/rest/v1/chat_mensajes*', async r => {
  const id = new URL(r.request().url()).searchParams.get('conversacion_id')?.replace('eq.', '')
  json(r, st.msjs[id] ?? [])
})

await page.reload()
await page.locator('nav').getByRole('link', { name: 'Asistente IA' }).click()
ok(await ver('¿En qué te ayudo, Chat?'), 'pantalla inicial del asistente con saludo')
ok(await ver('0 / 4'), 'muestra el cupo de consultas de hoy')
ok(await page.locator('.sugerencias button').count() >= 5, 'sugerencias de preguntas')
await page.screenshot({ path: `${SHOTS}/asistente_vacio.png` })

// 1. Pregunta con Enter
await page.getByLabel('Mensaje para el asistente').fill('¿Cómo vengo?')
await page.getByLabel('Mensaje para el asistente').press('Enter')
ok(await page.locator('.msj.usuario').filter({ hasText: '¿Cómo vengo?' }).count() === 1, 'la pregunta aparece al instante')
ok(await page.locator('.pensando').isVisible(), 'indicador de "pensando"')
ok(await ver('Resumen de tu prospección'), 'muestra la respuesta')
ok(await page.locator('.md h2').count() === 1 && await page.locator('.md table td').count() === 4, 'renderiza Markdown (título y tabla)')
await page.waitForTimeout(300)
ok(!(await page.evaluate(() => window.__xss)), 'el HTML peligroso de una respuesta se neutraliza')
ok(await ver('1 / 4'), 'el cupo baja a 1/4')
ok(await page.locator('.chat-conv').count() === 1 && await page.locator('.chat-conv.activa').count() === 1, 'la conversación aparece en la lista, activa')
ok(await page.locator('.msj').count() === 2, 'la conversación se recarga con sus 2 mensajes')

// 2. Seguir la misma conversación con una sugerencia de texto libre
await page.getByLabel('Mensaje para el asistente').fill('¿Y a quién le escribo hoy?')
await page.getByRole('button', { name: 'Enviar' }).click()
await page.waitForFunction(() => document.querySelectorAll('.msj.ia .md').length === 2, null, { timeout: 10000 })
ok(st.pedidos.at(-1).conversacion_id === st.convs[0].id, 'la segunda pregunta sigue en la misma conversación')
ok(await page.locator('.chat-conv').count() === 1, 'no crea una conversación nueva')

// 3. Exportar a PDF
const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Exportar PDF' }).click()])
await popup.waitForLoadState()
const pdfTxt = await popup.locator('body').innerText()
ok(/Prospecta/.test(pdfTxt) && /Resumen de tu prospección/.test(pdfTxt) && /¿Cómo vengo\?/.test(pdfTxt), 'Exportar PDF arma el documento con preguntas y respuestas')
ok(await popup.locator('table').count() >= 1, 'el PDF conserva las tablas')
await popup.close()
const [popup2] = await Promise.all([page.waitForEvent('popup'), page.locator('.msj.ia').first().getByRole('button', { name: 'PDF' }).click()])
await popup2.waitForLoadState()
ok(await popup2.locator('.respuesta').count() === 1, 'también se exporta una sola respuesta')
await popup2.close()

// 4. Adjuntar PDF en una conversación nueva
await page.getByRole('button', { name: 'Nueva conversación' }).click()
ok(await ver('¿En qué te ayudo'), 'nueva conversación vuelve a la pantalla inicial')
const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
await page.locator('input[type=file]').setInputFiles({ name: 'empresa.pdf', mimeType: 'application/pdf', buffer: pdf })
ok(await ver('empresa.pdf'), 'muestra el PDF adjunto antes de enviar')
await page.locator('input[type=file]').setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('x') })
ok(await ver('Sólo se pueden adjuntar PDFs'), 'rechaza archivos que no son PDF')
await page.getByLabel('Mensaje para el asistente').fill('¿Qué hace esta empresa?')
await page.getByLabel('Mensaje para el asistente').press('Enter')
ok(await ver('Qué hace la empresa'), 'responde sobre el PDF')
const conPdf = st.pedidos.at(-1)
ok(conPdf.pdf?.nombre === 'empresa.pdf' && Buffer.from(conPdf.pdf.base64, 'base64').toString().startsWith('%PDF') && !conPdf.conversacion_id, 'manda el PDF en base64 en una conversación nueva')
ok(await page.locator('.msj.usuario .adjunto').count() === 1, 'la pregunta muestra el adjunto')
ok(await page.locator('.chat-conv').count() === 2, 'ya hay 2 conversaciones')
await page.screenshot({ path: `${SHOTS}/asistente_chat.png` })

// 5. Error de Claude: no se pierde lo escrito
st.falla = true
await page.getByLabel('Mensaje para el asistente').fill('Pregunta que va a fallar')
await page.getByLabel('Mensaje para el asistente').press('Enter')
ok(await ver('Claude respondió con un error'), 'si Claude falla, avisa')
ok(await page.getByLabel('Mensaje para el asistente').inputValue() === 'Pregunta que va a fallar', 'y devuelve el texto a la caja para reintentar')
st.falla = false

// 6. Límite diario
await page.getByLabel('Mensaje para el asistente').press('Enter')
ok(await ver('4 / 4'), 'cupo 4/4')
ok(await ver('Llegaste al límite de 4 consultas de hoy'), 'avisa que llegó al límite')
ok(await page.getByLabel('Mensaje para el asistente').isDisabled(), 'con el cupo lleno no se puede preguntar')

// 7. Borrar conversación
await page.locator('.chat-conv').first().hover()
await page.locator('.chat-conv').first().locator('.borrar').click()
ok(await ver('¿Borrar esta conversación?'), 'borrar pide confirmación')
await page.getByRole('button', { name: 'Borrar', exact: true }).click()
await page.waitForTimeout(500)
ok(await page.locator('.chat-conv').count() === 1, 'la conversación se borra')

// 8. Buscar negocios con Claude (respuesta simulada; la importación es real)
await page.route('**/functions/v1/buscar-negocios', async r => {
  st.busqueda = r.request().postDataJSON()
  await new Promise(res => setTimeout(res, 800))
  json(r, { busquedas: 4, cupo: { limite: 4, usados: 4 }, resultados: [
    { id: 'ia-0', nombre: 'Barbería Prueba Uno ' + Date.now(), rubro: 'barbería', zona: 'Godoy Cruz', direccion: 'San Martín 100', telefono: '261 555-1234', instagram: 'https://www.instagram.com/barberiauno/', que_tiene_hoy: 'Instagram', web_actual: 'https://instagram.com/barberiauno', fuente: 'https://example.com/guia', nota: 'Mucho movimiento en Instagram', es_prospecto: true },
    { id: 'ia-1', nombre: 'Barbería Con Web ' + Date.now(), rubro: 'barbería', zona: 'Godoy Cruz', direccion: '', telefono: '', instagram: '', que_tiene_hoy: 'Dominio propio', web_actual: 'https://conweb.com.ar', fuente: '', nota: '', es_prospecto: false },
  ] })
})
await page.locator('nav').getByRole('link', { name: 'Buscar negocios' }).click()
await page.getByLabel('Rubro').fill('barbería')
await page.getByRole('button', { name: 'Buscar con Claude' }).click()
ok(await page.locator('.buscando').isVisible(), 'muestra el progreso mientras Claude busca')
ok(await ver('Mucho movimiento en Instagram'), 'lista los negocios con la nota de Claude')
ok(st.busqueda?.rubro === 'barbería' && st.busqueda?.zona === 'Godoy Cruz, Mendoza', 'manda rubro y zona')
ok(await page.locator('tbody input[type=checkbox]:checked').count() === 1, 'preselecciona sólo los que no tienen web propia')
await page.getByRole('button', { name: 'Importar 1' }).click()
ok(await ver('Importados 1'), 'importa el elegido a Prospectos')

// 9. Celular
await page.locator('nav').getByRole('link', { name: 'Asistente IA' }).click()
await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(400)
ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 392, 'sin desborde horizontal en celular')
await page.getByRole('button', { name: 'Ver conversaciones' }).click()
await page.waitForTimeout(400)
ok(await page.locator('.chat-lista.abierta').isVisible(), 'en celular las conversaciones se abren en un panel')
await page.screenshot({ path: `${SHOTS}/asistente_movil.png` })

ok(!errores.length, 'sin errores de JavaScript' + (errores.length ? ': ' + errores.join(' | ') : ''))
await b.close()
console.log(fallas ? `\n${fallas} FALLAS` : '\nTODO OK')
process.exit(fallas ? 1 : 0)
