import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Sparkles, Send, X, Loader2, Maximize2, RotateCcw } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { aHTML } from '../pages/Asistente.jsx'
import { useApp } from '../App.jsx'

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

export default function AsistenteFlotante() {
  const { servicios } = useApp()
  const loc = useLocation()
  const [abierto, setAbierto] = useState(false)
  const [conv, setConv] = useState(null)
  const [mensajes, setMensajes] = useState([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const fin = useRef(null)
  const caja = useRef(null)

  useEffect(() => { fin.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [mensajes, enviando, abierto])
  useEffect(() => { if (abierto) setTimeout(() => caja.current?.focus(), 50) }, [abierto])
  useEffect(() => {
    const k = e => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [])

  if (loc.pathname === '/asistente') return null

  async function enviar(t = texto) {
    t = t.trim()
    if (!t || enviando) return
    setTexto(''); setError(''); setEnviando(true)
    setMensajes(m => [...m, { rol: 'user', contenido: t }])
    try {
      const pagina = await contextoPagina(loc.pathname).catch(() => '')
      const r = await llamarFuncion('asistente', { conversacion_id: conv, mensaje: t, pagina })
      setConv(r.conversacion_id)
      setMensajes(m => [...m, { rol: 'assistant', contenido: r.respuesta }])
    } catch (e) {
      setError(e.message); setMensajes(m => m.slice(0, -1)); setTexto(t)
    }
    setEnviando(false)
  }

  return (
    <>
      {abierto && (
        <section className="flotante-panel" role="dialog" aria-label="Asistente IA">
          <header>
            <span className="flotante-avatar"><Sparkles size={15} /></span>
            <div><b>Asistente IA</b><small>{PANTALLAS[loc.pathname] ? `Viendo: ${PANTALLAS[loc.pathname]}` : /^\/prospectos\//.test(loc.pathname) ? 'Viendo este prospecto' : 'Conoce tus datos'}</small></div>
            <span className="espacio" />
            {mensajes.length > 0 && <button className="btn chico fantasma" title="Nueva conversación" onClick={() => { setConv(null); setMensajes([]) }}><RotateCcw size={14} /></button>}
            <Link className="btn chico fantasma" title="Abrir en pantalla completa" to={conv ? `/asistente?c=${conv}` : '/asistente'} onClick={() => setAbierto(false)}><Maximize2 size={14} /></Link>
            <button className="btn chico fantasma" title="Cerrar" onClick={() => setAbierto(false)}><X size={15} /></button>
          </header>
          <div className="flotante-cuerpo">
            {mensajes.length === 0 && (
              <div className="flotante-vacio">
                <p>Preguntame lo que quieras sobre tus prospectos, tus mensajes o cómo conseguir clientes.</p>
                {sugerencias(loc.pathname).map(s => <button key={s} className="chip-sel" onClick={() => enviar(s)} disabled={servicios.ia === false}>{s}</button>)}
              </div>
            )}
            {mensajes.map((m, i) => m.rol === 'user'
              ? <div key={i} className="burbuja yo">{m.contenido}</div>
              : <div key={i} className="burbuja ia md" dangerouslySetInnerHTML={{ __html: aHTML(m.contenido) }} />)}
            {enviando && <div className="burbuja ia"><div className="pensando"><i /><i /><i /></div></div>}
            {error && <div className="burbuja error">{error}</div>}
            <div ref={fin} />
          </div>
          <form className="flotante-caja" onSubmit={e => { e.preventDefault(); enviar() }}>
            <textarea ref={caja} rows={1} value={texto} placeholder={servicios.ia === false ? 'Falta la clave de Claude' : 'Escribí tu pregunta…'} disabled={servicios.ia === false}
              onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }} />
            <button className="btn ia" disabled={!texto.trim() || enviando} aria-label="Enviar">{enviando ? <Loader2 size={16} className="spin" /> : <Send size={16} />}</button>
          </form>
        </section>
      )}
      <button className={'flotante-boton' + (abierto ? ' abierto' : '')} onClick={() => setAbierto(a => !a)} aria-label="Asistente IA">
        {abierto ? <X size={22} /> : <><Sparkles size={20} /><span>Preguntale a Claude</span></>}
      </button>
    </>
  )
}
