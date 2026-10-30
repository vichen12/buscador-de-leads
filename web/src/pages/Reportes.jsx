import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Download, Send, MessageCircle, CalendarCheck, Trophy, Building2, FlaskConical, RefreshCw, Sparkles } from 'lucide-react'
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
    if (error) setError(error); else setDatos(data)
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
    <>
      <header className="cabecera">
        <div>
          <h1>Reportes</h1>
          <p className="saludo">Qué funciona y qué no: de dónde salen las respuestas, las reuniones y los clientes.</p>
        </div>
        <div className="acciones">
          <button type="button" className="btn" onClick={cargar} disabled={cargando}><RefreshCw size={15} className={cargando ? 'spin' : ''} /> Actualizar</button>
          <button type="button" className="btn ia" disabled={!datos} onClick={() => {
            const t = datos.totales
            const top = (l, n = 5) => l.slice(0, n).map(x => `${x.clave}: ${x.respondieron}/${x.contactados}`).join('; ')
            window.dispatchEvent(new CustomEvent('preguntar-a-claude', { detail: `Sos mi coach de ventas. Analizá mis resultados del ${desde} al ${hasta} y decime 3 cosas concretas para mejorar la semana que viene. Envíos ${t.enviados}, contactadas ${t.contactados}, respondieron ${t.respondieron}, reuniones ${t.reuniones}, clientes ${t.clientes}. Por rubro (respondieron/contactadas): ${top(datos.por_rubro)}. Por zona: ${top(datos.por_zona)}. Mensajes personalizados vs genéricos: ${top(datos.por_personalizacion)}. Motivos de pérdida: ${datos.motivos_perdida.map(m => m.clave + ' ' + m.cantidad).join(', ') || 'ninguno'}.` }))
          }}><Sparkles size={15} /> Consejos de Claude</button>
          <button type="button" className="btn primario" onClick={exportar} disabled={!datos}><Download size={15} /> Descargar Excel</button>
        </div>
      </header>

      <div className="filtros-reporte tarjeta">
        <label>Período
          <select value={rango} onChange={e => setRango(e.target.value)}>{RANGOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        {rango === 'otro' && <>
          <label>Desde<input type="date" value={desde} max={hasta} onChange={e => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} min={desde} max={hoy} onChange={e => setHasta(e.target.value)} /></label>
        </>}
        {equipo && (
          <label>De quién
            <select value={quien} onChange={e => setQuien(e.target.value)}>
              <option value="todos">Todo el equipo</option>
              <option value="yo">Sólo lo mío</option>
              {Object.entries(nombres).filter(([id]) => id !== session.user.id).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
          </label>
        )}
      </div>

      {error ? <ErrorCarga error={error} onReintentar={cargar} />
        : !datos ? <Esqueleto filas={6} />
        : <Contenido d={datos} nombres={nombres} equipo={equipo} cargando={cargando} />}
    </>
  )
}

function Contenido({ d, nombres, equipo, cargando }) {
  const t = d.totales
  const maxDia = Math.max(1, ...d.por_dia.map(x => Math.max(x.enviados, x.respuestas)))
  const sinNada = !t.enviados && !t.contactados && !Object.keys(d.embudo).length
  if (sinNada) return <Vacio icono={BarChart3} titulo="Todavía no hay datos para este período">Cuando empieces a contactar empresas vas a ver acá qué rubros, zonas y mensajes te traen más respuestas.</Vacio>
  const embudo = ['pendiente', 'contactado', 'respondio', 'reunion', 'propuesta', 'cliente', 'perdido']
  const maxEmb = Math.max(1, ...embudo.map(e => d.embudo[e] ?? 0))
  return (
    <div style={{ opacity: cargando ? 0.6 : 1, transition: 'opacity .2s' }}>
      <div className="kpis">
        <Kpi icono={Send} titulo="Envíos" valor={t.enviados} pie={`${t.contactados} empresas contactadas`} />
        <Kpi icono={MessageCircle} titulo="Tasa de respuesta" valor={`${pct(t.respondieron, t.contactados)}%`} pie={`${t.respondieron} de ${t.contactados} respondieron`} />
        <Kpi icono={CalendarCheck} titulo="Reuniones" valor={t.reuniones} pie={`${pct(t.reuniones, t.contactados)}% de las contactadas`} />
        <Kpi icono={Trophy} titulo="Clientes" valor={t.clientes} pie={`${pct(t.clientes, t.contactados)}% de las contactadas`} />
        <Kpi icono={Building2} titulo="Empresas nuevas" valor={t.nuevas_empresas} pie="Sumadas a tu lista" />
      </div>

      <div className="dos-col">
        <section className="tarjeta">
          <h3 className="titulo-tarjeta">Embudo actual</h3>
          <div className="embudo">
            {embudo.map(e => {
              const n = d.embudo[e] ?? 0
              return (
                <div key={e} className="embudo-fila con-valor">
                  <span>{ESTADOS[e].label}</span>
                  <span className="embudo-barra"><span style={{ width: `${Math.max(2, (n / maxEmb) * 100)}%`, background: ESTADOS[e].barra }} /></span>
                  <b>{n}</b>
                  <small className="muted">{d.valor_por_estado[e] ? plata(d.valor_por_estado[e]) : ''}</small>
                </div>
              )
            })}
          </div>
        </section>
        <section className="tarjeta">
          <h3 className="titulo-tarjeta">Envíos y respuestas por día</h3>
          <div className="barras-dia" role="img" aria-label="Envíos y respuestas por día">
            {d.por_dia.map(x => (
              <div key={x.dia} className="barra-dia" title={`${x.dia}: ${x.enviados} envíos, ${x.respuestas} respuestas`}>
                <i className="env" style={{ height: `${(x.enviados / maxDia) * 100}%` }} />
                <i className="resp" style={{ height: `${(x.respuestas / maxDia) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="leyenda"><span><i className="env" /> Envíos</span><span><i className="resp" /> Respuestas</span></div>
          {!!Object.keys(d.clasificacion_respuestas).length && (
            <div className="chips-fila">
              {Object.entries(d.clasificacion_respuestas).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="chip">{CLASES[k] ?? k}: <b>{v}</b></span>)}
            </div>
          )}
        </section>
      </div>

      <Tabla titulo="Por rubro" ayuda="Qué tipo de empresa te contesta más" filas={d.por_rubro} />
      <Tabla titulo="Por zona" filas={d.por_zona} />
      <Tabla titulo="Por búsqueda" ayuda="Qué búsquedas te trajeron mejores empresas" filas={d.por_busqueda} />
      <div className="dos-col">
        <Tabla titulo='Por "te sirve"' ayuda="¿Las que marcaste con más llamas responden más?" filas={d.por_calificacion} etiqueta={r => (r.clave === 'sin' ? 'Sin calificar' : '🔥'.repeat(Number(r.clave)))} />
        <Tabla titulo="Por tipo de mensaje" ayuda="Mensajes con frases personalizadas vs. genéricos" filas={d.por_personalizacion} sinTotal />
      </div>
      {equipo && <Tabla titulo="Por vendedor" filas={d.por_vendedor} etiqueta={r => nombres[r.owner_id] || 'Sin nombre'} extra={r => plata(r.valor_ganado)} extraTitulo="Ganado" />}

      <div className="dos-col">
        <section className="tarjeta">
          <h3 className="titulo-tarjeta">Por qué se perdieron</h3>
          {!d.motivos_perdida.length ? <p className="muted">No hay empresas perdidas. ¡Bien!</p> : (
            <table className="tabla compacta"><thead><tr><th>Motivo</th><th>Empresas</th><th>Valor estimado</th></tr></thead>
              <tbody>{d.motivos_perdida.map(m => <tr key={m.clave}><td className="fuerte">{MOTIVOS_PERDIDO[m.clave] ?? 'Sin motivo'}</td><td>{m.cantidad}</td><td>{plata(m.valor)}</td></tr>)}</tbody></table>
          )}
        </section>
        <section className="tarjeta">
          <h3 className="titulo-tarjeta">Por canal</h3>
          {!d.por_canal.length ? <p className="muted">Sin envíos en este período.</p> : (
            <table className="tabla compacta"><thead><tr><th>Canal</th><th>Envíos</th><th>Empresas</th></tr></thead>
              <tbody>{d.por_canal.map(c => <tr key={c.clave}><td className="fuerte">{CANALES[c.clave] ?? c.clave}</td><td>{c.enviados}</td><td>{c.empresas}</td></tr>)}</tbody></table>
          )}
        </section>
      </div>

      <section className="tarjeta">
        <h3 className="titulo-tarjeta"><FlaskConical size={16} /> Pruebas A/B de asunto</h3>
        {!d.ab.length ? <p className="muted">En Envío masivo podés probar dos asuntos: la mitad recibe uno y la mitad el otro, y acá ves cuál funcionó mejor.</p> : (
          <table className="tabla compacta"><thead><tr><th>Envío</th><th>Variante</th><th>Asunto</th><th>Enviados</th><th>Respondieron</th><th>Tasa</th></tr></thead>
            <tbody>{d.ab.map(a => {
              const otra = d.ab.find(b => b.lote_id === a.lote_id && b.variante !== a.variante)
              const gana = otra && a.enviados >= 10 && pct(a.respondieron, a.enviados) > pct(otra.respondieron, otra.enviados)
              return <tr key={a.lote_id + a.variante}><td>{a.lote}</td><td><span className="chip">{a.variante.toUpperCase()}</span></td><td className="fuerte">{a.asunto}{gana && <span className="chip ok" style={{ marginLeft: 8 }}>Ganador</span>}</td><td>{a.enviados}</td><td>{a.respondieron}</td><td>{pct(a.respondieron, a.enviados)}%</td></tr>
            })}</tbody></table>
        )}
      </section>
    </div>
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

function Kpi({ icono: Icono, titulo, valor, pie }) {
  return (
    <div className="kpi">
      <div className="kpi-top"><span>{titulo}</span><span className="kpi-icono" style={{ color: '#ff4a1c', background: '#fff1ec' }}><Icono size={16} /></span></div>
      <b>{typeof valor === 'number' ? <Contador valor={valor} /> : valor}</b>
      {pie && <small>{pie}</small>}
    </div>
  )
}
