import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Globe2, MapPin, Star, X, Building2, Check } from 'lucide-react'
import { PAISES, REGIONES, PROVINCIAS_AR, CIUDADES, ZONAS, REGIONES_PAIS, nombrePais, lugaresDe } from '../lib/catalogo.js'

const limpiar = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/**
 * "Dónde": país, provincia, ciudad o lo que escribas. Al abrir muestra todo agrupado (tus zonas, países,
 * provincias, ciudades); al escribir filtra en todos los grupos.
 */
const SelectorZona = forwardRef(function SelectorZona({ value = '', onChange, sugeridas = [], disabled, multi = false, seleccionadas = [], placeholder = 'País, provincia o ciudad', pais = '', region = '', soloPais = '' }, ref) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState(multi ? '' : value)
  const [activo, setActivo] = useState(0)
  const caja = useRef(null)
  useEffect(() => { if (!multi) setTexto(value) }, [value, multi])
  useEffect(() => {
    const cerrar = e => { if (!caja.current?.contains(e.target)) { setAbierto(false); if (!multi) setTexto(t => { if (t.trim() && t !== value) onChange(t.trim()); return t }) } }
    document.addEventListener('mousedown', cerrar); return () => document.removeEventListener('mousedown', cerrar)
  }, [value])

  const gruposPais = useMemo(() => {
    if (!soloPais) return null
    // Un solo país: dos columnas limpias (ciudades y provincias/regiones), sin repetir nada
    const vistos = new Set()
    const unicos = arr => arr.filter(x => { const k = limpiar(x); if (!x || vistos.has(k)) return false; vistos.add(k); return true }).map(v => ({ v }))
    const mza = soloPais === 'AR' && region === 'Mendoza' ? ['Gran Mendoza', ...ZONAS.flatMap(g => g.items)] : []
    const ciudades = unicos([...mza, ...(CIUDADES.find(c => c.pais === nombrePais(soloPais))?.items ?? []), ...sugeridas.filter(z => !(REGIONES_PAIS[soloPais] ?? []).some(r => limpiar(r) === limpiar(z)))])
    const regiones = unicos(REGIONES_PAIS[soloPais] ?? [])
    return [
      { titulo: 'Ciudades', icono: Building2, items: ciudades },
      { titulo: soloPais === 'AR' ? 'Provincias' : soloPais === 'MX' || soloPais === 'BR' || soloPais === 'US' ? 'Estados' : 'Regiones', icono: MapPin, items: regiones },
    ].filter(g => g.items.length)
  }, [sugeridas, soloPais, region])
  const gruposTodos = useMemo(() => [
    { titulo: 'Tus zonas', icono: Star, items: sugeridas.map(z => ({ v: z })), chips: true },
    { titulo: 'Países', icono: Globe2, items: PAISES.map(p => ({ v: p.nombre })), chips: true },
    { titulo: 'Varios países', icono: Globe2, items: REGIONES.map(v => ({ v })), chips: true },
    ...(pais && pais !== 'AR' && REGIONES_PAIS[pais] ? [{ titulo: `Regiones · ${nombrePais(pais)}`, icono: MapPin, items: REGIONES_PAIS[pais].map(r => ({ v: `${r}, ${nombrePais(pais)}`, label: r })), chips: true }] : []),
    { titulo: 'Provincias de Argentina', icono: MapPin, items: PROVINCIAS_AR.map(p => ({ v: p === 'CABA' ? 'CABA, Argentina' : `${p}, Argentina`, label: p })), chips: true },
    // Primero las ciudades del país de la cuenta
    ...[...CIUDADES].sort((a, b) => (b.pais === nombrePais(pais)) - (a.pais === nombrePais(pais))).map(c => ({ titulo: `Ciudades · ${c.pais}`, icono: Building2, items: c.items.map(x => ({ v: c.pais === 'Argentina' ? x : `${x}, ${c.pais}`, label: x })), chips: true })),
    ...(pais === 'AR' && region === 'Mendoza' ? [{ titulo: 'Mendoza', icono: MapPin, items: ZONAS.flatMap(g => g.items).map(x => ({ v: x })), chips: true }] : []),
  ].filter(g => g.items.length), [sugeridas, pais, region])
  const grupos = gruposPais ?? gruposTodos

  const t = limpiar(texto)
  const filtrando = !!t && (multi || limpiar(texto) !== limpiar(value))
  const visibles = useMemo(() => {
    if (!filtrando) return grupos
    return grupos.map(g => ({ ...g, items: g.items.filter(i => limpiar(i.label ?? i.v).includes(t) || limpiar(i.v).includes(t)) })).filter(g => g.items.length)
  }, [grupos, t, filtrando])
  const planos = visibles.flatMap(g => g.items)
  useEffect(() => setActivo(0), [t])

  const elegir = v => { if (!v) return; onChange(v); setTexto(multi ? '' : v); setAbierto(false) }
  const teclas = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setActivo(a => Math.min(planos.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && abierto) {
      if (filtrando && planos[activo]) { e.preventDefault(); elegir(planos[activo].v) }
      else { e.preventDefault(); setAbierto(false); if (texto.trim()) { onChange(texto.trim()); if (multi) setTexto('') } }
    } else if (e.key === 'Escape') setAbierto(false)
  }
  let idx = -1

  return (
    <div className="selector-zona" ref={caja}>
      <div className="sz-input">
        <input ref={ref} value={texto} disabled={disabled} placeholder={placeholder}
          onFocus={() => setAbierto(true)} onChange={e => { setTexto(e.target.value); setAbierto(true) }} onKeyDown={teclas}
          role="combobox" aria-expanded={abierto} aria-label="Dónde buscar" />
        {texto && !disabled && <button type="button" className="sz-limpiar" onClick={() => { setTexto(''); if (!multi) onChange(''); setAbierto(true) }} aria-label="Borrar"><X size={13} /></button>}
      </div>
      {abierto && !disabled && (
        <div className="sz-panel" role="listbox">
          {filtrando && !planos.length && (
            <button type="button" className="sz-libre" onClick={() => elegir(texto.trim())}><MapPin size={14} /> Buscar en “{texto.trim()}”</button>
          )}
          <div className={soloPais && !filtrando ? 'sz-columnas' : ''}>
          {visibles.map(g => {
            const Icono = g.icono
            return (
              <div key={g.titulo} className="sz-grupo">
                <div className="sz-titulo"><Icono size={13} /> {g.titulo}</div>
                <div className={g.chips && !filtrando ? 'sz-chips' : 'sz-lista'}>
                  {g.items.slice(0, filtrando ? 8 : 40).map(i => {
                    idx++
                    const on = multi ? seleccionadas.some(z => limpiar(z) === limpiar(i.v)) : limpiar(i.v) === limpiar(value)
                    return (
                      <button key={g.titulo + i.v} type="button" role="option" aria-selected={on}
                        className={(on ? 'on ' : '') + (filtrando && idx === activo ? 'activo' : '')}
                        onMouseDown={e => e.preventDefault()} onClick={() => elegir(i.v)}>
                        <span>{i.label ?? i.v}</span>{i.extra && <small> · {i.extra}</small>}{on && <Check size={14} className="sz-check" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      )}
    </div>
  )
})
export default SelectorZona
