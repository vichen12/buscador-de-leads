import { useEffect, useState } from 'react'
import { Save, KeyRound, Sparkles, MapPin, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { mensajeError } from '../lib/util.js'
import { Avatar, Cargando, useToast } from '../components/ui.jsx'

export default function Cuenta() {
  const { perfil, refrescar, session, servicios } = useApp()
  const toast = useToast()
  const [f, setF] = useState(null)
  const [pass, setPass] = useState({ nueva: '', repetir: '' })
  const [guardando, setGuardando] = useState(false)
  // Se carga una sola vez por cuenta: si el perfil se refresca mientras escribís, no te pisa lo tipeado
  useEffect(() => { if (perfil && f?.id !== perfil.id) setF(perfil) }, [perfil])
  if (!f) return <Cargando />
  const c = k => e => setF({ ...f, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value })

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    const { nombre, estudio, firma, email_contacto, portfolio_url, limite_diario, dias_seguimiento, instrucciones_ia } = f
    const { error } = await supabase.from('perfiles')
      .update({ nombre, estudio, firma, email_contacto, portfolio_url, limite_diario, dias_seguimiento, instrucciones_ia }).eq('id', f.id)
    setGuardando(false)
    if (error) toast(mensajeError(error), 'error'); else { toast('Cambios guardados'); refrescar() }
  }

  async function cambiarPass(e) {
    e.preventDefault()
    if (pass.nueva.length < 8) return toast('La contraseña debe tener al menos 8 caracteres', 'error')
    if (pass.nueva !== pass.repetir) return toast('Las contraseñas no coinciden', 'error')
    const { error } = await supabase.auth.updateUser({ password: pass.nueva })
    if (error) toast(error.message, 'error'); else { toast('Contraseña actualizada'); setPass({ nueva: '', repetir: '' }) }
  }

  const Estado = ({ ok, si, no }) => (
    <div className="estado-ia"><span className="punto" style={{ background: ok === null ? '#a1a1aa' : ok ? '#22c55e' : '#f59e0b' }} />
      <span>{ok === null ? 'Verificando…' : ok ? si : no}</span></div>
  )

  return (
    <>
      <header className="cabecera">
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <Avatar nombre={f.nombre || session.user.email} grande />
          <div><h1>Mi cuenta</h1><p>{session.user.email}{perfil?.es_admin ? ' · Administrador' : ''}</p></div>
        </div>
      </header>

      <form className="tarjeta" onSubmit={guardar}>
        <div className="seccion">
          <div><h3>Tu firma</h3><p>Así te presentás en los mensajes. Claude la usa en cada borrador.</p></div>
          <div>
            <div className="form-grid">
              <label>Tu nombre<input value={f.nombre} onChange={c('nombre')} /></label>
              <label>Estudio<input value={f.estudio} onChange={c('estudio')} placeholder="Ej.: Estudio Dalla" /></label>
              <label>Email de contacto<input type="email" value={f.email_contacto} onChange={c('email_contacto')} /></label>
              <label>Portfolio (opcional)<input value={f.portfolio_url} onChange={c('portfolio_url')} placeholder="tuestudio.com/trabajos" /></label>
            </div>
            <label>Firma de email<textarea rows={3} value={f.firma} onChange={c('firma')} placeholder={'Vincenzo\nEstudio …\n261 …'} /></label>
          </div>
        </div>
        <div className="seccion">
          <div><h3>Claude</h3><p>Indicaciones que la IA respeta en todos tus mensajes.</p></div>
          <div>
            <label>Indicaciones para la IA<textarea rows={3} value={f.instrucciones_ia} onChange={c('instrucciones_ia')}
              placeholder="Ej.: mencioná que hacemos la web en 2 semanas; no hables de precios; tuteá siempre." /></label>
          </div>
        </div>
        <div className="seccion">
          <div><h3>Ritmo de contacto</h3><p>Para cuidar tu número y tu reputación. La base no deja pasar el límite.</p></div>
          <div className="form-grid">
            <label>Límite diario de envíos<input type="number" min={1} max={100} value={f.limite_diario} onChange={c('limite_diario')} /><small>Recomendado: 10 a 15.</small></label>
            <label>Seguimiento a los (días)<input type="number" min={1} max={60} value={f.dias_seguimiento} onChange={c('dias_seguimiento')} /></label>
          </div>
        </div>
        <div className="acciones fin"><button className="btn primario" disabled={guardando}>{guardando ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Guardar cambios</button></div>
      </form>

      <div className="grilla-2">
        <form className="tarjeta" onSubmit={cambiarPass}>
          <div className="tarjeta-titulo"><h3><KeyRound size={16} /> Cambiar contraseña</h3></div>
          <label>Nueva contraseña<input type="password" value={pass.nueva} onChange={e => setPass({ ...pass, nueva: e.target.value })} autoComplete="new-password" minLength={8} required /></label>
          <label>Repetir<input type="password" value={pass.repetir} onChange={e => setPass({ ...pass, repetir: e.target.value })} autoComplete="new-password" required /></label>
          <button className="btn oscuro">Actualizar contraseña</button>
        </form>
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3><Sparkles size={16} /> Servicios</h3></div>
          <p className="muted chico" style={{ marginTop: 0 }}>Claude escribe y reescribe los mensajes</p>
          <Estado ok={servicios.ia} si={`Claude conectado (${servicios.modelo || 'IA'})`} no="Sin clave de Claude: se usan plantillas. La carga el super admin en su panel (Claves y servicios)." />
          <p className="muted chico" style={{ margin: '16px 0 8px', display: 'flex', gap: 6, alignItems: 'center' }}><MapPin size={14} /> Búsqueda en Google</p>
          <Estado ok={servicios.places} si="Google Places conectado" no="Sin clave de Google Places: la carga el super admin en su panel para usar Buscar." />
        </section>
      </div>
    </>
  )
}
