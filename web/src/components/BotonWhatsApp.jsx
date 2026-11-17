import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Check, X, Loader2, Pencil } from 'lucide-react'
import { linkWhatsApp, numeroWhatsApp } from '@shared/clasificar.js'
import { supabase } from '../lib/supabase.js'
import { NO_CONTACTAR, mensajeError } from '../lib/util.js'
import { useToast } from './ui.jsx'
import { useApp } from '../App.jsx'
import { mensajesWa, mundoDe, quienSoy, rellenarWa, sugeridoWa } from '../lib/mensajesWa.js'

/**
 * Botón verde de WhatsApp para la lista: elegís uno de tus mensajes y se abre el chat de ESA
 * empresa con el texto ya escrito (un link directo: anda en el celular y en la compu). Al volver
 * pregunta si lo mandaste, para registrarlo y agendar el seguimiento.
 */
export default function BotonWhatsApp({ p, onRegistrado }) {
  const toast = useToast()
  const app = useApp()
  const { perfil, enviadosHoy, refrescar } = app
  const [abierto, setAbierto] = useState(false)
  const [pendiente, setPendiente] = useState(null) // { texto, titulo } que se abrió en WhatsApp
  const [registrando, setRegistrando] = useState(false)
  const caja = useRef(null)
  const boton = useRef(null)
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!abierto || pendiente) return
    const fuera = e => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto, pendiente])
  // El menú flota sobre la pantalla (la tabla tiene scroll y lo cortaría): se ubica bajo el botón,
  // o arriba si no entra; al hacer scroll se cierra (salvo que esté preguntando si lo mandaste).
  useEffect(() => {
    if (!abierto) return
    const ubicar = () => {
      const r = boton.current?.getBoundingClientRect()
      if (!r) return
      const ancho = Math.min(320, window.innerWidth - 24)
      const left = Math.max(12, Math.min(r.left, window.innerWidth - ancho - 12))
      const abajo = window.innerHeight - r.bottom > 300 || r.top < 300
      setPos(abajo ? { left, top: r.bottom + 6, width: ancho } : { left, bottom: window.innerHeight - r.top + 6, width: ancho })
    }
    ubicar()
    const alScroll = () => { if (!pendiente) setAbierto(false); else ubicar() }
    window.addEventListener('scroll', alScroll, true)
    window.addEventListener('resize', ubicar)
    return () => { window.removeEventListener('scroll', alScroll, true); window.removeEventListener('resize', ubicar) }
  }, [abierto, pendiente])

  const tieneWA = Boolean(numeroWhatsApp(p.telefono)) && p.telefono_tipo !== 'fijo'
  const optOut = NO_CONTACTAR.includes(p.estado)
  const sinCupo = enviadosHoy >= (perfil?.limite_diario ?? 15)
  const motivo = !tieneWA ? 'No tiene un celular válido' : optOut ? 'Esta empresa pidió no ser contactada' : sinCupo ? 'Llegaste al límite de WhatsApp de hoy' : ''
  if (!p.telefono) return null

  const yo = quienSoy(app)
  const lista = mensajesWa(perfil, mundoDe(p)).filter(m => m.texto?.trim())
  const sug = sugeridoWa(lista, p)
  const orden = lista.map((m, i) => ({ m, i })).sort((a, b) => (b.i === sug) - (a.i === sug))

  async function registrar() {
    setRegistrando(true)
    try {
      const { data: m, error } = await supabase.from('mensajes')
        .upsert({ prospecto_id: p.id, tipo: 'whatsapp', asunto: '', cuerpo: pendiente.texto, editado: true, generado_por: 'manual' }, { onConflict: 'prospecto_id,tipo' })
        .select().single()
      if (error) throw error
      const { error: e2 } = await supabase.from('interacciones').insert({ prospecto_id: p.id, mensaje_id: m.id, tipo: 'enviado', canal: 'whatsapp', detalle: `WhatsApp: ${pendiente.titulo}` })
      if (e2) throw e2
      toast(`Registrado. Seguimiento agendado en ${perfil?.dias_seguimiento ?? 5} días.`, 'ok')
      setPendiente(null); setAbierto(false)
      refrescar(); onRegistrado?.()
    } catch (e) { toast(mensajeError(e), 'error') }
    setRegistrando(false)
  }

  return (
    <span className="bwa" ref={caja}>
      {motivo
        ? <span className="bwa-no" title={motivo}><MessageCircle size={12} /> {!tieneWA ? 'Sin WhatsApp' : optOut ? 'No contactar' : 'Límite de hoy'}</span>
        : <button ref={boton} type="button" className="btn wa chico bwa-boton" title="Mandar uno de tus mensajes por WhatsApp"
            onClick={() => setAbierto(a => !a)} aria-expanded={abierto}>
            <MessageCircle size={13} /> WhatsApp
          </button>}
      {abierto && (
        <div className="bwa-menu" style={pos ? { ...pos, position: 'fixed' } : { visibility: 'hidden' }} role="dialog" aria-label={`WhatsApp a ${p.nombre}`}>
          {pendiente ? (
            <div className="bwa-confirmar">
              <b>¿Le mandaste el WhatsApp a {p.nombre}?</b>
              <small className="muted">Si lo mandaste, queda registrado y se agenda el seguimiento.</small>
              <div className="bwa-acciones">
                <button type="button" className="btn primario chico" onClick={registrar} disabled={registrando}>{registrando ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Sí, lo mandé</button>
                <button type="button" className="btn fantasma chico" onClick={() => { setPendiente(null); setAbierto(false) }}><X size={13} /> No</button>
              </div>
            </div>
          ) : !lista.length ? (
            <div className="bwa-vacio">
              <span>Todavía no escribiste tus mensajes de WhatsApp.</span>
              <Link to="/mensajes-whatsapp" className="btn chico">Escribirlos</Link>
            </div>
          ) : (
            <>
              <small className="muted bwa-titulo">Elegí qué mensaje mandarle · {mundoDe(p) === 'libre' ? 'búsqueda libre' : 'mi negocio'}</small>
              {orden.map(({ m, i }) => {
                const texto = rellenarWa(m.texto, p, yo)
                return (
                  <a key={i} className={'bwa-opcion' + (i === sug ? ' sugerido' : '')} href={linkWhatsApp(p.telefono, texto)} target="_blank" rel="noreferrer"
                    onClick={() => setPendiente({ texto, titulo: m.titulo })}>
                    <span className="bwa-op-cab"><b>{m.titulo}</b>{i === sug && <em>{p.web_actual ? 'tiene web' : 'sin web'}</em>}</span>
                    <span className="bwa-op-texto">{texto}</span>
                  </a>
                )
              })}
              <Link to={`/prospectos/${p.id}?tab=whatsapp`} className="bwa-retocar"><Pencil size={12} /> Retocarlo antes en la ficha</Link>
            </>
          )}
        </div>
      )}
    </span>
  )
}
