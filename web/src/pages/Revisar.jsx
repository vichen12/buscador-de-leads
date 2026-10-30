import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox, Check, X, Download, Search, Sparkles, Undo2, Loader2, ListChecks, Ban } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { descargarExcel, filaEmpresa } from '../lib/excel.js'
import { aprobarHallazgos, descartarHallazgos, recuperarHallazgos } from '../lib/hallazgos.js'
import { Esqueleto, useToast } from '../components/ui.jsx'
import TarjetaHallazgo from '../components/TarjetaHallazgo.jsx'
import Desplegable from '../components/Desplegable.jsx'
import { useApp } from '../App.jsx'

const TABS = [
  ['por_revisar', 'Por revisar', Inbox],
  ['aprobado', 'Sumadas a mi lista', ListChecks],
  ['descartado', 'No sirven', Ban],
]

export default function Revisar() {
  const toast = useToast()
  const { refrescar, setPorRevisar } = useApp()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'por_revisar'
  const busqueda = params.get('busqueda') || ''
  const [todos, setTodos] = useState([])
  const [busquedas, setBusquedas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(new Set())
  const [ocupados, setOcupados] = useState(new Set())
  const set = (k, v) => setParams(() => { const p = new URLSearchParams(window.location.search); v ? p.set(k, v) : p.delete(k); return p }, { replace: true })

  async function cargar() {
    const [{ data, error }, { data: bs }] = await Promise.all([
      supabase.from('hallazgos').select('*').order('puntaje', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(2000),
      supabase.from('busquedas').select('id, rubro, zona, created_at').order('created_at', { ascending: false }).limit(50),
    ])
    if (error) toast(mensajeError(error), 'error')
    setTodos(data ?? []); setBusquedas(bs ?? []); setCargando(false)
  }
  useEffect(() => { cargar() }, [])
  useEffect(() => { setSel(new Set()) }, [tab, busqueda])
  useEffect(() => { setPorRevisar(todos.filter(h => h.estado === 'por_revisar').length) }, [todos])

  const cuenta = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, todos.filter(h => h.estado === k && (!busqueda || h.busqueda_id === busqueda)).length])), [todos, busqueda])
  const lista = useMemo(() => {
    const t = q.toLowerCase().trim()
    return todos.filter(h => h.estado === tab && (!busqueda || h.busqueda_id === busqueda) &&
      (!t || [h.nombre, h.rubro, h.zona, h.direccion, h.telefono, h.email].join(' ').toLowerCase().includes(t)))
  }, [todos, tab, busqueda, q])
  const busquedasConDatos = busquedas.filter(b => todos.some(h => h.busqueda_id === b.id))

  const marcar = (ids, cambio) => setTodos(l => l.map(h => ids.includes(h.id) ? { ...h, ...cambio } : h))
  const conOcupado = async (ids, fn) => {
    setOcupados(o => new Set([...o, ...ids]))
    try { await fn() } catch (e) { toast(mensajeError(e), 'error') }
    setOcupados(o => { const n = new Set(o); ids.forEach(i => n.delete(i)); return n })
    setSel(s => { const n = new Set(s); ids.forEach(i => n.delete(i)); return n })
  }

  const aprobar = ids => conOcupado(ids, async () => {
    const r = await aprobarHallazgos(ids)
    await cargar(); refrescar()
    toast(ids.length === 1 ? 'Sumada a tu lista' : `${r.nuevos} sumadas a tu lista${r.ya_estaban ? ` (${r.ya_estaban} ya estaban)` : ''}`)
  })
  const descartar = ids => conOcupado(ids, async () => {
    await descartarHallazgos(ids)
    marcar(ids, { estado: 'descartado' })
    toast(ids.length === 1 ? 'Marcada como "No sirve": no va a volver a aparecer en las búsquedas' : `${ids.length} marcadas como "No sirve"`)
  })
  const recuperar = ids => conOcupado(ids, async () => {
    await recuperarHallazgos(ids)
    marcar(ids, { estado: 'por_revisar', motivo: '' })
    toast('Volvió a "Por revisar"')
  })

  const todasSel = lista.length > 0 && lista.every(h => sel.has(h.id))
  const ids = [...sel]
  const nombreBusqueda = b => `${b.rubro.charAt(0).toUpperCase() + b.rubro.slice(1)} · ${b.zona.replace(/, Mendoza$/, '')}`

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Por revisar</h1>
          <p>Lo que encontró la búsqueda. Sumá a tu lista las empresas que vas a contactar y marcá las que no sirven: esas no vuelven a aparecer en ninguna búsqueda.</p>
        </div>
        <div className="acciones">
          <button className="btn" disabled={!lista.length} onClick={() => descargarExcel(`empresas_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`, lista.map(h => filaEmpresa(h)))}><Download size={16} /> Descargar Excel</button>
          <Link className="btn ia" to="/buscar"><Sparkles size={16} /> Buscar más</Link>
        </div>
      </header>

      <div className="tabs-revisar" role="tablist">
        {TABS.map(([k, label, Icono]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'activo' : ''} onClick={() => set('tab', k === 'por_revisar' ? '' : k)}>
            <Icono size={15} /> {label} <span className="num">{cuenta[k]}</span>
          </button>
        ))}
      </div>

      <div className="barra-herramientas">
        <div className="buscador"><Search size={16} /><input placeholder="Buscar por nombre, teléfono, zona…" value={q} onChange={e => setQ(e.target.value)} /></div>
        {busquedasConDatos.length > 0 && (
          <Desplegable compacto ariaLabel="Búsqueda" value={busqueda} onChange={v => set('busqueda', v)} anchoMenu={300}
            opciones={[{ value: '', label: 'Todas las búsquedas' }, ...busquedasConDatos.map(b => ({ value: b.id, label: nombreBusqueda(b), ayuda: new Date(b.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }))]} />
        )}
      </div>

      {tab === 'por_revisar' && lista.length > 0 && (
        <div className={'barra-sel revisar' + (sel.size ? ' con-sel' : '')}>
          <label className="sel-todos"><input type="checkbox" checked={todasSel} onChange={() => setSel(todasSel ? new Set() : new Set(lista.map(h => h.id)))} /> {sel.size ? `${sel.size} seleccionadas` : 'Seleccionar todas'}</label>
          <span className="espacio" />
          {sel.size > 0 ? <>
            <button className="btn fantasma" onClick={() => descartar(ids)} disabled={ocupados.size > 0}><X size={15} /> No sirven</button>
            <button className="btn primario" onClick={() => aprobar(ids)} disabled={ocupados.size > 0}>{ocupados.size ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Sumar {sel.size} a mi lista</button>
          </> : <span className="muted chico">Elegí varias para sumarlas o descartarlas de una</span>}
        </div>
      )}

      {cargando ? <Esqueleto filas={5} /> : lista.length ? (
        <div className="lista-hallazgos">
          {lista.map(h => (
            <TarjetaHallazgo key={h.id} h={h} sel={sel.has(h.id)} ocupado={ocupados.has(h.id)}
              onSel={() => setSel(s => { const n = new Set(s); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n })}
              onAprobar={() => aprobar([h.id])} onDescartar={() => descartar([h.id])} onRecuperar={() => recuperar([h.id])} />
          ))}
        </div>
      ) : (
        <div className="vacio-revisar">
          {tab === 'por_revisar' ? <><Inbox size={30} /><h3>No hay nada por revisar</h3><p className="muted">Cuando busques clientes, lo que encuentre Claude aparece acá para que elijas.</p><Link className="btn ia" to="/buscar"><Sparkles size={16} /> Buscar clientes</Link></>
            : tab === 'aprobado' ? <><ListChecks size={30} /><h3>Todavía no sumaste empresas</h3><p className="muted">Las que sumes quedan en <Link to="/prospectos">Prospectos</Link>, donde les cambiás el estado y las contactás.</p></>
              : <><Undo2 size={30} /><h3>No descartaste ninguna</h3><p className="muted">Las que marques como "No sirve" quedan acá y no vuelven a aparecer en las búsquedas.</p></>}
        </div>
      )}
    </>
  )
}
