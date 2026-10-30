import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarClock, ChevronRight, PartyPopper, ListTodo, Plus, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fecha, fechaHora, hoyLocal, mensajeError } from '../lib/util.js'
import { Avatar, Cargando, ErrorCarga, Vacio, useToast } from '../components/ui.jsx'
import { TareaItem } from '../components/Tareas.jsx'
import { useApp } from '../App.jsx'

/** Lo que hay que hacer hoy: tareas (llamar, WhatsApp, LinkedIn, las que dejan las secuencias) y seguimientos vencidos */
export default function Seguimientos() {
  const toast = useToast()
  const { session } = useApp()
  const yo = session.user.id
  const [params, setParams] = useSearchParams()
  const ver = params.get('ver') || 'hoy' // hoy | proximas | hechas
  const [tareas, setTareas] = useState(null)
  const [lista, setLista] = useState(null)
  const [proximos, setProximos] = useState([])
  const [error, setError] = useState('')
  const [nueva, setNueva] = useState('')
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    setError('')
    const hoy = hoyLocal()
    let q = supabase.from('tareas').select('*, prospectos(id, nombre, rubro, telefono, linkedin)').order('vence').limit(200)
    q = ver === 'hechas' ? q.not('hecha_at', 'is', null).order('hecha_at', { ascending: false }) : ver === 'proximas' ? q.is('hecha_at', null).gt('vence', hoy) : q.is('hecha_at', null).lte('vence', hoy)
    const [t, s, pr] = await Promise.all([
      q,
      supabase.from('prospectos').select('id, nombre, rubro, telefono, ultimo_contacto, proximo_seguimiento').eq('owner_id', yo).eq('estado', 'contactado').lte('proximo_seguimiento', hoy).order('proximo_seguimiento'),
      supabase.from('prospectos').select('id, nombre, rubro, proximo_seguimiento').eq('owner_id', yo).eq('estado', 'contactado').gt('proximo_seguimiento', hoy).order('proximo_seguimiento').limit(30),
    ])
    if (t.error || s.error) { setError(mensajeError(t.error || s.error)); setTareas([]); setLista([]); return }
    setTareas(t.data ?? []); setLista(s.data ?? []); setProximos(pr.data ?? [])
  }, [ver, yo])
  useEffect(() => { cargar() }, [cargar])

  async function crear(e) {
    e.preventDefault()
    if (!nueva.trim()) return
    setCreando(true)
    const { error } = await supabase.from('tareas').insert({ titulo: nueva.trim(), tipo: 'otra', vence: hoyLocal() })
    setCreando(false)
    if (error) toast(mensajeError(error), 'error'); else { setNueva(''); cargar() }
  }

  if (!tareas || !lista) return <Cargando />
  return (
    <>
      <header className="cabecera">
        <div><h1>Seguimientos</h1><p>Lo que tenés que hacer hoy: tareas de las secuencias (llamar, WhatsApp, LinkedIn), las que creaste vos y los seguimientos vencidos.</p></div>
      </header>
      {error && <ErrorCarga error={error} onReintentar={cargar} />}

      <section className="tarjeta">
        <div className="tarjeta-titulo">
          <h3><ListTodo size={16} /> Tareas</h3>
          <div className="segmentado-chico" role="tablist">
            {[['hoy', 'Para hoy'], ['proximas', 'Próximas'], ['hechas', 'Hechas']].map(([k, l]) => <button key={k} role="tab" aria-selected={ver === k} className={ver === k ? 'on' : ''} onClick={() => setParams(k === 'hoy' ? {} : { ver: k })}>{l}</button>)}
          </div>
        </div>
        <form className="fila-agregar" onSubmit={crear} style={{ marginBottom: 6 }}>
          <input value={nueva} onChange={e => setNueva(e.target.value)} placeholder="Nueva tarea para hoy (ej.: mandar la lista de precios a Logística Sur)" aria-label="Nueva tarea" />
          <button className="btn" disabled={!nueva.trim() || creando}>{creando ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Agregar</button>
        </form>
        {tareas.length === 0
          ? <Vacio icono={PartyPopper} titulo={ver === 'hoy' ? 'No tenés tareas para hoy' : ver === 'proximas' ? 'No hay tareas programadas' : 'Todavía no completaste tareas'}>Las secuencias crean tareas solas (llamar, mandar WhatsApp, LinkedIn). También podés crearlas desde la ficha de cada empresa.</Vacio>
          : tareas.map(t => <TareaItem key={t.id} t={t} onCambio={cargar} />)}
      </section>

      <section className="tarjeta">
        <div className="tarjeta-titulo"><h3><CalendarClock size={16} /> Seguimientos vencidos</h3><span className="chip">{lista.length}</span></div>
        {lista.length === 0 ? (
          <Vacio icono={PartyPopper} titulo="Estás al día">No hay empresas contactadas esperando un seguimiento.</Vacio>
        ) : (
          <div className="accion-lista">
            {lista.map(p => (
              <Link key={p.id} to={`/prospectos/${p.id}?tab=seguimiento`} className="accion-item">
                <Avatar nombre={p.nombre} />
                <div><b className="fuerte">{p.nombre}</b><div className="muted chico">{p.rubro} · último contacto {fechaHora(p.ultimo_contacto)}</div></div>
                <span className="espacio" /><span className="btn chico">Preparar seguimiento</span><ChevronRight size={16} />
              </Link>
            ))}
          </div>
        )}
      </section>
      {proximos.length > 0 && (
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3>Próximos seguimientos</h3><span className="chip">{proximos.length}</span></div>
          <div className="accion-lista">
            {proximos.map(p => (
              <Link key={p.id} to={`/prospectos/${p.id}`} className="accion-item">
                <Avatar nombre={p.nombre} />
                <div><b className="fuerte">{p.nombre}</b><div className="muted chico">{p.rubro}</div></div>
                <span className="espacio" /><span className="chip"><CalendarClock size={12} /> {fecha(p.proximo_seguimiento)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
