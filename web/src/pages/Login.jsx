import { useState } from 'react'
import { Eye, EyeOff, Loader2, Sparkles, ShieldCheck, Send, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'

export default function Login() {
  const codigoUrl = new URLSearchParams(window.location.search).get('invitacion') || ''
  const [modo, setModo] = useState(codigoUrl ? 'registro' : 'entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [codigo, setCodigo] = useState(codigoUrl.toUpperCase())
  const [ver, setVer] = useState(false)
  const [msg, setMsg] = useState('')
  const [cargando, setCargando] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setCargando(true); setMsg('')
    try {
      if (modo === 'registro') {
        const { data, error } = await supabase.functions.invoke('registro', { body: { email, password, nombre, codigo } })
        let err = data?.error || null
        if (error) { try { err = (await error.context.json()).error } catch { err = error.message } }
        if (err) throw new Error(err)
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : error.message)
      if (codigoUrl) window.history.replaceState(null, '', '/')
    } catch (e) {
      setMsg(e.message)
    }
    setCargando(false)
  }

  return (
    <div className="login">
      <section className="login-hero">
        <div className="marca"><span className="marca-logo">P</span>Prospecta</div>
        <h1>Conseguí clientes para tu estudio, de a uno y bien.</h1>
        <p>Negocios con Instagram activo y sin web, mensajes que escribe Claude con tu estilo, y un seguimiento ordenado. Vos revisás y enviás cada mensaje.</p>
        <div className="login-puntos">
          <div><Sparkles size={18} /> Borradores personalizados por negocio, con IA</div>
          <div><Send size={18} /> WhatsApp y email con un clic, siempre enviados por vos</div>
          <div><ShieldCheck size={18} /> Límite diario y opt-out para cuidar tu número</div>
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={enviar}>
          <h2>{modo === 'entrar' ? 'Hola de nuevo' : 'Crear tu cuenta'}</h2>
          <p>{modo === 'entrar' ? 'Entrá para seguir con tus prospectos.' : 'Necesitás el código de invitación de tu estudio.'}</p>
          {modo === 'registro' && (
            <>
              <label>Tu nombre<input value={nombre} onChange={e => setNombre(e.target.value)} required autoComplete="name" /></label>
              <label>Código de invitación<input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} required placeholder="MZA-XXXXXXXX" /></label>
            </>
          )}
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Contraseña
            <div className="campo-pass">
              <input type={ver ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'} style={{ marginTop: 6 }} />
              <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>{ver ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            {modo === 'registro' && <small>Mínimo 8 caracteres.</small>}
          </label>
          {msg && <div className="aviso error"><AlertCircle size={17} /><div>{msg}</div></div>}
          <button className="btn primario ancho" disabled={cargando} style={{ padding: '11px 14px' }}>
            {cargando && <Loader2 size={16} className="spin" />}{modo === 'entrar' ? 'Entrar' : 'Crear cuenta'}
          </button>
          <div className="alternar">
            {modo === 'entrar' ? '¿No tenés cuenta? ' : '¿Ya tenés cuenta? '}
            <button type="button" className="link" onClick={() => { setModo(modo === 'entrar' ? 'registro' : 'entrar'); setMsg('') }}>
              {modo === 'entrar' ? 'Crear una' : 'Entrar'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
