import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus, Download, List, Columns3, Sparkles, Loader2, Star, CalendarClock, X } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { ESTADOS, descargarCSV, fecha, handleIG, mensajeError } from '../lib/util.js'
import { Avatar, Esqueleto, EstadoBadge, QueTieneChip, useConfirmar, useToast } from '../components/ui.jsx'
import NuevoProspecto from '../components/NuevoProspecto.jsx'
import { useApp } from '../App.jsx'

export default function Prospectos() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const confirmar = useConfirmar()
  const { refrescar } = useApp()
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
  const set = (k, v) => setParams(() => { const p = new URLSearchParams(window.location.search); v ? p.set(k, v) : p.delete(k); return p }, { replace: true })

  async function cargar() {
    const { data, error } = await supabase.from('prospectos').select('*, mensajes(tipo)').order('created_at', { ascending: false })
    if (error) toast(mensajeError(error), 'error')
    setLista(data ?? [])
    setCargando(false)
  }
  useEffect(() => { cargar() }, [])

  const rubros = useMemo(() => [...new Set(lista.map(p => p.rubro).filter(Boolean))].sort(), [lista])
  const filtrados = useMemo(() => {
    const t = q.toLowerCase()
    const r = lista.filter(p =>
      (vista === 'pipeline' || !estado || p.estado === estado) && (!rubro || p.rubro === rubro) &&
      (!t || [p.nombre, p.rubro, p.direccion, p.telefono, p.instagram, p.notas].join(' ').toLowerCase().includes(t)))
    const cmp = {
      resenas: (a, b) => (b.resenas ?? 0) - (a.resenas ?? 0),
      nombre: (a, b) => a.nombre.localeCompare(b.nombre),
      reciente: (a, b) => b.created_at.localeCompare(a.created_at),
      seguimiento: (a, b) => (a.proximo_seguimiento ?? '9999').localeCompare(b.proximo_seguimiento ?? '9999'),
    }[orden]
    return r.sort(cmp)
  }, [lista, q, estado, rubro, orden, vista])

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

  function exportar() {
    descargarCSV(`prospectos_${new Date().toISOString().slice(0, 10)}.csv`, filtrados.map(p => ({
      Nombre: p.nombre, Rubro: p.rubro, Zona: p.zona, Dirección: p.direccion, Teléfono: p.telefono, Email: p.email,
      Instagram: p.instagram, 'Qué tiene hoy': p.que_tiene_hoy, 'Web actual': p.web_actual, Puntaje: p.rating ?? '',
      Reseñas: p.resenas ?? '', 'Google Maps': p.google_maps_url, Estado: ESTADOS[p.estado].label,
      'Último contacto': p.ultimo_contacto ? p.ultimo_contacto.slice(0, 10) : '', 'Próximo seguimiento': p.proximo_seguimiento ?? '', Notas: p.notas,
    })))
    toast(`Exportados ${filtrados.length} prospectos`)
  }

  return (
    <>
      <header className="cabecera">
        <div><h1>Prospectos</h1><p>{filtrados.length} de {lista.length} negocios</p></div>
        <div className="acciones">
          <div className="selector-vista" role="tablist">
            <button className={vista === 'lista' ? 'activo' : ''} onClick={() => set('vista', '')}><List size={15} /> Lista</button>
            <button className={vista === 'pipeline' ? 'activo' : ''} onClick={() => set('vista', 'pipeline')}><Columns3 size={15} /> Pipeline</button>
          </div>
          <button className="btn" onClick={exportar} disabled={!filtrados.length}><Download size={16} /> Exportar CSV</button>
          <button className="btn primario" onClick={() => setNuevo(true)}><Plus size={16} /> Nuevo</button>
        </div>
      </header>

      <div className="barra-herramientas">
        <div className="buscador"><Search size={16} />
          <input placeholder="Buscar nombre, teléfono, Instagram…" value={q} onChange={e => set('q', e.target.value)} />
        </div>
        {vista === 'lista' && (
          <select value={estado} onChange={e => set('estado', e.target.value)} aria-label="Estado">
            <option value="">Todos los estados</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        )}
        <select value={rubro} onChange={e => set('rubro', e.target.value)} aria-label="Rubro">
          <option value="">Todos los rubros</option>{rubros.map(r => <option key={r}>{r}</option>)}
        </select>
        <select value={orden} onChange={e => set('orden', e.target.value)} aria-label="Orden">
          <option value="resenas">Más reseñas</option><option value="nombre">Nombre</option>
          <option value="reciente">Cargados recientemente</option><option value="seguimiento">Próximo seguimiento</option>
        </select>
      </div>

      {sel.size > 0 && (
        <div className="barra-sel">
          <b>{sel.size} seleccionados</b>
          <button className="btn ia" onClick={generar} disabled={generando}>
            {generando ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}{generando ? 'Escribiendo borradores…' : 'Generar borradores'}
          </button>
          <span className="muted chico">Se guardan como borradores; el envío es siempre uno por uno.</span>
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
                <th>Negocio</th><th>Teléfono</th><th>Instagram</th><th>Hoy tiene</th><th>Google</th><th>Estado</th><th>Seguimiento</th>
              </tr></thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id} className={p.estado === 'no_interesado' ? 'apagado' : ''}>
                    <td><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={'Seleccionar ' + p.nombre} /></td>
                    <td>
                      <div className="negocio">
                        <Avatar nombre={p.nombre} />
                        <div>
                          <Link to={`/prospectos/${p.id}`} className="fuerte">{p.nombre}</Link>
                          <div className="muted chico">{p.rubro}{p.zona ? ' · ' + p.zona : ''}
                            {p.mensajes?.length > 0 && <> · <span style={{ color: 'var(--acc)' }}><Sparkles size={11} style={{ verticalAlign: -1 }} /> borrador</span></>}</div>
                        </div>
                      </div>
                    </td>
                    <td className="nowrap">{p.telefono || <span className="muted">—</span>}</td>
                    <td>{p.instagram ? <a href={p.instagram} target="_blank" rel="noreferrer">{handleIG(p.instagram)}</a> : <span className="muted">—</span>}</td>
                    <td><QueTieneChip valor={p.que_tiene_hoy} /></td>
                    <td className="nowrap">{p.resenas ?? '—'}{p.rating ? <span className="muted"> · {p.rating}★</span> : ''}</td>
                    <td><EstadoBadge estado={p.estado} /></td>
                    <td className="nowrap">{p.proximo_seguimiento ? fecha(p.proximo_seguimiento) : <span className="muted">—</span>}</td>
                  </tr>
                ))}
                {!filtrados.length && <tr><td colSpan={8} className="muted centrado" style={{ padding: 40 }}>No hay prospectos con esos filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {nuevo && <NuevoProspecto onCerrar={() => setNuevo(false)} onCreado={p => { setNuevo(false); toast('Prospecto creado'); nav(`/prospectos/${p.id}`) }} />}
    </>
  )
}
