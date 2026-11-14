import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Send, X, Loader2, Maximize2, History, SquarePen, ChevronLeft, MessageSquare } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { aHTML } from '../pages/Asistente.jsx'
import { useApp } from '../App.jsx'
import { SelectorModelo, useCalidadChat, nombreCalidad, creditosTexto } from './ModeloIA.jsx'

const PANTALLAS = {
  '/': 'Tablero (resumen de la cuenta)', '/prospectos': 'Lista de prospectos', '/seguimientos': 'Seguimientos pendientes',
  '/buscar': 'Buscar negocios', '/importar': 'Importar planilla', '/negocio': 'Mi negocio (su estrategia)', '/cuenta': 'Mi cuenta',
}

function sugerencias(path) {
  if (/^\/prospectos\/[0-9a-f-]{36}$/.test(path)) return ['Resumime este prospecto', '¿Cómo le escribo?', '¿Qué le respondo si me dice que no le interesa?']
  if (path === '/buscar') return ['¿Qué rubros me conviene buscar primero?', '¿En qué zona busco?']
  if (path === '/negocio') return ['¿Qué mejorarías de mi estrategia?', 'Sugerime más rubros']
  return ['¿A quién le escribo hoy?', 'Resumime cómo vengo', '¿Qué hago ahora para conseguir clientes?']
}

async function contextoPagina(path) {
  const id = path.match(/^\/prospectos\/([0-9a-f-]{36})$/)?.[1]
  if (!id) return PANTALLAS[path] ? `Pantalla: ${PANTALLAS[path]}` : ''
  const [{ data: p }, { data: ms }, { data: ints }] = await Promise.all([
    supabase.from('prospectos').select('*').eq('id', id).maybeSingle(),
    supabase.from('mensajes').select('tipo, asunto, cuerpo').eq('prospecto_id', id),
    supabase.from('interacciones').select('tipo, detalle, created_at').eq('prospecto_id', id).order('created_at', { ascending: false }).limit(15),
  ])
  if (!p) return 'Pantalla: ficha de un prospecto'
  return `Está viendo la ficha del prospecto "${p.nombre}".
Datos: rubro ${p.rubro || 's/d'}; zona ${p.zona || p.direccion || 's/d'}; estado ${p.estado}; teléfono ${p.telefono || 'no'}; email ${p.email || 'no'}; Instagram ${p.instagram || 'no'}; web ${p.web_actual || p.que_tiene_hoy || 's/d'}; reseñas ${p.resenas ?? 's/d'} (${p.rating ?? 's/d'}★); encaje ${p.puntaje ? p.puntaje + '/5' : 's/d'} ${p.encaje || ''}; último contacto ${p.ultimo_contacto?.slice(0, 10) || 'nunca'}; próximo seguimiento ${p.proximo_seguimiento || 'sin fecha'}.
Notas: ${p.notas || '—'}
Borradores: ${(ms ?? []).map(m => `[${m.tipo}] ${m.asunto ? m.asunto + ' — ' : ''}${m.cuerpo.slice(0, 400)}`).join('\n') || 'ninguno'}
Historial: ${(ints ?? []).map(i => `${i.created_at.slice(0, 10)} ${i.tipo}${i.detalle ? ' ' + i.detalle : ''}`).join('; ') || 'sin actividad'}`
}

const CLAVE_CHAT = 'prospecta-chat-actual'
const leerChat = () => { try { return localStorage.getItem(CLAVE_CHAT) || null } catch { return null } }
const guardarChat = id => { try { id ? localStorage.setItem(CLAVE_CHAT, id) : localStorage.removeItem(CLAVE_CHAT) } catch { /* sin almacenamiento */ } }
// En el celular no se abre el teclado solo: primero se lee, después se escribe
const esTactil = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
const esCelular = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 920px)').matches
const cuando = f => {
  const d = new Date(f), hoy = new Date()
  if (d.toDateString() === hoy.toDateString()) return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const ayer = new Date(); ayer.setDate(hoy.getDate() - 1)
  if (d.toDateString() === ayer.toDateString()) return 'Ayer'
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

export default function AsistenteFlotante() {
  const { servicios } = useApp()
  const loc = useLocation()
  const quieto = useReducedMotion()
  const [abierto, setAbierto] = useState(false)
  const [conv, setConvEstado] = useState(leerChat)
  const [mensajes, setMensajes] = useState([])
  const [cargandoChat, setCargandoChat] = useState(false)
  const [vista, setVista] = useState('chat') // chat | lista
  const [chats, setChats] = useState(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [calidad, elegirCalidad] = useCalidadChat()
  const [cupo, setCupo] = useState(null)
  const fin = useRef(null)
  const caja = useRef(null)
  const panel = useRef(null)
  const setConv = id => { setConvEstado(id); guardarChat(id) }

  // La conversación queda guardada: al volver (o al recargar) sigue donde la dejaste
  const cargado = useRef(null)
  useEffect(() => {
    if (!abierto || !conv || cargado.current === conv) return
    cargado.current = conv
    setCargandoChat(true)
    supabase.from('chat_mensajes').select('rol, contenido, adjunto').eq('conversacion_id', conv).order('created_at').limit(200)
      .then(({ data, error }) => {
        if (error || !data?.length) { if (!error) setConv(null); setMensajes([]) }
        else setMensajes(data.map(m => ({ rol: m.rol, contenido: m.adjunto ? `📎 ${m.adjunto}\n${m.contenido}` : m.contenido })))
      }).finally(() => setCargandoChat(false))
  }, [abierto, conv])
  useEffect(() => { if (abierto && !cupo) llamarFuncion('asistente', { modo: 'cupo' }).then(r => setCupo(r.cupo ?? null)).catch(() => {}) }, [abierto])
  useEffect(() => {
    if (!abierto || vista !== 'lista') return
    supabase.from('chat_conversaciones').select('id, titulo, updated_at').order('updated_at', { ascending: false }).limit(40).then(({ data }) => setChats(data ?? []))
  }, [abierto, vista])

  useEffect(() => { if (vista === 'chat') fin.current?.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'end' }) }, [mensajes, enviando, abierto, vista])
  useEffect(() => { if (abierto && vista === 'chat' && !esTactil()) setTimeout(() => caja.current?.focus(), 60) }, [abierto, vista])
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])
  // Celular: pantalla completa que se achica cuando aparece el teclado (así se sigue leyendo la charla)
  useEffect(() => {
    if (!abierto || !esCelular()) return
    document.body.classList.add('sin-scroll', 'chat-abierto')
    const vv = window.visualViewport
    const ajustar = () => {
      if (!panel.current || !vv) return
      panel.current.style.setProperty('--chat-alto', `${vv.height}px`)
      panel.current.style.setProperty('--chat-arriba', `${vv.offsetTop}px`)
      fin.current?.scrollIntoView({ block: 'end' })
    }
    ajustar()
    vv?.addEventListener('resize', ajustar); vv?.addEventListener('scroll', ajustar)
    return () => { document.body.classList.remove('sin-scroll', 'chat-abierto'); vv?.removeEventListener('resize', ajustar); vv?.removeEventListener('scroll', ajustar) }
  }, [abierto])
  // Al cambiar de pantalla en el celular se cierra (la conversación queda guardada)
  useEffect(() => { if (esCelular()) setAbierto(false) }, [loc.pathname])

  // Otras pantallas pueden pedirle algo a Claude: window.dispatchEvent(new CustomEvent('preguntar-a-claude', { detail: 'texto' }))
  const enviarRef = useRef(null)
  useEffect(() => {
    const f = e => { setAbierto(true); setVista('chat'); setTimeout(() => enviarRef.current?.(String(e.detail ?? '')), 80) }
    window.addEventListener('preguntar-a-claude', f); return () => window.removeEventListener('preguntar-a-claude', f)
  }, [])

  if (loc.pathname === '/asistente') return null

  async function enviar(t = texto) {
    t = t.trim()
    if (!t || enviando) return
    setTexto(''); setError(''); setEnviando(true)
    setMensajes(m => [...m, { rol: 'user', contenido: t }])
    try {
      const pagina = await contextoPagina(loc.pathname).catch(() => '')
      const r = await llamarFuncion('asistente', { conversacion_id: conv, mensaje: t, pagina, calidad })
      cargado.current = r.conversacion_id
      setConv(r.conversacion_id)
      if (r.cupo) setCupo(r.cupo)
      setMensajes(m => [...m, { rol: 'assistant', contenido: r.respuesta, creditos: r.creditos, calidad: r.calidad }])
    } catch (e) {
      setError(e.message); setMensajes(m => m.slice(0, -1)); setTexto(t)
    }
    setEnviando(false)
  }
  function nuevoChat() { cargado.current = null; setConv(null); setMensajes([]); setError(''); setVista('chat') }
  function abrirChat(id) { if (id !== conv) { cargado.current = null; setMensajes([]); setConv(id) } setError(''); setVista('chat') }

  enviarRef.current = enviar
  const actual = chats?.find(c => c.id === conv)
  return (
    <>
      <AnimatePresence>
        {abierto && (
          <motion.section ref={panel} className="flotante-panel" role="dialog" aria-label="Asistente IA"
            initial={quieto ? false : { opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            <header>
              {vista === 'lista'
                ? <button className="btn chico fantasma" title="Volver" aria-label="Volver al chat" onClick={() => setVista('chat')}><ChevronLeft size={18} /></button>
                : <span className="flotante-avatar"><Sparkles size={15} /></span>}
              <div className="flotante-titulo">
                <b>{vista === 'lista' ? 'Tus chats' : 'Asistente IA'}</b>
                <small>{vista === 'lista' ? 'Cada chat recuerda lo que hablaron' : conv ? 'Recuerda esta conversación' : PANTALLAS[loc.pathname] ? `Viendo: ${PANTALLAS[loc.pathname]}` : /^\/prospectos\//.test(loc.pathname) ? 'Viendo este prospecto' : 'Conoce tus datos'}</small>
              </div>
              <span className="espacio" />
              {vista === 'chat' && <button className="btn chico fantasma" title="Tus chats" aria-label="Tus chats" onClick={() => setVista('lista')}><History size={16} /></button>}
              <button className="btn chico fantasma" title="Nuevo chat" aria-label="Nuevo chat" onClick={nuevoChat}><SquarePen size={15} /></button>
              <Link className="btn chico fantasma solo-escritorio" title="Abrir en pantalla completa" to={conv ? `/asistente?c=${conv}` : '/asistente'} onClick={() => setAbierto(false)}><Maximize2 size={14} /></Link>
              <button className="btn chico fantasma" title="Cerrar" aria-label="Cerrar" onClick={() => setAbierto(false)}><X size={17} /></button>
            </header>

            {vista === 'lista' ? (
              <div className="flotante-cuerpo flotante-lista">
                <button className="flotante-chat nuevo" onClick={nuevoChat}><SquarePen size={16} /><span><b>Nuevo chat</b><small>Empezá una conversación de cero</small></span></button>
                {chats === null ? <div className="pensando centrado"><i /><i /><i /></div>
                  : !chats.length ? <p className="muted chico centrado">Todavía no tenés chats guardados.</p>
                  : chats.map(c => (
                    <button key={c.id} className={'flotante-chat' + (c.id === conv ? ' activo' : '')} onClick={() => abrirChat(c.id)}>
                      <MessageSquare size={16} /><span><b>{c.titulo || 'Conversación'}</b><small>{cuando(c.updated_at)}</small></span>
                    </button>
                  ))}
                <Link className="flotante-ver-todos" to="/asistente" onClick={() => setAbierto(false)}>Ver todo en el Asistente <Maximize2 size={13} /></Link>
              </div>
            ) : (
              <div className="flotante-cuerpo">
                {cargandoChat && !mensajes.length && <div className="pensando centrado"><i /><i /><i /></div>}
                {!cargandoChat && mensajes.length === 0 && (
                  <div className="flotante-vacio">
                    <span className="flotante-vacio-icono"><Sparkles size={20} /></span>
                    <p><b>¿En qué te ayudo?</b><br />Preguntame sobre tus prospectos, tus mensajes o cómo conseguir clientes. Tus chats quedan guardados.</p>
                    {sugerencias(loc.pathname).map(s => <button key={s} className="chip-sel" onClick={() => enviar(s)} disabled={servicios.ia === false}>{s}</button>)}
                  </div>
                )}
                {actual && mensajes.length > 0 && <div className="flotante-chat-titulo">{actual.titulo}</div>}
                {mensajes.map((m, i) => m.rol === 'user'
                  ? <motion.div key={i} className="burbuja yo" initial={quieto ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{m.contenido}</motion.div>
                  : <motion.div key={i} className="burbuja-ia-envoltura" initial={quieto ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <div className="burbuja ia md" dangerouslySetInnerHTML={{ __html: aHTML(m.contenido) }} />
                      {m.creditos > 0 && <small className="burbuja-meta">{nombreCalidad(m.calidad)} · usó {creditosTexto(m.creditos)}</small>}
                    </motion.div>)}
                {enviando && <div className="burbuja ia"><div className="pensando"><i /><i /><i /></div></div>}
                {error && <div className="burbuja error">{error}</div>}
                <div ref={fin} />
              </div>
            )}

            {vista === 'chat' && (
              <div className="flotante-modo"><SelectorModelo calidad={calidad} onChange={elegirCalidad} disabled={enviando} cupo={cupo} /></div>
            )}
            {vista === 'chat' && (
              <form className="flotante-caja" onSubmit={e => { e.preventDefault(); enviar() }}>
                <textarea ref={caja} rows={1} value={texto} placeholder={servicios.ia === false ? 'Falta la clave de Claude' : 'Escribí tu pregunta…'} disabled={servicios.ia === false}
                  enterKeyHint="send" onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !esTactil()) { e.preventDefault(); enviar() } }} />
                <button className="btn ia" disabled={!texto.trim() || enviando} aria-label="Enviar">{enviando ? <Loader2 size={16} className="spin" /> : <Send size={16} />}</button>
              </form>
            )}
          </motion.section>
        )}
      </AnimatePresence>
      <button className={'flotante-boton' + (abierto ? ' abierto' : '')} onClick={() => setAbierto(a => !a)} aria-label="Asistente IA" aria-expanded={abierto}>
        {abierto ? <X size={22} /> : <><Sparkles size={20} /><span>Preguntale a Claude</span></>}
      </button>
    </>
  )
}
