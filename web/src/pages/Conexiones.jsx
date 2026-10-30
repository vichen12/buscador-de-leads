import { useState } from 'react'
import { Mail, MessageCircle, CalendarDays, Loader2, CheckCircle2, ExternalLink, Send, RefreshCw, Unplug, ChevronDown, AlertTriangle, Info } from 'lucide-react'
import { llamarFuncion } from '../lib/supabase.js'
import { fechaHora, mensajeError } from '../lib/util.js'
import { Aviso, useConfirmar, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

export default function Conexiones() {
  return (
    <>
      <header className="cabecera">
        <div><h1>Conexiones</h1><p>Conectá tus cuentas para enviar y seguir a tus prospectos sin salir de Prospecta.</p></div>
      </header>
      <CorreoCard />
      <div className="grilla-2">
        <section className="tarjeta conexion">
          <div className="conexion-cab"><span className="conexion-icono wa"><MessageCircle size={20} /></span><div><h3>WhatsApp</h3><span className="chip ok"><CheckCircle2 size={12} /> Listo para usar</span></div></div>
          <p>Desde cada prospecto, <b>Abrir WhatsApp</b> abre tu WhatsApp (app o web) con el mensaje ya escrito. Vos apretás enviar y Prospecta lo registra.</p>
          <div className="nota-info"><Info size={15} /><span>WhatsApp no permite que una app mande mensajes automáticos a gente que no te escribió antes: te pueden bloquear el número. Por eso cada envío lo hacés vos, de a pocos.</span></div>
        </section>
        <section className="tarjeta conexion">
          <div className="conexion-cab"><span className="conexion-icono cal"><CalendarDays size={20} /></span><div><h3>Google Calendar</h3><span className="chip ok"><CheckCircle2 size={12} /> Listo para usar</span></div></div>
          <p>En cada prospecto, <b>Agendar</b> crea el evento en tu Google Calendar con su teléfono, dirección y notas, y deja anotado el seguimiento en Prospecta.</p>
          <div className="nota-info"><Info size={15} /><span>No hace falta conectar nada: se abre tu calendario con el evento cargado y lo guardás con un clic.</span></div>
        </section>
      </div>
    </>
  )
}

function CorreoCard() {
  const { correo, setCorreo, perfil } = useApp()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [f, setF] = useState({ email: perfil?.email_contacto || '', clave: '', nombre: perfil?.nombre || '', smtp_host: '', smtp_puerto: 465, imap_host: '', imap_puerto: 993 })
  const [avanzado, setAvanzado] = useState(false)
  const [cargando, setCargando] = useState('')
  const [error, setError] = useState('')
  const esGmail = /@(gmail|googlemail)\.com$/i.test(f.email)
  const noSoportado = /@(outlook|hotmail|live|msn)\.|@(icloud|me)\.com$/i.test(f.email)

  async function accion(modo, extra = {}) {
    setCargando(modo); setError('')
    try {
      const r = await llamarFuncion('correo', { modo, ...extra })
      if (modo === 'conectar') { setCorreo(r.conexion); toast(r.aviso ? 'Email conectado (sólo para enviar)' : '¡Email conectado!') }
      if (modo === 'probar') toast(`Te mandamos un mail de prueba a ${correo.email}`)
      if (modo === 'revisar') toast(r.respondieron?.length ? `Respondieron: ${r.respondieron.join(', ')}` : `Revisé ${r.revisados} mails nuevos: ninguno es de un prospecto`, r.respondieron?.length ? '' : 'info')
      if (modo === 'desconectar') { setCorreo(null); toast('Email desconectado') }
      if (modo !== 'desconectar') { const e = await llamarFuncion('correo', { modo: 'estado' }); if (e.conexion) setCorreo(e.conexion) }
    } catch (e) { setError(mensajeError(e)) }
    setCargando('')
  }

  if (correo) {
    return (
      <section className="tarjeta conexion conectada">
        <div className="conexion-cab">
          <span className="conexion-icono mail"><Mail size={20} /></span>
          <div style={{ flex: 1 }}><h3>Email</h3><span className="chip ok"><CheckCircle2 size={12} /> Conectado: {correo.email}</span></div>
          <button className="btn fantasma chico peligro" disabled={!!cargando} onClick={async () => { if (await confirmar({ titulo: '¿Desconectar tu email?', texto: 'Se borra la contraseña de aplicación guardada. Podés volver a conectarlo cuando quieras.', aceptar: 'Desconectar', peligro: true })) accion('desconectar') }}><Unplug size={14} /> Desconectar</button>
        </div>
        <ul className="conexion-lista">
          <li><CheckCircle2 size={15} className="ok" /> Los emails a tus prospectos salen desde <b>{correo.email}</b>{correo.nombre_remitente ? ` como "${correo.nombre_remitente}"` : ''}, con el botón <b>Enviar email</b> de cada prospecto.</li>
          {correo.leer_respuestas
            ? <li><CheckCircle2 size={15} className="ok" /> Revisa tu bandeja: cuando un prospecto te responde, lo pasa a <b>Respondió</b> solo.{correo.ultima_revision && <span className="muted"> Última revisión: {fechaHora(correo.ultima_revision)}.</span>}</li>
            : <li><AlertTriangle size={15} className="aviso-texto" /> No pude entrar a tu bandeja, así que las respuestas las marcás a mano.</li>}
          {correo.ultimo_error && <li><AlertTriangle size={15} className="aviso-texto" /> {correo.ultimo_error}</li>}
        </ul>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="acciones">
          <button className="btn" onClick={() => accion('probar')} disabled={!!cargando}>{cargando === 'probar' ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Mandarme un mail de prueba</button>
          {correo.leer_respuestas && <button className="btn" onClick={() => accion('revisar')} disabled={!!cargando}>{cargando === 'revisar' ? <Loader2 size={15} className="spin" /> : <RefreshCw size={15} />} Revisar respuestas ahora</button>}
        </div>
      </section>
    )
  }

  return (
    <section className="tarjeta conexion">
      <div className="conexion-cab"><span className="conexion-icono mail"><Mail size={20} /></span><div><h3>Email</h3><span className="chip">No conectado</span></div></div>
      <p>Mandá los emails desde tu propia cuenta sin salir de Prospecta, y enterate solo cuando alguien te responde.</p>
      <div className="conexion-pasos">
        <div><span>1</span><div><b>Activá la verificación en 2 pasos</b> en tu cuenta de Google (si ya la tenés, saltá este paso).<br /><a href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noreferrer">Abrir verificación en 2 pasos <ExternalLink size={11} /></a></div></div>
        <div><span>2</span><div><b>Creá una contraseña de aplicación</b>: ponele de nombre "Prospecta" y copiá las 16 letras que te da.<br /><a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Crear contraseña de aplicación <ExternalLink size={11} /></a></div></div>
        <div><span>3</span><div><b>Pegala acá abajo</b> junto con tu email y listo.</div></div>
      </div>
      <form className="conexion-form" onSubmit={e => { e.preventDefault(); accion('conectar', f) }}>
        <label>Tu email<input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="vos@gmail.com" /></label>
        <label>Contraseña de aplicación<input required value={f.clave} onChange={e => setF({ ...f, clave: e.target.value })} placeholder={esGmail || !f.email ? 'abcd efgh ijkl mnop' : 'Contraseña de aplicación o del correo'} autoComplete="off" /></label>
        <label>Nombre que ve el cliente <span className="muted">(opcional)</span><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Vincenzo de Bombas Cuyo" /></label>
        {noSoportado && <Aviso>Outlook, Hotmail e iCloud no se pueden conectar por ahora: sólo envían por un puerto que nuestro servidor no puede usar. Usá una cuenta de Gmail o el correo de tu dominio.</Aviso>}
        <button type="button" className="link chico" onClick={() => setAvanzado(a => !a)}><ChevronDown size={13} style={{ verticalAlign: -2, transform: avanzado ? 'rotate(180deg)' : '' }} /> Uso el correo de mi dominio (opciones avanzadas)</button>
        {avanzado && (
          <div className="form-grid">
            <label>Servidor de salida (SMTP)<input value={f.smtp_host} onChange={e => setF({ ...f, smtp_host: e.target.value })} placeholder={`mail.${f.email.split('@')[1] || 'tudominio.com'}`} /><small>Puerto 465 (SSL).</small></label>
            <label>Servidor de entrada (IMAP)<input value={f.imap_host} onChange={e => setF({ ...f, imap_host: e.target.value })} placeholder={`mail.${f.email.split('@')[1] || 'tudominio.com'}`} /><small>Puerto 993 (SSL).</small></label>
          </div>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <button className="btn primario" disabled={!!cargando || noSoportado}>{cargando === 'conectar' ? <><Loader2 size={15} className="spin" /> Probando la conexión…</> : <><Mail size={15} /> Conectar email</>}</button>
        <small className="muted">La contraseña se guarda cifrada y sólo la usa el servidor para enviar y leer. Podés revocarla cuando quieras desde tu cuenta de Google.</small>
      </form>
    </section>
  )
}
