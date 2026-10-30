import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Loader2, MapPin, Sparkles, Check, SlidersHorizontal, Store, ArrowRight, ChevronDown, X, Plus, Download, Inbox, Wand2, Pencil } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { descargarExcel, filaEmpresa } from '../lib/excel.js'
import { motivoHallazgo, aprobarHallazgos, descartarHallazgos } from '../lib/hallazgos.js'
import TarjetaHallazgo from '../components/TarjetaHallazgo.jsx'
import Desplegable from '../components/Desplegable.jsx'
import { RUBROS, ZONAS, zonaCompleta } from '../lib/catalogo.js'
import { Aviso, useToast } from '../components/ui.jsx'
import Autocompletar from '../components/Autocompletar.jsx'
import SelectorZona from '../components/SelectorZona.jsx'
import { useApp } from '../App.jsx'

const FILTROS_DEFECTO = [
  { id: 'con_telefono', titulo: 'Con teléfono o WhatsApp', descripcion: 'Que tenga un número para escribirle.', activo: true },
  { id: 'con_email', titulo: 'Con email', descripcion: 'Que tenga un email de contacto.', activo: false },
  { id: 'con_instagram', titulo: 'Con Instagram', descripcion: 'Que tenga Instagram.', activo: false },
]
const PASOS = ['Buscando en Google Maps…', 'Mirando directorios y redes…', 'Recorriendo la zona…', 'Revisando que encajen con lo que pediste…']

/** Lista de chips que se pueden sacar y agregar */
function ChipsEditables({ items, onChange, tipo, placeholder }) {
  const [nuevo, setNuevo] = useState('')
  const agregar = () => { const t = nuevo.trim(); if (t && !items.includes(t)) onChange([...items, t]); setNuevo('') }
  return (
    <div className={'chips-edit ' + tipo}>
      {items.map(i => <span key={i} className="chip-edit">{i}<button type="button" onClick={() => onChange(items.filter(x => x !== i))} aria-label={'Sacar ' + i}><X size={12} /></button></span>)}
      <span className="chip-nuevo"><Plus size={12} /><input value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder={placeholder}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar() } }} onBlur={agregar} /></span>
    </div>
  )
}

export default function BuscarPlaces() {
  const toast = useToast()
  const nav = useNavigate()
  const { servicios, refrescar, perfil, comercial } = useApp()
  const [brief, setBrief] = useState(null)
  const [cupo, setCupo] = useState(null)
  useEffect(() => { if (brief) supabase.rpc('mi_cupo_chat').then(({ data }) => setCupo(data ?? null)) }, [brief])
  const quedan = cupo ? Math.max(0, cupo.limite - cupo.usados) : null
  const [entendiendo, setEntendiendo] = useState(false)
  const [ocupados, setOcupados] = useState(new Set())
  const est = comercial?.estrategia?.rubros?.length ? comercial.estrategia : null
  const sugRubros = useMemo(() => est ? est.rubros.map(r => r.nombre) : ['barbería', 'centro de estética', 'veterinaria', 'gimnasio', 'estudio contable', 'inmobiliaria', 'restaurante', 'taller mecánico'], [est])
  const sugZonas = useMemo(() => est?.zonas?.length ? est.zonas : ['Ciudad de Mendoza', 'Godoy Cruz', 'Guaymallén', 'Las Heras', 'Luján de Cuyo', 'Maipú'], [est])
  const todosRubros = useMemo(() => [...new Set([...sugRubros, ...RUBROS.flatMap(g => g.items)])], [sugRubros])
  const todasZonas = useMemo(() => [...new Set([...sugZonas, ...ZONAS.flatMap(g => g.items), 'Gran Mendoza', 'Todo Mendoza', 'San Juan', 'San Luis', 'Neuquén', 'Córdoba', 'Rosario', 'Buenos Aires', 'CABA', 'Todo el país'])], [sugZonas])
  const filtros = est?.filtros?.length ? est.filtros : FILTROS_DEFECTO

  const [rubro, setRubro] = useState('')
  const [zona, setZona] = useState(sugZonas[0])
  const [cantidad, setCantidad] = useState(20)
  const [activos, setActivos] = useState(() => new Set(filtros.filter(f => f.activo).map(f => f.id)))
  const [pedido, setPedido] = useState('')
  const [verFiltros, setVerFiltros] = useState(false)
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [seg, setSeg] = useState(0)
  const [historial, setHistorial] = useState([])
  const resultadosRef = useRef(null)
  const rubroRef = useRef(null)

  useEffect(() => { setActivos(new Set(filtros.filter(f => f.activo).map(f => f.id))); if (est?.zonas?.[0]) setZona(est.zonas[0]) }, [comercial])
  const cargarHistorial = () => supabase.from('busquedas').select('*').order('created_at', { ascending: false }).limit(6).then(({ data }) => setHistorial(data ?? []))
  useEffect(() => { cargarHistorial() }, [])

  const filtrosActivos = filtros.filter(f => activos.has(f.id))
  const alternar = id => setActivos(a => { const n = new Set(a); n.has(id) ? n.delete(id) : n.add(id); return n })

  const sinTilde = z => z.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const zonaNormal = z => todasZonas.find(o => sinTilde(o) === sinTilde(z)) ?? z.trim()

  // Paso 1: Claude cuenta cómo entendió el pedido (qué entra y qué no) y la persona lo ajusta
  async function entender(e) {
    e?.preventDefault()
    if (!rubro.trim()) { rubroRef.current?.focus(); return }
    if (!zona.trim()) return
    const z = zonaNormal(zona)
    setZona(z)
    setEntendiendo(true); setError(''); setRes(null); setBrief(null)
    try {
      const r = await llamarFuncion('buscar-negocios', { modo: 'interpretar', rubro: rubro.trim(), zona: zonaCompleta(z) })
      setBrief({ ...r.brief, _aprendizaje: r.aprendizaje })
    } catch (err) { setError(mensajeError(err)) }
    setEntendiendo(false)
  }

  // Paso 2: buscar con esa interpretación
  async function buscar() {
    setCargando(true); setError(''); setRes(null); setSeg(0)
    const t0 = Date.now()
    const timer = setInterval(() => setSeg(Math.round((Date.now() - t0) / 1000)), 500)
    try {
      const { _aprendizaje, ...briefLimpio } = brief
      const r = await llamarFuncion('buscar-negocios', { rubro: rubro.trim(), zona: zonaCompleta(zonaNormal(zona)), cantidad, brief: briefLimpio, filtros: filtrosActivos.map(({ id, titulo, descripcion }) => ({ id, titulo, descripcion })), pedido })
      setRes(r); setBrief(null)
      toast(r.resultados.length ? `Encontró ${r.resultados.length} empresas nuevas para revisar` : 'No encontró empresas nuevas. Probá con otra zona o ampliá lo que entra.', r.resultados.length ? '' : 'info')
      refrescar(); cargarHistorial()
      setTimeout(() => resultadosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (err) { setError(mensajeError(err)) }
    clearInterval(timer)
    setCargando(false)
  }

  const conOcupado = async (ids, fn) => {
    setOcupados(o => new Set([...o, ...ids]))
    try { await fn() } catch (e) { toast(mensajeError(e), 'error') }
    setOcupados(o => { const n = new Set(o); ids.forEach(i => n.delete(i)); return n })
  }
  const actualizar = (ids, cambio) => setRes(r => ({ ...r, resultados: r.resultados.map(h => ids.includes(h.id) ? { ...h, ...cambio } : h) }))
  const aprobar = ids => conOcupado(ids, async () => {
    const r = await aprobarHallazgos(ids)
    const { data } = await supabase.from('hallazgos').select('id, estado, prospecto_id').in('id', ids)
    for (const h of data ?? []) actualizar([h.id], h)
    toast(ids.length === 1 ? 'Sumada a tu lista' : `${r.nuevos} sumadas a tu lista`); refrescar()
  })
  const descartar = ids => conOcupado(ids, async () => {
    await descartarHallazgos(ids); actualizar(ids, { estado: 'descartado' }); refrescar()
    toast(ids.length === 1 ? 'Listo, no va a volver a aparecer' : `${ids.length} descartadas`)
  })

  const estimado = cantidad * 2.2 + 25
  const pendientes = res?.resultados.filter(r => r.estado === 'por_revisar') ?? []

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Buscar clientes</h1>
          <p>Escribí con tus palabras qué empresas querés encontrar y dónde: una ciudad, una provincia o un país entero, en Argentina o afuera. Claude busca en Google, redes y directorios y te guarda las que sirven.</p>
        </div>
      </header>

      {comercial === null && (
        <div className="aviso-negocio">
          <Store size={22} />
          <div style={{ flex: 1 }}><b>Contanos qué vendés y la búsqueda se arma sola</b><p>Una sola pregunta y Claude te sugiere qué rubros y zonas buscar.</p></div>
          <Link className="btn primario" to="/negocio">Completar <ArrowRight size={15} /></Link>
        </div>
      )}
      {servicios.ia === false && <Aviso>Falta la clave de Claude. {perfil?.es_admin ? <Link to="/admin">Cargala en Super admin</Link> : 'Pedile al administrador que la cargue.'}</Aviso>}

      <form className="barra-busqueda" onSubmit={entender}>
        <label className="bb-campo">
          <span><Search size={14} /> Qué buscás</span>
          <Autocompletar ref={rubroRef} opciones={todosRubros} value={rubro} onChange={v => { setRubro(v); setBrief(null) }} placeholder="Describí qué empresas buscás. Ej.: empresas grandes con depósito, locales que venden celulares" disabled={cargando} />
          {rubro && !cargando && <button type="button" className="bb-limpiar" onClick={() => setRubro('')} aria-label="Borrar"><X size={13} /></button>}
        </label>
        <label className="bb-campo">
          <span><MapPin size={14} /> Dónde</span>
          <SelectorZona value={zona} onChange={v => { setZona(v); setBrief(null) }} sugeridas={sugZonas} disabled={cargando} />
        </label>
        <label className="bb-campo bb-chico">
          <span>Cuántos</span>
          <Desplegable className="bb-desplegable" ariaLabel="Cuántas empresas" value={cantidad} onChange={v => setCantidad(Number(v))} disabled={cargando} anchoMenu={170} alinear="der"
            opciones={[10, 20, 30, 40].map(n => ({ value: n, label: String(n), ayuda: n <= 10 ? 'menos de 1 minuto' : n <= 20 ? '≈ 1 minuto' : 'un par de minutos' }))} />
        </label>
        <button className="btn ia bb-boton" disabled={cargando || entendiendo || servicios.ia === false}>
          {cargando || entendiendo ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />} {cargando ? 'Buscando…' : entendiendo ? 'Pensando…' : 'Buscar'}
        </button>
      </form>

      {!cargando && !res && !brief && !entendiendo && (
        <div className="bb-sugerencias">
          <div className="sug-fila"><small>{est ? 'Para vos' : 'Ideas'}</small>
            {sugRubros.slice(0, 10).map(r => <button key={r} type="button" className={'chip-sel' + (rubro === r ? ' on' : '')} onClick={() => setRubro(r)}>{r}</button>)}
          </div>
          <div className="sug-fila"><small>Ejemplos</small>
            {['empresas grandes con depósito', 'locales que venden celulares', 'constructoras medianas', 'clínicas privadas', 'distribuidoras de alimentos'].map(r => <button key={r} type="button" className={'chip-sel' + (rubro === r ? ' on' : '')} onClick={() => setRubro(r)}>{r}</button>)}
          </div>
          <div className="sug-fila"><small>Zonas</small>
            {[...sugZonas.slice(0, 5), ...['Argentina', 'Chile', 'Uruguay', 'Perú', 'México'].filter(z => !sugZonas.includes(z))].map(z => <button key={z} type="button" className={'chip-sel' + (zona === z ? ' on' : '')} onClick={() => setZona(z)}>{z}</button>)}
          </div>
        </div>
      )}

      {entendiendo && (
        <section className="tarjeta entendiendo"><div className="pensando"><i /><i /><i /></div><span>Claude está entendiendo qué empresas te sirven…</span></section>
      )}
      {brief && !cargando && (
        <section className="tarjeta brief">
          <div className="brief-cab">
            <span className="brief-icono"><Wand2 size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <small>Así lo entendí · revisalo antes de buscar</small>
              <textarea className="brief-texto" rows={Math.max(1, Math.ceil(brief.interpretacion.length / 90))} value={brief.interpretacion} onChange={e => setBrief({ ...brief, interpretacion: e.target.value })} aria-label="Qué vamos a buscar" />
            </div>
            <Pencil size={14} className="muted" />
          </div>
          {(brief._aprendizaje?.sirven > 0 || brief._aprendizaje?.no_sirven > 0) && (
            <span className="aprendio"><Check size={13} /> Aprendí de {brief._aprendizaje.sirven} empresas que te sirvieron y {brief._aprendizaje.no_sirven} que no</span>
          )}
          <div className="brief-grid">
            <div><b className="ok-txt"><Check size={14} /> Sí entran</b><ChipsEditables tipo="si" items={brief.incluir} onChange={v => setBrief({ ...brief, incluir: v })} placeholder="Agregar tipo" /></div>
            <div><b className="no-txt"><X size={14} /> No entran</b><ChipsEditables tipo="no" items={brief.excluir} onChange={v => setBrief({ ...brief, excluir: v })} placeholder="Ej.: mudanzas" /></div>
          </div>
          <div className="brief-pie">
            <span className="muted chico"><MapPin size={12} style={{ verticalAlign: -2 }} /> {zona} · hasta {cantidad} empresas · no trae las que ya tenés ni las que descartaste</span>
            <span className="espacio" />
            <button className="btn fantasma" onClick={() => { setBrief(null); rubroRef.current?.focus() }}>Cambiar el pedido</button>
            {quedan !== null && <span className={'chico ' + (quedan <= Math.ceil(cupo.limite * 0.2) ? 'texto-alerta' : 'muted')} title="Cada búsqueda usa una consulta de IA de tu cupo diario">{quedan === 0 ? 'No te quedan consultas de IA hoy' : `Usa 1 consulta de IA · te quedan ${quedan} hoy`}</span>}
            <button className="btn ia" onClick={buscar} disabled={!brief.interpretacion.trim() || quedan === 0}><Search size={16} /> Buscar así</button>
          </div>
        </section>
      )}

      <div className="filtros-linea">
        <button type="button" className="btn fantasma chico" onClick={() => setVerFiltros(v => !v)}>
          <SlidersHorizontal size={14} /> Filtros{filtrosActivos.length ? ` (${filtrosActivos.length})` : ''} <ChevronDown size={13} style={{ transform: verFiltros ? 'rotate(180deg)' : '' }} />
        </button>
        {!verFiltros && filtrosActivos.length > 0 && <span className="muted chico">{filtrosActivos.map(f => f.titulo).join(' · ')}</span>}
      </div>
      {verFiltros && (
        <section className="tarjeta panel-filtros">
          <p className="muted chico" style={{ marginTop: 0 }}>Sólo trae negocios que cumplan lo que marques.{est && <> Los filtros salen de <Link to="/negocio">tu negocio</Link>.</>}</p>
          <div className="filtros-check">
            {filtros.map(f => (
              <label key={f.id} className={'filtro-check' + (activos.has(f.id) ? ' on' : '')} title={f.descripcion}>
                <input type="checkbox" checked={activos.has(f.id)} onChange={() => alternar(f.id)} /> {f.titulo}
              </label>
            ))}
          </div>
          <label style={{ marginTop: 14, marginBottom: 0 }}>Algo más que Claude tenga en cuenta <span className="muted">(opcional)</span>
            <input value={pedido} onChange={e => setPedido(e.target.value)} maxLength={400} placeholder="Ej.: que tengan buenas reseñas, que sean chicos o nuevos" />
          </label>
        </section>
      )}

      {cargando && (
        <section className="tarjeta buscando-panel">
          <div className="pensando"><i /><i /><i /></div>
          <div style={{ flex: 1 }}>
            <b>{PASOS[Math.min(PASOS.length - 1, Math.floor((seg / estimado) * PASOS.length))]}</b>
            <div className="barra-progreso"><span style={{ width: Math.min(95, (seg / estimado) * 100) + '%' }} /></div>
            <small className="muted">{seg} s · suele tardar {cantidad <= 10 ? 'menos de un minuto' : cantidad <= 20 ? 'alrededor de un minuto' : 'un par de minutos'}</small>
          </div>
        </section>
      )}
      {error && <Aviso tipo="error">{error}</Aviso>}

      {res && (
        <section ref={resultadosRef} className="resultados-busqueda">
          <div className="resultado-cab">
            <div>
              <h2>{res.resultados.length ? `${res.resultados.length} empresas nuevas` : 'No encontró empresas nuevas'}</h2>
              <p className="muted">
                {res.brief?.interpretacion && <>{res.brief.interpretacion} · </>}{zona}
                {(res.ya_conocidos > 0 || res.no_encajan > 0 || res.descartados > 0) && <><br />No te mostramos {[
                  res.ya_conocidos > 0 && `${res.ya_conocidos} que ya tenías${res.ya_descartados ? ' o descartaste' : ''}`,
                  res.no_encajan > 0 && `${res.no_encajan} que no encajaban`,
                  res.descartados > 0 && `${res.descartados} sin los datos pedidos`].filter(Boolean).join(', ')}.</>}
              </p>
            </div>
            <div className="acciones">
              <button className="btn" onClick={() => { setRes(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Nueva búsqueda</button>
              {res.resultados.length > 0 && <button className="btn" onClick={() => descargarExcel(`busqueda_${new Date().toISOString().slice(0, 10)}.xlsx`, res.resultados.map(h => filaEmpresa(h)))}><Download size={15} /> Excel</button>}
              {pendientes.length > 1 && <button className="btn primario" disabled={ocupados.size > 0} onClick={() => aprobar(pendientes.map(h => h.id))}><Check size={15} /> Sumar las {pendientes.length}</button>}
            </div>
          </div>
          {res.resultados.length > 0 && <p className="ayuda-revisar"><Inbox size={15} /> <span>Quedaron guardadas en <Link to={`/revisar?busqueda=${res.busqueda_id ?? ''}`}>Por revisar</Link>. Sumá a tu lista las que vas a contactar y marcá las que no sirven: esas no vuelven a aparecer.</span></p>}
          <div className="lista-hallazgos">
            {res.resultados.map(h => (
              <TarjetaHallazgo key={h.id ?? h.nombre} h={h} ocupado={ocupados.has(h.id)}
                onAprobar={() => aprobar([h.id])} onDescartar={() => descartar([h.id])} onMotivo={m => motivoHallazgo(h.id, m).then(() => actualizar([h.id], { motivo: m })).catch(e => toast(mensajeError(e), 'error'))} />
            ))}
          </div>
          {res.resultados.length > 0 && <small className="muted">Los datos salen de fuentes públicas: revisá cada empresa antes de escribirle.</small>}
        </section>
      )}

      {!cargando && historial.length > 0 && (
        <div className="recientes">
          <small className="muted">Búsquedas recientes</small>
          {historial.map(b => (
            <button key={b.id} type="button" className="reciente" onClick={() => nav(`/revisar?busqueda=${b.id}`)} title="Ver lo que trajo">
              {b.rubro.charAt(0).toUpperCase() + b.rubro.slice(1)} · {b.zona.replace(/, Mendoza$/, '')} <span className="muted">({b.guardados})</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
