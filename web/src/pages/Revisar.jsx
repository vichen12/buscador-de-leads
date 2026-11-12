import { useEffect, useMemo, useState } from 'react'
import { usePaginado, Paginador } from '../components/Paginador.jsx'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Inbox, Check, X, Download, Search, Sparkles, Undo2, Loader2, ListChecks, Ban, SkipForward } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { descargarExcel, filaEmpresa } from '../lib/excel.js'
import { motivoHallazgo, aprobarHallazgos, descartarHallazgos, recuperarHallazgos, saltearHallazgos } from '../lib/hallazgos.js'
import { Esqueleto, useToast } from '../components/ui.jsx'
import TarjetaHallazgo from '../components/TarjetaHallazgo.jsx'
import Desplegable from '../components/Desplegable.jsx'
import { ORIGENES, busquedasLibres, esLibre, delOrigen } from '../lib/origen.js'
import { useApp } from '../App.jsx'

const TABS = [
  ['por_revisar', 'Por revisar', Inbox],
  ['aprobado', 'Sumadas a mi lista', ListChecks],
  ['descartado', 'Rechazadas', Ban],
]

export default function Revisar() {
  const toast = useToast()
  const { refrescar, setPorRevisar } = useApp()
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const tab = params.get('tab') || 'por_revisar'
  const busqueda = params.get('busqueda') || ''
  const motivoF = params.get('motivo') || ''
  const rubroF = params.get('rubro') || ''
  const cuandoF = params.get('cuando') || ''
  const origen = params.get('origen') || '' // '' | negocio | libre
  const [libres, setLibres] = useState(new Set())
  // Los atajos S / N / O recién actúan cuando elegiste una tarjeta (clic o J/K): una tecla suelta no toca nada
  const [armado, setArmado] = useState(false)
  const [todos, setTodos] = useState([])
  const [busquedas, setBusquedas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(new Set())
  const [ocupados, setOcupados] = useState(new Set())
  const [foco, setFoco] = useState(0)
  const set = (k, v) => setParams(() => { const p = new URLSearchParams(window.location.search); v ? p.set(k, v) : p.delete(k); return p }, { replace: true })

  async function cargar() {
    const [{ data, error }, { data: bs }] = await Promise.all([
      supabase.from('hallazgos').select('*').order('puntaje', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(2000),
      supabase.from('busquedas').select('id, rubro, zona, created_at, requisitos').order('created_at', { ascending: false }).limit(50),
    ])
    busquedasLibres().then(setLibres).catch(() => {})
    if (error) toast(mensajeError(error), 'error')
    setTodos(data ?? []); setBusquedas(bs ?? []); setCargando(false)
  }
  useEffect(() => { cargar() }, [])
  useEffect(() => { setSel(new Set()); setArmado(false) }, [tab, busqueda, motivoF, rubroF, cuandoF, origen])
  useEffect(() => { setPorRevisar(todos.filter(h => h.estado === 'por_revisar').length) }, [todos])

  const cuenta = useMemo(() => Object.fromEntries(TABS.map(([k]) => [k, todos.filter(h => h.estado === k && (!busqueda || h.busqueda_id === busqueda) && delOrigen(h, origen, libres)).length])), [todos, busqueda, origen, libres])
  const hayLibres = useMemo(() => todos.some(h => esLibre(h, libres)), [todos, libres])
  const lista = useMemo(() => {
    const t = q.toLowerCase().trim()
    const desde = cuandoF ? Date.now() - Number(cuandoF) * 864e5 : 0
    return todos.filter(h => h.estado === tab && (!busqueda || h.busqueda_id === busqueda) && delOrigen(h, origen, libres) &&
      (tab !== 'descartado' || ((!motivoF || (motivoF === '_sin' ? !h.motivo : h.motivo === motivoF)) && (!rubroF || (h.rubro || 'Sin rubro') === rubroF) && (!desde || new Date(h.revisado_at || h.created_at).getTime() >= desde))) &&
      (!t || [h.nombre, h.rubro, h.zona, h.direccion, h.telefono, h.email, h.motivo].join(' ').toLowerCase().includes(t)))
      .sort((a, b) => tab === 'descartado' ? new Date(b.revisado_at || b.created_at) - new Date(a.revisado_at || a.created_at) : 0)
  }, [todos, tab, busqueda, q, motivoF, rubroF, cuandoF, origen, libres])
  const rechazadas = useMemo(() => todos.filter(h => h.estado === 'descartado' && (!busqueda || h.busqueda_id === busqueda) && delOrigen(h, origen, libres)), [todos, busqueda, origen, libres])
  const porMotivo = useMemo(() => rechazadas.reduce((a, h) => { const k = h.motivo || '_sin'; a[k] = (a[k] ?? 0) + 1; return a }, {}), [rechazadas])
  const rubrosRechazadas = useMemo(() => Object.entries(rechazadas.reduce((a, h) => { const k = h.rubro || 'Sin rubro'; a[k] = (a[k] ?? 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1]), [rechazadas])
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
    // La base anota el prospecto en cada hallazgo: con eso la tarjeta y el aviso llevan a su ficha
    const { data } = await supabase.from('hallazgos').select('id, prospecto_id').in('id', ids)
    await cargar(); refrescar()
    const ficha = ids.length === 1 ? (data ?? [])[0]?.prospecto_id : null
    toast(ids.length === 1 ? 'Sumada a tu lista' : `${r.nuevos} sumadas a tu lista${r.ya_estaban ? ` (${r.ya_estaban} ya estaban)` : ''}`, 'ok',
      { acciones: [ficha && { label: 'Ver ficha', onClick: () => nav(`/prospectos/${ficha}`) }, { label: 'Ver mi lista', onClick: () => nav('/prospectos?orden=reciente') }] })
  })
  const descartar = ids => conOcupado(ids, async () => {
    await descartarHallazgos(ids)
    marcar(ids, { estado: 'descartado' })
    toast(ids.length === 1 ? 'Marcada como "No sirve": no va a volver a aparecer en las búsquedas' : `${ids.length} marcadas como "No sirve"`, 'ok',
      tab === 'descartado' ? {} : { accion: { label: 'Ver rechazadas', onClick: () => nav('/revisar?tab=descartado') } })
  })
  const saltear = ids => conOcupado(ids, async () => {
    // Saltear borra: de a muchas se confirma (y se aclara que son todas las elegidas, no sólo esta página)
    if (ids.length > 5 && !window.confirm(`Vas a sacar ${ids.length} empresas de la bandeja (todas las elegidas, no sólo las de esta página). No se pueden recuperar, aunque pueden volver a aparecer en otra búsqueda. ¿Seguimos?`)) return
    await saltearHallazgos(ids)
    setTodos(l => l.filter(h => !ids.includes(h.id)))
    toast(ids.length === 1 ? 'Salteada: no cuenta como rechazada y puede volver en otra búsqueda' : `${ids.length} salteadas`)
  })
  const recuperar = ids => conOcupado(ids, async () => {
    await recuperarHallazgos(ids)
    marcar(ids, { estado: 'por_revisar', motivo: '' })
    toast('Volvió a "Por revisar"', 'ok', { accion: { label: 'Ver', onClick: () => nav('/revisar') } })
  })

  const todasSel = lista.length > 0 && lista.every(h => sel.has(h.id))
  const ids = [...sel]
  const nombreBusqueda = b => `${b.requisitos?.libre ? 'Libre · ' : ''}${b.rubro.charAt(0).toUpperCase() + b.rubro.slice(1)} · ${b.zona}`

  const pag = usePaginado(lista, 30, [tab, busqueda, q, origen])
  // Atajos de teclado para revisar rápido (sólo en "Por revisar" y si no estás escribiendo)
  useEffect(() => { setFoco(f => Math.min(f, Math.max(0, pag.items.length - 1))) }, [pag.items.length, pag.pagina])
  useEffect(() => {
    if (tab !== 'por_revisar') return
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea|select/i.test(e.target.tagName) || e.target.isContentEditable) return
      const h = pag.items[foco]
      const k = e.key.toLowerCase()
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setArmado(true); setFoco(f => Math.min(pag.items.length - 1, f + 1)) }
      else if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setArmado(true); setFoco(f => Math.max(0, f - 1)) }
      else if (!armado) return
      else if (k === 's' && h && !ocupados.size) { e.preventDefault(); aprobar([h.id]) }
      else if (k === 'n' && h && !ocupados.size) { e.preventDefault(); descartar([h.id]) }
      else if (k === 'o' && h && !ocupados.size) { e.preventDefault(); saltear([h.id]) }
      else if (k === 'x' && h) { e.preventDefault(); setSel(s => { const n = new Set(s); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  useEffect(() => { document.querySelector('[data-foco="1"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [foco])

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Por revisar</h1>
          <p>Lo que encontró la búsqueda. <b>Sumar</b> la pasa a tu lista, <b>No sirve</b> la rechaza (no vuelve a aparecer) y <b>Saltear</b> la saca sin marcarla como buena ni mala.</p>
        </div>
        <div className="acciones">
          <button className="btn" disabled={!lista.length} onClick={() => descargarExcel(`empresas_${tab}_${new Date().toISOString().slice(0, 10)}.xlsx`, lista.map(h => filaEmpresa(h)))}><Download size={16} /> Descargar Excel</button>
          <Link className="btn" to="/prospectos"><ListChecks size={16} /> Ir a mi lista</Link>
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

      {hayLibres && (
        <div className="origen-sel" role="radiogroup" aria-label="De qué búsqueda vienen">
          {ORIGENES.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={origen === k} className={origen === k ? 'on' : ''} onClick={() => set('origen', k)}>{label}</button>)}
        </div>
      )}

      <div className="barra-herramientas">
        <div className="buscador"><Search size={16} /><input placeholder="Buscar por nombre, teléfono, zona…" value={q} onChange={e => setQ(e.target.value)} /></div>
        {busquedasConDatos.length > 0 && (
          <Desplegable compacto ariaLabel="Búsqueda" value={busqueda} onChange={v => set('busqueda', v)} anchoMenu={300}
            opciones={[{ value: '', label: 'Todas las búsquedas' }, ...busquedasConDatos.map(b => ({ value: b.id, label: nombreBusqueda(b), ayuda: new Date(b.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }))]} />
        )}
      </div>

      {tab === 'descartado' && rechazadas.length > 0 && (
        <div className="filtros-rechazadas">
          <div className="fr-motivos">
            <button type="button" className={'fr-chip' + (!motivoF ? ' on' : '')} onClick={() => set('motivo', '')}>Todos los motivos <span>{rechazadas.length}</span></button>
            {Object.entries(porMotivo).sort((a, b) => b[1] - a[1]).map(([m, n]) => (
              <button key={m} type="button" className={'fr-chip' + (motivoF === m ? ' on' : '')} onClick={() => set('motivo', motivoF === m ? '' : m)}>{m === '_sin' ? 'Sin motivo' : m} <span>{n}</span></button>
            ))}
          </div>
          <div className="fr-fila">
            <Desplegable compacto ariaLabel="Rubro" value={rubroF} onChange={v => set('rubro', v)} anchoMenu={280}
              opciones={[{ value: '', label: 'Todos los rubros' }, ...rubrosRechazadas.map(([r, n]) => ({ value: r, label: r, ayuda: String(n) }))]} />
            <Desplegable compacto ariaLabel="Cuándo" value={cuandoF} onChange={v => set('cuando', v)} anchoMenu={200}
              opciones={[{ value: '', label: 'Siempre' }, { value: '1', label: 'Hoy' }, { value: '7', label: 'Últimos 7 días' }, { value: '30', label: 'Últimos 30 días' }]} />
            <span className="espacio" />
            {lista.length > 0 && <label className="sel-todos"><input type="checkbox" checked={todasSel} onChange={() => setSel(todasSel ? new Set() : new Set(lista.map(h => h.id)))} /> {sel.size ? `${sel.size} elegidas` : 'Elegir todas'}</label>}
            {sel.size > 0 && <>
              <button className="btn fantasma chico" onClick={() => saltear(ids)} disabled={ocupados.size > 0} title="Dejan de estar rechazadas y desaparecen"><SkipForward size={14} /> Saltear</button>
              <button className="btn fantasma chico" onClick={() => recuperar(ids)} disabled={ocupados.size > 0}><Undo2 size={14} /> Volver a revisar</button>
              <button className="btn primario chico" onClick={() => aprobar(ids)} disabled={ocupados.size > 0}>{ocupados.size ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Sumar {sel.size} a mi lista</button>
            </>}
          </div>
          <p className="muted chico">Las rechazadas no vuelven a aparecer en ninguna búsqueda. Si cambiaste de idea, decidí acá mismo: sumarla a tu lista, volverla a revisar o saltearla.</p>
        </div>
      )}

      {tab === 'por_revisar' && lista.length > 0 && (
        <div className={'barra-sel revisar' + (sel.size ? ' con-sel' : '')}>
          <label className="sel-todos"><input type="checkbox" checked={todasSel} onChange={() => setSel(todasSel ? new Set() : new Set(lista.map(h => h.id)))} /> {sel.size ? `${sel.size} seleccionadas` : 'Seleccionar todas'}</label>
          <span className="espacio" />
          {sel.size > 0 ? <>
            <button className="btn fantasma" onClick={() => saltear(ids)} disabled={ocupados.size > 0} title="Sacarlas sin marcarlas como buenas ni malas"><SkipForward size={15} /> Saltear</button>
            <button className="btn fantasma" onClick={() => descartar(ids)} disabled={ocupados.size > 0}><X size={15} /> No sirven</button>
            <button className="btn primario" onClick={() => aprobar(ids)} disabled={ocupados.size > 0}>{ocupados.size ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Sumar {sel.size} a mi lista</button>
          </> : <span className="muted chico">Elegí varias para sumarlas o descartarlas de una</span>}
        </div>
      )}

      {tab === 'por_revisar' && lista.length > 0 && <p className="atajos-teclado muted chico">Atajos (primero elegí una tarjeta): <kbd>J</kbd>/<kbd>K</kbd> moverse · <kbd>S</kbd> sirve · <kbd>N</kbd> no sirve · <kbd>O</kbd> saltear · <kbd>X</kbd> seleccionar</p>}
      {cargando ? <Esqueleto filas={5} /> : lista.length ? (
        <div className="lista-hallazgos">
          {pag.items.map((h, i) => (
            <div key={h.id} data-foco={tab === 'por_revisar' && armado && i === foco ? '1' : undefined} className="hallazgo-envoltura" onMouseDown={() => { setFoco(i); setArmado(true) }}>
            <TarjetaHallazgo key={h.id} h={esLibre(h, libres) ? { ...h, libre: true } : h} sel={sel.has(h.id)} ocupado={ocupados.has(h.id)}
              onSel={tab === 'descartado' || tab === 'por_revisar' ? () => setSel(s => { const n = new Set(s); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n }) : undefined}
              onAprobar={() => aprobar([h.id])} onDescartar={() => descartar([h.id])} onSaltear={() => saltear([h.id])} onMotivo={m => motivoHallazgo(h.id, m).then(() => marcar([h.id], { motivo: m })).catch(e => toast(mensajeError(e), 'error'))} onRecuperar={() => recuperar([h.id])} />
            </div>
          ))}
          <Paginador {...pag} />
        </div>
      ) : (
        <div className="vacio-revisar">
          {tab === 'por_revisar' ? <><Inbox size={30} /><h3>No hay nada por revisar</h3><p className="muted">Cuando busques clientes, lo que encuentre Claude aparece acá para que elijas.</p><Link className="btn ia" to="/buscar"><Sparkles size={16} /> Buscar clientes</Link></>
            : tab === 'aprobado' ? <><ListChecks size={30} /><h3>Todavía no sumaste empresas</h3><p className="muted">Las que sumes quedan en <Link to="/prospectos">Prospectos</Link>, donde les cambiás el estado y las contactás.</p><Link className="btn" to={cuenta.por_revisar ? '/revisar' : '/buscar'}>{cuenta.por_revisar ? <><Inbox size={16} /> Revisar las {cuenta.por_revisar} encontradas</> : <><Sparkles size={16} /> Buscar clientes</>}</Link></>
              : <><Undo2 size={30} /><h3>No descartaste ninguna</h3><p className="muted">Las que marques como "No sirve" quedan acá y no vuelven a aparecer en las búsquedas.</p><Link className="btn" to="/revisar"><Inbox size={16} /> Ir a Por revisar</Link></>}
        </div>
      )}
    </>
  )
}
