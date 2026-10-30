import { useEffect, useState } from 'react'
import { ShieldCheck, Loader2, KeyRound, Smartphone, Download, Trash2, History, Eye, EyeOff, LogOut } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { fecha } from '../lib/util.js'
import { Modal, useToast, useConfirmar } from './ui.jsx'
import Logo from './Logo.jsx'

/** Pantalla para poner una contraseña nueva, después de tocar el link del mail de recuperación */
export function NuevaClave({ onListo }) {
  const [a, setA] = useState(''); const [b, setB] = useState('')
  const [ver, setVer] = useState(false)
  const [msg, setMsg] = useState(''); const [cargando, setCargando] = useState(false)
  async function guardar(e) {
    e.preventDefault()
    if (a.length < 8) return setMsg('Tiene que tener al menos 8 caracteres.')
    if (a !== b) return setMsg('Las dos contraseñas no coinciden.')
    setCargando(true); setMsg('')
    const { error } = await supabase.auth.updateUser({ password: a })
    setCargando(false)
    if (error) setMsg(error.message); else onListo()
  }
  return (
    <div className="centro-pantalla">
      <form className="tarjeta" style={{ width: 'min(420px, 92vw)' }} onSubmit={guardar}>
        <Logo size={24} />
        <h2 style={{ margin: '18px 0 6px' }}>Elegí tu contraseña nueva</h2>
        <p className="muted">Mínimo 8 caracteres. Después entrás directo.</p>
        <label>Contraseña nueva<div className="campo-pass"><input type={ver ? 'text' : 'password'} value={a} onChange={e => setA(e.target.value)} autoFocus autoComplete="new-password" /><button type="button" onClick={() => setVer(v => !v)} aria-label="Mostrar">{ver ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
        <label>Repetila<input type={ver ? 'text' : 'password'} value={b} onChange={e => setB(e.target.value)} autoComplete="new-password" /></label>
        {msg && <p style={{ color: 'var(--err)' }}>{msg}</p>}
        <button className="btn primario ancho" disabled={cargando}>{cargando && <Loader2 size={15} className="spin" />} Guardar y entrar</button>
      </form>
    </div>
  )
}

/** Segundo paso del ingreso: el código de 6 dígitos de la app autenticadora */
export function DosPasos({ onListo }) {
  const [codigo, setCodigo] = useState(''); const [msg, setMsg] = useState(''); const [cargando, setCargando] = useState(false)
  async function verificar(e) {
    e.preventDefault()
    setCargando(true); setMsg('')
    const { data: f } = await supabase.auth.mfa.listFactors()
    const factor = f?.totp?.find(x => x.status === 'verified')
    if (!factor) { setCargando(false); return onListo() }
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: codigo.replace(/\s/g, '') })
    setCargando(false)
    if (error) setMsg('El código no es correcto o ya venció. Probá con el que aparece ahora.'); else onListo()
  }
  return (
    <div className="centro-pantalla">
      <form className="tarjeta" style={{ width: 'min(420px, 92vw)' }} onSubmit={verificar}>
        <Logo size={24} />
        <h2 style={{ margin: '18px 0 6px' }}><Smartphone size={20} style={{ verticalAlign: -3 }} /> Verificación en dos pasos</h2>
        <p className="muted">Abrí tu app autenticadora (Google Authenticator, Authy, 1Password…) y escribí el código de 6 dígitos de Prospecta.</p>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={codigo} onChange={e => setCodigo(e.target.value)} autoFocus placeholder="123 456" style={{ fontSize: 22, letterSpacing: 4, textAlign: 'center' }} />
        {msg && <p style={{ color: 'var(--err)' }}>{msg}</p>}
        <button className="btn primario ancho" style={{ marginTop: 12 }} disabled={cargando || codigo.replace(/\D/g, '').length !== 6}>{cargando && <Loader2 size={15} className="spin" />} Verificar</button>
        <button type="button" className="btn fantasma ancho" style={{ marginTop: 8 }} onClick={() => supabase.auth.signOut()}><LogOut size={15} /> Salir</button>
      </form>
    </div>
  )
}

const TABLAS_EXPORTAR = ['prospectos', 'contactos', 'mensajes', 'interacciones', 'respuestas', 'tareas', 'secuencias', 'inscripciones', 'clientes', 'busquedas', 'perfil_comercial', 'archivos']
const ACCIONES = {
  casilla_conectada: 'Conectó la casilla', casilla_desconectada: 'Desconectó la casilla', empresa_borrada: 'Borró una empresa', cliente_borrado: 'Borró un cliente',
  cliente_baja: 'Dio de baja a un cliente', cliente_permiso: 'Cambió el permiso de un cliente', usuario_cambiado: 'Cambió un usuario', exporto_datos: 'Descargó sus datos',
  activo_2fa: 'Activó la verificación en dos pasos', quito_2fa: 'Quitó la verificación en dos pasos',
}

/** Sección "Seguridad y datos" de Mi cuenta */
export function SeguridadCuenta({ session, perfil }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [factores, setFactores] = useState(null)
  const [alta, setAlta] = useState(null) // { id, qr, secreto }
  const [codigo, setCodigo] = useState('')
  const [trabajando, setTrabajando] = useState('')
  const [borrar, setBorrar] = useState(false)
  const [actividad, setActividad] = useState(null)

  const cargar = async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactores((data?.totp ?? []).filter(f => f.status === 'verified'))
  }
  useEffect(() => {
    cargar()
    supabase.from('auditoria').select('id, accion, detalle, created_at, owner_id').order('created_at', { ascending: false }).limit(15).then(({ data }) => setActividad(data ?? []))
  }, [])

  async function empezar2fa() {
    setTrabajando('2fa')
    // Si quedó un alta a medias, se limpia antes
    const { data: todos } = await supabase.auth.mfa.listFactors()
    for (const f of (todos?.all ?? []).filter(f => f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Prospecta ' + new Date().toLocaleDateString('es-AR') })
    setTrabajando('')
    if (error) return toast(error.message, 'error')
    setAlta({ id: data.id, qr: data.totp.qr_code, secreto: data.totp.secret }); setCodigo('')
  }
  async function confirmar2fa(e) {
    e.preventDefault()
    setTrabajando('verificar')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: alta.id, code: codigo.replace(/\s/g, '') })
    setTrabajando('')
    if (error) return toast('El código no es correcto. Probá con el que aparece ahora en la app.', 'error')
    await supabase.rpc('auditar', { p_accion: 'activo_2fa' })
    setAlta(null); toast('Listo: la próxima vez que entres te va a pedir el código.', 'ok'); cargar()
  }
  async function quitar2fa(f) {
    if (!(await confirmar({ titulo: '¿Quitar la verificación en dos pasos?', texto: 'Tu cuenta queda protegida sólo con la contraseña.', aceptar: 'Quitar', peligro: true }))) return
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id })
    if (error) return toast(error.message, 'error')
    await supabase.rpc('auditar', { p_accion: 'quito_2fa' })
    toast('Verificación en dos pasos quitada'); cargar()
  }

  async function exportar() {
    setTrabajando('exportar')
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const yo = session.user.id
      for (const t of TABLAS_EXPORTAR) {
        let filas = [], desde = 0
        for (;;) {
          const { data, error } = await supabase.from(t).select('*').eq('owner_id', yo).range(desde, desde + 999)
          if (error || !data?.length) break
          filas = filas.concat(data); desde += 1000
          if (data.length < 1000) break
        }
        zip.file(`${t}.json`, JSON.stringify(filas, null, 2))
      }
      zip.file('perfil.json', JSON.stringify({ ...perfil, email: session.user.email }, null, 2))
      zip.file('LEEME.txt', `Tus datos de Prospecta al ${new Date().toLocaleString('es-AR')}.\nCada archivo .json es una tabla. No incluye contraseñas.\n`)
      const blob = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `prospecta-mis-datos-${new Date().toISOString().slice(0, 10)}.zip`; a.click(); URL.revokeObjectURL(a.href)
      await supabase.rpc('auditar', { p_accion: 'exporto_datos' })
      toast('Listo: descargaste todos tus datos.', 'ok')
    } catch (e) { toast('No se pudo armar el archivo: ' + (e?.message ?? e), 'error') }
    setTrabajando('')
  }

  return (
    <section className="tarjeta">
      <div className="tarjeta-titulo"><h3><ShieldCheck size={16} /> Seguridad y datos</h3></div>

      <div className="fila-ajuste">
        <div><b>Verificación en dos pasos</b><div className="muted chico">Además de la contraseña, te pide un código de tu celular al entrar.</div></div>
        {factores === null ? <Loader2 size={16} className="spin" />
          : factores.length ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="consent si"><ShieldCheck size={11} /> Activada</span><button type="button" className="btn chico" onClick={() => quitar2fa(factores[0])}>Quitar</button></div>
          : <button type="button" className="btn chico oscuro" onClick={empezar2fa} disabled={trabajando === '2fa'}>{trabajando === '2fa' && <Loader2 size={14} className="spin" />} Activar</button>}
      </div>

      <div className="fila-ajuste">
        <div><b>Descargar mis datos</b><div className="muted chico">Un .zip con todas tus empresas, clientes, mensajes, respuestas y tareas.</div></div>
        <button type="button" className="btn chico" onClick={exportar} disabled={trabajando === 'exportar'}>{trabajando === 'exportar' ? <Loader2 size={14} className="spin" /> : <Download size={14} />} Descargar</button>
      </div>

      <div className="fila-ajuste">
        <div><b>Borrar mi cuenta</b><div className="muted chico">Se borran tu usuario y todos tus datos. No se puede deshacer.</div></div>
        <button type="button" className="btn chico peligro" onClick={() => setBorrar(true)}><Trash2 size={14} /> Borrar</button>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="chico fuerte" style={{ marginBottom: 6 }}><History size={13} style={{ verticalAlign: -2 }} /> Actividad reciente{perfil?.rol === 'admin' && perfil?.empresa_id ? ' del equipo' : ''}</div>
        {actividad === null ? <Loader2 size={15} className="spin" /> : !actividad.length ? <p className="muted chico">Todavía no hay movimientos registrados.</p> : (
          <ul className="lista-actividad">{actividad.map(a => <li key={a.id}><span>{ACCIONES[a.accion] ?? a.accion}{a.detalle ? <span className="muted"> · {a.detalle}</span> : ''}</span><small className="muted">{fecha(a.created_at)}</small></li>)}</ul>
        )}
      </div>

      {alta && (
        <Modal onCerrar={() => setAlta(null)} ancho={440}>
          <form onSubmit={confirmar2fa}>
            <h3 style={{ marginTop: 0 }}><Smartphone size={18} style={{ verticalAlign: -3 }} /> Activar verificación en dos pasos</h3>
            <ol className="chico" style={{ paddingLeft: 18 }}>
              <li>Abrí Google Authenticator, Authy o 1Password en tu celular.</li>
              <li>Escaneá este código (o cargá la clave a mano).</li>
              <li>Escribí el código de 6 dígitos que te muestra.</li>
            </ol>
            <div style={{ textAlign: 'center', margin: '10px 0' }}><img src={alta.qr} alt="Código QR para la app autenticadora" width={180} height={180} style={{ background: '#fff', borderRadius: 10 }} /></div>
            <p className="muted chico" style={{ textAlign: 'center', wordBreak: 'break-all' }}>Clave: <code>{alta.secreto}</code></p>
            <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="123 456" autoFocus style={{ fontSize: 20, letterSpacing: 4, textAlign: 'center' }} />
            <div className="acciones fin" style={{ marginTop: 12 }}><button type="button" className="btn" onClick={() => setAlta(null)}>Cancelar</button><button className="btn primario" disabled={trabajando === 'verificar' || codigo.replace(/\D/g, '').length !== 6}>{trabajando === 'verificar' && <Loader2 size={15} className="spin" />} Activar</button></div>
          </form>
        </Modal>
      )}
      {borrar && <BorrarCuenta email={session.user.email} onCerrar={() => setBorrar(false)} />}
    </section>
  )
}

function BorrarCuenta({ email, onCerrar }) {
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [borrando, setBorrando] = useState(false)
  async function borrar() {
    setBorrando(true)
    try {
      await llamarFuncion('admin-usuarios', { modo: 'borrar_mi_cuenta', confirmar: texto.trim().toLowerCase() })
      await supabase.auth.signOut()
    } catch (e) { toast(e.message, 'error'); setBorrando(false) }
  }
  return (
    <Modal onCerrar={onCerrar} ancho={460}>
      <h3 style={{ marginTop: 0, color: 'var(--err)' }}><Trash2 size={18} style={{ verticalAlign: -3 }} /> Borrar tu cuenta</h3>
      <p>Se borran tu usuario, tus empresas, clientes, mensajes, respuestas, secuencias, archivos y la conexión de tu email. <b>No se puede deshacer.</b></p>
      <p className="chico muted">Si querés guardar algo, primero tocá "Descargar mis datos".</p>
      <label>Para confirmar, escribí tu email (<b>{email}</b>)<input value={texto} onChange={e => setTexto(e.target.value)} autoComplete="off" /></label>
      <div className="acciones fin"><button type="button" className="btn" onClick={onCerrar}>Cancelar</button><button type="button" className="btn peligro" disabled={borrando || texto.trim().toLowerCase() !== email.toLowerCase()} onClick={borrar}>{borrando && <Loader2 size={15} className="spin" />} Borrar todo</button></div>
    </Modal>
  )
}
