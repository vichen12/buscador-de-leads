import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, Phone, Mail, AtSign, Globe, MapPin, Star, Clock, CalendarClock, MessageCircle, Send, Sparkles, Wand2, Loader2,
  Copy, Reply, Trophy, Ban, Trash2, Pencil, StickyNote, RefreshCw, CheckCircle2, ExternalLink, Save, CalendarPlus, Link2, Target, Paperclip,
} from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { ESTADOS, fechaHora, fecha, handleIG, mensajeError } from '../lib/util.js'
import { linkWhatsApp, linkEmail, linkGmail, numeroWhatsApp } from '@shared/clasificar.js'
import { Avatar, Cargando, SelectorEstado, EstadoBadge, Modal, QueTieneChip, Aviso, useConfirmar, useToast } from '../components/ui.jsx'
import Desplegable from '../components/Desplegable.jsx'
import Enlaces from '../components/Enlaces.jsx'
import { useArchivos } from '../lib/archivos.js'
import { AdjuntarEnEmail } from '../components/ArchivosCorreo.jsx'
import { useApp } from '../App.jsx'

const TABS = [['whatsapp', 'WhatsApp', MessageCircle], ['email', 'Email', Mail], ['seguimiento', 'Seguimiento', CalendarClock]]
const TIPO_INT = {
  enviado: ['Mensaje enviado', Send, '#1d4ed8', '#e8efff'], respuesta: ['Respondió', Reply, '#b45309', '#fdf3e2'],
  nota: ['Nota', StickyNote, '#52525b', '#f0ece5'], cambio_estado: ['Cambio de estado', RefreshCw, '#7c3aed', '#f1ebff'],
  llamada: ['Llamada', Phone, '#15803d', '#e8f6ec'],
}
const RAPIDOS = ['Más corto', 'Más cálido', 'Más profesional', 'Mencioná su Instagram', 'Otro enfoque', 'Sin signos de exclamación']

export default function Prospecto() {
  const { id } = useParams()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const toast = useToast()
  const confirmar = useConfirmar()
  const { perfil, enviadosHoy, refrescar, servicios, correo, session } = useApp()
  const arch = useArchivos(session?.user?.id)
  const [adj, setAdj] = useState(null) // ids de archivos a adjuntar; null = lo que eligió Claude
  const [mandando, setMandando] = useState(false)
  const [agenda, setAgenda] = useState(null)
  const [p, setP] = useState(null)
  const [msgs, setMsgs] = useState({})
  const [borrador, setBorrador] = useState({})
  const [hist, setHist] = useState([])
  const [tab, setTab] = useState(params.get('tab') || 'whatsapp')
  const [generando, setGenerando] = useState(false)
  const [reescribiendo, setReescribiendo] = useState(false)
  const [instruccion, setInstruccion] = useState('')
  const [confirmarEnvio, setConfirmarEnvio] = useState(null)
  const [editando, setEditando] = useState(false)
  const [nota, setNota] = useState('')
  const [aviso, setAviso] = useState('')

  async function cargar() {
    const [{ data: pr }, { data: ms }, { data: hs }] = await Promise.all([
      supabase.from('prospectos').select('*').eq('id', id).single(),
      supabase.from('mensajes').select('*').eq('prospecto_id', id),
      supabase.from('interacciones').select('*').eq('prospecto_id', id).order('created_at', { ascending: false }),
    ])
    setP(pr)
    const porTipo = Object.fromEntries((ms ?? []).map(m => [m.tipo, m]))
    setMsgs(porTipo)
    setAdj(null)
    setBorrador(Object.fromEntries(TABS.map(([t]) => [t, { asunto: porTipo[t]?.asunto ?? '', cuerpo: porTipo[t]?.cuerpo ?? '' }])))
    setHist(hs ?? [])
  }
  useEffect(() => { cargar() }, [id])
  // Si todavía no hay borradores, Claude los escribe solo al abrir la ficha (con tu negocio, tu firma y tus archivos)
  const autoGenerado = useRef(new Set())
  useEffect(() => {
    if (!p || p.id !== id || Object.keys(msgs).length || !servicios.ia || p.estado === 'no_interesado' || autoGenerado.current.has(id)) return
    autoGenerado.current.add(id)
    generar()
  }, [p, msgs, servicios.ia])

  if (!p) return <Cargando />
  const optOut = p.estado === 'no_interesado'
  const actual = borrador[tab] ?? { asunto: '', cuerpo: '' }
  const adjElegidos = adj ?? (msgs.email?.adjuntos ?? [])
  const alternarAdj = id => setAdj(a => { const s = new Set(a ?? msgs.email?.adjuntos ?? []); s.has(id) ? s.delete(id) : s.add(id); return [...s] })
  const sucio = actual.cuerpo !== (msgs[tab]?.cuerpo ?? '') || actual.asunto !== (msgs[tab]?.asunto ?? '')
  const limite = perfil?.limite_diario ?? 15
  const sinCupo = enviadosHoy >= limite
  const tieneWA = Boolean(numeroWhatsApp(p.telefono))
  const editar = (campo, valor) => setBorrador(b => ({ ...b, [tab]: { ...actual, [campo]: valor } }))

  async function generar() {
    const hay = Object.keys(msgs).length > 0
    if (hay && Object.values(msgs).some(m => m.editado) && !(await confirmar({
      titulo: '¿Reemplazar los borradores?', texto: 'Tenés cambios propios en alguno. Se van a escribir los tres de nuevo.', aceptar: 'Reemplazar',
    }))) return
    setGenerando(true); setAviso('')
    try {
      const r = await llamarFuncion('generar-mensajes', { prospecto_ids: [id], forzar: hay })
      toast(r.ia ? (hay ? 'Claude escribió los borradores de nuevo' : 'Claude te dejó los borradores listos para esta empresa') : 'Borradores listos (plantillas)')
      if (r.error_ia) toast('Claude no respondió y se usaron plantillas: ' + r.error_ia, 'error')
      await cargar()
    } catch (e) { toast(mensajeError(e), 'error') }
    setGenerando(false)
  }

  async function reescribir(texto) {
    const ind = (texto ?? instruccion).trim()
    if (!ind || !actual.cuerpo.trim()) return
    setReescribiendo(true)
    try {
      const r = await llamarFuncion('generar-mensajes', { modo: 'reescribir', prospecto_id: id, tipo: tab, cuerpo: actual.cuerpo, asunto: actual.asunto, instruccion: ind })
      setBorrador(b => ({ ...b, [tab]: { asunto: r.asunto ?? actual.asunto, cuerpo: r.cuerpo } }))
      setInstruccion('')
      toast('Listo. Revisalo y guardalo si te gusta.', 'info')
    } catch (e) { toast(mensajeError(e), 'error') }
    setReescribiendo(false)
  }

  async function guardarBorrador(silencioso) {
    const fila = { prospecto_id: id, tipo: tab, asunto: actual.asunto, cuerpo: actual.cuerpo, editado: true, generado_por: msgs[tab]?.generado_por ?? 'manual' }
    const { data, error } = await supabase.from('mensajes').upsert(fila, { onConflict: 'prospecto_id,tipo' }).select().single()
    if (error) { toast(mensajeError(error), 'error'); return null }
    setMsgs(m => ({ ...m, [tab]: data }))
    if (!silencioso) toast('Borrador guardado')
    return data
  }

  // Paso 1: validar y abrir la app con el texto. El envío lo hace la persona.
  async function abrir(canal) {
    setAviso('')
    if (optOut) return
    if (sinCupo) { setAviso(mensajeError({ message: 'LIMITE_DIARIO' })); return }
    if (!actual.cuerpo.trim()) { setAviso('El mensaje está vacío.'); return }
    const m = sucio || !msgs[tab] ? await guardarBorrador(true) : msgs[tab]
    if (!m) return
    const { data: iguales } = await supabase.from('mensajes').select('id').eq('cuerpo', m.cuerpo).not('enviado_at', 'is', null).neq('id', m.id).limit(1)
    if (iguales?.length) { setAviso(mensajeError({ message: 'TEXTO_REPETIDO' })); return }
    let url = ''
    if (canal === 'whatsapp') url = linkWhatsApp(p.telefono, m.cuerpo)
    if (canal === 'email') url = linkEmail(p.email, m.asunto, m.cuerpo)
    if (canal === 'gmail') url = linkGmail(p.email, m.asunto, m.cuerpo)
    if (canal === 'instagram') { try { await navigator.clipboard.writeText(m.cuerpo) } catch { /* sin permiso */ } url = p.instagram }
    if (url) window.open(url, '_blank', 'noopener')
    setConfirmarEnvio({ canal: canal === 'gmail' ? 'email' : canal, mensaje: m })
  }

  // Paso 2: la persona confirma → se registra (la base valida límite, opt-out y texto repetido)
  async function registrarEnvio() {
    const { canal, mensaje } = confirmarEnvio
    const { error } = await supabase.from('interacciones').insert({
      prospecto_id: id, mensaje_id: mensaje.id, tipo: 'enviado', canal, detalle: `${TABS.find(t => t[0] === mensaje.tipo)[1]} por ${canal}`,
    })
    setConfirmarEnvio(null)
    if (error) toast(mensajeError(error), 'error')
    else toast(`Envío registrado. Seguimiento agendado en ${perfil?.dias_seguimiento ?? 5} días.`)
    await Promise.all([cargar(), refrescar()])
  }

  // Envío directo desde la cuenta conectada (función "correo")
  async function enviarDesdeApp() {
    setAviso('')
    if (optOut || sinCupo) return
    if (!actual.cuerpo.trim()) { setAviso('El mensaje está vacío.'); return }
    const m = sucio || !msgs[tab] ? await guardarBorrador(true) : msgs[tab]
    if (!m) return
    if (!(await confirmar({ titulo: `¿Enviar el email a ${p.email}?`, texto: `Sale desde ${correo.email} con el asunto "${m.asunto || 'Hola'}"${tab === 'email' && adjElegidos.length ? ` y ${adjElegidos.length === 1 ? '1 archivo adjunto' : adjElegidos.length + ' archivos adjuntos'}` : ''}. Queda registrado y se agenda el seguimiento.`, aceptar: 'Enviar' }))) return
    setMandando(true)
    try {
      await llamarFuncion('correo', { modo: 'enviar', mensaje_id: m.id, adjuntos: tab === 'email' ? adjElegidos.filter(id => arch.adjuntos.some(a => a.id === id)) : [] })
      toast(`Email enviado a ${p.email}`)
      await Promise.all([cargar(), refrescar()])
    } catch (e) { setAviso(mensajeError(e)) }
    setMandando(false)
  }

  // Google Calendar: abre el evento cargado (sin conectar nada) y deja nota + seguimiento
  async function agendar(e) {
    e.preventDefault()
    const { titulo, fecha: dia, hora: h, duracion } = agenda
    const ini = new Date(`${dia}T${h}`), fin = new Date(ini.getTime() + Number(duracion) * 60000)
    const f = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
    const detalles = [p.telefono && `Tel: ${p.telefono}`, p.email && `Email: ${p.email}`, p.instagram && `Instagram: ${p.instagram}`, p.notas && `\nNotas: ${p.notas}`, `\nFicha: ${location.origin}/prospectos/${p.id}`].filter(Boolean).join('\n')
    const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(titulo)}&dates=${f(ini)}/${f(fin)}&details=${encodeURIComponent(detalles)}&location=${encodeURIComponent(p.direccion || p.zona || '')}`
    window.open(url, '_blank', 'noopener')
    await supabase.from('interacciones').insert({ prospecto_id: id, tipo: 'nota', detalle: `Agendado: ${titulo} (${ini.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' })})` })
    // Agendar una reunión o llamada = hay conversación en curso
    if (p.estado === 'pendiente' || p.estado === 'contactado') {
      await supabase.from('prospectos').update({ estado: 'respondio', ultimo_contacto: new Date().toISOString() }).eq('id', id)
      await supabase.from('interacciones').insert({ prospecto_id: id, tipo: 'cambio_estado', detalle: `${ESTADOS[p.estado].label} → ${ESTADOS.respondio.label}` })
    }
    await supabase.from('prospectos').update({ proximo_seguimiento: dia }).eq('id', id)
    setAgenda(null); toast(`Agendado y pasado a "${ESTADOS.respondio.label}". Se abrió tu Google Calendar con el evento.`); cargar(); refrescar()
  }

  async function registrar(tipo, detalle = '') {
    const antes = p.estado
    const { error } = await supabase.from('interacciones').insert({ prospecto_id: id, tipo, detalle })
    if (error) toast(mensajeError(error), 'error')
    else if (tipo === 'llamada') toast(antes === 'pendiente' ? 'Llamada registrada: pasó a "Contactado"' : 'Llamada registrada')
    else if (tipo === 'respuesta') toast('Pasó a "Respondió"')
    await cargar(); refrescar()
  }

  async function cambiarEstado(estado) {
    if (estado === p.estado) return
    if (estado === 'no_interesado' && !(await confirmar({
      titulo: '¿Marcar como no interesado?', texto: 'No se le podrá escribir más y sale de todos los seguimientos. Es lo correcto si te pidió que no lo contactes.', aceptar: 'Sí, marcar', peligro: true,
    }))) return
    const { error } = await supabase.from('prospectos').update({ estado }).eq('id', id)
    if (error) { toast(mensajeError(error), 'error'); return }
    await registrar('cambio_estado', `${ESTADOS[p.estado].label} → ${ESTADOS[estado].label}`)
    toast(`Estado: ${ESTADOS[estado].label}`)
  }

  async function guardarDatos(e) {
    e.preventDefault()
    const f = Object.fromEntries(new FormData(e.target))
    f.resenas = f.resenas ? Number(f.resenas) : null
    f.rating = f.rating ? Number(String(f.rating).replace(',', '.')) : null
    const { error } = await supabase.from('prospectos').update(f).eq('id', id)
    if (error) toast(mensajeError(error), 'error'); else { setEditando(false); toast('Datos actualizados'); cargar() }
  }

  async function borrar() {
    if (!(await confirmar({ titulo: `¿Borrar a ${p.nombre}?`, texto: 'Se borra con sus borradores y todo su historial. No se puede deshacer.', aceptar: 'Borrar', peligro: true }))) return
    await supabase.from('prospectos').delete().eq('id', id)
    toast('Prospecto borrado'); refrescar(); nav('/prospectos')
  }

  const hora = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <Link to="/prospectos" className="migas"><ArrowLeft size={15} /> Prospectos</Link>
      {optOut && <div className="banner"><Ban size={18} /> Marcado como No interesado: fuera de toda secuencia. No se le puede escribir más.</div>}
      {aviso && <Aviso tipo="error">{aviso}</Aviso>}

      <div className="detalle">
        <section className="tarjeta">
          <div className="ficha-cab">
            <Avatar nombre={p.nombre} grande />
            <div style={{ minWidth: 0 }}>
              <h3>{p.nombre}</h3>
              <div className="muted chico">{[p.rubro, p.zona].filter(Boolean).join(' · ') || 'Sin rubro'}</div>
            </div>
          </div>
          <SelectorEstado valor={p.estado} onCambiar={cambiarEstado} />

          {editando ? (
            <form onSubmit={guardarDatos}>
              {[['nombre', 'Nombre'], ['rubro', 'Tipo de empresa'], ['zona', 'Zona'], ['direccion', 'Dirección'], ['telefono', 'Teléfono'], ['email', 'Email'],
                ['web_actual', 'Página web'], ['google_maps_url', 'Google Maps'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['linkedin', 'LinkedIn'], ['rating', 'Puntaje en Google'], ['resenas', 'Reseñas']]
                .map(([k, l]) => <label key={k}>{l}<input name={k} defaultValue={p[k] ?? ''} required={k === 'nombre'} /></label>)}
              <div className="acciones"><button className="btn primario"><Save size={15} /> Guardar</button><button type="button" className="btn" onClick={() => setEditando(false)}>Cancelar</button></div>
            </form>
          ) : (
            <div className="datos">
              <Phone size={16} /><div>{p.telefono || '—'}{p.telefono && !tieneWA && <small>Parece fijo: sin WhatsApp</small>}</div>
              <Mail size={16} /><div>{p.email ? <a href={`mailto:${p.email}`}>{p.email}</a> : '—'}</div>
              <MapPin size={16} /><div>{p.direccion || '—'}{p.zona && <small>{p.zona}</small>}</div>
              <Globe size={16} /><div><Enlaces e={p} conTexto /></div>
              {(p.resenas || p.rating) && <><Star size={16} /><div>{p.resenas ?? '—'} reseñas{p.rating ? ` · ${p.rating}★` : ''}</div></>}
              {p.encaje && <><Target size={16} /><div><small>Por qué encaja</small>{p.encaje}</div></>}
              <Clock size={16} /><div><small>Último contacto</small>{fechaHora(p.ultimo_contacto)}</div>
              <CalendarClock size={16} /><div><small>Próximo seguimiento</small>{p.proximo_seguimiento ? fecha(p.proximo_seguimiento) : '—'}</div>
            </div>
          )}
          {!editando && <button className="btn chico" onClick={() => setEditando(true)}><Pencil size={14} /> Editar datos</button>}
          <NotasEditor p={p} onGuardado={cargar} />
          <div className="acciones-estado">
            <button className="btn" onClick={() => registrar('respuesta', 'Respondió')} disabled={optOut}><Reply size={15} /> Respondió</button>
            <button className="btn" onClick={() => cambiarEstado('cliente')}><Trophy size={15} /> ¡Es cliente!</button>
            <button className="btn" onClick={() => registrar('llamada', 'Llamada registrada')} disabled={optOut}><Phone size={15} /> Llamé</button>
            <button className="btn" onClick={() => { const m = new Date(Date.now() + 86400000); setAgenda({ titulo: `Llamada con ${p.nombre}`, fecha: m.toLocaleDateString('en-CA'), hora: '10:00', duracion: 30 }) }} disabled={optOut}><CalendarPlus size={15} /> Agendar</button>
            <button className="btn peligro" onClick={() => cambiarEstado('no_interesado')} disabled={optOut}><Ban size={15} /> No interesado</button>
          </div>
          <button className="btn fantasma chico peligro" style={{ marginTop: 14 }} onClick={borrar}><Trash2 size={14} /> Borrar prospecto</button>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-titulo">
            <h3><Sparkles size={16} /> Mensajes</h3>
            <button className="btn ia chico" onClick={generar} disabled={generando || optOut}>
              {generando ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
              {generando ? 'Escribiendo…' : Object.keys(msgs).length ? 'Regenerar' : 'Generar borradores'}
            </button>
          </div>
          <div className="tabs" role="tablist">
            {TABS.map(([k, l, Icono]) => (
              <button key={k} className={tab === k ? 'activo' : ''} onClick={() => setTab(k)} role="tab" aria-selected={tab === k}>
                <Icono size={15} /> {l}{msgs[k]?.enviado_at && <CheckCircle2 size={14} className="ok" />}
              </button>
            ))}
          </div>

          <div className="editor-wrap">
            <div>
              {(tab === 'email' || tab === 'seguimiento') && (
                <input className="asunto" placeholder="Asunto" value={actual.asunto} onChange={e => editar('asunto', e.target.value)} disabled={optOut} aria-label="Asunto" />
              )}
              <textarea className="editor" rows={tab === 'email' ? 12 : 9} value={actual.cuerpo} disabled={optOut || reescribiendo} aria-label="Mensaje"
                placeholder={generando ? 'Escribiendo…' : 'Escribí el mensaje o tocá "Generar borradores".'} onChange={e => editar('cuerpo', e.target.value)} />
              <div className="meta-editor">
                <span className="muted chico">
                  {actual.cuerpo.length} caracteres
                  {msgs[tab] && <> · {msgs[tab].generado_por === 'ia' ? 'escrito por Claude' : msgs[tab].generado_por}{msgs[tab].editado ? ', editado' : ''}</>}
                  {msgs[tab]?.enviado_at && <> · enviado {fechaHora(msgs[tab].enviado_at)}</>}
                </span>
                <button className="btn chico" onClick={() => guardarBorrador()} disabled={!sucio || optOut}><Save size={14} /> Guardar</button>
              </div>

              <div className="panel-ia">
                <h4><Wand2 size={15} /> Ajustar con Claude</h4>
                {servicios.ia === false ? (
                  <p className="muted chico" style={{ margin: 0 }}>Para reescribir con IA falta cargar la clave de Claude. Mirá el estado en <Link to="/cuenta">Mi cuenta</Link>.</p>
                ) : <>
                  <div className="rapidos">
                    {RAPIDOS.map(r => <button key={r} onClick={() => reescribir(r)} disabled={reescribiendo || optOut || !actual.cuerpo}>{r}</button>)}
                  </div>
                  <form className="instruccion" onSubmit={e => { e.preventDefault(); reescribir() }}>
                    <input placeholder="Ej.: mencioná que hacemos la web en 2 semanas" value={instruccion} onChange={e => setInstruccion(e.target.value)} disabled={reescribiendo || optOut} />
                    <button className="btn oscuro" disabled={reescribiendo || !instruccion.trim() || optOut}>{reescribiendo ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}</button>
                  </form>
                </>}
              </div>
            </div>

            <div>
              {tab === 'email' ? (
                <div className="preview-mail"><div className="mail-cab"><span className="muted chico">Para: {p.email || 'sin email'}</span><b>{actual.asunto || 'Sin asunto'}</b></div><div className="mail-cuerpo">{actual.cuerpo || <span className="muted">Vista previa del email</span>}{arch.firmaUrl && actual.cuerpo && <img className="mail-firma-img" src={arch.firmaUrl} alt="Imagen de tu firma" />}</div>
                  {adjElegidos.length > 0 && <div className="mail-adjuntos">{adjElegidos.map(id => arch.adjuntos.find(a => a.id === id)).filter(Boolean).map(a => <span key={a.id} className="chip"><Paperclip size={11} /> {a.nombre}</span>)}</div>}</div>
              ) : (
                <div className="preview">
                  <div className="preview-cab"><Avatar nombre={p.nombre} /><div><span>{p.nombre}</span><small>WhatsApp · vista previa</small></div></div>
                  <div className="preview-cuerpo">{actual.cuerpo ? <div className="burbuja" key={actual.cuerpo.length}>{actual.cuerpo}<small><span>{hora}</span> ✓✓</small></div> : <span className="muted chico centrado" style={{ margin: 'auto' }}>Vista previa del mensaje</span>}</div>
                </div>
              )}
            </div>
          </div>

          <div className="envio">
            <p>{tab !== 'whatsapp' && correo
              ? <>Revisá el texto. <b>Enviar email</b> lo manda desde {correo.email} y queda registrado. WhatsApp e Instagram se abren con el mensaje cargado y el envío lo hacés vos.</>
              : <>Revisá el texto. El botón abre la app con el mensaje cargado: <b>el envío lo hacés vos</b> y después lo confirmás acá.{!correo && tab !== 'whatsapp' && <> Para mandar emails directo desde acá, <Link to="/email">conectá tu email</Link>.</>}</>}</p>
            {tab === 'email' && correo && (
              <div className="adjuntar-bloque">
                <small className="adjuntar-titulo"><Paperclip size={13} /> Adjuntos{msgs.email?.adjuntos?.length && adj === null ? ' · Claude eligió los marcados' : ''}</small>
                <AdjuntarEnEmail arch={arch} elegidos={adjElegidos} onAlternar={alternarAdj} onSubido={id => setAdj([...new Set([...adjElegidos, id])])} />
                {arch.firma && <small className="muted">Tu firma lleva la imagen al final. <Link to="/email">Cambiarla</Link></small>}
              </div>
            )}
            <div className="acciones">
              {tab !== 'email' && (
                <button className="btn wa" onClick={() => abrir('whatsapp')} disabled={optOut || !tieneWA || sinCupo} title={!tieneWA ? 'No hay un celular válido' : ''}>
                  <MessageCircle size={16} /> Abrir WhatsApp
                </button>
              )}
              {tab !== 'whatsapp' && correo && (
                <button className="btn primario" onClick={enviarDesdeApp} disabled={optOut || !p.email || sinCupo || mandando} title={!p.email ? 'Cargá un email' : `Sale desde ${correo.email}`}>
                  {mandando ? <Loader2 size={16} className="spin" /> : <Send size={16} />} Enviar email
                </button>
              )}
              {tab !== 'whatsapp' && <>
                <button className="btn" onClick={() => abrir('gmail')} disabled={optOut || !p.email || sinCupo} title={!p.email ? 'Cargá un email' : ''}><Mail size={16} /> Abrir en Gmail</button>
                <button className="btn" onClick={() => abrir('email')} disabled={optOut || !p.email || sinCupo}>App de mail</button>
              </>}
              {p.instagram && <button className="btn" onClick={() => abrir('instagram')} disabled={optOut || sinCupo}><Copy size={16} /> Copiar y abrir Instagram</button>}
            </div>
            {sinCupo && <Aviso>Llegaste al límite de hoy ({limite}). Seguí mañana o cambialo en Mi cuenta.</Aviso>}
          </div>
        </section>
      </div>

      <section className="tarjeta">
        <div className="tarjeta-titulo"><h3><Clock size={16} /> Historial</h3></div>
        <form className="nota-rapida" onSubmit={async e => { e.preventDefault(); if (nota.trim()) { await registrar('nota', nota.trim()); setNota(''); toast('Nota agregada') } }}>
          <input placeholder="Agregar una nota (qué te dijo, cuándo volver a escribir…)" value={nota} onChange={e => setNota(e.target.value)} />
          <button className="btn oscuro">Agregar</button>
        </form>
        {hist.length === 0 ? <p className="muted">Sin interacciones todavía.</p> : (
          <ul className="timeline">
            {hist.map(h => {
              const [label, Icono, color, fondo] = TIPO_INT[h.tipo]
              return (
                <li key={h.id}>
                  <span className="tl-icono" style={{ color, background: fondo }}><Icono size={15} /></span>
                  <div className="tl-cuerpo"><b>{label}</b>{h.canal && <> <span className="chip">{h.canal}</span></>}
                    <span className="muted"> · {fechaHora(h.created_at)}</span>{h.detalle && <div>{h.detalle}</div>}</div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {agenda && (
        <Modal onCerrar={() => setAgenda(null)}>
          <form onSubmit={agendar}>
            <h3><CalendarPlus size={18} style={{ verticalAlign: -3 }} /> Agendar en Google Calendar</h3>
            <label>Qué<input value={agenda.titulo} onChange={e => setAgenda({ ...agenda, titulo: e.target.value })} required /></label>
            <div className="form-grid">
              <label>Día<input type="date" value={agenda.fecha} onChange={e => setAgenda({ ...agenda, fecha: e.target.value })} required /></label>
              <label>Hora<input type="time" value={agenda.hora} onChange={e => setAgenda({ ...agenda, hora: e.target.value })} required /></label>
            </div>
            <div className="campo">Duración<Desplegable className="ancho" ariaLabel="Duración" value={agenda.duracion} onChange={v => setAgenda({ ...agenda, duracion: v })} opciones={[[15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [120, '2 horas']].map(([value, label]) => ({ value, label }))} /></div>
            <p className="muted chico">Se abre tu Google Calendar con el evento cargado (con teléfono, dirección y notas) y en Prospecta queda agendado el seguimiento para ese día.</p>
            <div className="acciones fin">
              <button type="button" className="btn" onClick={() => setAgenda(null)}>Cancelar</button>
              <button className="btn primario"><CalendarPlus size={15} /> Abrir en Google Calendar</button>
            </div>
          </form>
        </Modal>
      )}

      {confirmarEnvio && (
        <Modal>
          <h3>¿Enviaste el mensaje?</h3>
          <p>Se abrió {confirmarEnvio.canal === 'instagram' ? 'Instagram (el texto quedó copiado: pegalo en el DM)' : confirmarEnvio.canal === 'email' ? 'el email' : 'WhatsApp'} con el texto cargado.
            Confirmá sólo si lo enviaste: queda registrado y se agenda el seguimiento a {perfil?.dias_seguimiento ?? 5} días.</p>
          <div className="acciones fin">
            <button className="btn" onClick={() => setConfirmarEnvio(null)}>No, no lo envié</button>
            <button className="btn primario" onClick={registrarEnvio}><Send size={15} /> Sí, lo envié</button>
          </div>
        </Modal>
      )}
    </>
  )
}

function NotasEditor({ p, onGuardado }) {
  const toast = useToast()
  const [notas, setNotas] = useState(p.notas)
  useEffect(() => setNotas(p.notas), [p.notas])
  return (
    <label style={{ marginTop: 16 }}>Notas internas
      <textarea rows={3} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Lo que sepas del negocio: dueño, horarios, qué le interesa…"
        onBlur={async () => {
          if (notas === p.notas) return
          const { error } = await supabase.from('prospectos').update({ notas }).eq('id', p.id)
          if (error) toast(mensajeError(error), 'error'); else { toast('Notas guardadas'); onGuardado() }
        }} />
    </label>
  )
}
