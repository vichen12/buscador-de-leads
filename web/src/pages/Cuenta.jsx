import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Sparkles, Loader2, IdCard, Store, Gauge, ShieldCheck, Plus, ArrowRight, Mail, Globe, Eye, EyeOff, LogOut, Paperclip } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { mensajeError } from '../lib/util.js'
import { Avatar, Cargando, useToast } from '../components/ui.jsx'
import { SeguridadCuenta } from '../components/Seguridad.jsx'

const CAMPOS = ['nombre', 'estudio', 'firma', 'email_contacto', 'portfolio_url', 'limite_diario', 'dias_seguimiento', 'instrucciones_ia']
const IDEAS_IA = ['Tuteá siempre', 'No hables de precios en el primer mensaje', 'Mencioná que respondemos en el día', 'Mensajes bien cortos', 'Ofrecé una visita o llamada sin compromiso']

export default function Cuenta() {
  const { perfil, refrescar, session, servicios, comercial } = useApp()
  const toast = useToast()
  const [f, setF] = useState(null)
  const [pass, setPass] = useState({ nueva: '', repetir: '' })
  const [verPass, setVerPass] = useState(false)
  const [guardando, setGuardando] = useState(false)
  // Se carga una sola vez por cuenta: si el perfil se refresca mientras escribís, no te pisa lo tipeado
  useEffect(() => { if (perfil && f?.id !== perfil.id) setF(perfil) }, [perfil])
  if (!f) return <Cargando />
  const c = k => e => setF({ ...f, [k]: e.target.type === 'number' || e.target.type === 'range' ? Number(e.target.value) : e.target.value })
  const cambios = CAMPOS.some(k => (f[k] ?? '') !== (perfil?.[k] ?? ''))
  const empresa = f.estudio || comercial?.respuestas?.empresa || ''

  async function guardar(e) {
    e?.preventDefault()
    setGuardando(true)
    const datos = Object.fromEntries(CAMPOS.map(k => [k, f[k]]))
    const { error } = await supabase.from('perfiles').update(datos).eq('id', f.id)
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

  const agregarIdea = idea => setF(x => ({ ...x, instrucciones_ia: [x.instrucciones_ia?.trim(), idea].filter(Boolean).join('. ') }))
  const firmaVista = f.firma?.trim() || [f.nombre, empresa, f.email_contacto].filter(Boolean).join('\n')

  return (
    <form onSubmit={guardar} className="cuenta">
      <section className="cuenta-cabecera">
        <Avatar nombre={f.nombre || session.user.email} grande />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1>{f.nombre || 'Mi cuenta'}</h1>
          <p className="muted">{session.user.email}</p>
          <div className="acciones" style={{ marginTop: 8 }}>
            {perfil?.es_admin && <span className="chip ia"><ShieldCheck size={12} /> Administrador</span>}
            {empresa && <span className="chip"><Store size={12} /> {empresa}</span>}
            <span className={'chip ' + (servicios.ia ? 'ok' : 'web')}><Sparkles size={12} /> {servicios.ia ? 'Claude conectado' : servicios.ia === false ? 'Claude sin clave' : 'Verificando Claude…'}</span>
          </div>
        </div>
        <button type="button" className="btn fantasma" onClick={() => supabase.auth.signOut()}><LogOut size={15} /> Salir</button>
      </section>

      <div className="cuenta-grid">
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3><IdCard size={16} /> Cómo te presentás</h3></div>
          <p className="muted chico ayuda">Claude usa estos datos para presentarte en tus mensajes.</p>
          <div className="form-grid">
            <label>Tu nombre<input value={f.nombre} onChange={c('nombre')} placeholder="Ej.: Vincenzo" /></label>
            <label>Empresa<input value={f.estudio} onChange={c('estudio')} placeholder={comercial?.respuestas?.empresa || 'Ej.: Bombas Cuyo'} /></label>
            <label>Email de contacto<input type="email" value={f.email_contacto} onChange={c('email_contacto')} /></label>
            <label>Web o portfolio <span className="muted">(opcional)</span><input value={f.portfolio_url} onChange={c('portfolio_url')} placeholder="tuempresa.com" /></label>
          </div>
          <div className="nota-info"><Mail size={15} /><span>La firma, la conexión de tu casilla y los archivos para adjuntar están en <Link to="/email">Email</Link>.</span></div>
        </section>

        <div className="cuenta-col">
          <section className="tarjeta">
            <div className="tarjeta-titulo"><h3><Store size={16} /> Tu negocio</h3><Link to="/negocio" className="chico">Editar <ArrowRight size={12} style={{ verticalAlign: -1 }} /></Link></div>
            {comercial?.estrategia?.resumen ? (
              <>
                <p className="resumen-corto">{comercial.estrategia.resumen}</p>
                <div className="acciones">
                  <span className="chip">{comercial.estrategia.rubros?.length ?? 0} rubros</span>
                  <span className="chip">{comercial.estrategia.zonas?.length ?? 0} zonas</span>
                  <span className="chip">{comercial.estrategia.filtros?.length ?? 0} filtros</span>
                </div>
              </>
            ) : (
              <>
                <p className="muted" style={{ marginTop: 0 }}>Contale a Claude qué vendés y a quién, y arma tu estrategia de búsqueda.</p>
                <Link className="btn primario" to="/negocio">Completar mi negocio <ArrowRight size={15} /></Link>
              </>
            )}
          </section>

          <section className="tarjeta">
            <div className="tarjeta-titulo"><h3><Sparkles size={16} /> Indicaciones para Claude</h3></div>
            <textarea rows={3} value={f.instrucciones_ia} onChange={c('instrucciones_ia')} placeholder="Qué tiene que respetar siempre en tus mensajes. Ej.: tuteá siempre; no hables de precios." />
            <div className="chips-sel chicos">
              {IDEAS_IA.filter(i => !f.instrucciones_ia?.includes(i)).map(i => <button type="button" key={i} className="chip-sel" onClick={() => agregarIdea(i)}><Plus size={12} /> {i}</button>)}
            </div>
          </section>
        </div>
      </div>

      <div className="cuenta-grid">
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3><Gauge size={16} /> Ritmo de contacto</h3></div>
          <p className="muted chico ayuda">De a pocos se cuida tu número de WhatsApp y tu reputación. La app no te deja pasar el límite.</p>
          <div className="slider-campo">
            <div><b>{f.limite_diario}</b> envíos por día</div>
            <input type="range" min={1} max={50} value={f.limite_diario} onChange={c('limite_diario')} aria-label="Límite diario de envíos" />
            <small className={f.limite_diario > 20 ? 'aviso-texto' : 'muted'}>{f.limite_diario > 20 ? 'Más de 20 por día aumenta el riesgo de que WhatsApp te bloquee.' : 'Recomendado: entre 10 y 15.'}</small>
          </div>
          <div className="slider-campo">
            <div>Seguimiento a los <b>{f.dias_seguimiento}</b> días</div>
            <input type="range" min={1} max={30} value={f.dias_seguimiento} onChange={c('dias_seguimiento')} aria-label="Días para el seguimiento" />
            <small className="muted">Si no te responden, te avisamos para escribirles de nuevo.</small>
          </div>
        </section>

        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3><KeyRound size={16} /> Contraseña</h3></div>
          <div className="campo-pass">
            <input type={verPass ? 'text' : 'password'} placeholder="Nueva contraseña (mínimo 8)" value={pass.nueva} onChange={e => setPass({ ...pass, nueva: e.target.value })} autoComplete="new-password" />
            <button type="button" className="btn chico fantasma" onClick={() => setVerPass(v => !v)} aria-label="Mostrar contraseña">{verPass ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          </div>
          <input style={{ marginTop: 8 }} type={verPass ? 'text' : 'password'} placeholder="Repetila" value={pass.repetir} onChange={e => setPass({ ...pass, repetir: e.target.value })} autoComplete="new-password" />
          <button type="button" className="btn oscuro" style={{ marginTop: 12 }} onClick={cambiarPass} disabled={!pass.nueva || !pass.repetir}>Cambiar contraseña</button>
          <div className="cuenta-datos">
            <div><Mail size={13} /> {session.user.email}</div>
            <div><Globe size={13} /> Zona horaria: {f.zona_horaria}</div>
          </div>
        </section>

        <SeguridadCuenta session={session} perfil={perfil} />
      </div>

      {cambios && (
        <div className="barra-guardar">
          <span>Tenés cambios sin guardar</span>
          <button type="button" className="btn fantasma" onClick={() => setF(perfil)}>Descartar</button>
          <button className="btn primario" disabled={guardando}>{guardando && <Loader2 size={15} className="spin" />} Guardar cambios</button>
        </div>
      )}
    </form>
  )
}
