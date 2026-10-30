import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'

const limpiar = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Input con sugerencias propias (reemplaza al <datalist> del navegador). Sólo muestra opciones que coinciden con lo escrito. */
const Autocompletar = forwardRef(function Autocompletar({ value, onChange, opciones = [], max = 7, className = '', ...props }, ref) {
  const [abierto, setAbierto] = useState(false)
  const [activo, setActivo] = useState(0)
  const caja = useRef(null)
  const t = limpiar(value).trim()
  const lista = useMemo(() => {
    if (!t) return []
    const empiezan = [], contienen = []
    for (const o of opciones) {
      const l = limpiar(o)
      if (l === t) continue
      if (l.startsWith(t)) empiezan.push(o); else if (l.includes(t)) contienen.push(o)
    }
    return [...empiezan, ...contienen].slice(0, max)
  }, [t, opciones, max])
  useEffect(() => setActivo(0), [t])
  useEffect(() => {
    const cerrar = e => { if (!caja.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar); return () => document.removeEventListener('mousedown', cerrar)
  }, [])
  const elegir = o => { onChange(o); setAbierto(false) }
  const marcar = o => {
    const i = limpiar(o).indexOf(t)
    return i < 0 ? o : <>{o.slice(0, i)}<b>{o.slice(i, i + t.length)}</b>{o.slice(i + t.length)}</>
  }
  return (
    <div className={'autocompletar ' + className} ref={caja}>
      <input ref={ref} autoComplete="off" value={value} {...props}
        onChange={e => { onChange(e.target.value); setAbierto(true) }}
        onFocus={e => { setAbierto(true); props.onFocus?.(e) }}
        onKeyDown={e => {
          if (abierto && lista.length) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => (a + 1) % lista.length); return }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => (a - 1 + lista.length) % lista.length); return }
            if (e.key === 'Enter' && activo >= 0 && lista[activo]) { e.preventDefault(); elegir(lista[activo]); return }
            if (e.key === 'Escape') { setAbierto(false); return }
          }
          props.onKeyDown?.(e)
        }} />
      {abierto && lista.length > 0 && (
        <ul className="ac-lista" role="listbox">
          {lista.map((o, i) => (
            <li key={o} role="option" aria-selected={i === activo} className={i === activo ? 'activo' : ''}
              onMouseDown={e => { e.preventDefault(); elegir(o) }} onMouseEnter={() => setActivo(i)}>{marcar(o)}</li>
          ))}
        </ul>
      )}
    </div>
  )
})
export default Autocompletar
