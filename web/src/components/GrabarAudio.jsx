import { useEffect, useRef, useState } from 'react'
import { Mic, Square, RotateCcw, Send, Check, X, Loader2 } from 'lucide-react'
import { linkWhatsApp } from '@shared/clasificar.js'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { useToast } from './ui.jsx'

/**
 * Audio por WhatsApp: grabás acá y lo mandás. WhatsApp no deja abrir un chat con un audio adjunto
 * (sólo con texto), así que en el celular se abre el menú de compartir (elegís WhatsApp y el chat) y
 * en la compu se descarga el audio y se abre el chat de la empresa para que lo arrastres.
 */
export default function GrabarAudio({ p, disabled, onRegistrado }) {
  const toast = useToast()
  const [estado, setEstado] = useState('nada') // nada | grabando | listo | preguntar
  const [seg, setSeg] = useState(0)
  const [url, setUrl] = useState('')
  const [registrando, setRegistrando] = useState(false)
  const grabador = useRef(null)
  const trozos = useRef([])
  const archivo = useRef(null)
  const reloj = useRef(null)

  useEffect(() => () => { clearInterval(reloj.current); grabador.current?.stream?.getTracks().forEach(t => t.stop()); if (url) URL.revokeObjectURL(url) }, [])

  async function empezar() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return toast('Este navegador no deja grabar audio. Probá con Chrome o desde el celular.', 'error')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const tipo = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported?.(t)) || ''
      const g = new MediaRecorder(stream, tipo ? { mimeType: tipo } : undefined)
      trozos.current = []
      g.ondataavailable = e => e.data.size && trozos.current.push(e.data)
      g.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const mime = g.mimeType || 'audio/webm'
        const blob = new Blob(trozos.current, { type: mime })
        const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm'
        archivo.current = new File([blob], `audio-${String(p.nombre ?? 'empresa').replace(/[^\w]+/g, '-').slice(0, 30)}.${ext}`, { type: mime })
        setUrl(u => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob) })
        setEstado('listo')
      }
      grabador.current = g
      g.start()
      setSeg(0); setEstado('grabando')
      reloj.current = setInterval(() => setSeg(s => { if (s >= 179) { parar(); return s } return s + 1 }), 1000)
    } catch {
      toast('No se pudo usar el micrófono: dale permiso en el navegador.', 'error')
    }
  }
  function parar() { clearInterval(reloj.current); if (grabador.current?.state === 'recording') grabador.current.stop() }

  async function mandar() {
    const f = archivo.current
    if (!f) return
    // Celular: menú de compartir con el archivo (WhatsApp → el chat de la empresa)
    if (navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], title: `Audio para ${p.nombre}` }); setEstado('preguntar') } catch (e) { if (e?.name !== 'AbortError') toast('No se pudo compartir el audio.', 'error') }
      return
    }
    // Compu: se descarga y se abre el chat para arrastrarlo
    const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove()
    const chat = linkWhatsApp(p.telefono, '')
    if (chat) window.open(chat, '_blank', 'noopener')
    toast('Se descargó el audio: arrastralo al chat de WhatsApp que se abrió.', 'info')
    setEstado('preguntar')
  }

  async function registrar() {
    setRegistrando(true)
    const { error } = await supabase.from('interacciones').insert({ prospecto_id: p.id, tipo: 'enviado', canal: 'whatsapp', detalle: `Audio por WhatsApp (${seg} s)` })
    setRegistrando(false)
    if (error) return toast(mensajeError(error), 'error')
    toast('Audio registrado. Se agendó el seguimiento.', 'ok')
    setEstado('nada'); onRegistrado?.()
  }

  const mmss = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
  return (
    <div className={'audio-wa ' + estado}>
      {estado === 'nada' && (
        <button type="button" className="btn chico audio-boton" onClick={empezar} disabled={disabled} title="Grabá un audio para mandarle por WhatsApp">
          <Mic size={14} /> Grabar audio
        </button>
      )}
      {estado === 'grabando' && (
        <div className="audio-grabando">
          <span className="audio-punto" aria-hidden="true" /> <b>Grabando</b> <span className="audio-tiempo">{mmss}</span>
          <span className="espacio" />
          <button type="button" className="btn chico" onClick={parar}><Square size={13} /> Terminar</button>
        </div>
      )}
      {estado === 'listo' && (
        <div className="audio-listo">
          <audio src={url} controls preload="metadata" />
          <div className="audio-acciones">
            <button type="button" className="btn fantasma chico" onClick={empezar}><RotateCcw size={13} /> Grabar de nuevo</button>
            <button type="button" className="btn wa chico" onClick={mandar}><Send size={13} /> Mandar por WhatsApp</button>
          </div>
        </div>
      )}
      {estado === 'preguntar' && (
        <div className="audio-preguntar">
          <span>¿Le mandaste el audio a <b>{p.nombre}</b>?</span>
          <button type="button" className="btn primario chico" onClick={registrar} disabled={registrando}>{registrando ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Sí, lo mandé</button>
          <button type="button" className="btn fantasma chico" onClick={() => setEstado('listo')}><X size={13} /> Todavía no</button>
        </div>
      )}
    </div>
  )
}
