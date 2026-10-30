import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

/**
 * Desplegable propio (reemplaza al <select> nativo en toda la app).
 * opciones: [{ value, label, ayuda?, icono?, nodo? }]  ·  nodo = contenido custom para el botón y la opción
 * El menú se dibuja en un portal con posición fija, así no lo corta una tabla con scroll.
 */
export default function Desplegable({ value, onChange, opciones, ariaLabel, placeholder = 'Elegí…', disabled, className = '', compacto, anchoMenu, alinear = 'izq' }) {
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const [pos, setPos] = useState(null)
  const boton = useRef(null)
  const menu = useRef(null)
  const actual = opciones.find(o => String(o.value) === String(value))

  const ubicar = () => {
    const r = boton.current?.getBoundingClientRect()
    if (!r) return
    const ancho = Math.max(r.width, anchoMenu ?? 0)
    const alto = Math.min(320, opciones.length * 44 + 12)
    const abajo = window.innerHeight - r.bottom > alto + 12 || r.top < alto + 12
    let left = alinear === 'der' ? r.right - ancho : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - ancho - 8))
    setPos({ left, width: ancho, top: abajo ? r.bottom + 6 : undefined, bottom: abajo ? undefined : window.innerHeight - r.top + 6 })
  }
  useLayoutEffect(() => { if (abierto) ubicar() }, [abierto])
  useEffect(() => {
    if (!abierto) return
    setActivo(Math.max(0, opciones.findIndex(o => String(o.value) === String(value))))
    const fuera = e => { if (!boton.current?.contains(e.target) && !menu.current?.contains(e.target)) setAbierto(false) }
    const mover = () => ubicar()
    document.addEventListener('mousedown', fuera)
    window.addEventListener('resize', mover); window.addEventListener('scroll', mover, true)
    return () => { document.removeEventListener('mousedown', fuera); window.removeEventListener('resize', mover); window.removeEventListener('scroll', mover, true) }
  }, [abierto])
  useEffect(() => { menu.current?.querySelector('[data-activo=true]')?.scrollIntoView({ block: 'nearest' }) }, [activo, abierto])

  const elegir = o => { setAbierto(false); boton.current?.focus(); if (String(o.value) !== String(value)) onChange(o.value) }
  const teclas = e => {
    if (disabled) return
    if (!abierto && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setAbierto(true); return }
    if (!abierto) return
    if (e.key === 'Escape') { e.preventDefault(); setAbierto(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => Math.min(opciones.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opciones[activo] && elegir(opciones[activo]) }
    else if (e.key === 'Tab') setAbierto(false)
  }

  return (
    <>
      <button type="button" ref={boton} className={'desplegable' + (compacto ? ' compacto' : '') + (abierto ? ' abierto' : '') + (className ? ' ' + className : '')}
        aria-haspopup="listbox" aria-expanded={abierto} aria-label={ariaLabel} disabled={disabled}
        onClick={e => { e.stopPropagation(); setAbierto(a => !a) }} onKeyDown={teclas}>
        <span className="desplegable-valor">
          {actual ? (actual.nodo ?? <>{actual.icono}{actual.label}</>) : <span className="muted">{placeholder}</span>}
        </span>
        <ChevronDown size={15} className="chev" />
      </button>
      {abierto && pos && createPortal(
        <div ref={menu} className="desplegable-menu" role="listbox" aria-label={ariaLabel}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }} onMouseDown={e => e.stopPropagation()}>
          {opciones.map((o, i) => {
            const sel = String(o.value) === String(value)
            return (
              <button key={String(o.value)} type="button" role="option" aria-selected={sel} data-activo={i === activo}
                className={'desplegable-opcion' + (sel ? ' sel' : '') + (i === activo ? ' activo' : '')}
                onMouseEnter={() => setActivo(i)} onClick={e => { e.stopPropagation(); elegir(o) }}>
                <span className="desplegable-texto">
                  {o.nodo ?? <>{o.icono}<span><span>{o.label}</span>{o.ayuda && <small>{o.ayuda}</small>}</span></>}
                </span>
                {sel && <Check size={15} className="tilde" />}
              </button>
            )
          })}
        </div>, document.body)}
    </>
  )
}
