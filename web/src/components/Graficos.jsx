// Gráficos livianos en SVG (sin librerías): área doble, dona, barras horizontales y mini línea.
import { useState } from 'react'

const fmt = n => Number(n || 0).toLocaleString('es-AR')

/** Dos series en el tiempo (ej.: envíos y respuestas por día) con tooltip */
export function AreaDoble({ datos, series, alto = 190 }) {
  const [hover, setHover] = useState(null)
  const W = 640, H = alto, pad = { l: 30, r: 10, t: 12, b: 24 }
  const n = datos.length
  if (!n) return null
  const max = Math.max(1, ...datos.flatMap(d => series.map(s => d[s.clave] || 0)))
  const tope = Math.ceil(max / 4) * 4 || 4
  const x = i => pad.l + (n === 1 ? 0 : (i / (n - 1)) * (W - pad.l - pad.r))
  const y = v => pad.t + (1 - v / tope) * (H - pad.t - pad.b)
  // Curva suave (que no se pasa por debajo de cero)
  const camino = clave => {
    const p = datos.map((d, i) => [x(i), y(d[clave] || 0)])
    if (p.length < 3) return p.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join(' ')
    const base = y(0)
    let out = `M${p[0][0].toFixed(1)},${p[0][1].toFixed(1)}`
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[i - 1] ?? p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] ?? p2
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, Math.min(base, p1[1] + (p2[1] - p0[1]) / 6)]
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, Math.min(base, p2[1] - (p3[1] - p1[1]) / 6)]
      out += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`
    }
    return out
  }
  const area = clave => `${camino(clave)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`
  const marcas = [0, tope / 2, tope]
  const cadaCuanto = Math.max(1, Math.ceil(n / 7))
  return (
    <div className="grafico" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={series.map(s => s.nombre).join(' y ') + ' por día'}>
        <defs>{series.map(s => (
          <linearGradient key={s.clave} id={'g-' + s.clave} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity=".28" /><stop offset="1" stopColor={s.color} stopOpacity="0" /></linearGradient>
        ))}</defs>
        {marcas.map(m => <g key={m}><line x1={pad.l} x2={W - pad.r} y1={y(m)} y2={y(m)} className="g-guia" /><text x={pad.l - 6} y={y(m) + 3} textAnchor="end" className="g-eje">{fmt(m)}</text></g>)}
        {series.map(s => <path key={'a' + s.clave} d={area(s.clave)} fill={`url(#g-${s.clave})`} />)}
        {series.map(s => <path key={'l' + s.clave} d={camino(s.clave)} fill="none" stroke={s.color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
        {datos.map((d, i) => i % cadaCuanto === 0 && <text key={'x' + i} x={x(i)} y={H - 6} textAnchor="middle" className="g-eje">{d.etiqueta}</text>)}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} className="g-cursor" />}
        {hover !== null && series.map(s => <circle key={'c' + s.clave} cx={x(hover)} cy={y(datos[hover][s.clave] || 0)} r="4" fill="#fff" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
        {datos.map((d, i) => <rect key={'h' + i} x={x(i) - (W / n) / 2} y={0} width={W / n} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />)}
      </svg>
      {hover !== null && (
        <div className="g-tooltip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{datos[hover].titulo || datos[hover].etiqueta}</b>
          {series.map(s => <span key={s.clave}><i style={{ background: s.color }} />{s.nombre}: <b>{fmt(datos[hover][s.clave])}</b></span>)}
        </div>
      )}
      <div className="leyenda">{series.map(s => <span key={s.clave}><i style={{ background: s.color }} /> {s.nombre}</span>)}</div>
    </div>
  )
}

/** Dona con leyenda */
export function Dona({ items, centro, sub, tam = 150 }) {
  const total = items.reduce((a, i) => a + (i.valor || 0), 0)
  const r = 42, c = 2 * Math.PI * r
  let acum = 0
  return (
    <div className="dona">
      <svg width={tam} height={tam} viewBox="0 0 100 100" role="img" aria-label={items.map(i => `${i.label}: ${i.valor}`).join(', ')}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#f2eee8" strokeWidth="13" />
        {total > 0 && items.filter(i => i.valor > 0).map(i => {
          const largo = (i.valor / total) * c
          const el = <circle key={i.label} cx="50" cy="50" r={r} fill="none" stroke={i.color} strokeWidth="13" strokeDasharray={`${Math.max(0, largo - 1)} ${c}`} strokeDashoffset={-acum} transform="rotate(-90 50 50)"><title>{`${i.label}: ${i.valor}`}</title></circle>
          acum += largo
          return el
        })}
        <text x="50" y="49" textAnchor="middle" className="dona-num">{centro ?? fmt(total)}</text>
        {sub && <text x="50" y="62" textAnchor="middle" className="dona-sub">{sub}</text>}
      </svg>
      <ul className="dona-leyenda">
        {items.map(i => <li key={i.label}><i style={{ background: i.color }} /><span>{i.label}</span><b>{fmt(i.valor)}</b>{total > 0 && <small>{Math.round((i.valor / total) * 100)}%</small>}</li>)}
      </ul>
    </div>
  )
}

/** Barras horizontales (ranking) */
export function BarrasH({ items, formato = fmt, color = 'var(--acc)' }) {
  const max = Math.max(1, ...items.map(i => i.valor || 0))
  return (
    <div className="barras-h">
      {items.map(i => (
        <div key={i.label} className="barra-h">
          <div className="barra-h-top"><span title={i.label}>{i.label}</span><b>{formato(i.valor)}</b></div>
          <div className="barra-h-fondo"><span style={{ width: `${Math.max(2, (i.valor / max) * 100)}%`, background: i.color || color }} /></div>
          {i.sub && <small className="muted">{i.sub}</small>}
        </div>
      ))}
    </div>
  )
}

/** Mini línea para KPIs */
export function Sparkline({ valores, color = 'var(--acc)', ancho = 90, alto = 26 }) {
  if (!valores?.length) return null
  const max = Math.max(1, ...valores)
  const p = valores.map((v, i) => `${(i / Math.max(1, valores.length - 1)) * ancho},${alto - 2 - (v / max) * (alto - 4)}`).join(' ')
  return <svg width={ancho} height={alto} className="sparkline" aria-hidden="true"><polyline points={p} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" /></svg>
}

/** Embudo: cada etapa con su barra y cuánto pasa a la siguiente */
export function Embudo({ etapas, onElegir }) {
  const max = Math.max(1, ...etapas.map(e => e.valor || 0))
  return (
    <div className="embudo-g">
      {etapas.map((e, i) => {
        const sig = etapas[i + 1]
        const pasa = sig && e.valor > 0 ? Math.round((sig.valor / e.valor) * 100) : null
        return (
          <div key={e.label} className="embudo-g-fila">
            <button type="button" className="embudo-g-etapa" onClick={() => onElegir?.(e)} title={`Ver ${e.label.toLowerCase()}`}>
              <span className="embudo-g-label">{e.label}</span>
              <span className="embudo-g-pista">{e.valor > 0 ? <span className="embudo-g-barra" style={{ width: `${Math.max(7, (e.valor / max) * 100)}%`, background: e.color }}><b>{fmt(e.valor)}</b></span> : <span className="embudo-g-cero">0</span>}</span>
            </button>
            {sig && <span className="embudo-g-pasa">{pasa === null ? '—' : `${pasa}% ↓`}</span>}
          </div>
        )
      })}
    </div>
  )
}

/** Barras verticales por día, apiladas (ej.: sumadas y rechazadas) */
export function BarrasDias({ datos, series, alto = 120 }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...datos.map(d => series.reduce((a, s) => a + (d[s.clave] || 0), 0)))
  return (
    <div className="barras-dias" onMouseLeave={() => setHover(null)}>
      <div className="barras-dias-zona" style={{ height: alto }}>
        {datos.map((d, i) => (
          <div key={i} className={'barras-dias-col' + (hover === i ? ' on' : '')} onMouseEnter={() => setHover(i)}>
            <div className="barras-dias-pila">
              {series.map(s => d[s.clave] > 0 && <span key={s.clave} style={{ height: `${(d[s.clave] / max) * 100}%`, background: s.color }} />)}
            </div>
            <small>{d.etiqueta}</small>
          </div>
        ))}
      </div>
      {hover !== null && <div className="g-tooltip barras-dias-tip" style={{ left: `${((hover + 0.5) / datos.length) * 100}%` }}><b>{datos[hover].titulo || datos[hover].etiqueta}</b>{series.map(s => <span key={s.clave}><i style={{ background: s.color }} />{s.nombre}: <b>{fmt(datos[hover][s.clave])}</b></span>)}</div>}
      <div className="leyenda">{series.map(s => <span key={s.clave}><i style={{ background: s.color }} /> {s.nombre}</span>)}</div>
    </div>
  )
}

/** Columnas agrupadas por día (ej.: envíos y respuestas), con guías y detalle al pasar el mouse */
export function Columnas({ datos, series, alto = 180 }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...datos.flatMap(d => series.map(s => d[s.clave] || 0)))
  const paso = max <= 4 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 60 ? 10 : Math.ceil(max / 5 / 10) * 10
  const tope = Math.ceil(max / paso) * paso
  const guias = Array.from({ length: Math.floor(tope / paso) + 1 }, (_, i) => i * paso)
  return (
    <div className="cols" onMouseLeave={() => setHover(null)}>
      <div className="cols-area" style={{ height: alto }}>
        <div className="cols-guias">{[...guias].reverse().map(g => <div key={g}><span>{fmt(g)}</span></div>)}</div>
        <div className="cols-dias">
          {datos.map((d, i) => (
            <div key={i} className={'cols-dia' + (hover === i ? ' on' : '')} onMouseEnter={() => setHover(i)}>
              <div className="cols-barras">{series.map(s => <span key={s.clave} style={{ height: `${((d[s.clave] || 0) / tope) * 100}%`, background: s.color }} />)}</div>
            </div>
          ))}
        </div>
        {hover !== null && (
          <div className="cols-tip" style={{ left: `calc(36px + (100% - 36px) * ${(hover + 0.5) / datos.length})` }}>
            <b>{datos[hover].titulo || datos[hover].etiqueta}</b>
            {series.map(s => <span key={s.clave}><i style={{ background: s.color }} />{s.nombre}<b>{fmt(datos[hover][s.clave])}</b></span>)}
          </div>
        )}
      </div>
      <div className="cols-ejes">{datos.map((d, i) => <span key={i}>{i % 2 === (datos.length - 1) % 2 ? d.etiqueta : ''}</span>)}</div>
    </div>
  )
}

/** Una barra partida en partes (ej.: sumadas / por revisar / rechazadas) */
export function BarraPartes({ partes }) {
  const total = partes.reduce((a, p) => a + (p.valor || 0), 0)
  return (
    <div className="partes">
      <div className="partes-barra">{total > 0 && partes.filter(p => p.valor > 0).map(p => <span key={p.label} style={{ width: `${(p.valor / total) * 100}%`, background: p.color }} title={`${p.label}: ${p.valor}`} />)}</div>
      <div className="partes-leyenda">{partes.map(p => (
        <div key={p.label}><i style={{ background: p.color }} /><span>{p.label}</span><b>{fmt(p.valor)}</b></div>
      ))}</div>
    </div>
  )
}
