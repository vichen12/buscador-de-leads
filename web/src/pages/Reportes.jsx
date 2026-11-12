import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, Send, MessageCircle, CalendarCheck, Trophy, Building2, FlaskConical, RefreshCw, Sparkles, Lightbulb, TrendingUp, TrendingDown, MapPin, Search, PenLine, ChevronDown, Target } from 'lucide-react'
import { Columnas, Embudo, BarraPartes } from '../components/Graficos.jsx'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { ESTADOS, MOTIVOS_PERDIDO, hoyLocal } from '../lib/util.js'
import { Esqueleto, ErrorCarga, Vacio, Contador } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const RANGOS = [['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días'], ['365', 'Último año'], ['otro', 'Elegir fechas']]
const CANALES = { email: 'Email', whatsapp: 'WhatsApp', llamada: 'Llamada', linkedin: 'LinkedIn', otro: 'Otro' }
const CLASES = { interesado: 'Interesado', pide_info: 'Pide info', reunion: 'Quiere reunión', no_interesado: 'No interesado', derivar: 'Derivó a otro', baja: 'Pidió la baja', otro: 'Otro' }
const restar = (iso, dias) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - dias); return d.toISOString().slice(0, 10) }
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)
const plata = n => (n ? '$ ' + Math.round(n).toLocaleString('es-AR') : '—')

export default function Reportes() {
  const { session, perfil } = useApp()
  const hoy = hoyLocal()
  const [rango, setRango] = useState('30')
  const [desde, setDesde] = useState(restar(hoy, 29))
  const [hasta, setHasta] = useState(hoy)
  const [quien, setQuien] = useState('todos')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [nombres, setNombres] = useState({})

  useEffect(() => { supabase.rpc('responsables').then(({ data }) => setNombres(Object.fromEntries((data ?? []).map(r => [r.id, r.nombre])))) }, [])
  useEffect(() => { if (rango !== 'otro') { setDesde(restar(hoy, Number(rango) - 1)); setHasta(hoy) } }, [rango])

  const cargar = async () => {
    if (!desde || !hasta || desde > hasta) return
    setCargando(true); setError(null)
    const p_owner = quien === 'yo' ? session.user.id : quien !== 'todos' ? quien : null
    const { data, error } = await supabase.rpc('reporte', { p_desde: desde, p_hasta: hasta, p_owner })
    if (error) setError(error); else if (data?.totales) setDatos(data); else setError(new Error('El reporte vino vacío. Probá de nuevo en un rato.'))
    setCargando(false)
  }
  useEffect(() => { cargar() }, [desde, hasta, quien])

  const equipo = Object.keys(nombres).length > 1

  const exportar = () => {
    if (!datos) return
    const filas = [['Reporte de Prospecta', `${desde} al ${hasta}`], []]
    const t = datos.totales
    filas.push(['Resumen'], ['Envíos', t.enviados], ['Empresas contactadas', t.contactados], ['Respondieron', t.respondieron], ['Tasa de respuesta', pct(t.respondieron, t.contactados) + '%'], ['Reuniones', t.reuniones], ['Clientes', t.clientes], [])
    const tabla = (titulo, lista, etiqueta = x => x.clave) => {
      filas.push([titulo], ['', 'Empresas', 'Contactadas', 'Respondieron', 'Tasa', 'Reuniones', 'Clientes'])
      for (const r of lista ?? []) filas.push([etiqueta(r), r.total ?? '', r.contactados, r.respondieron, pct(r.respondieron, r.contactados) + '%', r.reuniones ?? '', r.clientes])
      filas.push([])
    }
    tabla('Por rubro', datos.por_rubro); tabla('Por zona', datos.por_zona); tabla('Por búsqueda', datos.por_busqueda)
    tabla('Por "te sirve"', datos.por_calificacion, r => (r.clave === 'sin' ? 'Sin calificar' : '🔥'.repeat(Number(r.clave))))
    tabla('Por vendedor', datos.por_vendedor, r => nombres[r.owner_id] || 'Sin nombre')
    filas.push(['Motivos de pérdida'], ['Motivo', 'Cantidad', 'Valor estimado'])
    for (const m of datos.motivos_perdida ?? []) filas.push([MOTIVOS_PERDIDO[m.clave] ?? 'Sin motivo', m.cantidad, m.valor])
    filas.push([], ['Prueba A/B'], ['Envío', 'Variante', 'Asunto', 'Enviados', 'Respondieron', 'Tasa'])
    for (const a of datos.ab ?? []) filas.push([a.lote, a.variante.toUpperCase(), a.asunto, a.enviados, a.respondieron, pct(a.respondieron, a.enviados) + '%'])
    filas.push([], ['Día', 'Envíos', 'Respuestas'])
    for (const d of datos.por_dia ?? []) filas.push([d.dia, d.enviados, d.respuestas])
    const csv = '﻿' + filas.map(f => f.map(c => { const s = String(c ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(';')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `reporte-prospecta-${desde}-a-${hasta}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="home reportes">
      <header className="home-cab">
        <div>
          <p className="home-fecha">{new Date(desde + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} al {new Date(hasta + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <h1>Informe</h1>
          <p className="home-sub">Qué te funciona y qué no: qué empresas responden, dónde y con qué mensajes.</p>
        </div>
        <div className="rep-acciones">
          <button type="button" className="btn" onClick={cargar} disabled={cargando} title="Actualizar"><RefreshCw size={15} className={cargando ? 'spin' : ''} /></button>
          <button type="button" className="btn" onClick={exportar} disabled={!datos}><Download size={15} /> Excel</button>
          <button type="button" className="btn ia" disabled={!datos} onClick={() => {
            const t = datos.totales
            const top = (l, n = 5) => l.slice(0, n).map(x => `${x.clave}: ${x.respondieron}/${x.contactados}`).join('; ')
            window.dispatchEvent(new CustomEvent('preguntar-a-claude', { detail: `Sos mi coach de ventas. Analizá mis resultados del ${desde} al ${hasta} y decime 3 cosas concretas para mejorar la semana que viene. Envíos ${t.enviados}, contactadas ${t.contactados}, respondieron ${t.respondieron}, reuniones ${t.reuniones}, clientes ${t.clientes}. Por rubro (respondieron/contactadas): ${top(datos.por_rubro)}. Por zona: ${top(datos.por_zona)}. Mensajes personalizados vs genéricos: ${top(datos.por_personalizacion)}. Motivos de pérdida: ${datos.motivos_perdida.map(m => m.clave + ' ' + m.cantidad).join(', ') || 'ninguno'}.` }))
          }}><Sparkles size={15} /> Consejos de Claude</button>
        </div>
      </header>

      <div className="rep-filtros">
        <div className="rep-pastillas" role="tablist">{RANGOS.map(([v, l]) => <button key={v} type="button" role="tab" aria-selected={rango === v} className={rango === v ? 'on' : ''} onClick={() => setRango(v)}>{l.replace('Últimos ', '').replace('Último ', '1 ')}</button>)}</div>
        {rango === 'otro' && <div className="rep-fechas"><input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /><span>al</span><input type="date" value={hasta} min={desde} max={hoy} onChange={e => setHasta(e.target.value)} /></div>}
        {equipo && (
          <select className="rep-quien" value={quien} onChange={e => setQuien(e.target.value)}>
            <option value="todos">Todo el equipo</option>
            <option value="yo">Sólo lo mío</option>
            {Object.entries(nombres).filter(([id]) => id !== session.user.id).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
        )}
      </div>

      {error ? <ErrorCarga error={error} onReintentar={cargar} />
        : !datos ? <Esqueleto filas={6} />
        : <Contenido d={datos} nombres={nombres} equipo={equipo} cargando={cargando} />}
    </div>
  )
}

/** Lo mejor de una lista (con al menos `min` contactadas para que no sea casualidad) */
function mejor(lista, min = 3) {
  const val = (lista ?? []).filter(x => x.contactados >= min && x.clave && x.clave !== 'sin')
  if (val.length < 2) return null
  const orden = [...val].sort((a, b) => pct(b.respondieron, b.contactados) - pct(a.respondieron, a.contactados) || b.contactados - a.contactados)
  return { top: orden[0], peor: orden.at(-1) }
}

/** Conclusiones en palabras, para entender el reporte sin leer tablas */
function conclusiones(d) {
  const t = d.totales, out = []
  const tasa = pct(t.respondieron, t.contactados)
  if (t.contactados) out.push({ icono: MessageCircle, tono: tasa >= 10 ? 'bien' : tasa >= 4 ? 'medio' : 'mal', texto: <>De cada 100 empresas que contactaste, <b>{tasa} te respondieron</b>{tasa >= 10 ? ': muy buena tasa.' : tasa >= 4 ? ': está bien, se puede mejorar.' : ': es baja, probá mensajes más personalizados o rubros que respondan más.'}</> })
  const r = mejor(d.por_rubro)
  if (r) out.push({ icono: TrendingUp, tono: 'bien', texto: <>El rubro que más responde es <b>{r.top.clave}</b> ({pct(r.top.respondieron, r.top.contactados)}%). {pct(r.peor.respondieron, r.peor.contactados) < pct(r.top.respondieron, r.top.contactados) && <>El que menos: {r.peor.clave} ({pct(r.peor.respondieron, r.peor.contactados)}%).</>}</> })
  const z = mejor(d.por_zona)
  if (z) out.push({ icono: MapPin, tono: 'bien', texto: <>La zona que mejor te funciona es <b>{z.top.clave}</b>: {z.top.respondieron} de {z.top.contactados} respondieron.</> })
  const per = (d.por_personalizacion ?? []).find(x => /personal/i.test(x.clave)), gen = (d.por_personalizacion ?? []).find(x => /gen/i.test(x.clave))
  if (per && gen && per.contactados >= 3 && gen.contactados >= 3) {
    const a = pct(per.respondieron, per.contactados), b = pct(gen.respondieron, gen.contactados)
    out.push({ icono: PenLine, tono: a >= b ? 'bien' : 'medio', texto: a >= b ? <>Los mensajes <b>personalizados responden {a}%</b> contra {b}% de los genéricos: seguí personalizando.</> : <>Curioso: los genéricos responden {b}% y los personalizados {a}%. Revisá cómo estás personalizando.</> })
  }
  const motivo = d.motivos_perdida?.[0]
  if (motivo?.cantidad) out.push({ icono: TrendingDown, tono: 'mal', texto: <>Lo que más te hace perder es <b>{MOTIVOS_PERDIDO[motivo.clave] ?? 'sin motivo cargado'}</b> ({motivo.cantidad} {motivo.cantidad === 1 ? 'empresa' : 'empresas'}).</> })
  if (t.reuniones || t.clientes) out.push({ icono: Trophy, tono: 'bien', texto: <>Conseguiste <b>{t.reuniones} {t.reuniones === 1 ? 'reunión' : 'reuniones'}</b> y <b>{t.clientes} {t.clientes === 1 ? 'cliente' : 'clientes'}</b> en este período.</> })
  return out.slice(0, 4)
}

function Contenido({ d, nombres, equipo, cargando }) {
  const nav = useNavigate()
  const t = d.totales
  const sinNada = !t.enviados && !t.contactados && !Object.keys(d.embudo).length
  if (sinNada) return <Vacio icono={BarChart3} titulo="Todavía no hay datos para este período">Cuando empieces a contactar empresas vas a ver acá qué rubros, zonas y mensajes te traen más respuestas.</Vacio>
  const ideas = conclusiones(d)
  // Muchos días: se agrupa por semana para que se lea
  const dias = d.por_dia ?? []
  const porSemana = dias.length > 45
  const serie = porSemana
    ? Object.values(dias.reduce((a, x) => { const f = new Date(x.dia + 'T12:00:00'); const lunes = new Date(f); lunes.setDate(f.getDate() - ((f.getDay() + 6) % 7)); const k = lunes.toISOString().slice(0, 10); a[k] = a[k] ?? { etiqueta: `${lunes.getDate()}/${lunes.getMonth() + 1}`, titulo: `Semana del ${lunes.getDate()}/${lunes.getMonth() + 1}`, enviados: 0, respuestas: 0 }; a[k].enviados += x.enviados; a[k].respuestas += x.respuestas; return a }, {}))
    : dias.map(x => { const f = new Date(x.dia + 'T12:00:00'); return { etiqueta: `${f.getDate()}/${f.getMonth() + 1}`, titulo: f.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'numeric' }), enviados: x.enviados, respuestas: x.respuestas } })
  const clases = Object.entries(d.clasificacion_respuestas ?? {}).sort((a, b) => b[1] - a[1])
  const COLOR_CLASE = { interesado: '#15803d', reunion: '#0f766e', pide_info: '#2563eb', derivar: '#7c3aed', no_interesado: '#b91c1c', baja: '#78716c', otro: '#a8a29e' }
  return (
    <div style={{ opacity: cargando ? 0.6 : 1, transition: 'opacity .2s' }}>
      {ideas.length > 0 && (
        <section className="home-seccion">
          <h2 className="home-titulo">En pocas palabras</h2>
          <div className="rep-ideas">{ideas.map((x, i) => <div key={i} className={'rep-idea ' + x.tono}><span><x.icono size={17} /></span><p>{x.texto}</p></div>)}</div>
        </section>
      )}

      <section className="home-seccion">
        <h2 className="home-titulo">Los números</h2>
        <div className="rep-kpis">
          <Kpi to="/envios" titulo="Empresas contactadas" valor={t.contactados} pie={`${t.enviados} mensajes enviados`} />
          <Kpi to="/prospectos?estado=respondio" titulo="Respondieron" valor={`${pct(t.respondieron, t.contactados)}%`} pie={`${t.respondieron} de ${t.contactados}`} />
          <Kpi to="/prospectos?estado=reunion" titulo="Reuniones" valor={t.reuniones} pie={t.contactados ? `${pct(t.reuniones, t.contactados)}% de las contactadas` : ''} />
          <Kpi to="/prospectos?estado=cliente" titulo="Clientes" valor={t.clientes} pie={t.contactados ? `${pct(t.clientes, t.contactados)}% de las contactadas` : ''} verde />
          <Kpi to="/prospectos?orden=reciente" titulo="Empresas nuevas" valor={t.nuevas_empresas} pie="sumadas a tu lista" />
        </div>
      </section>

      <section className="home-seccion">
        <h2 className="home-titulo">Cómo fue el período</h2>
        <div className="home-grid">
          <article className="home-card ancho">
            <header><div><h3>Envíos y respuestas</h3><small>{porSemana ? 'Por semana' : 'Por día'} · pasá el mouse para ver el detalle</small></div>
              <div className="home-card-nums"><span><b>{t.enviados}</b><em><i style={{ background: '#fd4a22' }} />envíos</em></span><span><b>{t.respondieron}</b><em><i style={{ background: '#16161a' }} />respondieron</em></span></div></header>
            {serie.some(x => x.enviados || x.respuestas) ? <Columnas datos={serie} series={[{ clave: 'enviados', nombre: 'Envíos', color: '#fd4a22' }, { clave: 'respuestas', nombre: 'Respuestas', color: '#16161a' }]} /> : <div className="home-vacio"><Send size={18} /><span>Sin envíos en este período.</span></div>}
          </article>
          <article className="home-card">
            <header><div><h3>Dónde está cada empresa hoy</h3><small>Tocá una etapa para verlas</small></div></header>
            <Embudo onElegir={e => nav(`/prospectos?estado=${e.clave}`)} etapas={['pendiente', 'contactado', 'respondio', 'reunion', 'propuesta', 'cliente'].map(e => ({ clave: e, label: ESTADOS[e].label, valor: d.embudo[e] ?? 0, color: e === 'cliente' ? '#15803d' : '#fd4a22' }))} />
            {(d.embudo.perdido ?? 0) > 0 && <small className="muted">Además, {d.embudo.perdido} perdidas.</small>}
          </article>
          <article className="home-card">
            <header><div><h3>Qué te contestaron</h3><small>Cómo clasificó Claude las respuestas</small></div></header>
            {clases.length ? <BarraPartes partes={clases.slice(0, 6).map(([k, v]) => ({ label: CLASES[k] ?? k, valor: v, color: COLOR_CLASE[k] ?? '#a8a29e' }))} /> : <div className="home-vacio"><MessageCircle size={18} /><span>Todavía no hay respuestas en este período.</span></div>}
          </article>
        </div>
      </section>

      <section className="home-seccion">
        <h2 className="home-titulo">Qué te funciona mejor</h2>
        <div className="home-grid">
          <Ranking titulo="Por rubro" ayuda="Qué tipo de empresa te contesta más" icono={Building2} filas={d.por_rubro} />
          <Ranking titulo="Por zona" ayuda="Dónde te contestan más" icono={MapPin} filas={d.por_zona} />
          <Ranking titulo="Por búsqueda" ayuda="Qué búsquedas trajeron mejores empresas" icono={Search} filas={d.por_busqueda} />
          <Ranking titulo="Por tipo de mensaje" ayuda="Personalizados vs. genéricos" icono={PenLine} filas={d.por_personalizacion} />
          {equipo && <Ranking titulo="Por vendedor" ayuda="Cómo le va a cada uno" icono={Target} filas={d.por_vendedor} etiqueta={r => nombres[r.owner_id] || 'Sin nombre'} />}
          <article className="home-card">
            <header><div><h3>Por qué se perdieron</h3><small>Los motivos que cargaste</small></div></header>
            {!d.motivos_perdida.length ? <div className="home-vacio"><Trophy size={18} /><span>No perdiste ninguna en este período.</span></div> : (
              <div className="home-rubros">{d.motivos_perdida.slice(0, 5).map(m => <div key={m.clave}><span>{MOTIVOS_PERDIDO[m.clave] ?? 'Sin motivo'}</span><b>{m.cantidad}</b><div className="home-rubro-barra"><i style={{ width: `${(m.cantidad / d.motivos_perdida[0].cantidad) * 100}%`, background: '#8f887d' }} /></div></div>)}</div>
            )}
          </article>
        </div>
      </section>

      {d.ab.length > 0 && (
        <section className="home-seccion">
          <h2 className="home-titulo"><FlaskConical size={13} style={{ verticalAlign: -2 }} /> Pruebas de asunto (A/B)</h2>
          <div className="rep-ab">{Object.values(d.ab.reduce((a, x) => { (a[x.lote_id] = a[x.lote_id] ?? []).push(x); return a }, {})).map(par => {
            const [a, b] = par
            const ta = pct(a.respondieron, a.enviados), tb = b ? pct(b.respondieron, b.enviados) : 0
            return (
              <article key={a.lote_id} className="home-card"><header><div><h3>{a.lote}</h3><small>{a.enviados + (b?.enviados ?? 0)} enviados</small></div></header>
                {par.map(x => { const tx = pct(x.respondieron, x.enviados); const gana = b && x.enviados >= 10 && tx === Math.max(ta, tb) && ta !== tb
                  return <div key={x.variante} className={'rep-ab-fila' + (gana ? ' gana' : '')}><span className="chip">{x.variante.toUpperCase()}</span><p>{x.asunto}</p><b>{tx}%</b>{gana && <span className="chip ok">Ganó</span>}</div> })}
              </article>
            )
          })}</div>
        </section>
      )}

      <details className="rep-detalle">
        <summary><ChevronDown size={15} /> Ver todas las tablas con el detalle</summary>
        <Tabla titulo="Por rubro" filas={d.por_rubro} />
        <Tabla titulo="Por zona" filas={d.por_zona} />
        <Tabla titulo="Por búsqueda" filas={d.por_busqueda} />
        <Tabla titulo='Por "te sirve"' filas={d.por_calificacion} etiqueta={r => (r.clave === 'sin' ? 'Sin calificar' : '🔥'.repeat(Number(r.clave)))} />
        {equipo && <Tabla titulo="Por vendedor" filas={d.por_vendedor} etiqueta={r => nombres[r.owner_id] || 'Sin nombre'} extra={r => plata(r.valor_ganado)} extraTitulo="Ganado" />}
        <section className="tarjeta"><h3 className="titulo-tarjeta">Por canal</h3>
          {!d.por_canal.length ? <p className="muted">Sin envíos en este período.</p> : <table className="tabla compacta"><thead><tr><th>Canal</th><th>Envíos</th><th>Empresas</th></tr></thead><tbody>{d.por_canal.map(c => <tr key={c.clave}><td className="fuerte">{CANALES[c.clave] ?? c.clave}</td><td>{c.enviados}</td><td>{c.empresas}</td></tr>)}</tbody></table>}
        </section>
      </details>
    </div>
  )
}

/** Ranking en tarjeta: cada fila con cuántas respondieron de las contactadas y la mejor destacada */
function Ranking({ titulo, ayuda, icono: Icono, filas, etiqueta = r => r.clave }) {
  const lista = (filas ?? []).filter(r => r.contactados > 0).sort((a, b) => pct(b.respondieron, b.contactados) - pct(a.respondieron, a.contactados) || b.contactados - a.contactados).slice(0, 5)
  const max = Math.max(1, ...lista.map(r => pct(r.respondieron, r.contactados)))
  return (
    <article className="home-card">
      <header><div><h3>{titulo}</h3><small>{ayuda}</small></div><span className="rep-icono"><Icono size={16} /></span></header>
      {!lista.length ? <div className="home-vacio"><Icono size={18} /><span>Todavía no contactaste empresas en este período.</span></div> : (
        <div className="rep-ranking">{lista.map((r, i) => {
          const tasa = pct(r.respondieron, r.contactados)
          return (
            <div key={i} className={i === 0 && lista.length > 1 && tasa > 0 ? 'top' : ''}>
              <span title={etiqueta(r)}>{etiqueta(r) === 'sin' ? 'Sin dato' : etiqueta(r)}</span>
              <b>{tasa}%</b>
              <div className="home-rubro-barra"><i style={{ width: `${(tasa / max) * 100}%`, background: i === 0 && tasa > 0 ? '#15803d' : undefined }} /></div>
              <small>{r.respondieron} de {r.contactados} respondieron{r.clientes ? ` · ${r.clientes} ${r.clientes === 1 ? 'cliente' : 'clientes'}` : ''}</small>
            </div>
          )
        })}</div>
      )}
    </article>
  )
}

function Tabla({ titulo, ayuda, filas, etiqueta = r => r.clave, sinTotal, extra, extraTitulo }) {
  const lista = useMemo(() => (filas ?? []).slice(0, 15), [filas])
  return (
    <section className="tarjeta">
      <h3 className="titulo-tarjeta">{titulo}{ayuda && <small className="muted"> · {ayuda}</small>}</h3>
      {!lista.length ? <p className="muted">Sin datos en este período.</p> : (
        <div className="tabla-scroll">
          <table className="tabla compacta">
            <thead><tr><th></th>{!sinTotal && <th>Empresas</th>}<th>Contactadas</th><th>Respondieron</th><th>Tasa</th>{!sinTotal && <th>Reuniones</th>}<th>Clientes</th>{extra && <th>{extraTitulo}</th>}</tr></thead>
            <tbody>{lista.map((r, i) => {
              const tasa = pct(r.respondieron, r.contactados)
              return (
                <tr key={i}>
                  <td className="fuerte">{etiqueta(r)}</td>{!sinTotal && <td>{r.total}</td>}<td>{r.contactados}</td><td>{r.respondieron}</td>
                  <td><span className="tasa"><i style={{ width: `${Math.min(100, tasa)}%` }} /></span> {r.contactados ? `${tasa}%` : '—'}</td>
                  {!sinTotal && <td>{r.reuniones}</td>}<td>{r.clientes}</td>{extra && <td>{extra(r)}</td>}
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// Con "to", el número lleva a la lista ya filtrada
function Kpi({ titulo, valor, pie, verde, to }) {
  const Tag = to ? Link : 'div'
  return (
    <Tag {...(to ? { to, title: 'Ver la lista' } : {})} className={'home-kpi rep-kpi' + (verde ? ' verde' : '') + (to ? ' kpi-link' : '')}>
      <small>{titulo}</small>
      <div><b>{typeof valor === 'number' ? <Contador valor={valor} /> : valor}</b></div>
      {pie && <span className="rep-kpi-pie">{pie}</span>}
    </Tag>
  )
}
