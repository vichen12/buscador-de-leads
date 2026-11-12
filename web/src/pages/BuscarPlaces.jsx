import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Loader2, MapPin, Sparkles, Check, SlidersHorizontal, Store, ArrowRight, X, Download, Inbox } from 'lucide-react'
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
import { leerIA, textoCosto } from '../lib/uso.js'

const FILTROS_DEFECTO = [
  { id: 'con_telefono', titulo: 'Con teléfono o WhatsApp', descripcion: 'Que tenga un número para escribirle.', activo: false },
  { id: 'con_email', titulo: 'Con email', descripcion: 'Que tenga un email de contacto.', activo: false },
  { id: 'con_instagram', titulo: 'Con Instagram', descripcion: 'Que tenga Instagram.', activo: false },
  { id: 'sin_web', titulo: 'Sin página web', descripcion: 'Que no tenga sitio propio: sólo redes, WhatsApp, Maps o nada.', activo: false },
]
// De dónde sale la búsqueda: Claude (web), Google Maps (fichas reales evaluadas por Claude) o los dos
const FUENTES = [
  { id: 'claude', nombre: 'Claude', ayuda: 'Busca en la web, redes y directorios' },
  { id: 'maps', nombre: 'Google Maps', ayuda: 'Fichas reales de Maps, evaluadas por Claude' },
  { id: 'ambas', nombre: 'Los dos', ayuda: 'Más resultados: Maps y la web juntos' },
]
// Para qué es la búsqueda: atada a «Mi negocio» (Claude piensa a quién le podés vender) o libre
// (cualquier rubro, tal cual lo escribís, sin usar tu negocio ni lo que aprendió de tu lista)
const MODOS = [
  { id: 'negocio', nombre: 'Clientes para mi negocio', ayuda: 'Claude piensa qué empresas te pueden comprar, según lo que vendés' },
  { id: 'libre', nombre: 'Cualquier cosa', ayuda: 'Cualquier rubro, tal cual lo escribís' },
]
const CLAVE_MODO = 'prospecta-modo-busqueda'
const modoGuardado = () => { try { return localStorage.getItem(CLAVE_MODO) === 'libre' ? 'libre' : 'negocio' } catch { return 'negocio' } }
const PASOS = ['Buscando en Google Maps…', 'Mirando directorios y redes…', 'Recorriendo la zona…', 'Revisando que encajen con lo que pediste…']

export default function BuscarPlaces() {
  const toast = useToast()
  const nav = useNavigate()
  const { servicios, refrescar, perfil, comercial } = useApp()
  const [modo, setModo] = useState(modoGuardado)
  const libre = modo === 'libre'
  const [sinLibre, setSinLibre] = useState(false) // el servidor todavía no conoce la búsqueda libre
  function elegirModo(m) {
    setModo(m); setRes(null); setError('')
    try { localStorage.setItem(CLAVE_MODO, m) } catch { /* sin almacenamiento */ }
  }
  const [cupo, setCupo] = useState(null)
  useEffect(() => { supabase.rpc('mi_cupo_chat').then(({ data }) => setCupo(data ?? null)) }, [res])
  const quedan = cupo ? Math.max(0, cupo.limite - cupo.usados) : null
  const ia = leerIA(cupo)
  const [ocupados, setOcupados] = useState(new Set())
  const estNegocio = comercial?.estrategia?.rubros?.length ? comercial.estrategia : null
  // En la búsqueda libre no se usa la estrategia: ni sus rubros ni sus filtros
  const est = libre ? null : estNegocio
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
  // Los de siempre (incluido «Sin página web») + los que sumó la estrategia de tu negocio
  const filtros = useMemo(() => [...FILTROS_DEFECTO, ...(est?.filtros ?? []).filter(f => !FILTROS_DEFECTO.some(d => d.id === f.id || d.titulo.toLowerCase() === String(f.titulo).toLowerCase()))], [est])

  // Si viene de la home con algo escrito (?q=), arranca con eso puesto
  const [params] = useSearchParams()
  const [rubro, setRubro] = useState(() => params.get('q') ?? '')
  const [, setFuente] = useState('ambas')
  // Sin clave de Google Places, Maps no se puede elegir: se busca con Claude
  const sinMaps = servicios.places === false
  const fuenteUsada = sinMaps ? 'claude' : 'ambas'
  const [zona, setZona] = useState(sugZonas[0])
  const [cantidad, setCantidad] = useState(20)
  // Los filtros arrancan apagados (prendidos de fábrica descartaban de más) y se recuerda lo que elijas, por modo
  const claveFiltros = 'prospecta-filtros-' + modo
  const filtrosGuardados = () => { try { return new Set(JSON.parse(localStorage.getItem(claveFiltros)) ?? []) } catch { return new Set() } }
  const [activos, setActivos] = useState(filtrosGuardados)
  const [pedido, setPedido] = useState('')
  const [verFiltros, setVerFiltros] = useState(false)
  const [res, setRes] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [seg, setSeg] = useState(0)
  const [historial, setHistorial] = useState([])
  const resultadosRef = useRef(null)
  const rubroRef = useRef(null)

  useEffect(() => { setActivos(filtrosGuardados()) }, [modo])
  // La zona por defecto sigue a la configuración de la cuenta hasta que la persona elige otra
  useEffect(() => { if ((!zonaTocada.current || !zona) && sugZonas[0]) setZona(sugZonas[0]) }, [sugZonas])
  const cargarHistorial = () => supabase.from('busquedas').select('*').order('created_at', { ascending: false }).limit(6).then(({ data }) => setHistorial(data ?? []))
  useEffect(() => { cargarHistorial() }, [])

  const filtrosActivos = filtros.filter(f => activos.has(f.id))
  const alternar = id => setActivos(a => { const n = new Set(a); n.has(id) ? n.delete(id) : n.add(id); try { localStorage.setItem(claveFiltros, JSON.stringify([...n])) } catch { /* sin almacenamiento */ } return n })

  const sinTilde = z => z.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const zonaNormal = z => todasZonas.find(o => sinTilde(o) === sinTilde(z)) ?? z.trim()

  // Buscar: el servidor entiende el pedido y busca de una
  async function buscar() {
    if (!rubro.trim()) { rubroRef.current?.focus(); return }
    if (!zona?.trim()) { setError(`Elegí una provincia, ciudad o zona de ${nombrePais(paisBusq)}: si buscás en todo el país, los resultados se dispersan.`); return }
    setZona(zonaNormal(zona))
    setCargando(true); setError(''); setRes(null); setSeg(0)
    const t0 = Date.now()
    const timer = setInterval(() => setSeg(Math.round((Date.now() - t0) / 1000)), 500)
    try {
      // Sin paso previo: el servidor entiende el pedido y busca de una
      const pedirA = f => llamarFuncion('buscar-negocios', { rubro: rubro.trim(), zona: zonaConPais(zonaNormal(zona), paisBusq), cantidad, filtros: filtrosActivos.map(({ id, titulo, descripcion }) => ({ id, titulo, descripcion })), pedido, fuente: f, libre })
      let r
      try { r = await pedirA(fuenteUsada) } catch (err) {
        // Maps sin clave (se quitó recién): se avisa y se busca con Claude, sin perder el pedido
        if (fuenteUsada === 'claude' || !/google places/i.test(err.message)) throw err
        toast('Google Maps no está conectado: busco sólo con Claude.', 'info')
        setFuente('claude')
        r = await pedirA('claude')
      }
      setRes(r); setSinLibre(libre && r.libre !== true)
      toast(r.resultados.length ? `Encontró ${r.resultados.length} empresas nuevas para revisar` : 'No encontró empresas nuevas. Probá con otra zona o ampliá lo que entra.', r.resultados.length ? '' : 'info',
        r.resultados.length ? { accion: { label: 'Ver en Por revisar', onClick: () => nav(`/revisar?busqueda=${r.busqueda_id ?? ''}`) } } : {})
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
          <h1>Buscar</h1>
          <p>{libre
            ? 'Escribí lo que quieras encontrar y dónde. Busca exactamente eso en Google Maps, la web y redes.'
            : 'Escribí qué empresas querés y dónde. Trae las que te pueden comprar, según lo que vendés.'}</p>
        </div>
      </header>

      <div className="modo-busqueda">
        <div className="fuente-sel" role="radiogroup" aria-label="Tipo de búsqueda">
          {MODOS.map(m => <button key={m.id} type="button" role="radio" aria-checked={modo === m.id} className={modo === m.id ? 'on' : ''} disabled={cargando} title={m.ayuda} onClick={() => elegirModo(m.id)}>
            {m.id === 'libre' ? <Search size={13} /> : <Store size={13} />}{m.nombre}</button>)}
        </div>
      </div>

      {comercial === null && !libre && (
        <div className="aviso-negocio">
          <Store size={22} />
          <div style={{ flex: 1 }}><b>Contanos qué vendés y la búsqueda se arma sola</b><p>Una sola pregunta y Claude te sugiere qué rubros y zonas buscar.</p></div>
          <Link className="btn primario" to="/negocio">Completar <ArrowRight size={15} /></Link>
        </div>
      )}
      {servicios.ia === false && <Aviso>Falta la clave de Claude. {perfil?.es_admin ? <Link to="/admin?tab=claves">Cargala acá</Link> : 'Pedile al administrador que la cargue.'}</Aviso>}
      {servicios.ia !== false && sinMaps && <Aviso tipo="info">Google Maps no está conectado: la búsqueda va sólo con Claude. {perfil?.es_admin ? <Link to="/admin?tab=claves">Conectar Google Maps</Link> : 'Para sumar las fichas de Maps, pedile al administrador que lo conecte.'}</Aviso>}

      <section className="busqueda-hero">
      <form className="barra-busqueda" onSubmit={e => { e.preventDefault(); buscar() }}>
        <label className="bb-campo">
          <span><Search size={14} /> Qué buscás</span>
          <Autocompletar ref={rubroRef} opciones={todosRubros} value={rubro} onChange={setRubro} placeholder={libre ? 'Ej.: comercios sin página web, ferreterías, transportes' : 'Ej.: distribuidoras con depósito propio'} disabled={cargando} />
          {rubro && !cargando && <button type="button" className="bb-limpiar" onClick={() => setRubro('')} aria-label="Borrar"><X size={13} /></button>}
        </label>
        <label className="bb-campo">
          <span><MapPin size={14} /> Dónde</span>
          <div className="donde-fila">
            <Desplegable className="donde-pais" ariaLabel="País" value={paisBusq} disabled={cargando} anchoMenu={230}
              onChange={v => { zonaTocada.current = true; setPaisBusq(v); setZona('') }}
              opciones={[...paisesCuenta.map(c => PAISES.find(p => p.code === c)).filter(Boolean), ...PAISES.filter(p => !paisesCuenta.includes(p.code))].map(p => ({ value: p.code, label: p.nombre, icono: <Bandera code={p.code} />, ayuda: paisesCuenta.includes(p.code) ? 'de tu cuenta' : '' }))} />
            <SelectorZona soloPais={paisBusq} region={paisBusq === perfil?.pais ? perfil?.region : ''} value={zona} placeholder="Provincia, ciudad o zona" onChange={v => { zonaTocada.current = true; setZona(v) }} sugeridas={sugZonas.slice(0, 6)} disabled={cargando} />
          </div>
        </label>
        <label className="bb-campo bb-chico">
          <span>Cuántos</span>
          <Desplegable className="bb-desplegable" ariaLabel="Cuántas empresas" value={cantidad} onChange={v => setCantidad(Number(v))} disabled={cargando} anchoMenu={170} alinear="der"
            opciones={[10, 20, 30, 40].map(n => ({ value: n, label: String(n), ayuda: n <= 10 ? 'menos de 1 minuto' : n <= 20 ? '≈ 1 minuto' : 'un par de minutos' }))} />
        </label>
        <button className="btn ia bb-boton" disabled={cargando || servicios.ia === false}>
          {cargando ? <Loader2 size={18} className="spin" /> : <Search size={18} />} {cargando ? 'Buscando…' : 'Buscar'}
        </button>
      </form>

      <div className="bb-pie">
        <div className="filtros-rapidos" role="group" aria-label="Filtros">
          {filtros.map(f => (
            <button key={f.id} type="button" className={'filtro-chip' + (activos.has(f.id) ? ' on' : '')} aria-pressed={activos.has(f.id)} title={f.descripcion || f.titulo} onClick={() => alternar(f.id)} disabled={cargando}>
              {activos.has(f.id) && <Check size={12} />} {f.titulo}
            </button>
          ))}
          <button type="button" className={'filtro-chip' + (verFiltros || pedido ? ' on' : '')} onClick={() => setVerFiltros(v => !v)} aria-expanded={verFiltros} disabled={cargando}>
            <SlidersHorizontal size={12} /> {pedido ? 'Con un pedido extra' : 'Algo más'}
          </button>
        </div>
        <span className="espacio" />
        {ia && <Link to="/uso" className={'chico bb-costo ' + (ia.agotada ? 'texto-alerta' : 'muted')} title="Ver uso y límites">{textoCosto(ia)}</Link>}
      </div>
      </section>
      {verFiltros && (
        <section className="tarjeta panel-filtros">
          <label style={{ margin: 0 }}>Algo más que Claude tenga en cuenta <span className="muted">(opcional)</span>
            <input value={pedido} onChange={e => setPedido(e.target.value)} maxLength={400} placeholder="Ej.: que tengan buenas reseñas, que sean chicos o nuevos" autoFocus />
          </label>
        </section>
      )}

      {sinLibre && <Aviso tipo="info">La búsqueda libre todavía no está activada en el servidor: esta búsqueda se hizo según tu negocio. Hay que publicar la versión nueva de las funciones.</Aviso>}

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
              <h2>{res.resultados.length ? `${res.resultados.length} empresas nuevas` : 'No encontró empresas nuevas'}{res.libre ? <span className="etiqueta-libre">Búsqueda libre</span> : null}</h2>
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
              <TarjetaHallazgo key={h.id ?? h.nombre} h={res.libre ? { ...h, libre: true } : h} ocupado={ocupados.has(h.id)}
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
              {b.requisitos?.libre && <span className="etiqueta-libre">Libre</span>}{b.rubro.charAt(0).toUpperCase() + b.rubro.slice(1)} · {b.zona} <span className="muted">({b.guardados})</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
