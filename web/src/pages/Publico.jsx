import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Loader2, CheckCircle2, AlertCircle, MailX, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import Logo from '../components/Logo.jsx'

/** Marco de las páginas públicas (sin login): baja, términos y privacidad */
function Marco({ children, ancho }) {
  return (
    <div className="publico">
      <header className="publico-cab"><Logo size={24} /></header>
      <main className={'publico-cuerpo' + (ancho ? ' ancho' : '')}>{children}</main>
      <footer className="publico-pie">
        <Link to="/terminos">Términos de uso</Link> · <Link to="/privacidad">Política de privacidad</Link>
      </footer>
    </div>
  )
}

/** Página a la que lleva el link "darse de baja" de cada mail. No pide login. */
export function Baja() {
  const { token } = useParams()
  const [info, setInfo] = useState(undefined)
  const [estado, setEstado] = useState('') // '' | enviando | listo | error
  useEffect(() => {
    supabase.rpc('info_baja', { p_token: token }).then(({ data, error }) => setInfo(error ? null : data ?? null))
  }, [token])

  async function confirmar() {
    setEstado('enviando')
    const { data, error } = await supabase.rpc('confirmar_baja', { p_token: token })
    setEstado(error || !data?.ok ? 'error' : 'listo')
  }

  return (
    <Marco>
      <div className="tarjeta publico-tarjeta">
        {info === undefined ? <div className="centro"><Loader2 className="spin" /></div>
          : info === null ? (
            <>
              <AlertCircle size={30} className="publico-icono error" />
              <h1>Este link no es válido</h1>
              <p className="muted">Puede que esté incompleto. Si querés que no te escriban más, respondé el mail con la palabra <b>BAJA</b> y listo.</p>
            </>
          ) : info.ya || estado === 'listo' ? (
            <>
              <CheckCircle2 size={30} className="publico-icono ok" />
              <h1>Listo, no vas a recibir más mensajes</h1>
              <p className="muted">Sacamos a <b>{info.email}</b> de la lista de {info.remitente}. No hace falta que hagas nada más.</p>
            </>
          ) : (
            <>
              <MailX size={30} className="publico-icono" />
              <h1>¿No querés recibir más mensajes?</h1>
              <p className="muted">Vamos a dejar de escribirle a <b>{info.email}</b> de parte de {info.remitente}.</p>
              {estado === 'error' && <div className="aviso error"><AlertCircle size={17} /><div>No pudimos registrar la baja. Probá de nuevo o respondé el mail con la palabra BAJA.</div></div>}
              <button className="btn primario btn-grande ancho" onClick={confirmar} disabled={estado === 'enviando'}>
                {estado === 'enviando' && <Loader2 size={16} className="spin" />} Sí, no quiero recibir más mensajes
              </button>
              <p className="publico-nota">Tus datos se obtuvieron de fuentes públicas (como la web o la ficha de Google de la empresa). Podés pedir que los borren: mirá la <Link to="/privacidad">política de privacidad</Link>.</p>
            </>
          )}
      </div>
    </Marco>
  )
}

function useLegales() {
  const [d, setD] = useState({})
  useEffect(() => { supabase.rpc('datos_legales').then(({ data }) => setD(data ?? {})) }, [])
  return d
}
const contacto = d => d.email_privacidad
  ? <a href={`mailto:${d.email_privacidad}`}>{d.email_privacidad}</a>
  : 'el email de contacto del administrador de la cuenta que te escribió (figura en el mail que recibiste)'

export function Terminos() {
  const d = useLegales()
  return (
    <Marco ancho>
      <article className="tarjeta legal">
        <Link to="/" className="link volver-legal"><ArrowLeft size={14} /> Volver</Link>
        <h1>Términos de uso</h1>
        <p className="muted">Última actualización: octubre de 2026</p>
        <h2>1. Qué es Prospecta</h2>
        <p>Prospecta es una herramienta para que empresas encuentren posibles clientes, les escriban y hagan el seguimiento. {d.responsable ? `El servicio lo presta ${d.responsable}.` : ''} Al usarla aceptás estos términos.</p>
        <h2>2. De dónde salen los datos</h2>
        <p>Las empresas que muestra Prospecta se obtienen de <b>fuentes públicas</b>: sitios web, fichas de Google Maps, directorios y redes sociales donde las propias empresas publican sus datos de contacto. Prospecta no compra bases de datos ni accede a información privada.</p>
        <h2>3. Tu responsabilidad</h2>
        <p>Vos sos responsable de usar esos datos según la ley de tu país. En Argentina rige la <b>Ley 25.326 de Protección de los Datos Personales</b>. En particular:</p>
        <ul>
          <li>Escribí sólo a empresas, con mensajes relacionados con su actividad, y nunca a personas particulares que no te dieron permiso.</li>
          <li>Respetá siempre las bajas: si alguien pide que no le escriban más, no se le escribe más. Prospecta lo bloquea automáticamente.</li>
          <li>No uses la herramienta para mandar spam, engañar, ni para nada ilegal.</li>
          <li>Cuidá tu usuario y tu contraseña. Lo que se haga con tu cuenta es tu responsabilidad.</li>
        </ul>
        <h2>4. Envíos</h2>
        <p>Los mails salen desde tu propia casilla. Prospecta limita la cantidad diaria y agrega a cada mail una forma de darse de baja para cuidar tu reputación y la de los destinatarios. Los mensajes de WhatsApp los mandás siempre vos.</p>
        <h2>5. Inteligencia artificial</h2>
        <p>Los textos que propone la IA son borradores: revisalos antes de enviarlos. Prospecta no garantiza resultados comerciales.</p>
        <h2>6. Suspensión</h2>
        <p>Podemos suspender cuentas que se usen para spam o en contra de estos términos o de la ley.</p>
        <h2>7. Contacto</h2>
        <p>Por cualquier consulta escribinos a {contacto(d)}.</p>
      </article>
    </Marco>
  )
}

export function Privacidad() {
  const d = useLegales()
  return (
    <Marco ancho>
      <article className="tarjeta legal">
        <Link to="/" className="link volver-legal"><ArrowLeft size={14} /> Volver</Link>
        <h1>Política de privacidad</h1>
        <p className="muted">Última actualización: octubre de 2026</p>
        <h2>1. Qué datos tratamos</h2>
        <ul>
          <li><b>De quienes usan Prospecta:</b> nombre, email, datos de la empresa y la configuración de la cuenta. Las contraseñas de las casillas de correo se guardan cifradas.</li>
          <li><b>De las empresas contactadas:</b> nombre comercial, rubro, dirección, teléfono, email, web y redes, obtenidos de <b>fuentes públicas</b> donde la propia empresa los publicó, y el historial de mensajes que se le enviaron.</li>
        </ul>
        <h2>2. Para qué los usamos</h2>
        <p>Sólo para que cada usuario pueda encontrar, contactar y hacer el seguimiento de posibles clientes. No vendemos ni cedemos datos a terceros. Los datos de cada empresa cliente están separados y nadie de otra empresa puede verlos.</p>
        <h2>3. Ley aplicable</h2>
        <p>Cumplimos la <b>Ley 25.326 de Protección de los Datos Personales</b> de Argentina. La Agencia de Acceso a la Información Pública, en su carácter de Órgano de Control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos.</p>
        <h2>4. Tus derechos</h2>
        <p>Podés pedir en cualquier momento <b>acceder</b> a tus datos, <b>corregirlos</b> o que los <b>eliminemos</b>. También podés pedir que no te escriban más:</p>
        <ul>
          <li>Desde el link "darse de baja" que trae cada mail, o respondiendo con la palabra <b>BAJA</b>.</li>
          <li>Escribiendo a {contacto(d)}, indicando tu email o el nombre de tu empresa. Respondemos en un plazo máximo de 10 días hábiles para el acceso y de 5 días hábiles para la corrección o eliminación.</li>
        </ul>
        <p>Cuando alguien pide la baja guardamos únicamente su email (o el dominio de su empresa) en una lista de "No contactar", para asegurarnos de no volver a escribirle.</p>
        <h2>5. Seguridad y conservación</h2>
        <p>Los datos se guardan en servidores con acceso restringido, cifrado y copias de seguridad. Los conservamos mientras la cuenta esté activa o hasta que se pida su eliminación.</p>
      </article>
    </Marco>
  )
}

/** Formulario público para la web de cada cuenta: lo que se manda entra como empresa nueva + tarea + aviso */
export function FormularioPublico() {
  const { token } = useParams()
  const embebido = new URLSearchParams(window.location.search).has('embebido')
  const [f, setF] = useState({ nombre: '', empresa: '', email: '', telefono: '', mensaje: '', web: '' })
  const [estado, setEstado] = useState('') // '' | enviando | ok | error
  const [error, setError] = useState('')
  async function enviar(e) {
    e.preventDefault()
    if (f.web) return setEstado('ok') // campo trampa para robots
    setEstado('enviando'); setError('')
    const { data, error } = await supabase.rpc('recibir_lead', { p_token: token, p_nombre: f.nombre, p_empresa: f.empresa, p_email: f.email, p_telefono: f.telefono, p_mensaje: f.mensaje })
    if (error || !data?.ok) { setEstado('error'); setError(data?.error || 'No pudimos mandar tu mensaje. Probá de nuevo en un rato.') } else setEstado('ok')
  }
  const cuerpo = estado === 'ok' ? (
    <div className="baja-ok"><CheckCircle2 size={34} /><h1>¡Gracias! Te vamos a contactar a la brevedad.</h1></div>
  ) : (
    <form onSubmit={enviar} className="form-publico">
      {!embebido && <h1>Escribinos</h1>}
      <label>Tu nombre<input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} required maxLength={120} /></label>
      <label>Empresa<input value={f.empresa} onChange={e => setF({ ...f, empresa: e.target.value })} maxLength={160} /></label>
      <label>Email<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} maxLength={160} /></label>
      <label>Teléfono / WhatsApp<input value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} maxLength={40} /></label>
      <label>¿En qué te podemos ayudar?<textarea rows={4} value={f.mensaje} onChange={e => setF({ ...f, mensaje: e.target.value })} maxLength={1500} required /></label>
      <input tabIndex={-1} autoComplete="off" value={f.web} onChange={e => setF({ ...f, web: e.target.value })} style={{ position: 'absolute', left: -9999 }} aria-hidden="true" />
      {estado === 'error' && <p style={{ color: 'var(--err)' }}><AlertCircle size={14} /> {error}</p>}
      <button className="btn primario ancho" disabled={estado === 'enviando'}>{estado === 'enviando' && <Loader2 size={15} className="spin" />} Enviar</button>
      <p className="muted chico">Usamos tus datos sólo para responderte.</p>
    </form>
  )
  return embebido ? <div style={{ padding: 16 }}>{cuerpo}</div> : <Marco>{cuerpo}</Marco>
}
