import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ListTodo, Plus, Loader2, Users, Star, Trash2, Workflow, Pause, Play, X, MessageSquareReply, Network, Mail, Phone, Save } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fecha, mensajeError, hoyLocal } from '../lib/util.js'
import { useToast, useConfirmar, Vacio, Cargando } from './ui.jsx'
import { TareaItem, TIPO_TAREA } from './Tareas.jsx'
import { ItemRespuesta } from '../pages/Respuestas.jsx'
import { InscribirEnSecuencia, TIPOS_PASO } from '../pages/Secuencias.jsx'

/** Respuestas de esta empresa, completas, con el botón Responder */
export function RespuestasDeEmpresa({ p }) {
  const [lista, setLista] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const cargar = useCallback(() => supabase.from('respuestas').select('*, prospectos(id, nombre, rubro, estado, email)').eq('prospecto_id', p.id).order('recibida_at', { ascending: false }).then(({ data }) => { setLista(data ?? []); setAbierta(a => a ?? data?.[0]?.id ?? null) }), [p.id])
  useEffect(() => { cargar() }, [cargar])
  if (!lista?.length) return null
  return (
    <section className="tarjeta lista-respuestas" style={{ paddingTop: 14 }}>
      <div className="tarjeta-titulo" style={{ padding: '0 18px' }}><h3><MessageSquareReply size={16} /> Lo que respondió</h3><span className="chip">{lista.length}</span></div>
      {lista.map(r => <ItemRespuesta key={r.id} r={r} abierta={abierta === r.id} onAbrir={() => { setAbierta(abierta === r.id ? null : r.id); if (!r.leida) supabase.from('respuestas').update({ leida: true }).eq('id', r.id) }} onCambio={cargar} />)}
    </section>
  )
}

/** Tareas de esta empresa ("Volver a llamar en marzo") */
export function TareasDeEmpresa({ p }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [nueva, setNueva] = useState({ titulo: '', vence: hoyLocal(), tipo: 'llamar' })
  const [creando, setCreando] = useState(false)
  const cargar = useCallback(() => supabase.from('tareas').select('*, prospectos(id, nombre, rubro, telefono, linkedin)').eq('prospecto_id', p.id).order('hecha_at', { nullsFirst: true }).order('vence').limit(30).then(({ data }) => setLista(data ?? [])), [p.id])
  useEffect(() => { cargar() }, [cargar])
  async function crear(e) {
    e.preventDefault()
    if (!nueva.titulo.trim()) return
    setCreando(true)
    const { error } = await supabase.from('tareas').insert({ prospecto_id: p.id, titulo: nueva.titulo.trim(), vence: nueva.vence || hoyLocal(), tipo: nueva.tipo })
    setCreando(false)
    if (error) toast(mensajeError(error), 'error'); else { setNueva({ titulo: '', vence: hoyLocal(), tipo: 'llamar' }); toast(`Tarea para el ${fecha(nueva.vence)}`); cargar() }
  }
  return (
    <section className="tarjeta">
      <div className="tarjeta-titulo"><h3><ListTodo size={16} /> Tareas</h3></div>
      <form className="tarea-nueva" onSubmit={crear}>
        <select value={nueva.tipo} onChange={e => setNueva({ ...nueva, tipo: e.target.value })} aria-label="Tipo de tarea">{['llamar', 'whatsapp', 'email', 'reunion', 'otra'].map(k => <option key={k} value={k}>{TIPO_TAREA[k][0]}</option>)}</select>
        <input value={nueva.titulo} onChange={e => setNueva({ ...nueva, titulo: e.target.value })} placeholder="Ej.: volver a llamar en marzo" aria-label="Tarea" />
        <input type="date" value={nueva.vence} onChange={e => setNueva({ ...nueva, vence: e.target.value })} aria-label="Para cuándo" />
        <button className="btn" disabled={!nueva.titulo.trim() || creando}>{creando ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}</button>
      </form>
      {lista === null ? <Cargando /> : !lista.length ? <p className="muted chico">Sin tareas. Las secuencias suman las suyas solas.</p> : lista.map(t => <TareaItem key={t.id} t={t} onCambio={cargar} conEmpresa={false} />)}
    </section>
  )
}

/** Personas de la empresa (decisores), con el principal marcado */
export function ContactosDeEmpresa({ p }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [lista, setLista] = useState(null)
  const [form, setForm] = useState(null)
  const cargar = useCallback(() => supabase.from('contactos').select('*').eq('prospecto_id', p.id).order('principal', { ascending: false }).order('created_at').then(({ data }) => setLista(data ?? [])), [p.id])
  useEffect(() => { cargar() }, [cargar])
  async function guardar(e) {
    e.preventDefault()
    const fila = { ...form, prospecto_id: p.id, fuente: form.fuente || 'Cargado a mano' }
    const { error } = form.id ? await supabase.from('contactos').update(fila).eq('id', form.id) : await supabase.from('contactos').insert(fila)
    if (error) toast(mensajeError(error), 'error'); else { setForm(null); cargar(); toast('Contacto guardado') }
  }
  async function principal(c) { const { error } = await supabase.from('contactos').update({ principal: true }).eq('id', c.id); if (error) toast(mensajeError(error), 'error'); else cargar() }
  async function borrar(c) {
    if (!(await confirmar({ titulo: `¿Borrar a ${c.nombre || c.email}?`, aceptar: 'Borrar', peligro: true }))) return
    await supabase.from('contactos').delete().eq('id', c.id); cargar()
  }
  return (
    <section className="tarjeta">
      <div className="tarjeta-titulo"><h3><Users size={16} /> Contactos</h3><button className="btn chico" onClick={() => setForm({ nombre: '', cargo: '', email: '', telefono: '', linkedin: '' })}><Plus size={14} /> Agregar</button></div>
      {lista === null ? <Cargando /> : !lista.length && !form ? (
        <div className="aviso-sin-contacto"><b>Sin contacto con nombre.</b> Los mails a info@ suelen tener menos respuesta: si sabés quién decide (dueño, compras, gerente), cargalo y los borradores le van a hablar a esa persona.</div>
      ) : (
        <ul className="lista-contactos">
          {lista.map(c => (
            <li key={c.id}>
              <div>
                <b>{c.nombre || 'Sin nombre'}</b>{c.principal && <span className="chip"><Star size={11} /> Principal</span>}{c.cargo && <span className="muted chico"> · {c.cargo}</span>}
                <div className="contacto-datos chico">
                  {c.email && <a href={`mailto:${c.email}`}><Mail size={12} /> {c.email}</a>}
                  {c.telefono && <a href={`tel:${c.telefono}`}><Phone size={12} /> {c.telefono}</a>}
                  {c.linkedin && <a href={c.linkedin} target="_blank" rel="noreferrer"><Network size={12} /> LinkedIn</a>}
                </div>
                {c.fuente && <span className="muted chico">Fuente: {/^https?:/.test(c.fuente) ? <a href={c.fuente} target="_blank" rel="noreferrer">{new URL(c.fuente).hostname}</a> : c.fuente}</span>}
              </div>
              {!c.principal && <button className="btn chico fantasma" onClick={() => principal(c)} title="Marcar como principal"><Star size={13} /></button>}
              <button className="btn chico fantasma" onClick={() => setForm(c)}>Editar</button>
              <button className="btn chico fantasma" onClick={() => borrar(c)} aria-label="Borrar"><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      {form && (
        <form onSubmit={guardar} className="form-contacto">
          <div className="form-grid">
            <label>Nombre<input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required autoFocus /></label>
            <label>Cargo<input value={form.cargo} onChange={e => setForm({ ...form, cargo: e.target.value })} placeholder="Ej.: Gerente de compras" /></label>
            <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
            <label>Teléfono<input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></label>
            <label>LinkedIn<input value={form.linkedin} onChange={e => setForm({ ...form, linkedin: e.target.value })} placeholder="https://www.linkedin.com/in/..." /></label>
          </div>
          <div className="acciones"><button type="button" className="btn" onClick={() => setForm(null)}>Cancelar</button><button className="btn primario"><Save size={15} /> Guardar</button></div>
        </form>
      )}
    </section>
  )
}

/** En qué secuencia está la empresa, con pausar / frenar / sumar */
export function SecuenciaDeEmpresa({ p, onCambio }) {
  const toast = useToast()
  const [ins, setIns] = useState(undefined)
  const [abrir, setAbrir] = useState(false)
  const cargar = useCallback(() => supabase.from('inscripciones').select('*, secuencias(nombre, pasos)').eq('prospecto_id', p.id).order('created_at', { ascending: false }).limit(1).then(({ data }) => setIns(data?.[0] ?? null)), [p.id])
  useEffect(() => { cargar() }, [cargar])
  async function cambiar(estado) {
    const { error } = await supabase.from('inscripciones').update({ estado, motivo: estado === 'frenada' ? 'La frenaste vos' : '' }).eq('id', ins.id)
    if (error) toast(mensajeError(error), 'error'); else { cargar(); onCambio?.() }
  }
  if (ins === undefined) return null
  const activa = ins && ['activa', 'pausada'].includes(ins.estado)
  const pasos = ins?.secuencias?.pasos ?? []
  const prox = pasos[ins?.paso]
  return (
    <div className="secuencia-ficha">
      <Workflow size={16} />
      {activa ? (
        <>
          <span><b>{ins.secuencias?.nombre}</b> · {ins.estado === 'pausada' ? 'pausada' : prox ? `próximo: ${TIPOS_PASO[prox.tipo]?.[0] ?? prox.tipo} el ${fecha(ins.proximo_at)}` : 'terminando'}</span>
          <span className="espacio" />
          {ins.estado === 'activa' ? <button className="btn chico fantasma" onClick={() => cambiar('pausada')}><Pause size={13} /> Pausar</button> : <button className="btn chico" onClick={() => cambiar('activa')}><Play size={13} /> Seguir</button>}
          <button className="btn chico fantasma" onClick={() => cambiar('frenada')}><X size={13} /> Frenar</button>
        </>
      ) : (
        <>
          <span className="muted">{ins ? `La secuencia ${ins.estado === 'terminada' ? 'terminó' : 'se frenó'}${ins.motivo ? `: ${ins.motivo}` : ''}.` : 'No está en ninguna secuencia.'}</span>
          <span className="espacio" />
          {!['no_interesado', 'no_contactar', 'cliente', 'perdido'].includes(p.estado) && <button className="btn chico" onClick={() => setAbrir(true)}><Workflow size={13} /> Sumar a una secuencia</button>}
        </>
      )}
      {abrir && <InscribirEnSecuencia ids={[p.id]} onCerrar={() => setAbrir(false)} onListo={() => { cargar(); onCambio?.() }} />}
    </div>
  )
}
