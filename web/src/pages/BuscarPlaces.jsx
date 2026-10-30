import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Loader2, MapPin, Sparkles, ExternalLink, Phone, AtSign, Check, SlidersHorizontal, Star, Store, ArrowRight, ChevronDown, X } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError, handleIG } from '../lib/util.js'
import { RUBROS, ZONAS, zonaCompleta } from '../lib/catalogo.js'
import { Aviso, useToast } from '../components/ui.jsx'
import Autocompletar from '../components/Autocompletar.jsx'
import { useApp } from '../App.jsx'

const FILTROS_DEFECTO = [
  { id: 'con_telefono', titulo: 'Con teléfono o WhatsApp', descripcion: 'Que tenga un número para escribirle.', activo: true },
  { id: 'con_email', titulo: 'Con email', descripcion: 'Que tenga un email de contacto.', activo: false },
  { id: 'con_instagram', titulo: 'Con Instagram', descripcion: 'Que tenga Instagram.', activo: false },
]
const PASOS = ['Buscando en Google Maps…', 'Mirando redes y directorios…', 'Revisando si encajan con lo que vendés…', 'Guardando los que sirven…']

export default function BuscarPlaces() {
  const toast = useToast()
  const nav = useNavigate()
  const { servicios, refrescar, perfil, comercial } = useApp()
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

  async function buscar(e) {
    e?.preventDefault()
    if (!rubro.trim()) { rubroRef.current?.focus(); return }
    if (!zona.trim()) return
    setCargando(true); setError(''); setRes(null); setSeg(0)
    const t0 = Date.now()
    const timer = setInterval(() => setSeg(Math.round((Date.now() - t0) / 1000)), 500)
    try {
      const r = await llamarFuncion('buscar-negocios', { rubro: rubro.trim(), zona: zonaCompleta(zona.trim()), cantidad, filtros: filtrosActivos.map(({ id, titulo, descripcion }) => ({ id, titulo, descripcion })), pedido })
      setRes(r)
      const nuevos = r.resultados.filter(x => x.estado === 'nuevo').length
      toast(r.resultados.length ? `Listo: ${nuevos} nuevos guardados en tus prospectos` : 'No encontró negocios. Probá con otra zona o sacá algún filtro.', r.resultados.length ? '' : 'info')
      refrescar(); cargarHistorial()
      setTimeout(() => resultadosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch (err) { setError(mensajeError(err)) }
    clearInterval(timer)
    setCargando(false)
  }

  const estimado = cantidad * 2.2 + 20
  const nuevos = res?.resultados.filter(r => r.estado === 'nuevo') ?? []

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Buscar clientes</h1>
          <p>Escribí con tus palabras qué empresas querés encontrar y dónde, en cualquier lugar del país. Claude busca en Google, redes y directorios y te guarda las que sirven.</p>
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

      <form className="barra-busqueda" onSubmit={buscar}>
        <label className="bb-campo">
          <span><Search size={14} /> Qué buscás</span>
          <Autocompletar ref={rubroRef} opciones={todosRubros} value={rubro} onChange={setRubro} placeholder="Describí qué empresas buscás. Ej.: empresas grandes con depósito, locales que venden celulares" disabled={cargando} />
          {rubro && !cargando && <button type="button" className="bb-limpiar" onClick={() => setRubro('')} aria-label="Borrar"><X size={13} /></button>}
        </label>
        <label className="bb-campo">
          <span><MapPin size={14} /> Dónde</span>
          <Autocompletar opciones={todasZonas} value={zona} onChange={setZona} placeholder="Ciudad, provincia o todo el país" disabled={cargando} />
        </label>
        <label className="bb-campo bb-chico">
          <span>Cuántos</span>
          <select value={cantidad} onChange={e => setCantidad(Number(e.target.value))} disabled={cargando}>
            {[10, 20, 30, 40].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <button className="btn ia bb-boton" disabled={cargando || servicios.ia === false}>
          {cargando ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />} {cargando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      {!cargando && !res && (
        <div className="bb-sugerencias">
          <div className="sug-fila"><small>{est ? 'Para vos' : 'Ideas'}</small>
            {sugRubros.slice(0, 10).map(r => <button key={r} type="button" className={'chip-sel' + (rubro === r ? ' on' : '')} onClick={() => setRubro(r)}>{r}</button>)}
          </div>
          <div className="sug-fila"><small>Ejemplos</small>
            {['empresas grandes con depósito', 'locales que venden celulares', 'constructoras medianas', 'clínicas privadas', 'distribuidoras de alimentos'].map(r => <button key={r} type="button" className={'chip-sel' + (rubro === r ? ' on' : '')} onClick={() => setRubro(r)}>{r}</button>)}
          </div>
          <div className="sug-fila"><small>Zonas</small>
            {[...sugZonas.slice(0, 6), ...['Gran Mendoza', 'Neuquén', 'Córdoba', 'Buenos Aires', 'Todo el país'].filter(z => !sugZonas.includes(z))].map(z => <button key={z} type="button" className={'chip-sel' + (zona === z ? ' on' : '')} onClick={() => setZona(z)}>{z}</button>)}
          </div>
        </div>
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
              <h2>{res.resultados.length ? `${res.resultados.length} negocios de ${rubro} en ${zona}` : 'No encontró negocios'}</h2>
              <p className="muted">
                {nuevos.length > 0 ? <><b className="ok-txt">{nuevos.length} nuevos</b> quedaron guardados en tus prospectos</> : res.resultados.length ? 'Ya los tenías a todos' : 'Probá con otra zona o sacá algún filtro.'}
                {res.descartados > 0 && <> · {res.descartados} no cumplían los filtros</>}
              </p>
            </div>
            <div className="acciones">
              <button className="btn" onClick={() => { setRes(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Nueva búsqueda</button>
              {res.busqueda_id && nuevos.length > 0 && <button className="btn primario" onClick={() => nav(`/prospectos?busqueda=${res.busqueda_id}&generar=1`)}><Sparkles size={15} /> Armar mensajes</button>}
            </div>
          </div>
          <div className="lista-resultados">
            {res.resultados.map(r => (
              <article key={r.id} className={'resultado' + (r.estado === 'ya_estaba' ? ' apagado' : '')}>
                <div className="resultado-principal">
                  <div className="resultado-nombre">
                    {r.prospecto_id ? <Link to={`/prospectos/${r.prospecto_id}`}>{r.nombre}</Link> : <span>{r.nombre}</span>}
                    {r.puntaje > 0 && <span className="puntaje" title={`Encaje ${r.puntaje} de 5`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={11} fill="currentColor" className={n > r.puntaje ? 'off' : ''} />)}</span>}
                  </div>
                  {r.encaje && <p>{r.encaje}</p>}
                  <div className="resultado-datos">
                    {r.telefono && <span><Phone size={12} /> {r.telefono}</span>}
                    {r.instagram && <a href={r.instagram} target="_blank" rel="noreferrer"><AtSign size={12} /> {handleIG(r.instagram)}</a>}
                    {r.direccion && <span className="muted"><MapPin size={12} /> {r.direccion}</span>}
                    {r.fuente && /^https?:/.test(r.fuente) && <a className="muted" href={r.fuente} target="_blank" rel="noreferrer">fuente <ExternalLink size={10} /></a>}
                  </div>
                </div>
                <span className={'chip ' + (r.estado === 'nuevo' ? 'ok' : 'duplicado')}>{r.estado === 'nuevo' ? <><Check size={11} /> Guardado</> : r.estado === 'ya_estaba' ? 'Ya lo tenías' : 'No guardado'}</span>
              </article>
            ))}
          </div>
          {res.resultados.length > 0 && <small className="muted">Los datos salen de fuentes públicas: revisá cada negocio antes de escribirle.</small>}
        </section>
      )}

      {!cargando && historial.length > 0 && (
        <div className="recientes">
          <small className="muted">Búsquedas recientes</small>
          {historial.map(b => (
            <button key={b.id} type="button" className="reciente" onClick={() => nav(`/prospectos?busqueda=${b.id}`)} title="Ver los prospectos que trajo">
              {b.rubro} · {b.zona.replace(/, Mendoza$/, '')} <span className="muted">({b.guardados})</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
