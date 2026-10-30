import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus, Download, Send, Flame, List, Columns3, Sparkles, Loader2, Star, CalendarClock, X, Phone, Mail, Inbox, ArrowRight, Tag, ArrowDownUp, CircleDot } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { ESTADOS, fecha, mensajeError } from '../lib/util.js'
import { descargarExcel, filaEmpresa } from '../lib/excel.js'
import { Avatar, Esqueleto, EstadoBadge, useConfirmar, useToast } from '../components/ui.jsx'
import NuevoProspecto from '../components/NuevoProspecto.jsx'
import Desplegable from '../components/Desplegable.jsx'
import Enlaces from '../components/Enlaces.jsx'
import EnvioMasivo from '../components/EnvioMasivo.jsx'
import { useApp } from '../App.jsx'

export default function Prospectos() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const confirmar = useConfirmar()
  const { refrescar, porRevisar, correo } = useApp()
  const [envio, setEnvio] = useState(null)
  const [lista, setLista] = useState([])
  const [cargando, setCargando] = useState(true)
  const [sel, setSel] = useState(new Set())
  const [nuevo, setNuevo] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [arrastrado, setArrastrado] = useState(null)
  const [sobre, setSobre] = useState(null)

  const q = params.get('q') ?? ''
  const estado = params.get('estado') ?? ''
  const rubro = params.get('rubro') ?? ''
  const orden = params.get('orden') ?? 'resenas'
  const vista = params.get('vista') ?? 'lista'
  const busqueda = params.get('busqueda') ?? ''
  const califFiltro = params.get('calif') ?? ''
  const [infoBusqueda, setInfoBusqueda] = useState(null)
  const set = (k, v) => setParams(() => { const p = new URLSearchParams(window.location.search); v ? p.set(k, v) : p.delete(k); return p }, { replace: true })

  async function cargar() {
    const { data, error } = await supabase.from('prospectos').select('*, mensajes(tipo)').order('created_at', { ascending: false })
    if (error) toast(mensajeError(error), 'error')
    setLista(data ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])
  useEffect(() => {
    if (!busqueda) { setInfoBusqueda(null); return }
    supabase.from('busquedas').select('*').eq('id', busqueda).maybeSingle().then(({ data }) => setInfoBusqueda(data))
  }, [busqueda])
  // Viene de "Armar mensajes para estos": dejar seleccionados los de la búsqueda
  useEffect(() => {
    if (cargando || params.get('generar') !== '1') return
    setSel(new Set(lista.filter(p => p.busqueda_id === busqueda && p.estado === 'pendiente').map(p => p.id)))
    set('generar', '')
  }, [cargando])

  const rubros = useMemo(() => [...new Set(lista.map(p => p.rubro).filter(Boolean))].sort(), [lista])
  const filtrados = useMemo(() => {
    const t = q.toLowerCase()
    const r = lista.filter(p =>
      (vista === 'pipeline' || !estado || p.estado === estado) && (!rubro || p.rubro === rubro) && (!califFiltro || String(p.calificacion ?? '') === califFiltro) && (!busqueda || p.busqueda_id === busqueda) &&
      (!t || [p.nombre, p.rubro, p.zona, p.direccion, p.telefono, p.email, p.instagram, p.notas].join(' ').toLowerCase().includes(t)))
    const cmp = {
      resenas: (a, b) => (b.calificacion ?? 0) - (a.calificacion ?? 0) || (b.puntaje ?? 0) - (a.puntaje ?? 0) || (b.resenas ?? 0) - (a.resenas ?? 0),
      nombre: (a, b) => a.nombre.localeCompare(b.nombre),
      reciente: (a, b) => b.created_at.localeCompare(a.created_at),
      seguimiento: (a, b) => (a.proximo_seguimiento ?? '9999').localeCompare(b.proximo_seguimiento ?? '9999'),
    }[orden]
    return r.sort(cmp)
  }, [lista, q, estado, rubro, orden, vista, busqueda, califFiltro])

  const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const todos = filtrados.length > 0 && filtrados.every(p => sel.has(p.id))

  async function generar() {
    const ids = [...sel].filter(id => lista.find(p => p.id === id)?.estado !== 'no_interesado')
    if (!ids.length) return
    setGenerando(true)
    try {
      let ia = false, errorIA = ''
      for (let i = 0; i < ids.length; i += 25) {
        const r = await llamarFuncion('generar-mensajes', { prospecto_ids: ids.slice(i, i + 25) })
        ia = ia || r.ia; errorIA = errorIA || r.error_ia || ''
      }
      toast(`Borradores listos para ${ids.length} ${ids.length === 1 ? 'prospecto' : 'prospectos'}${ia ? ' (escritos por Claude)' : ' (con plantillas)'}. Abrí cada uno para revisarlo y enviarlo.`)
      if (errorIA) toast('Claude no respondió en algunos casos y se usaron plantillas: ' + errorIA, 'error')
      setSel(new Set()); cargar()
    } catch (e) { toast(mensajeError(e), 'error') }
    setGenerando(false)
  }

  async function calificar(p, valor) {
    const nuevo = p.calificacion === valor ? null : valor
    setLista(l => l.map(x => x.id === p.id ? { ...x, calificacion: nuevo } : x))
    const { error } = await supabase.from('prospectos').update({ calificacion: nuevo }).eq('id', p.id)
    if (error) { toast(mensajeError(error), 'error'); cargar() }
  }

  async function moverA(p, nuevoEstado) {
    if (!p || p.estado === nuevoEstado) return
    if (nuevoEstado === 'no_interesado' && !(await confirmar({
      titulo: `¿Marcar "${p.nombre}" como no interesado?`, texto: 'No se le podrá escribir más y sale de todos los seguimientos.', aceptar: 'Sí, marcar', peligro: true,
    }))) return
    setLista(l => l.map(x => x.id === p.id ? { ...x, estado: nuevoEstado } : x))
    const { error } = await supabase.from('prospectos').update({ estado: nuevoEstado }).eq('id', p.id)
    if (error) { toast(mensajeError(error), 'error'); cargar(); return }
    await supabase.from('interacciones').insert({ prospecto_id: p.id, tipo: 'cambio_estado', detalle: `${ESTADOS[p.estado].label} → ${ESTADOS[nuevoEstado].label}` })
    toast(`${p.nombre}: ${ESTADOS[nuevoEstado].label}`)
    refrescar()
  }

  async function exportar() {
    await descargarExcel(`mi_lista_${new Date().toISOString().slice(0, 10)}.xlsx`, filtrados.map(p => filaEmpresa(p, {
      Estado: ESTADOS[p.estado].label, 'Último contacto': p.ultimo_contacto ? p.ultimo_contacto.slice(0, 10) : '',
      'Próximo seguimiento': p.proximo_seguimiento ?? '', Notas: p.notas || '',
    })))
    toast(`Descargaste ${filtrados.length} empresas en Excel`)
  }

  const opcionesEstado = Object.entries(ESTADOS).map(([k, v]) => ({ value: k, label: v.label, nodo: <EstadoBadge estado={k} /> }))

  return (
    <>
      <header className="cabecera">
        <div><h1>Para contactar</h1><p>Las empresas que pasaste en limpio: calificalas, contactalas y seguí cada una. {lista.length ? `${filtrados.length} de ${lista.length}.` : ''}</p></div>
        <div className="acciones">
          <div className="selector-vista" role="tablist">
            <button className={vista === 'lista' ? 'activo' : ''} onClick={() => set('vista', '')}><List size={15} /> Tabla</button>
            <button className={vista === 'pipeline' ? 'activo' : ''} onClick={() => set('vista', 'pipeline')}><Columns3 size={15} /> Pipeline</button>
          </div>
          <Link className="btn" to="/envios"><Send size={16} /> Envío masivo</Link>
          <button className="btn" onClick={exportar} disabled={!filtrados.length}><Download size={16} /> Descargar Excel</button>
          <button className="btn primario" onClick={() => setNuevo(true)}><Plus size={16} /> Agregar</button>
        </div>
      </header>

      {porRevisar > 0 && (
        <Link to="/revisar" className="aviso-revisar">
          <Inbox size={18} />
          <span><b>{porRevisar} {porRevisar === 1 ? 'empresa encontrada espera' : 'empresas encontradas esperan'} tu revisión.</b> Sumá las que te sirven a esta lista.</span>
          <span className="espacio" /><span className="link">Revisar <ArrowRight size={14} /></span>
        </Link>
      )}

      <div className="barra-herramientas">
        <div className="buscador"><Search size={16} />
          <input placeholder="Buscar por nombre, teléfono, zona…" value={q} onChange={e => set('q', e.target.value)} />
          {q && <button className="bb-limpiar" onClick={() => set('q', '')} aria-label="Borrar"><X size={13} /></button>}
        </div>
        {vista === 'lista' && (
          <Desplegable compacto ariaLabel="Estado" value={estado} onChange={v => set('estado', v)} anchoMenu={210}
            opciones={[{ value: '', label: 'Todos los estados', icono: <CircleDot size={14} className="muted" /> }, ...opcionesEstado]} />
        )}
        <Desplegable compacto ariaLabel="Cuánto te sirve" value={califFiltro} onChange={v => set('calif', v)} anchoMenu={220}
          opciones={[{ value: '', label: 'Te sirve: todas', icono: <Flame size={14} className="muted" /> }, ...CALIF.map(c => ({ value: String(c.v), label: c.label, icono: <Llamas n={c.v} /> }))]} />
        {rubros.length > 1 && (
          <Desplegable compacto ariaLabel="Tipo de empresa" value={rubro} onChange={v => set('rubro', v)} anchoMenu={240}
            opciones={[{ value: '', label: 'Todos los tipos', icono: <Tag size={14} className="muted" /> }, ...rubros.map(r => ({ value: r, label: r }))]} />
        )}
        <Desplegable compacto ariaLabel="Ordenar" value={orden} onChange={v => set('orden', v)} anchoMenu={230} alinear="der"
          opciones={[['resenas', 'Mejor encaje'], ['reciente', 'Agregadas recientemente'], ['nombre', 'Nombre (A-Z)'], ['seguimiento', 'Próximo seguimiento']].map(([value, label]) => ({ value, label, icono: <ArrowDownUp size={14} className="muted" /> }))} />
      </div>

      {busqueda && (
        <div className="aviso-filtro">
          <Sparkles size={15} />
          <span>Mostrando los negocios de la búsqueda <b>{infoBusqueda ? `${infoBusqueda.rubro} · ${infoBusqueda.zona.replace(/, Mendoza$/, '')}` : '…'}</b></span>
          <span className="espacio" />
          <button className="link" onClick={() => set('busqueda', '')}><X size={14} style={{ verticalAlign: -2 }} /> Ver todos</button>
        </div>
      )}

      {sel.size > 0 && (
        <div className="barra-sel">
          <b>{sel.size} seleccionados</b>
          <button className="btn ia" onClick={generar} disabled={generando}>
            {generando ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}{generando ? 'Escribiendo borradores…' : 'Generar borradores'}
          </button>
          {correo
            ? <button className="btn primario" onClick={() => setEnvio(lista.filter(p => sel.has(p.id)))}><Send size={16} /> Enviar emails</button>
            : <Link className="btn" to="/email"><Send size={16} /> Conectá tu email para enviar de a varios</Link>}
          <span className="espacio" />
          <button className="link" onClick={() => setSel(new Set())}><X size={14} style={{ verticalAlign: -2 }} /> Limpiar</button>
        </div>
      )}

      {cargando ? <Esqueleto filas={6} /> : vista === 'pipeline' ? (
        <div className="kanban">
          {Object.entries(ESTADOS).map(([k, e]) => {
            const items = filtrados.filter(p => p.estado === k)
            return (
              <div key={k} className={'kanban-col' + (sobre === k ? ' sobre' : '')} style={{ '--col': e.barra }}
                onDragOver={ev => { ev.preventDefault(); setSobre(k) }} onDragLeave={() => setSobre(null)}
                onDrop={ev => { ev.preventDefault(); setSobre(null); const p = lista.find(x => x.id === arrastrado); setArrastrado(null); moverA(p, k) }}>
                <div className="kanban-cab"><EstadoBadge estado={k} /><span className="num">{items.length}</span></div>
                <div className="kanban-tarjetas">
                  {items.map(p => (
                    <div key={p.id} className={'kcard' + (arrastrado === p.id ? ' arrastrando' : '')} draggable
                      onDragStart={() => setArrastrado(p.id)} onDragEnd={() => setArrastrado(null)}
                      onClick={() => nav(`/prospectos/${p.id}`)} role="button" tabIndex={0}
                      onKeyDown={ev => ev.key === 'Enter' && nav(`/prospectos/${p.id}`)}>
                      <b>{p.nombre}</b>
                      <div className="meta">
                        <span>{p.rubro}</span>
                        {p.resenas ? <span>· <Star size={11} style={{ verticalAlign: -1 }} /> {p.resenas}</span> : null}
                        {p.mensajes?.length > 0 && p.estado === 'pendiente' && <span className="chip ia"><Sparkles size={11} /> borrador</span>}
                        {p.proximo_seguimiento && <span className="chip"><CalendarClock size={11} /> {fecha(p.proximo_seguimiento)}</span>}
                      </div>
                    </div>
                  ))}
                  {!items.length && <p className="muted chico centrado" style={{ padding: 12 }}>Arrastrá acá</p>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="tarjeta sin-pad">
          <div className="scroll-x">
            <table className="tabla">
              <thead><tr>
                <th style={{ width: 36 }}><input type="checkbox" checked={todos} aria-label="Seleccionar todos"
                  onChange={() => setSel(todos ? new Set() : new Set(filtrados.map(p => p.id)))} /></th>
                <th>Empresa</th><th>Te sirve</th><th>Contacto</th><th>Links</th><th>Estado</th><th>Seguimiento</th>
              </tr></thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id} className={(p.estado === 'no_interesado' ? 'apagado ' : '') + (sel.has(p.id) ? 'seleccionada' : '')}>
                    <td><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={'Seleccionar ' + p.nombre} /></td>
                    <td>
                      <div className="negocio">
                        <Avatar nombre={p.nombre} />
                        <div className="negocio-txt">
                          <Link to={`/prospectos/${p.id}`} className="fuerte nombre-empresa">{p.nombre}</Link>
                          <div className="muted chico">{[p.rubro, p.zona].filter(Boolean).join(' · ')}
                            {p.puntaje > 0 && <> · <span className="puntaje mini" title={`Encaje ${p.puntaje} de 5`}><Star size={10} fill="currentColor" /> {p.puntaje}</span></>}
                            {p.mensajes?.length > 0 && <> · <span style={{ color: 'var(--acc)' }}><Sparkles size={11} style={{ verticalAlign: -1 }} /> borrador</span></>}</div>
                        </div>
                      </div>
                    </td>
                    <td><Calificador valor={p.calificacion} onCambiar={v => calificar(p, v)} /></td>
                    <td className="contacto-celda">
                      {p.telefono ? <a href={`tel:${p.telefono.split('/')[0].replace(/[^\d+]/g, '')}`}><Phone size={12} /> {p.telefono}</a> : null}
                      {p.email ? <a href={`mailto:${p.email}`}><Mail size={12} /> {p.email}</a> : null}
                      {!p.telefono && !p.email && <span className="muted">—</span>}
                    </td>
                    <td><Enlaces e={p} fuente={false} /></td>
                    <td><Desplegable compacto className="estado-celda" ariaLabel={'Estado de ' + p.nombre} value={p.estado} onChange={v => moverA(p, v)} anchoMenu={200} opciones={opcionesEstado} /></td>
                    <td className="nowrap">{p.proximo_seguimiento ? fecha(p.proximo_seguimiento) : <span className="muted">—</span>}</td>
                  </tr>
                ))}
                {!filtrados.length && <tr><td colSpan={7} className="muted centrado" style={{ padding: 40 }}>
                  {lista.length ? 'No hay empresas con esos filtros.' : <>Todavía no pasaste empresas a tu lista. <Link to={porRevisar ? '/revisar' : '/buscar'}>{porRevisar ? 'Revisá las encontradas' : 'Buscá clientes'}</Link> o importá una planilla.</>}
                </td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {envio && <EnvioMasivo prospectos={envio} onCerrar={() => { setEnvio(null); cargar() }} onListo={() => { setSel(new Set()); cargar() }} />}
      {nuevo && <NuevoProspecto onCerrar={() => setNuevo(false)} onCreado={p => { setNuevo(false); toast('Prospecto creado'); nav(`/prospectos/${p.id}`) }} />}
    </>
  )
}

const CALIF = [
  { v: 3, label: 'Me sirve mucho' },
  { v: 2, label: 'Me sirve' },
  { v: 1, label: 'Más o menos' },
]
function Llamas({ n }) {
  return <span className="llamas">{[1, 2, 3].map(i => <Flame key={i} size={13} className={i <= n ? 'on' : ''} />)}</span>
}
/** Cuánto te sirve esta empresa: 1 a 3 llamas. Lo usa la búsqueda para aprender qué traer */
function Calificador({ valor, onCambiar }) {
  return (
    <span className="calificador" role="radiogroup" aria-label="Cuánto te sirve">
      {[1, 2, 3].map(i => (
        <button key={i} type="button" role="radio" aria-checked={valor === i} className={i <= (valor ?? 0) ? 'on' : ''}
          title={CALIF.find(c => c.v === i).label} onClick={() => onCambiar(i)}><Flame size={16} /></button>
      ))}
    </span>
  )
}
