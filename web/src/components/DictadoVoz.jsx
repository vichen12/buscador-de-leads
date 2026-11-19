// Dictado por voz: tocás el micrófono, hablás y el texto se escribe solo (Web Speech API del navegador).
// Anda en Chrome, Edge, Safari y en el celular; donde el navegador no lo tiene, el botón no aparece.
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { useToast } from './ui.jsx'

const Reconocedor = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null

/**
 * value: lo que ya hay escrito (lo dictado se agrega a continuación).
 * onChange: recibe el texto completo mientras hablás.
 * onFin: opcional, se llama al terminar con el texto final.
 */
export default function DictadoVoz({ value = '', onChange, onFin, disabled, idioma = 'es-AR', className = '' }) {
  const toast = useToast()
  const [escuchando, setEscuchando] = useState(false)
  const rec = useRef(null)
  const base = useRef('')
  const ultimo = useRef('')

  useEffect(() => () => rec.current?.abort?.(), [])
  if (!Reconocedor) return null

  function empezar() {
    const r = new Reconocedor()
    r.lang = idioma
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1
    base.current = value.trim() ? value.trim() + ' ' : ''
    ultimo.current = value
    r.onresult = e => {
      let texto = ''
      for (let i = 0; i < e.results.length; i++) texto += e.results[i][0].transcript
      ultimo.current = (base.current + texto).replace(/\s+/g, ' ').trimStart()
      onChange(ultimo.current)
    }
    r.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast('Permití el micrófono en el navegador para dictar.', 'error')
      else if (e.error === 'no-speech') toast('No te escuché. Tocá el micrófono y probá de nuevo.', 'info')
      else if (e.error !== 'aborted') toast('No se pudo usar el dictado. Probá de nuevo.', 'error')
    }
    r.onend = () => { setEscuchando(false); rec.current = null; onFin?.(ultimo.current) }
    try { r.start(); rec.current = r; setEscuchando(true) } catch { setEscuchando(false) }
  }
  const parar = () => rec.current?.stop()

  return (
    <button type="button" className={'dictado-voz' + (escuchando ? ' escuchando' : '') + (className ? ' ' + className : '')}
      onClick={escuchando ? parar : empezar} disabled={disabled}
      aria-label={escuchando ? 'Dejar de dictar' : 'Dictar por voz'} aria-pressed={escuchando} title={escuchando ? 'Te escucho… tocá para terminar' : 'Dictar por voz'}>
      {escuchando ? <MicOff size={19} /> : <Mic size={19} />}
    </button>
  )
}
