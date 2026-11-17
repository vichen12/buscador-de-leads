import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { StickyNote, Loader2, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { EstadoBadge, useToast } from './ui.jsx'

/**
 * Notas de una empresa: «le mandé el mail», «me dijo que llame el martes»… Cada nota guarda la fecha
 * y el estado en que estaba la empresa cuando la escribiste, así el historial se entiende aunque
 * después cambie de estado. Son interacciones de tipo «nota».
 */

const cuando = f => new Date(f).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Cuántas notas tiene cada empresa y la última (para la lista y seguimientos). */
export function useResumenNotas() {
  const [resumen, setResumen] = useState({})
  const cargar = useCallback(async () => {
    const { data } = await supabase.from('interacciones').select('prospecto_id, detalle, created_at').eq('tipo', 'nota')
      .order('created_at', { ascending: false }).limit(4000)
    const r = {}
    for (const n of data ?? []) {
      const x = r[n.prospecto_id] ?? (r[n.prospecto_id] = { n: 0, ultima: n.detalle, cuando: n.created_at })
      x.n++
    }
    setResumen(r)
  }, [])
  useEffect(() => { cargar() }, [cargar])
  return [resumen, cargar]
}

/** La lista de notas con el cuadro para agregar una. */
export function NotasPanel({ p, compacto = false, onCambio, autoFoco = false }) {
  const toast = useToast()
  const [notas, setNotas] = useState(null)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const area = useRef(null)

  const cargar = useCallback(async () => {
    const { data, error } = await supabase.from('interacciones').select('*').eq('prospecto_id', p.id).eq('tipo', 'nota')
      .order('created_at', { ascending: false }).limit(200)
    if (error) toast(mensajeError(error), 'error')
    setNotas(data ?? [])
  }, [p.id])
  useEffect(() => { cargar() }, [cargar])
  useEffect(() => { if (autoFoco) area.current?.focus() }, [autoFoco])

  async function guardar(e) {
    e?.preventDefault()
    const t = texto.trim()
    if (!t) return
    setGuardando(true)
    // El estado se manda desde acá; si la base tiene el trigger, igual lo completa sola
    let { error } = await supabase.from('interacciones').insert({ prospecto_id: p.id, tipo: 'nota', detalle: t.slice(0, 2000), estado: p.estado })
    if (error && /estado/i.test(error.message)) ({ error } = await supabase.from('interacciones').insert({ prospecto_id: p.id, tipo: 'nota', detalle: t.slice(0, 2000) }))
    setGuardando(false)
    if (error) return toast(mensajeError(error), 'error')
    setTexto('')
    await cargar()
    onCambio?.()
  }

  return (
    <div className={'notas' + (compacto ? ' compacto' : '')}>
      <form className="notas-nueva" onSubmit={guardar}>
        <textarea ref={area} rows={compacto ? 2 : 3} value={texto} maxLength={2000} onChange={e => setTexto(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) guardar(e) }}
          placeholder="Ej.: le mandé el mail con la propuesta; me dijo que lo llame el martes a la tarde…" aria-label="Nueva nota" />
        <div className="notas-nueva-pie">
          <small className="muted">Queda con la fecha y el estado de ahora{p.estado ? <> (<EstadoBadge estado={p.estado} />)</> : ''} · Ctrl + Enter</small>
          <button className="btn primario chico" disabled={guardando || !texto.trim()}>{guardando ? <Loader2 size={13} className="spin" /> : <Send size={13} />} Guardar nota</button>
        </div>
      </form>
      {notas === null ? <p className="muted chico">Cargando notas…</p> : notas.length === 0 ? (
        <p className="notas-vacio muted chico"><StickyNote size={14} /> Todavía no hay notas de esta empresa.</p>
      ) : (
        <ol className="notas-lista">
          {notas.map(n => (
            <li key={n.id}>
              <div className="notas-cab">
                {n.estado && <EstadoBadge estado={n.estado} />}
                <time dateTime={n.created_at}>{cuando(n.created_at)}</time>
              </div>
              <p>{n.detalle}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/** Botón chico para la lista y seguimientos: muestra cuántas notas hay y abre el panel flotante. */
export function NotasBoton({ p, resumen, onCambio }) {
  const [abierto, setAbierto] = useState(false)
  const [pos, setPos] = useState(null)
  const boton = useRef(null)
  const caja = useRef(null)
  const n = resumen?.n ?? 0

  useEffect(() => {
    if (!abierto) return
    const ubicar = () => {
      const r = boton.current?.getBoundingClientRect()
      if (!r) return
      const ancho = Math.min(380, window.innerWidth - 24)
      const left = Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12))
      const abajo = window.innerHeight - r.bottom > 360 || r.top < 360
      setPos(abajo ? { left, top: r.bottom + 6, width: ancho } : { left, bottom: window.innerHeight - r.top + 6, width: ancho })
    }
    ubicar()
    const fuera = e => { if (!caja.current?.contains(e.target) && !boton.current?.contains(e.target)) setAbierto(false) }
    const esc = e => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    window.addEventListener('resize', ubicar)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); window.removeEventListener('resize', ubicar) }
  }, [abierto])

  // Puede estar adentro de un link (Seguimientos): los clics no tienen que navegar
  const frenar = e => { e.preventDefault(); e.stopPropagation() }
  return (
    <>
      <button ref={boton} type="button" className={'notas-boton' + (n ? ' con' : '')} aria-expanded={abierto}
        title={n ? `${n} ${n === 1 ? 'nota' : 'notas'} · última: ${resumen.ultima}` : 'Agregar una nota'}
        onClick={e => { frenar(e); setAbierto(a => !a) }}>
        <StickyNote size={13} /> {n ? n : 'Nota'}
      </button>
      {abierto && createPortal(
        <div ref={caja} className="notas-flotante" style={pos ? { ...pos, position: 'fixed' } : { visibility: 'hidden' }}
          role="dialog" aria-label={`Notas de ${p.nombre}`} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
          <div className="notas-flotante-cab"><b>Notas · {p.nombre}</b><button type="button" className="notas-cerrar" onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={15} /></button></div>
          <NotasPanel p={p} compacto autoFoco onCambio={onCambio} />
        </div>, document.body)}
    </>
  )
}
