import { useEffect, useRef, useState } from 'react'
import { HelpCircle, ThumbsUp, ThumbsDown, Megaphone } from 'lucide-react'

/** "¿por qué?" al lado del puntaje: las razones concretas a favor y en contra, y las novedades de la empresa */
export default function PorQue({ razones, senales, encaje }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const cerrar = e => { if (!ref.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])
  const a = razones?.a_favor ?? [], c = razones?.en_contra ?? []
  if (!a.length && !c.length && !senales && !encaje) return null
  return (
    <span className="porque" ref={ref}>
      <button type="button" className="porque-boton" onClick={e => { e.preventDefault(); e.stopPropagation(); setAbierto(v => !v) }} aria-expanded={abierto}><HelpCircle size={12} /> ¿por qué?</button>
      {abierto && (
        <span className="porque-panel" role="dialog" onClick={e => e.stopPropagation()}>
          {!a.length && encaje && <span className="porque-fila"><ThumbsUp size={13} /> {encaje}</span>}
          {a.map((x, i) => <span key={'a' + i} className="porque-fila"><ThumbsUp size={13} /> {x}</span>)}
          {c.map((x, i) => <span key={'c' + i} className="porque-fila contra"><ThumbsDown size={13} /> {x}</span>)}
          {senales && <span className="porque-fila senal"><Megaphone size={13} /> {senales}</span>}
        </span>
      )}
    </span>
  )
}
