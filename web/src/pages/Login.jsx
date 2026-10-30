import { useState } from 'react'
import { Eye, EyeOff, Loader2, Sparkles, ShieldCheck, Send, AlertCircle, Lock, Mail, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ver, setVer] = useState(false)
  const [msg, setMsg] = useState('')
  const [cargando, setCargando] = useState(false)
  const [olvido, setOlvido] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setCargando(true); setMsg('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setMsg(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos.' : error.message)
    setCargando(false)
  }

  return (
    <div className="login">
      <section className="login-hero">
        <div className="marca"><span className="marca-logo">P</span>Prospecta</div>
        <h1>Conseguí clientes para tu estudio, de a uno y bien.</h1>
        <p>Claude encuentra negocios sin web, te escribe los mensajes con tu estilo y te ordena el seguimiento. Vos revisás y enviás cada uno.</p>
        <div className="login-puntos">
          <div><Sparkles size={18} /> Búsqueda de negocios y borradores con Claude</div>
          <div><Send size={18} /> WhatsApp y email con un clic, siempre enviados por vos</div>
          <div><ShieldCheck size={18} /> Límite diario y opt-out para cuidar tu número</div>
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={enviar}>
          <span className="login-sello"><Lock size={13} /> Acceso privado</span>
          <h2>Hola de nuevo</h2>
          <p>Entrá con el email y la contraseña que te dio el administrador.</p>
          <label>Email
            <div className="campo-icono"><Mail size={16} />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" autoFocus placeholder="vos@estudio.com" />
            </div>
          </label>
          <label>Contraseña
            <div className="campo-pass campo-icono"><Lock size={16} />
              <input type={ver ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" />
              <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{ver ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
          </label>
          {msg && <div className="aviso error"><AlertCircle size={17} /><div>{msg}</div></div>}
          <button className="btn primario ancho btn-grande" disabled={cargando}>
            {cargando ? <Loader2 size={16} className="spin" /> : null} Entrar {!cargando && <ArrowRight size={16} />}
          </button>
          <div className="alternar">
            {olvido
              ? <span>Pedile al administrador que te genere una contraseña nueva desde su panel.</span>
              : <button type="button" className="link" onClick={() => setOlvido(true)}>¿Olvidaste tu contraseña?</button>}
          </div>
          <p className="login-pie">¿No tenés cuenta? Las cuentas las crea el administrador de tu estudio.</p>
        </form>
      </section>
    </div>
  )
}
