import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Sparkles, Send, Paperclip, X, FileText, Plus, Trash2, Copy, FileDown, MessageSquare, Loader2, PanelLeft } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { fechaHora } from '../lib/util.js'
import { Aviso, useConfirmar, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

marked.setOptions({ gfm: true, breaks: true })
export const aHTML = md => DOMPurify.sanitize(marked.parse(md ?? ''))

const SUGERENCIAS = [
  ['Resumime cómo vengo', '¿Cómo vengo? Resumime mis números, qué está funcionando y qué no.'],
  ['¿A quién le escribo hoy?', '¿A qué 5 prospectos le conviene escribirles hoy y por qué? Dame un mensaje corto para cada uno.'],
  ['Informe para PDF', 'Armame un informe completo de mi prospección (resumen, embudo, rubros que mejor responden, próximos pasos) para exportar en PDF.'],
  ['Objeción "ya tengo Instagram"', '¿Cómo respondo cuando me dicen "no necesito web, ya tengo Instagram"? Dame 3 respuestas cortas para WhatsApp.'],
  ['¿Cuánto cobro una web?', '¿Cuánto debería cobrar una web para un negocio chico de Mendoza? Proponé 3 paquetes con precio en pesos y qué incluye cada uno.'],
]

/** Abre una versión imprimible y el diálogo de "Guardar como PDF" del navegador */
export function exportarPDF(titulo, bloques) {
  const w = window.open('', '_blank')
  if (!w) return false
  const cuerpo = bloques.map(b => b.rol === 'user'
    ? `<div class="pregunta"><span>Pregunta</span>${DOMPurify.sanitize(b.contenido).replace(/\n/g, '<br>')}</div>`
    : `<div class="respuesta">${aHTML(b.contenido)}</div>`).join('')
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Fraunces:opsz,wght@9..144,600&display=swap" rel="stylesheet">
<style>
@page { margin: 18mm 16mm; }
body { font: 11pt/1.6 Inter, system-ui, sans-serif; color: #17171a; max-width: 760px; margin: 0 auto; padding: 24px; }
header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #8b2c3c; padding-bottom: 12px; margin-bottom: 22px; }
header b { font-family: Fraunces, Georgia, serif; font-size: 22pt; color: #8b2c3c; }
header span { color: #71717a; font-size: 9.5pt; text-align: right; }
h1, h2, h3 { font-family: Fraunces, Georgia, serif; color: #2b0b12; line-height: 1.25; page-break-after: avoid; }
h1 { font-size: 19pt; } h2 { font-size: 15pt; margin-top: 22px; } h3 { font-size: 12.5pt; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10pt; page-break-inside: avoid; }
th, td { border: 1px solid #e4e4e8; padding: 6px 9px; text-align: left; } th { background: #fbeff1; }
code { background: #f4f4f6; padding: 1px 5px; border-radius: 4px; }
blockquote { border-left: 3px solid #e8bcc4; margin: 10px 0; padding: 2px 14px; color: #52525b; }
.pregunta { background: #f6f6f8; border-radius: 10px; padding: 10px 14px; margin: 22px 0 10px; color: #3f3f46; }
.pregunta span { display: block; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; color: #8b2c3c; font-weight: 600; }
footer { margin-top: 30px; border-top: 1px solid #e4e4e8; padding-top: 8px; color: #a1a1aa; font-size: 8.5pt; }
</style></head><body>
<header><b>Prospecta</b><span>${esc(titulo)}<br>${new Date().toLocaleString('es-AR', { dateStyle: 'long', timeStyle: 'short' })}</span></header>
${cuerpo}
<footer>Generado con el Asistente IA de Prospecta</footer>
<script>document.fonts.ready.then(() => setTimeout(() => window.print(), 250))</script>
</body></html>`)
  w.document.close()
  return true
}

const aBase64 = archivo => new Promise((res, rej) => {
  const r = new FileReader()
  r.onload = () => res(String(r.result).split(',')[1])
  r.onerror = rej
  r.readAsDataURL(archivo)
})

export default function Asistente() {
  const toast = useToast()
  const confirmar = useConfirmar()
  const { servicios, perfil } = useApp()
  const [convs, setConvs] = useState([])
  const [activa, setActiva] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [pdf, setPdf] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [cupo, setCupo] = useState(null)
  const [lista, setLista] = useState(false)
  const fin = useRef(null)
  const archivoRef = useRef(null)
  const caja = useRef(null)

  async function cargarConvs() {
    const { data } = await supabase.from('chat_conversaciones').select('*').order('updated_at', { ascending: false })
    setConvs(data ?? [])
  }
  useEffect(() => {
    cargarConvs()
    llamarFuncion('asistente', { modo: 'cupo' }).then(r => setCupo(r.cupo)).catch(() => {})
  }, [])
  useEffect(() => {
    if (!activa) { setMensajes([]); return }
    supabase.from('chat_mensajes').select('*').eq('conversacion_id', activa).order('created_at').then(({ data }) => setMensajes(data ?? []))
  }, [activa])
  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [mensajes, enviando])

  const sinCupo = cupo && cupo.usados >= cupo.limite
  const sinIA = servicios.ia === false
  const tituloActiva = useMemo(() => convs.find(c => c.id === activa)?.titulo ?? 'Nueva conversación', [convs, activa])

  async function enviar(contenido = texto) {
    const t = contenido.trim()
    if ((!t && !pdf) || enviando) return
    const adjunto = pdf
    setTexto(''); setPdf(null); setEnviando(true)
    setMensajes(m => [...m, { id: 'tmp' + Date.now(), rol: 'user', contenido: t || '(PDF adjunto)', adjunto: adjunto?.nombre, created_at: new Date().toISOString() }])
    try {
      const r = await llamarFuncion('asistente', { conversacion_id: activa, mensaje: t, pdf: adjunto ? { nombre: adjunto.nombre, base64: adjunto.base64 } : undefined })
      setCupo(r.cupo)
      setMensajes(m => [...m, { id: 'r' + Date.now(), rol: 'assistant', contenido: r.respuesta, created_at: new Date().toISOString() }])
      cargarConvs()
      if (r.conversacion_id !== activa) setActiva(r.conversacion_id) // recarga desde la base: ya están guardados
    } catch (e) {
      toast(e.message, 'error')
      setMensajes(m => m.slice(0, -1))
      setTexto(t); setPdf(adjunto)
    } finally {
      setEnviando(false)
      caja.current?.focus()
    }
  }

  async function elegirPDF(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (f.type !== 'application/pdf') return toast('Sólo se pueden adjuntar PDFs', 'error')
    if (f.size > 8 * 1024 * 1024) return toast('El PDF es muy pesado (máximo 8 MB)', 'error')
    setPdf({ nombre: f.name, tamano: f.size, base64: await aBase64(f) })
  }

  async function borrar(c) {
    if (!(await confirmar({ titulo: '¿Borrar esta conversación?', texto: `"${c.titulo}" se borra para siempre. El cupo usado hoy no se devuelve.`, peligro: true, aceptar: 'Borrar' }))) return
    const { error } = await supabase.from('chat_conversaciones').delete().eq('id', c.id)
    if (error) return toast(error.message, 'error')
    if (activa === c.id) setActiva(null)
    cargarConvs()
  }

  const copiar = async t => { try { await navigator.clipboard.writeText(t); toast('Copiado') } catch { toast('No se pudo copiar', 'error') } }
  const pdfDe = (titulo, bloques) => { if (!exportarPDF(titulo, bloques)) toast('Permití las ventanas emergentes para exportar el PDF', 'error') }
  const nueva = () => { setActiva(null); setLista(false); caja.current?.focus() }

  return (
    <div className="chat">
      <aside className={'chat-lista' + (lista ? ' abierta' : '')}>
        <button className="btn primario ancho" onClick={nueva} disabled={enviando}><Plus size={16} /> Nueva conversación</button>
        <div className="chat-convs">
          {convs.map(c => (
            <div key={c.id} className={'chat-conv' + (c.id === activa ? ' activa' : '')}>
              <button onClick={() => { setActiva(c.id); setLista(false) }} title={c.titulo}>
                <MessageSquare size={15} /><span><b>{c.titulo}</b><small>{fechaHora(c.updated_at)}</small></span>
              </button>
              <button className="borrar" onClick={() => borrar(c)} aria-label={'Borrar ' + c.titulo}><Trash2 size={14} /></button>
            </div>
          ))}
          {!convs.length && <p className="muted chico centrado" style={{ marginTop: 20 }}>Tus conversaciones van a aparecer acá.</p>}
        </div>
        {cupo && (
          <div className="cupo" style={{ marginTop: 'auto' }}>
            <div className="cupo-top"><span>Consultas de hoy</span><b>{cupo.usados} / {cupo.limite}</b></div>
            <div className="cupo-barra"><span style={{ width: Math.min(100, cupo.usados / Math.max(1, cupo.limite) * 100) + '%' }} /></div>
            <small>Se renueva todos los días.</small>
          </div>
        )}
      </aside>

      <section className="chat-main">
        <header className="chat-cab">
          <button className="btn fantasma chico solo-movil" onClick={() => setLista(l => !l)} aria-label="Ver conversaciones"><PanelLeft size={17} /></button>
          <span className="chat-avatar"><Sparkles size={16} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <b className="chat-titulo">{activa ? tituloActiva : 'Asistente IA'}</b>
            <small className="muted">{servicios.ia ? `Claude · conoce tus prospectos y tus números` : 'Claude'}</small>
          </div>
          {mensajes.length > 0 && <button className="btn chico" onClick={() => pdfDe(tituloActiva, mensajes)}><FileDown size={15} /> Exportar PDF</button>}
        </header>

        <div className="chat-scroll">
          {!mensajes.length && !enviando ? (
            <div className="chat-vacio">
              <div className="icono-grande" style={{ background: 'var(--grad)', color: '#fff' }}><Sparkles size={26} /></div>
              <h2>¿En qué te ayudo{perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''}?</h2>
              <p className="muted">Preguntame lo que quieras: tus números, a quién escribirle, cómo responder una objeción o cuánto cobrar. También puedo leer un PDF (por ejemplo, el de tu empresa) y armarte un informe para exportar.</p>
              {sinIA && <Aviso>Falta la clave de Claude. {perfil?.es_admin ? <Link to="/admin">Cargala en Super admin → Claves</Link> : 'Pedile al administrador que la cargue.'}</Aviso>}
              <div className="sugerencias stagger">
                {SUGERENCIAS.map(([t, p]) => <button key={t} onClick={() => enviar(p)} disabled={sinIA || sinCupo}>{t}</button>)}
                <button onClick={() => archivoRef.current?.click()} disabled={sinIA || sinCupo}><FileText size={14} /> Analizar un PDF</button>
              </div>
            </div>
          ) : (
            <div className="burbujas">
              {mensajes.map((m, i) => m.rol === 'user' ? (
                <div key={m.id} className="msj usuario">
                  {m.adjunto && <span className="adjunto"><FileText size={14} /> {m.adjunto}</span>}
                  <div className="msj-texto">{m.contenido}</div>
                </div>
              ) : (
                <div key={m.id} className="msj ia">
                  <span className="chat-avatar"><Sparkles size={14} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="md" dangerouslySetInnerHTML={{ __html: aHTML(m.contenido) }} />
                    <div className="msj-acciones">
                      <button onClick={() => copiar(m.contenido)}><Copy size={13} /> Copiar</button>
                      <button onClick={() => pdfDe(mensajes[i - 1]?.contenido?.slice(0, 70) || tituloActiva, [m])}><FileDown size={13} /> PDF</button>
                    </div>
                  </div>
                </div>
              ))}
              {enviando && (
                <div className="msj ia"><span className="chat-avatar"><Sparkles size={14} /></span><div className="pensando" aria-label="Pensando"><i /><i /><i /></div></div>
              )}
              <div ref={fin} />
            </div>
          )}
        </div>

        <form className="chat-input" onSubmit={e => { e.preventDefault(); enviar() }}>
          {sinCupo && <Aviso>Llegaste al límite de {cupo.limite} consultas de hoy. Mañana se renueva.</Aviso>}
          {pdf && <span className="adjunto">
            <FileText size={14} /> {pdf.nombre} <small className="muted">({Math.round(pdf.tamano / 1024)} KB)</small>
            <button type="button" onClick={() => setPdf(null)} aria-label="Quitar PDF"><X size={13} /></button>
          </span>}
          <div className="chat-caja">
            <input ref={archivoRef} type="file" accept="application/pdf" hidden onChange={elegirPDF} />
            <button type="button" className="btn fantasma icono" onClick={() => archivoRef.current?.click()} disabled={enviando || sinIA || sinCupo} aria-label="Adjuntar PDF" title="Adjuntar PDF"><Paperclip size={18} /></button>
            <textarea ref={caja} rows={1} value={texto} placeholder={sinIA ? 'Falta la clave de Claude' : 'Preguntale lo que quieras…'} aria-label="Mensaje para el asistente"
              disabled={sinIA || sinCupo}
              onChange={e => { setTexto(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(180, e.target.scrollHeight) + 'px' }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} />
            <button className="btn ia" disabled={enviando || (!texto.trim() && !pdf) || sinIA || sinCupo} aria-label="Enviar">
              {enviando ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
            </button>
          </div>
          <small className="muted chico centrado" style={{ display: 'block', marginTop: 6 }}>Enter para enviar · Shift+Enter para salto de línea · Claude puede equivocarse: revisá los datos importantes.</small>
        </form>
      </section>
    </div>
  )
}
