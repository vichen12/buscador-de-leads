import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Workflow, Plus, Trash2, Loader2, Save, Mail, Phone, MessageCircle, Network, Copy, Pause, Play, X, ChevronDown, Sparkles, FileText } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fecha, mensajeError } from '../lib/util.js'
import { Cargando, ErrorCarga, Vacio, Modal, useToast, useConfirmar, EstadoBadge } from '../components/ui.jsx'

export const TIPOS_PASO = {
  email: ['Email', Mail, 'Sale solo desde tu casilla, en el mismo hilo'],
  llamada: ['Llamar', Phone, 'Te queda una tarea con un guion corto'],
  whatsapp: ['WhatsApp', MessageCircle, 'Te queda una tarea con el mensaje listo: lo mandás vos'],
  linkedin_visita: ['Ver perfil de LinkedIn', Network, 'Tarea: mirar el perfil antes de escribir'],
  linkedin_conexion: ['Conectar en LinkedIn', Network, 'Tarea con la nota de conexión (máx. 280 caracteres)'],
  linkedin_mensaje: ['Mensaje en LinkedIn', Network, 'Tarea con el mensaje listo para copiar'],
}
const PASO_NUEVO = { dia: 3, tipo: 'email', como: 'claude', indicacion: 'Seguimiento corto con otro ángulo de valor.' }

/** Secuencias automáticas: pasos con días, que se frenan solas si la empresa responde, rebota o pide la baja */
export default function Secuencias() {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [lista, setLista] = useState(null)
  const [conteos, setConteos] = useState({})
  const [error, setError] = useState('')
  const [editando, setEditando] = useState(null)
  const [verInscriptas, setVerInscriptas] = useState(null)

  const cargar = useCallback(async () => {
    setError('')
    await supabase.rpc('secuencia_por_defecto')
    const [{ data, error }, { data: ins }] = await Promise.all([
      supabase.from('secuencias').select('*').order('por_defecto', { ascending: false }).order('created_at'),
      supabase.from('inscripciones').select('secuencia_id, estado'),
    ])
    if (error) { setError(mensajeError(error)); setLista([]); return }
    const c = {}
    for (const i of ins ?? []) { c[i.secuencia_id] ??= { activa: 0, terminada: 0, frenada: 0, pausada: 0 }; c[i.secuencia_id][i.estado]++ }
    setConteos(c); setLista(data ?? [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function borrar(s) {
    if (!(await confirmar({ titulo: `¿Borrar "${s.nombre}"?`, texto: 'Las empresas que estén en esta secuencia dejan de recibir sus pasos.', aceptar: 'Borrar', peligro: true }))) return
    const { error } = await supabase.from('secuencias').delete().eq('id', s.id)
    if (error) toast(mensajeError(error), 'error'); else { toast('Secuencia borrada'); cargar() }
  }

  if (lista === null) return <Cargando />
  return (
    <>
      <header className="cabecera">
        <div><h1>Secuencias</h1><p>El seguimiento que se hace solo: mail inicial, seguimientos en el mismo hilo y tareas de llamar o WhatsApp. Se frena sola si la empresa responde, rebota o pide la baja.</p></div>
        <div className="acciones"><button className="btn primario" onClick={() => setEditando({ nombre: 'Nueva secuencia', descripcion: '', pasos: [{ dia: 0, tipo: 'email', como: 'claude', indicacion: 'Mail inicial.' }, { ...PASO_NUEVO }] })}><Plus size={15} /> Nueva secuencia</button></div>
      </header>
      {error && <ErrorCarga error={error} onReintentar={cargar} />}
      {!lista.length ? <section className="tarjeta"><Vacio icono={Workflow} titulo="Todavía no tenés secuencias">Creá una o usá la recomendada.</Vacio></section> : (
        <div className="grilla-secuencias">
          {lista.map(s => {
            const c = conteos[s.id] ?? {}
            return (
              <section key={s.id} className="tarjeta secuencia">
                <div className="tarjeta-titulo"><h3><Workflow size={16} /> {s.nombre}</h3>{s.por_defecto && <span className="chip">Recomendada</span>}</div>
                {s.descripcion && <p className="muted chico" style={{ marginTop: 0 }}>{s.descripcion}</p>}
                <ol className="pasos-linea">
                  {(s.pasos ?? []).map((p, i) => {
                    const [label, Icono] = TIPOS_PASO[p.tipo] ?? TIPOS_PASO.email
                    return <li key={i}><span className="paso-dia">Día {p.dia}</span><Icono size={14} /> {label}{p.como === 'plantilla' ? <span className="muted chico"> · plantilla</span> : <span className="muted chico"> · escribe Claude</span>}</li>
                  })}
                </ol>
                <div className="secuencia-pie">
                  <button type="button" className="link chico" onClick={() => setVerInscriptas(s)}>{c.activa ?? 0} en curso · {c.terminada ?? 0} terminadas · {c.frenada ?? 0} frenadas</button>
                  <span className="espacio" />
                  <button className="btn chico" onClick={() => setEditando(s)}>Editar</button>
                  <button className="btn chico fantasma" onClick={() => setEditando({ ...s, id: undefined, por_defecto: false, nombre: `${s.nombre} (copia)` })} aria-label="Duplicar"><Copy size={14} /></button>
                  {!s.por_defecto && <button className="btn chico fantasma" onClick={() => borrar(s)} aria-label="Borrar"><Trash2 size={14} /></button>}
                </div>
              </section>
            )
          })}
        </div>
      )}
      <p className="muted chico">Para sumar empresas a una secuencia: elegilas en <Link to="/prospectos">Para contactar</Link> y tocá <b>Secuencia</b>, o desde la ficha de cada una. Los pasos salen de lunes a sábado de 8 a 20.</p>
      {editando && <EditorSecuencia s={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />}
      {verInscriptas && <Inscriptas s={verInscriptas} onCerrar={() => { setVerInscriptas(null); cargar() }} />}
    </>
  )
}

function EditorSecuencia({ s, onCerrar, onGuardado }) {
  const toast = useToast()
  const [f, setF] = useState({ nombre: s.nombre, descripcion: s.descripcion ?? '', pasos: (s.pasos ?? []).map(p => ({ ...p })) })
  const [guardando, setGuardando] = useState(false)
  const setPaso = (i, cambio) => setF(x => ({ ...x, pasos: x.pasos.map((p, j) => j === i ? { ...p, ...cambio } : p) }))
  const ordenados = [...f.pasos].sort((a, b) => a.dia - b.dia)
  async function guardar() {
    if (!f.nombre.trim() || !f.pasos.length) { toast('Poné un nombre y al menos un paso', 'error'); return }
    setGuardando(true)
    const fila = { nombre: f.nombre.trim(), descripcion: f.descripcion, pasos: ordenados.map(p => ({ ...p, dia: Math.max(0, Number(p.dia) || 0) })) }
    const { error } = s.id ? await supabase.from('secuencias').update(fila).eq('id', s.id) : await supabase.from('secuencias').insert(fila)
    setGuardando(false)
    if (error) toast(mensajeError(error), 'error'); else { toast('Secuencia guardada'); onGuardado() }
  }
  return (
    <Modal onCerrar={onCerrar} ancho={720}>
      <h2 style={{ marginTop: 0 }}>{s.id ? 'Editar secuencia' : 'Nueva secuencia'}</h2>
      <label>Nombre<input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></label>
      <label>Para qué sirve <span className="muted">(opcional)</span><input value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} placeholder="Ej.: para distribuidoras grandes" /></label>
      <div className="pasos-editor">
        {f.pasos.map((p, i) => (
          <div key={i} className="paso-editor">
            <div className="paso-fila">
              <label className="paso-dia-input">Día<input type="number" min={0} max={120} value={p.dia} onChange={e => setPaso(i, { dia: e.target.value })} /></label>
              <label style={{ flex: 1 }}>Qué hacer
                <select value={p.tipo} onChange={e => setPaso(i, { tipo: e.target.value })}>{Object.entries(TIPOS_PASO).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
              </label>
              <div className="segmentado-chico" style={{ alignSelf: 'flex-end', marginBottom: 14 }}>
                <button type="button" className={p.como !== 'plantilla' ? 'on' : ''} onClick={() => setPaso(i, { como: 'claude' })}><Sparkles size={12} /> Claude</button>
                <button type="button" className={p.como === 'plantilla' ? 'on' : ''} onClick={() => setPaso(i, { como: 'plantilla' })}><FileText size={12} /> Plantilla</button>
              </div>
              <button type="button" className="btn chico fantasma" style={{ alignSelf: 'flex-end', marginBottom: 14 }} onClick={() => setF(x => ({ ...x, pasos: x.pasos.filter((_, j) => j !== i) }))} aria-label="Quitar paso"><X size={14} /></button>
            </div>
            <small className="muted">{TIPOS_PASO[p.tipo]?.[2]}</small>
            {p.como === 'plantilla' ? (
              <>
                {p.tipo === 'email' && <input placeholder="Asunto (en los seguimientos va Re: del primero)" value={p.asunto ?? ''} onChange={e => setPaso(i, { asunto: e.target.value })} />}
                <textarea rows={4} placeholder="Hola {{nombre}}, ... Variables: {{nombre}} {{empresa}} {{rubro}} {{zona}} {{mi_nombre}} {{mi_empresa}} {{link_agenda}}" value={p.cuerpo ?? ''} onChange={e => setPaso(i, { cuerpo: e.target.value })} />
              </>
            ) : <input placeholder="Qué tiene que decir este paso (Claude lo escribe para cada empresa)" value={p.indicacion ?? ''} onChange={e => setPaso(i, { indicacion: e.target.value })} />}
          </div>
        ))}
        <button type="button" className="btn" onClick={() => setF(x => ({ ...x, pasos: [...x.pasos, { ...PASO_NUEVO, dia: (Math.max(0, ...x.pasos.map(p => Number(p.dia) || 0)) + 4) }] }))}><Plus size={14} /> Agregar paso</button>
      </div>
      <div className="acciones" style={{ marginTop: 16 }}>
        <button className="btn" onClick={onCerrar}>Cancelar</button>
        <button className="btn primario" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Guardar</button>
      </div>
    </Modal>
  )
}

const ESTADO_INS = { activa: 'En curso', pausada: 'Pausada', terminada: 'Terminada', frenada: 'Frenada' }
function Inscriptas({ s, onCerrar }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const cargar = useCallback(() => supabase.from('inscripciones').select('*, prospectos(id, nombre, estado)').eq('secuencia_id', s.id).order('updated_at', { ascending: false }).limit(300).then(({ data }) => setLista(data ?? [])), [s.id])
  useEffect(() => { cargar() }, [cargar])
  async function cambiar(i, estado) {
    const { error } = await supabase.from('inscripciones').update({ estado, motivo: estado === 'frenada' ? 'La frenaste vos' : estado === 'pausada' ? 'La pausaste vos' : '' }).eq('id', i.id)
    if (error) toast(mensajeError(error), 'error'); else cargar()
  }
  return (
    <Modal onCerrar={onCerrar} ancho={680}>
      <h2 style={{ marginTop: 0 }}>{s.nombre}</h2>
      {lista === null ? <Cargando /> : !lista.length ? <Vacio icono={Workflow} titulo="Nadie en esta secuencia todavía">Elegí empresas en "Para contactar" y tocá "Secuencia".</Vacio> : (
        <ul className="lista-inscriptas">
          {lista.map(i => (
            <li key={i.id}>
              <div><Link to={`/prospectos/${i.prospectos?.id}`}><b>{i.prospectos?.nombre}</b></Link> <EstadoBadge estado={i.prospectos?.estado} />
                <span className="muted chico">{ESTADO_INS[i.estado]}{i.estado === 'activa' ? ` · paso ${i.paso + 1} de ${s.pasos.length}, el ${fecha(i.proximo_at)}` : i.motivo ? ` · ${i.motivo}` : ''}</span></div>
              {i.estado === 'activa' && <><button className="btn chico fantasma" onClick={() => cambiar(i, 'pausada')}><Pause size={13} /> Pausar</button><button className="btn chico fantasma" onClick={() => cambiar(i, 'frenada')}><X size={13} /> Frenar</button></>}
              {i.estado === 'pausada' && <button className="btn chico" onClick={() => cambiar(i, 'activa')}><Play size={13} /> Seguir</button>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}

/** Modal para sumar una o varias empresas a una secuencia */
export function InscribirEnSecuencia({ ids, onCerrar, onListo }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [elegida, setElegida] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  useEffect(() => {
    supabase.rpc('secuencia_por_defecto').then(async ({ data: def }) => {
      const { data } = await supabase.from('secuencias').select('*').eq('activa', true).order('por_defecto', { ascending: false })
      setLista(data ?? []); setElegida(def || data?.[0]?.id || '')
    })
  }, [])
  async function inscribir() {
    setTrabajando(true)
    const { data, error } = await supabase.rpc('inscribir_en_secuencia', { p_secuencia: elegida, p_prospectos: ids })
    setTrabajando(false)
    if (error) { toast(mensajeError(error), 'error'); return }
    toast(`${data.inscriptas} ${data.inscriptas === 1 ? 'empresa sumada' : 'empresas sumadas'} a la secuencia${data.saltadas ? ` (${data.saltadas} ya estaban en una o no se pueden contactar)` : ''}. El primer paso sale en los próximos minutos.`)
    onListo?.(); onCerrar()
  }
  const sec = lista?.find(s => s.id === elegida)
  return (
    <Modal onCerrar={onCerrar} ancho={560}>
      <h2 style={{ marginTop: 0 }}><Workflow size={19} /> Sumar {ids.length === 1 ? 'a una secuencia' : `${ids.length} empresas a una secuencia`}</h2>
      {lista === null ? <Cargando /> : (
        <>
          <div className="opciones-secuencia">
            {lista.map(s => (
              <button key={s.id} type="button" className={'opcion-secuencia' + (elegida === s.id ? ' on' : '')} onClick={() => setElegida(s.id)}>
                <b>{s.nombre}</b><small className="muted">{(s.pasos ?? []).map(p => `Día ${p.dia}: ${TIPOS_PASO[p.tipo]?.[0] ?? p.tipo}`).join(' · ')}</small>
              </button>
            ))}
          </div>
          {sec && <p className="muted chico">Se frena sola si responde, rebota, pide la baja o pasa a Cliente / No interesado. Los mails salen de lunes a sábado de 8 a 20, respetando el límite de tu casilla.</p>}
          <div className="acciones"><Link className="btn fantasma" to="/secuencias">Editar secuencias</Link><span className="espacio" /><button className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" onClick={inscribir} disabled={!elegida || trabajando}>{trabajando ? <Loader2 size={15} className="spin" /> : <Play size={15} />} Empezar</button></div>
        </>
      )}
    </Modal>
  )
}
