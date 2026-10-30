import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, MessageCircle, CalendarDays, Loader2, CheckCircle2, ExternalLink, Send, RefreshCw, Unplug, ChevronDown, AlertTriangle, Info, Eye, EyeOff, Check, ArrowRight } from 'lucide-react'
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
      <Link to="/email" className="aviso-revisar">
        <Mail size={18} />
        <span><b>El email se configura en la sección Email</b>: ahí conectás tu casilla, armás la firma y subís tus archivos.</span>
        <span className="espacio" /><span className="link">Ir a Email <ArrowRight size={14} /></span>
      </Link>
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

const PROVEEDORES = [
  { id: 'gmail', color: '#ea4335', letra: 'G', nombre: 'Gmail', sub: 'o Google Workspace', smtp: 'smtp.gmail.com', imap: 'imap.gmail.com', clave: 'Contraseña de aplicación', ph: 'abcd efgh ijkl mnop',
    pasos: [<><b>Activá la verificación en 2 pasos</b> en tu cuenta de Google (si ya la tenés, saltá este paso).<br /><a href="https://myaccount.google.com/signinoptions/twosv" target="_blank" rel="noreferrer">Abrir verificación en 2 pasos <ExternalLink size={11} /></a></>,
      <><b>Creá una contraseña de aplicación</b>: ponele de nombre "Prospecta" y copiá las 16 letras que te da.<br /><a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Crear contraseña de aplicación <ExternalLink size={11} /></a></>] },
  { id: 'privateemail', color: '#de3723', letra: 'P', nombre: 'Private Email', sub: 'Namecheap', smtp: 'mail.privateemail.com', imap: 'mail.privateemail.com', clave: 'Contraseña de la casilla', ph: 'La misma con la que entrás al webmail',
    pasos: [<><b>Usá tu email completo</b> (ej.: vos@tuempresa.com) y <b>la contraseña de esa casilla</b>, la misma con la que entrás a <a href="https://privateemail.com" target="_blank" rel="noreferrer">privateemail.com <ExternalLink size={11} /></a>.</>] },
  { id: 'zoho', color: '#e42527', letra: 'Z', nombre: 'Zoho Mail', sub: '', smtp: 'smtp.zoho.com', imap: 'imap.zoho.com', clave: 'Contraseña (o de aplicación si usás 2 pasos)', ph: 'Contraseña de Zoho',
    pasos: [<><b>Activá IMAP</b> en Zoho Mail → Configuración → Cuentas de correo → IMAP.</>,
      <>Si tenés verificación en 2 pasos, <b>generá una contraseña de aplicación</b>.<br /><a href="https://accounts.zoho.com/home#security/app_password" target="_blank" rel="noreferrer">Crear contraseña de aplicación <ExternalLink size={11} /></a></>] },
  { id: 'hostinger', color: '#673de6', letra: 'H', nombre: 'Hostinger', sub: '', smtp: 'smtp.hostinger.com', imap: 'imap.hostinger.com', clave: 'Contraseña de la casilla', ph: 'La del webmail de Hostinger',
    pasos: [<><b>Usá tu email completo y la contraseña de la casilla</b> (la que usás en el webmail de Hostinger).</>] },
  { id: 'godaddy', color: '#0b8f8f', letra: 'G', nombre: 'GoDaddy', sub: 'Workspace Email', smtp: 'smtpout.secureserver.net', imap: 'imap.secureserver.net', clave: 'Contraseña de la casilla', ph: 'La del webmail de GoDaddy',
    pasos: [<><b>Usá tu email completo y la contraseña de la casilla.</b> Si tu correo de GoDaddy es de Microsoft 365, por ahora no se puede conectar.</>] },
  { id: 'yahoo', color: '#6001d2', letra: 'Y', nombre: 'Yahoo', sub: '', smtp: 'smtp.mail.yahoo.com', imap: 'imap.mail.yahoo.com', clave: 'Contraseña de aplicación', ph: 'Contraseña de aplicación de Yahoo',
    pasos: [<><b>Generá una contraseña de aplicación</b> en Seguridad de tu cuenta de Yahoo.<br /><a href="https://login.yahoo.com/account/security" target="_blank" rel="noreferrer">Abrir seguridad de Yahoo <ExternalLink size={11} /></a></>] },
  { id: 'otro', color: '#52525b', letra: '@', nombre: 'Otro', sub: 'mi dominio / cPanel', smtp: '', imap: '', clave: 'Contraseña de la casilla', ph: 'Contraseña del correo',
    pasos: [<><b>Buscá los datos de tu correo</b> en el panel de tu hosting ("Configurar cliente de correo"): servidor SMTP con SSL (puerto 465) e IMAP con SSL (puerto 993).</>,
      <>Completalos abajo con tu email y la contraseña de la casilla.</>] },
]
const detectar = email => /@(gmail|googlemail)\.com$/i.test(email) ? 'gmail' : /@yahoo\./i.test(email) ? 'yahoo' : /@zoho(mail)?\.com$/i.test(email) ? 'zoho' : null

export function CorreoCard() {
  const { correo, setCorreo, perfil } = useApp()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [f, setF] = useState({ email: perfil?.email_contacto || '', clave: '', nombre: perfil?.nombre || '', smtp_host: '', smtp_puerto: 465, imap_host: '', imap_puerto: 993 })
  const [prov, setProv] = useState(detectar(perfil?.email_contacto || '') || 'gmail')
  const P = PROVEEDORES.find(x => x.id === prov)
  const [verClave, setVerClave] = useState(false)
  const [cargando, setCargando] = useState('')
  const [error, setError] = useState('')
  const noSoportado = /@(outlook|hotmail|live|msn)\.|@(icloud|me)\.com$/i.test(f.email)

  async function accion(modo, extra = {}) {
    setCargando(modo); setError('')
    try {
      const r = await llamarFuncion('correo', { modo, ...extra })
      if (modo === 'conectar') { setCorreo(r.conexion); toast(r.aviso ? 'Email conectado (sólo para enviar)' : '¡Email conectado!') }
      if (modo === 'probar') toast(`Te mandamos un mail de prueba a ${correo.email}${r.en_enviados === false ? '. Ojo: no pude copiarlo a tu carpeta Enviados' : r.en_enviados ? '. También quedó en tu carpeta Enviados' : ''}`, r.en_enviados === false ? 'info' : '')
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
      <div className="proveedores-titulo">¿Dónde tenés tu correo?</div>
      <div className="proveedores" role="radiogroup" aria-label="Dónde tenés tu correo">
        {PROVEEDORES.map(x => (
          <button key={x.id} type="button" role="radio" aria-checked={prov === x.id} className={'proveedor' + (prov === x.id ? ' on' : '')} onClick={() => { setProv(x.id); setError('') }}>
            <span className="proveedor-marca" style={{ '--marca': x.color }}>{x.letra}</span>
            <span className="proveedor-txt"><b>{x.nombre}</b><small>{x.sub || 'Correo'}</small></span>
            <span className="proveedor-tilde"><Check size={12} strokeWidth={3} /></span>
          </button>
        ))}
      </div>
      <div className="conexion-pasos">
        {[...P.pasos, <><b>Completá tus datos acá abajo</b> y tocá Conectar: probamos la conexión al toque.</>].map((paso, n) => <div key={prov + n}><span>{n + 1}</span><div>{paso}</div></div>)}
      </div>
      <form className="conexion-form" onSubmit={e => { e.preventDefault(); accion('conectar', { ...f, smtp_host: f.smtp_host || P.smtp, imap_host: f.imap_host || P.imap }) }}>
        <label>Tu email<input type="email" required value={f.email} onChange={e => { const v = e.target.value; setF({ ...f, email: v }); const d = detectar(v); if (d && d !== prov && prov !== 'otro') setProv(d) }} placeholder={prov === 'gmail' || prov === 'yahoo' ? `vos@${prov}.com` : 'vos@tuempresa.com'} /></label>
        <label>{P.clave}
          <div className="campo-pass">
            <input required type={verClave ? 'text' : 'password'} value={f.clave} onChange={e => setF({ ...f, clave: e.target.value })} placeholder={P.ph} autoComplete="new-password" spellCheck={false} />
            <button type="button" className="btn chico fantasma" onClick={() => setVerClave(v => !v)} aria-label={verClave ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={verClave ? 'Ocultar' : 'Mostrar'}>{verClave ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </label>
        <label>Nombre que ve el cliente <span className="muted">(opcional)</span><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Vincenzo de Bombas Cuyo" /></label>
        {noSoportado && <Aviso>Outlook, Hotmail e iCloud no se pueden conectar por ahora: sólo envían por un puerto que nuestro servidor no puede usar. Usá Gmail, Private Email, Zoho o el correo de tu dominio.</Aviso>}
        {prov === 'otro' && (
          <div className="form-grid">
            <label>Servidor de salida (SMTP)<input required value={f.smtp_host} onChange={e => setF({ ...f, smtp_host: e.target.value })} placeholder={`mail.${f.email.split('@')[1] || 'tudominio.com'}`} /><small>Puerto 465 (SSL).</small></label>
            <label>Servidor de entrada (IMAP)<input value={f.imap_host} onChange={e => setF({ ...f, imap_host: e.target.value })} placeholder={`mail.${f.email.split('@')[1] || 'tudominio.com'}`} /><small>Puerto 993 (SSL). Opcional: sirve para leer respuestas.</small></label>
          </div>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        <button className="btn primario" disabled={!!cargando || noSoportado}>{cargando === 'conectar' ? <><Loader2 size={15} className="spin" /> Probando la conexión…</> : <><Mail size={15} /> Conectar {P.nombre === 'Otro' ? 'email' : P.nombre}</>}</button>
        <small className="muted">La contraseña se guarda cifrada y sólo la usa el servidor para enviar y leer tus respuestas. Podés desconectarla cuando quieras.</small>
      </form>
    </section>
  )
}
