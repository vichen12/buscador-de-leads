import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Loader2, MapPin, Sparkles, Check, SlidersHorizontal, Store, ArrowRight, ChevronDown, X, Plus, Download, Inbox, Wand2, Pencil } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { descargarExcel, filaEmpresa } from '../lib/excel.js'
import { motivoHallazgo, aprobarHallazgos, descartarHallazgos, saltearHallazgos } from '../lib/hallazgos.js'
import TarjetaHallazgo from '../components/TarjetaHallazgo.jsx'
import { Bandera } from '../components/ElegirPais.jsx'
import Desplegable from '../components/Desplegable.jsx'
import { RUBROS, ZONAS, zonaCompleta, zonasDe, nombrePais, lugaresDe, zonaConPais, PAISES } from '../lib/catalogo.js'
import { Aviso, useToast } from '../components/ui.jsx'
import Autocompletar from '../components/Autocompletar.jsx'
import SelectorZona from '../components/SelectorZona.jsx'
import { useApp } from '../App.jsx'

const FILTROS_DEFECTO = [
  { id: 'con_telefono', titulo: 'Con teléfono o WhatsApp', descripcion: 'Que tenga un número para escribirle.', activo: true },
  { id: 'con_email', titulo: 'Con email', descripcion: 'Que tenga un email de contacto.', activo: false },
  { id: 'con_instagram', titulo: 'Con Instagram', descripcion: 'Que tenga Instagram.', activo: false },
]
// De dónde sale la búsqueda: Claude (web), Google Maps (fichas reales evaluadas por Claude) o los dos
const FUENTES = [
  { id: 'claude', nombre: 'Claude', ayuda: 'Busca en la web, redes y directorios' },
  { id: 'maps', nombre: 'Google Maps', ayuda: 'Fichas reales de Maps, evaluadas por Claude' },
  { id: 'ambas', nombre: 'Los dos', ayuda: 'Más resultados: Maps y la web juntos' },
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
  const zonaTocada = useRef(false)
  // Dónde: UN país a la vez y un lugar concreto (provincia, ciudad o zona). Si es muy amplio, la búsqueda se dispersa.
  const [paisBusq, setPaisBusq] = useState(perfil?.pais || 'AR')
  useEffect(() => { if (perfil?.pais && !zonaTocada.current) setPaisBusq(perfil.pais) }, [perfil?.pais])
  const paisesCuenta = useMemo(() => [...new Set([perfil?.pais, ...(perfil?.paises ?? [])].filter(Boolean))], [perfil?.pais, perfil?.paises])
  const sugZonas = useMemo(() => {
    const deEstrategia = (est?.zonas ?? []).map(z => z.split(',').map(x => x.trim())).filter(p => p.length === 1 ? !PAISES.some(x => x.nombre === p[0]) && paisBusq === (perfil?.pais || 'AR') : p.at(-1) === nombrePais(paisBusq)).map(p => p.length > 1 ? p.slice(0, -1).join(', ') : p[0])
    return [...new Set([...deEstrategia, ...lugaresDe(paisBusq, paisBusq === perfil?.pais ? perfil?.region : null)])].filter(Boolean)
  }, [est, paisBusq, perfil?.pais, perfil?.region])
  const todosRubros = useMemo(() => [...new Set([...sugRubros, ...RUBROS.flatMap(g => g.items)])], [sugRubros])
  const todasZonas = sugZonas
  const filtros = est?.filtros?.length ? est.filtros : FILTROS_DEFECTO

  const [rubro, setRubro] = useState('')
  const [fuente, setFuente] = useState('ambas')
  // Sin clave de Google Places, Maps no se puede elegir: se busca con Claude
  const sinMaps = servicios.places === false
  const fuenteUsada = sinMaps ? 'claude' : fuente
  // Guía con preguntas: si el pedido es muy general, Claude pregunta lo justo para concretarlo
  const [guia, setGuia] = useState(null) // { base, preguntas, paso, respuestas: [[...]], otra, briefGeneral }
  const [preguntando, setPreguntando] = useState(false)
  async function pedirPreguntas(base, briefGeneral = null) {
    if (!zona.trim()) { setError(`Elegí una provincia, ciudad o zona de ${nombrePais(paisBusq)}.`); return }
    setPreguntando(true); setError(''); setBrief(null); setRes(null)
    try {
      const r = await llamarFuncion('buscar-negocios', { modo: 'preguntar', rubro: base, zona: zonaConPais(zonaNormal(zona), paisBusq) })
      if (r.preguntas?.length) setGuia({ base, preguntas: r.preguntas, paso: 0, respuestas: r.preguntas.map(() => []), otra: '', briefGeneral })
      else if (briefGeneral) setBrief(briefGeneral)
    } catch (err) { setError(mensajeError(err)); if (briefGeneral) setBrief(briefGeneral) }
    setPreguntando(false)
  }
  function responder(valor, varias) {
    setGuia(g => {
      const respuestas = g.respuestas.map((r, k) => k !== g.paso ? r : varias ? (r.includes(valor) ? r.filter(x => x !== valor) : [...r, valor]) : [valor])
      return { ...g, respuestas }
    })
    if (!varias) setTimeout(() => avanzar(), 180)
  }
  const guiaRef = useRef(null)
  useEffect(() => { guiaRef.current = guia }, [guia])
  function avanzar(saltar = false) {
    const g = guiaRef.current
    if (!g) return
    const respuestas = g.respuestas.map((r, k) => k !== g.paso ? r : saltar ? [] : g.otra.trim() ? [...r.filter(x => x !== g.otra.trim()), g.otra.trim()] : r)
    if (g.paso < g.preguntas.length - 1) { setGuia({ ...g, respuestas, otra: '', paso: g.paso + 1 }); return }
    // Listo: se arma la búsqueda concreta y se interpreta
    const final = [g.base, respuestas.flat().filter(Boolean).join(', ')].filter(Boolean).join(' — ') || g.base
    setGuia(null)
    if (!final) return
    setRubro(final); entender(null, final, true)
  }
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

  useEffect(() => { setActivos(new Set(filtros.filter(f => f.activo).map(f => f.id))) }, [comercial])
  // La zona por defecto sigue a la configuración de la cuenta hasta que la persona elige otra
  useEffect(() => { if ((!zonaTocada.current || !zona) && sugZonas[0]) setZona(sugZonas[0]) }, [sugZonas])
  const cargarHistorial = () => supabase.from('busquedas').select('*').order('created_at', { ascending: false }).limit(6).then(({ data }) => setHistorial(data ?? []))
  useEffect(() => { cargarHistorial() }, [])

  const filtrosActivos = filtros.filter(f => activos.has(f.id))
  const alternar = id => setActivos(a => { const n = new Set(a); n.has(id) ? n.delete(id) : n.add(id); return n })

  const sinTilde = z => z.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const zonaNormal = z => todasZonas.find(o => sinTilde(o) === sinTilde(z)) ?? z.trim()

  // Paso 1: Claude cuenta cómo entendió el pedido (qué entra y qué no) y la persona lo ajusta
  async function entender(e, pedidoDirecto, sinGuia = false) {
    e?.preventDefault?.()
    const que = (typeof pedidoDirecto === 'string' ? pedidoDirecto : rubro).trim()
    if (!que) { rubroRef.current?.focus(); return }
    if (!zona.trim()) { setError(`Elegí una provincia, ciudad o zona de ${nombrePais(paisBusq)}: si buscás en todo el país, los resultados se dispersan.`); return }
    const z = zonaNormal(zona)
    setZona(z)
    setEntendiendo(true); setError(''); setRes(null); setBrief(null); setGuia(null)
    try {
      const r = await llamarFuncion('buscar-negocios', { modo: 'interpretar', rubro: que, zona: zonaConPais(z, paisBusq) })
      const b = { ...r.brief, _aprendizaje: r.aprendizaje }
      if (r.brief?.especifica === false && !sinGuia) { setEntendiendo(false); await pedirPreguntas(que, b); return }
      setBrief(b)
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
      const pedirA = f => llamarFuncion('buscar-negocios', { rubro: rubro.trim(), zona: zonaConPais(zonaNormal(zona), paisBusq), cantidad, brief: briefLimpio, filtros: filtrosActivos.map(({ id, titulo, descripcion }) => ({ id, titulo, descripcion })), pedido, fuente: f })
      let r
      try { r = await pedirA(fuenteUsada) } catch (err) {
        // Maps sin clave (se quitó recién): se avisa y se busca con Claude, sin perder el pedido
        if (fuenteUsada === 'claude' || !/google places/i.test(err.message)) throw err
        toast('Google Maps no está conectado: busco sólo con Claude.', 'info')
        setFuente('claude')
        r = await pedirA('claude')
      }
      setRes(r); setBrief(null)
      toast(r.resultados.length ? `Encontró ${r.resultados.length} empresas nuevas para revisar` : 'No encontró empresas nuevas. Probá con otra zona o ampliá lo que entra.', r.resultados.length ? '' : 'info',
        r.resultados.length ? { accion: { label: 'Ver en Por revisar', onClick: () => nav('/revisar') } } : {})
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
    const ficha = ids.length === 1 ? (data ?? [])[0]?.prospecto_id : null
    toast(ids.length === 1 ? 'Sumada a tu lista' : `${r.nuevos} sumadas a tu lista`, 'ok',
      { acciones: [ficha && { label: 'Ver ficha', onClick: () => nav(`/prospectos/${ficha}`) }, { label: 'Ver mi lista', onClick: () => nav('/prospectos?orden=reciente') }] })
    refrescar()
  })
  const descartar = ids => conOcupado(ids, async () => {
    await descartarHallazgos(ids); actualizar(ids, { estado: 'descartado' }); refrescar()
    toast(ids.length === 1 ? 'Listo, no va a volver a aparecer' : `${ids.length} descartadas`)
  })

  const saltear = ids => conOcupado(ids, async () => {
    await saltearHallazgos(ids)
    setRes(r => ({ ...r, resultados: r.resultados.filter(h => !ids.includes(h.id)) })); refrescar()
    toast('Salteada: no la marqué como buena ni mala, puede volver en otra búsqueda')
  })

  const estimado = cantidad * 2.2 + 25
  const pendientes = res?.resultados.filter(r => r.estado === 'por_revisar') ?? []

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Buscar clientes</h1>
          <p>Describí con tus palabras qué empresas querés y dónde. Claude busca en Google, redes y directorios y te trae sólo las que encajan.</p>
        </div>
      </header>

      {comercial === null && (
        <div className="aviso-negocio">
          <Store size={22} />
          <div style={{ flex: 1 }}><b>Contanos qué vendés y la búsqueda se arma sola</b><p>Una sola pregunta y Claude te sugiere qué rubros y zonas buscar.</p></div>
          <Link className="btn primario" to="/negocio">Completar <ArrowRight size={15} /></Link>
        </div>
      )}
      {servicios.ia === false && <Aviso>Falta la clave de Claude. {perfil?.es_admin ? <Link to="/admin?tab=claves">Cargala acá</Link> : 'Pedile al administrador que la cargue.'}</Aviso>}
      {servicios.ia !== false && sinMaps && <Aviso tipo="info">Google Maps no está conectado: la búsqueda va sólo con Claude. {perfil?.es_admin ? <Link to="/admin?tab=claves">Conectar Google Maps</Link> : 'Para sumar las fichas de Maps, pedile al administrador que lo conecte.'}</Aviso>}

      <section className="busqueda-hero">
      <form className="barra-busqueda" onSubmit={entender}>
        <label className="bb-campo">
          <span><Search size={14} /> Qué buscás</span>
          <Autocompletar ref={rubroRef} opciones={todosRubros} value={rubro} onChange={v => { setRubro(v); setBrief(null) }} placeholder="Ej.: distribuidoras con depósito propio" disabled={cargando} />
          {rubro && !cargando && <button type="button" className="bb-limpiar" onClick={() => setRubro('')} aria-label="Borrar"><X size={13} /></button>}
        </label>
        <label className="bb-campo">
          <span><MapPin size={14} /> Dónde</span>
          <div className="donde-fila">
            <Desplegable className="donde-pais" ariaLabel="País" value={paisBusq} disabled={cargando} anchoMenu={230}
              onChange={v => { zonaTocada.current = true; setPaisBusq(v); setZona(''); setBrief(null) }}
              opciones={[...paisesCuenta.map(c => PAISES.find(p => p.code === c)).filter(Boolean), ...PAISES.filter(p => !paisesCuenta.includes(p.code))].map(p => ({ value: p.code, label: p.nombre, icono: <Bandera code={p.code} />, ayuda: paisesCuenta.includes(p.code) ? 'de tu cuenta' : '' }))} />
            <SelectorZona soloPais={paisBusq} region={paisBusq === perfil?.pais ? perfil?.region : ''} value={zona} placeholder="Provincia, ciudad o zona" onChange={v => { zonaTocada.current = true; setZona(v); setBrief(null) }} sugeridas={sugZonas.slice(0, 6)} disabled={cargando} />
          </div>
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

      <div className="bb-pie">
        <div className="fuente-sel" role="radiogroup" aria-label="Dónde buscar">
          {FUENTES.map(f => {
            const bloqueada = f.id !== 'claude' && sinMaps
            const on = fuenteUsada === f.id
            return <button key={f.id} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} disabled={bloqueada || cargando}
              title={bloqueada ? 'Falta conectar Google Maps (clave de Google Places)' : f.ayuda} onClick={() => setFuente(f.id)}>{f.id === 'maps' ? <MapPin size={13} /> : f.id === 'claude' ? <Sparkles size={13} /> : null}{f.nombre}</button>
          })}
        </div>
        <button type="button" className={'filtros-pill' + (verFiltros ? ' abierto' : '') + (filtrosActivos.length ? ' con' : '')} onClick={() => setVerFiltros(v => !v)} aria-expanded={verFiltros}>
          <SlidersHorizontal size={14} /> Filtros{filtrosActivos.length ? <span className="filtros-num">{filtrosActivos.length}</span> : ''} <ChevronDown size={13} style={{ transform: verFiltros ? 'rotate(180deg)' : '' }} />
        </button>
        {!verFiltros && filtrosActivos.map(f => <button key={f.id} type="button" className="filtro-activo" title={`${f.descripcion || f.titulo} · tocá para sacarlo`} onClick={() => { alternar(f.id); setBrief(null) }} disabled={cargando}><Check size={12} /> {f.titulo}<X size={12} className="filtro-quitar" /></button>)}
        <span className="espacio" />
        <span className="muted chico bb-tiempo">{cantidad <= 10 ? 'Tarda menos de 1 minuto' : cantidad <= 20 ? 'Tarda ≈ 1 minuto' : 'Tarda un par de minutos'} · no repite las que ya tenés</span>
      </div>
      </section>
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

      {!cargando && !res && !brief && !entendiendo && !guia && !preguntando && (
        <button type="button" className="guia-invitacion" onClick={() => pedirPreguntas(rubro.trim())} disabled={servicios.ia === false}>
          <Wand2 size={18} /><span><b>¿No sabés bien qué buscar? Te ayudo con unas preguntas</b><small>Mientras más concreta la búsqueda, mejores empresas trae. Te pregunto según lo que vendés.</small></span><ArrowRight size={16} />
        </button>
      )}
      {preguntando && <section className="tarjeta entendiendo"><div className="pensando"><i /><i /><i /></div><span>Pensando qué preguntarte para afinar la búsqueda…</span></section>}
      {guia && (() => {
        const q = guia.preguntas[guia.paso], elegidas = guia.respuestas[guia.paso]
        return (
          <section className="tarjeta guia">
            <div className="guia-cab">
              <span className="brief-icono"><Wand2 size={18} /></span>
              <div style={{ flex: 1 }}><small>{guia.base ? <>Para concretar “{guia.base}”</> : 'Armemos la búsqueda'} · pregunta {guia.paso + 1} de {guia.preguntas.length}</small><h3>{q.pregunta}</h3></div>
              <button type="button" className="btn fantasma chico" onClick={() => { const b = guia.briefGeneral; setGuia(null); if (b) setBrief(b) }}>{guia.briefGeneral ? 'Buscar igual así' : 'Cerrar'}</button>
            </div>
            <div className="guia-progreso">{guia.preguntas.map((_, k) => <span key={k} className={k <= guia.paso ? 'on' : ''} />)}</div>
            <div className="guia-opciones">{q.opciones.map(o => { const on = elegidas.includes(o); return <button key={o} type="button" className={'guia-opcion' + (on ? ' on' : '')} onClick={() => responder(o, q.varias)}>{on && <Check size={14} />}{o}</button> })}</div>
            <div className="guia-pie">
              <input value={guia.otra} onChange={e => setGuia({ ...guia, otra: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); avanzar() } }} placeholder="Otra respuesta (escribila)" maxLength={80} />
              <button type="button" className="link chico" onClick={() => avanzar(true)}>Saltar</button>
              {(q.varias || guia.otra.trim()) && <button type="button" className="btn primario chico" onClick={() => avanzar()}>{guia.paso < guia.preguntas.length - 1 ? 'Siguiente' : 'Listo, buscar'} <ArrowRight size={13} /></button>}
            </div>
          </section>
        )
      })()}

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
          {brief.opciones?.length > 0 && (
            <div className={'brief-opciones' + (brief.especifica === false ? ' general' : '')}>
              <b>{brief.especifica === false ? 'Es bastante general. Algo más concreto:' : '¿Más específico? Probá con:'}</b>
              <div className="sug-chips">{brief.opciones.map(o => <button key={o} type="button" className="sug-chip destacado" onClick={() => { setRubro(o); entender(null, o, true) }}>{o}</button>)}</div>
            </div>
          )}
          {brief._aprendizaje && (brief._aprendizaje.sirven > 0 || brief._aprendizaje.no_sirven > 0 ? (
            <div className="aprendio">
              <Sparkles size={14} />
              <span>Aprendí de <b>{brief._aprendizaje.sirven} empresa{brief._aprendizaje.sirven === 1 ? '' : 's'} que te sirven</b> y {brief._aprendizaje.no_sirven} que descartaste.
                {brief._aprendizaje.ejemplos?.length > 0 && <> Busco parecidas a {brief._aprendizaje.ejemplos.slice(0, 3).join(', ')}{brief._aprendizaje.sirven > 3 ? ' y las demás' : ''}.</>}</span>
            </div>
          ) : (
            <div className="aprendio vacio"><Sparkles size={14} /><span>Todavía no tengo de qué aprender: sumá a tu lista las que te sirven y descartá las que no (con el motivo). Cada búsqueda nueva va a traer más parecidas a las buenas.</span></div>
          ))}
          <div className="brief-grid">
            <div><b className="ok-txt"><Check size={14} /> Sí entran</b><ChipsEditables tipo="si" items={brief.incluir} onChange={v => setBrief({ ...brief, incluir: v })} placeholder="Agregar tipo" /></div>
            <div><b className="no-txt"><X size={14} /> No entran</b><ChipsEditables tipo="no" items={brief.excluir} onChange={v => setBrief({ ...brief, excluir: v })} placeholder="Ej.: mudanzas" /></div>
          </div>
          <div className="brief-pie">
            <span className="muted chico"><MapPin size={12} style={{ verticalAlign: -2 }} /> {zonaConPais(zona, paisBusq)} · hasta {cantidad} empresas · no trae las que ya tenés ni las que descartaste</span>
            <span className="espacio" />
            <button className="btn fantasma" onClick={() => { setBrief(null); rubroRef.current?.focus() }}>Cambiar el pedido</button>
            {quedan !== null && !cupo.sin_tope && <span className={'chico ' + (quedan <= Math.ceil(cupo.limite * 0.2) ? 'texto-alerta' : 'muted')} title={cupo.periodo === 'mes' ? 'Las consultas de IA son de toda tu empresa, por mes' : 'Cada búsqueda usa una consulta de IA de tu cupo diario'}>{quedan === 0 ? (cupo.periodo === 'mes' ? 'Tu empresa usó todas las consultas de IA del mes' : 'No te quedan consultas de IA hoy') : `Usa 1 consulta de IA · ${cupo.periodo === 'mes' ? `a tu empresa le quedan ${quedan.toLocaleString('es-AR')} este mes` : `te quedan ${quedan} hoy`}`}</span>}
            <button className="btn ia" onClick={buscar} disabled={!brief.interpretacion.trim() || quedan === 0}><Search size={16} /> Buscar así</button>
          </div>
        </section>
      )}


      {cargando && (
        <section className="tarjeta buscando-panel">
          <div className="pensando"><i /><i /><i /></div>
          <div style={{ flex: 1 }}>
            {(() => { const pasos = fuenteUsada === 'claude' ? PASOS.slice(1) : fuenteUsada === 'maps' ? [PASOS[0], 'Leyendo cada ficha…', PASOS[3]] : PASOS; return <b>{pasos[Math.min(pasos.length - 1, Math.floor((seg / estimado) * pasos.length))]}</b> })()}
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
                {res.brief?.interpretacion && <>{res.brief.interpretacion} · </>}{zonaConPais(zona, paisBusq)}
                {(res.ya_conocidos > 0 || res.no_encajan > 0 || res.descartados > 0) && <><br />No te mostramos {[
                  res.ya_conocidos > 0 && `${res.ya_conocidos} que ya tenías${res.ya_descartados ? ' o descartaste' : ''}`,
                  res.no_encajan > 0 && `${res.no_encajan} que no encajaban`,
                  res.descartados > 0 && `${res.descartados} que no cumplían los filtros`].filter(Boolean).join(', ')}.</>}
                {res.diagnostico && res.resultados.length < Math.min(5, cantidad) && (
                  <><br /><span className="diagnostico">
                    {res.diagnostico.maps === 'no_pedido' ? 'Buscaste sólo con Claude: sumá Google Maps para traer más fichas.'
                      : res.diagnostico.maps === 'sin_clave' ? 'Google Maps no está conectado (falta la clave de Google Places en Super admin → Claves): sólo se buscó en la web, que trae pocas.'
                      : String(res.diagnostico.maps).startsWith('error') ? `Google Maps dio un error: ${String(res.diagnostico.maps).slice(7)}`
                      : `Google Maps trajo ${res.diagnostico.maps_fichas} fichas y ${res.diagnostico.maps_sirven} encajaban.`}
                    {' '}{res.diagnostico.web.length ? <>Búsqueda web: {res.diagnostico.web.reduce((a, b) => a + b, 0)} empresas</> : 'Sin búsqueda web (elegiste sólo Google Maps)'}{res.diagnostico.web_errores?.length ? ` (con errores: ${res.diagnostico.web_errores.join('; ')})` : ''}.
                  </span></>
                )}
                {res.aprendizaje?.parecidas > 0 && <><br /><Sparkles size={12} style={{ verticalAlign: -1 }} /> {res.aprendizaje.parecidas} se parecen a las que ya te sirven: están primeras.</>}
              </p>
            </div>
            <div className="acciones">
              <button className="btn" onClick={() => { setRes(null); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Nueva búsqueda</button>
              {res.resultados.length > 0 && <button className="btn" onClick={() => descargarExcel(`busqueda_${new Date().toISOString().slice(0, 10)}.xlsx`, res.resultados.map(h => filaEmpresa(h)))}><Download size={15} /> Excel</button>}
              {pendientes.length > 1 && <button className="btn primario" disabled={ocupados.size > 0} onClick={() => aprobar(pendientes.map(h => h.id))}><Check size={15} /> Sumar las {pendientes.length}</button>}
            </div>
          </div>
          {res.aviso && <Aviso>{res.aviso}</Aviso>}
          {res.resultados.length > 0 && <p className="ayuda-revisar"><Inbox size={15} /> <span>Quedaron guardadas en <Link to={`/revisar?busqueda=${res.busqueda_id ?? ''}`}>Por revisar</Link>. Sumá a tu lista las que vas a contactar y marcá las que no sirven: esas no vuelven a aparecer.</span></p>}
          <div className="lista-hallazgos">
            {res.resultados.map(h => (
              <TarjetaHallazgo key={h.id ?? h.nombre} h={h} ocupado={ocupados.has(h.id)}
                onAprobar={() => aprobar([h.id])} onDescartar={() => descartar([h.id])} onSaltear={h.id ? () => saltear([h.id]) : null} onMotivo={m => motivoHallazgo(h.id, m).then(() => actualizar([h.id], { motivo: m })).catch(e => toast(mensajeError(e), 'error'))} />
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
