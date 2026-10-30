import { useEffect, useMemo, useState } from 'react'
import { Bot, Crown, Building2, Users, Ticket, KeyRound, Plus, Copy, Pencil, Sparkles, MapPin, Cpu, Trash2, Loader2, CheckCircle2, Eye, EyeOff, UserPlus, RotateCcw } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { fecha, fechaHora, mensajeError } from '../lib/util.js'
import { Avatar, Esqueleto, Interruptor, Modal, Aviso, Contador, useConfirmar, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const MODELOS = [
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 — equilibrado (recomendado)'],
  ['claude-opus-5-5', 'Claude Opus 5.5 — máxima calidad'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 — más rápido y barato'],
]

export default function Admin() {
  const toast = useToast()
  const [tab, setTab] = useState('empresas')
  const [datos, setDatos] = useState(null)
  const [alta, setAlta] = useState(null)
  const [credenciales, setCredenciales] = useState(null)

  async function cargar() {
    const [e, u, k, ch] = await Promise.all([
      supabase.rpc('admin_empresas'),
      supabase.rpc('admin_usuarios'),
      supabase.rpc('admin_estado_claves'),
      supabase.rpc('admin_uso_chat'),
    ])
    const error = e.error || u.error || k.error
    if (error) toast(mensajeError(error), 'error')
    const chat = new Map((ch.data ?? []).map(x => [x.id, x]))
    setDatos({ empresas: e.data ?? [], usuarios: (u.data ?? []).map(x => ({ ...x, chat: chat.get(x.id) })), claves: k.data ?? [] })
  }
  useEffect(() => { cargar() }, [])

  if (!datos) return <Esqueleto />
  const { empresas, usuarios, claves } = datos
  const claveIA = claves.find(c => c.nombre === 'anthropic')
  const tabs = [
    ['empresas', 'Empresas', Building2, empresas.length],
    ['usuarios', 'Usuarios', Users, usuarios.length],
    ['claves', 'Claves y servicios', KeyRound, claveIA?.configurada ? null : '!'],
  ]
  const total = k => empresas.reduce((s, x) => s + Number(x[k] || 0), 0)

  return (
    <>
      <header className="cabecera">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Crown size={26} style={{ color: 'var(--acc)' }} /> Super admin</h1>
          <p>Dás de alta empresas y usuarios, habilitás o suspendés su acceso y cargás las claves que usa todo el sistema.</p>
        </div>
      </header>

      <div className="resumen-admin stagger">
        <Mini titulo="Empresas activas" valor={empresas.filter(e => e.activa).length} pie={`de ${empresas.length}`} icono={Building2} color="#8b2c3c" fondo="#fbeff1" />
        <Mini titulo="Usuarios" valor={usuarios.length} pie={`${usuarios.filter(u => !u.activo).length} suspendidos`} icono={Users} color="#1d4ed8" fondo="#ebf1ff" />
        <Mini titulo="Prospectos" valor={total('prospectos')} pie={`${total('clientes')} clientes`} icono={Ticket} color="#b45309" fondo="#fdf4e4" />
        <Mini titulo="Claude" valor={claveIA?.configurada ? 'Activo' : 'Sin clave'} pie={claveIA?.configurada ? `termina en …${claveIA.final}` : 'cargala en Claves'} icono={Sparkles} color={claveIA?.configurada ? '#15803d' : '#71717a'} fondo={claveIA?.configurada ? '#e9f7ee' : '#f1f1f4'} />
      </div>

      <div className="subtabs" role="tablist">
        {tabs.map(([k, label, Icono, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'activo' : ''} onClick={() => setTab(k)}>
            <Icono size={16} /> {label} {n !== null && n !== undefined && <span className={'chip' + (n === '!' ? ' mal' : '')}>{n}</span>}
          </button>
        ))}
      </div>

      <div key={tab} className="pagina">
        {tab === 'empresas' && <Empresas empresas={empresas} recargar={cargar} nuevoUsuario={emp => setAlta({ empresa_id: emp.id })} />}
        {tab === 'usuarios' && <Usuarios usuarios={usuarios} empresas={empresas} recargar={cargar} nuevoUsuario={() => setAlta({ empresa_id: empresas.find(e => e.activa)?.id ?? '' })} setCredenciales={setCredenciales} />}
        {tab === 'claves' && <Claves claves={claves} recargar={cargar} />}
      </div>
      {alta && <NuevoUsuario inicial={alta} empresas={empresas} onCerrar={() => setAlta(null)} onCreado={c => { setAlta(null); setCredenciales(c); cargar() }} />}
      {credenciales && <Credenciales {...credenciales} onCerrar={() => setCredenciales(null)} />}
    </>
  )
}

function Mini({ titulo, valor, pie, icono: Icono, color, fondo }) {
  return (
    <div className="kpi">
      <div className="kpi-top"><span>{titulo}</span><span className="kpi-icono" style={{ color, background: fondo }}><Icono size={16} /></span></div>
      <b style={typeof valor === 'string' ? { fontSize: '1.5rem' } : undefined}>{typeof valor === 'number' ? <Contador valor={valor} /> : valor}</b>
      <small>{pie}</small>
    </div>
  )
}

const copiar = async (toast, texto, msg) => { try { await navigator.clipboard.writeText(texto); toast(msg) } catch { toast(texto, 'info') } }

// ---------------- Empresas ----------------
function Empresas({ empresas, recargar, nuevoUsuario }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [edit, setEdit] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(ev) {
    ev.preventDefault()
    if (!edit.nombre.trim()) return
    setGuardando(true)
    const { data: id, error } = await supabase.rpc('admin_guardar_empresa', { p_id: edit.id ?? null, p_nombre: edit.nombre, p_contacto: edit.contacto, p_notas: edit.notas, p_activa: edit.activa ?? true })
    setGuardando(false)
    if (error) return toast(mensajeError(error), 'error')
    const nueva = !edit.id
    setEdit(null)
    toast(nueva ? `Empresa "${edit.nombre.trim()}" creada` : 'Cambios guardados')
    await recargar()
    if (nueva) nuevoUsuario({ id })
  }

  async function alternar(e) {
    if (e.activa && !(await confirmar({
      titulo: `¿Suspender a ${e.nombre}?`, peligro: true, aceptar: 'Suspender',
      texto: `Sus ${e.usuarios} usuario(s) dejan de poder entrar y no se pueden registrar nuevos con sus códigos. Los datos quedan guardados y podés reactivarla cuando quieras.`,
    }))) return
    const { error } = await supabase.rpc('admin_guardar_empresa', { p_id: e.id, p_nombre: e.nombre, p_contacto: e.contacto, p_notas: e.notas, p_activa: !e.activa })
    if (error) return toast(mensajeError(error), 'error')
    toast(e.activa ? `${e.nombre} suspendida` : `${e.nombre} habilitada`, e.activa ? 'info' : 'ok')
    recargar()
  }

  return (
    <>
      <div className="barra-herramientas" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Cada empresa tiene sus propios usuarios. Cada usuario ve sólo sus prospectos.</span>
        <button className="btn primario" onClick={() => setEdit({ nombre: '', contacto: '', notas: '' })}><Plus size={16} /> Nueva empresa</button>
      </div>
      {!empresas.length ? (
        <div className="tarjeta vacio"><div className="icono-grande"><Building2 size={26} /></div><h3>Todavía no hay empresas</h3><p>Creá la primera y después dale de alta a sus usuarios.</p></div>
      ) : (
        <div className="empresas-grid stagger">
          {empresas.map(e => (
            <article key={e.id} className={'empresa' + (e.activa ? '' : ' suspendida')} data-empresa={e.nombre}>
              <div className="empresa-cab">
                <Avatar nombre={e.nombre} className="cuadrado" />
                <div><b>{e.nombre}</b><span>{e.contacto || 'Sin contacto'} · desde {fecha(e.creada)}</span></div>
                <Interruptor on={e.activa} onCambiar={() => alternar(e)} etiqueta={(e.activa ? 'Suspender ' : 'Habilitar ') + e.nombre} />
              </div>
              <div className="metricas">
                <div><b>{e.usuarios}</b><span>usuarios</span></div>
                <div><b>{e.prospectos}</b><span>prospectos</span></div>
                <div><b>{e.enviados}</b><span>envíos</span></div>
                <div><b>{e.clientes}</b><span>clientes</span></div>
              </div>
              {e.notas && <p className="muted chico" style={{ margin: '0 0 12px' }}>{e.notas}</p>}
              <div className="acciones">
                <span className={'estado'} style={e.activa ? { color: 'var(--ok)', background: 'var(--ok-soft)' } : { color: 'var(--err)', background: 'var(--err-soft)' }}>{e.activa ? 'Habilitada' : 'Suspendida'}</span>
                <span className="espacio" />
                <button className="btn chico" onClick={() => setEdit({ ...e })}><Pencil size={14} /> Editar</button>
                <button className="btn chico oscuro" onClick={() => nuevoUsuario(e)} disabled={!e.activa}><UserPlus size={14} /> Agregar usuario</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {edit && (
        <Modal onCerrar={() => setEdit(null)}>
          <form onSubmit={guardar}>
            <h3>{edit.id ? 'Editar empresa' : 'Nueva empresa'}</h3>
            <p>{edit.id ? 'Los cambios se ven al instante.' : 'Después de crearla, le das de alta los usuarios.'}</p>
            <label>Nombre<input autoFocus required value={edit.nombre} onChange={ev => setEdit({ ...edit, nombre: ev.target.value })} placeholder="Ej.: Estudio Andes" /></label>
            <label>Contacto<input value={edit.contacto} onChange={ev => setEdit({ ...edit, contacto: ev.target.value })} placeholder="Nombre, mail o teléfono del responsable" /></label>
            <label>Notas internas<textarea rows={3} value={edit.notas} onChange={ev => setEdit({ ...edit, notas: ev.target.value })} placeholder="Plan, forma de pago, lo que quieras recordar" /></label>
            <div className="acciones fin">
              <button type="button" className="btn" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn primario" disabled={guardando || !edit.nombre.trim()}>{guardando && <Loader2 size={15} className="spin" />}{edit.id ? 'Guardar' : 'Crear empresa'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}

// ---------------- Usuarios ----------------
function Usuarios({ usuarios, empresas, recargar, nuevoUsuario, setCredenciales }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const { session } = useApp()
  const [q, setQ] = useState('')
  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? usuarios.filter(u => [u.nombre, u.email, u.empresa].some(x => x?.toLowerCase().includes(t))) : usuarios
  }, [usuarios, q])

  async function actualizar(u, cambios, msg) {
    const { error } = await supabase.rpc('admin_actualizar_usuario', { p_id: u.id, p_activo: cambios.activo ?? u.activo, p_empresa: 'empresa' in cambios ? cambios.empresa : u.empresa_id })
    if (error) return toast(mensajeError(error), 'error')
    toast(msg); recargar()
  }
  async function restablecer(u) {
    if (!(await confirmar({ titulo: `¿Generar una contraseña nueva para ${u.nombre || u.email}?`, texto: 'La actual deja de funcionar. Te mostramos la nueva para que se la pases.', aceptar: 'Generar contraseña' }))) return
    try {
      const r = await llamarFuncion('admin-usuarios', { modo: 'restablecer', id: u.id })
      setCredenciales({ nombre: u.nombre, email: r.email, password: r.password, nueva: false })
    } catch (e) { toast(e.message, 'error') }
  }
  async function alternar(u) {
    if (u.activo && !(await confirmar({ titulo: `¿Suspender a ${u.nombre || u.email}?`, texto: 'No va a poder entrar hasta que lo reactives. Sus datos quedan guardados.', peligro: true, aceptar: 'Suspender' }))) return
    actualizar(u, { activo: !u.activo }, u.activo ? 'Usuario suspendido' : 'Usuario reactivado')
  }

  return (
    <section className="tarjeta sin-pad">
      <div className="barra-herramientas" style={{ padding: '16px 18px 0', marginBottom: 12 }}>
        <div className="buscador"><SearchIcon /><input placeholder="Buscar por nombre, email o empresa" value={q} onChange={e => setQ(e.target.value)} /></div>
        <button className="btn primario" onClick={nuevoUsuario}><UserPlus size={16} /> Nuevo usuario</button>
      </div>
      <div className="scroll-x">
        <table className="tabla">
          <thead><tr><th>Persona</th><th>Empresa</th><th>Prospectos</th><th>Envíos</th><th>Clientes</th><th title="Consultas al asistente hoy / límite diario">Asistente IA</th><th>Último ingreso</th><th>Acceso</th></tr></thead>
          <tbody>
            {lista.map(u => {
              const yo = u.id === session.user.id
              return (
                <tr key={u.id} className={u.activo ? '' : 'apagado'}>
                  <td>
                    <div className="negocio" style={{ minWidth: 220 }}>
                      <Avatar nombre={u.nombre || u.email} />
                      <div style={{ minWidth: 0 }}>
                        <span className="fuerte" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{u.nombre || '—'} {u.es_admin && <span className="chip ia"><Crown size={11} /> admin</span>}{yo && <span className="chip">vos</span>}</span>
                        <div className="muted chico">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ minWidth: 180 }}>
                    <select value={u.empresa_id ?? ''} aria-label={'Empresa de ' + (u.nombre || u.email)} onChange={e => actualizar(u, { empresa: e.target.value || null }, 'Empresa actualizada')} style={{ padding: '6px 30px 6px 10px' }}>
                      <option value="">Sin empresa</option>
                      {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.activa ? '' : ' (suspendida)'}</option>)}
                    </select>
                  </td>
                  <td>{u.prospectos}</td><td>{u.enviados}</td><td>{u.clientes}</td>
                  <td><LimiteChat u={u} onGuardar={async v => {
                    const { error } = await supabase.rpc('admin_limite_chat', { p_id: u.id, p_limite: v })
                    if (error) return toast(mensajeError(error), 'error')
                    toast(v === null ? 'Vuelve al límite general' : `Límite del asistente: ${v} por día`); recargar()
                  }} /></td>
                  <td className="nowrap muted">{u.ultimo_ingreso ? fechaHora(u.ultimo_ingreso) : 'Nunca'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <Interruptor on={u.activo} disabled={yo} onCambiar={() => alternar(u)} etiqueta={(u.activo ? 'Suspender a ' : 'Reactivar a ') + (u.nombre || u.email)} />
                      {!yo && <button className="btn chico fantasma" onClick={() => restablecer(u)} title="Generar contraseña nueva" aria-label={'Nueva contraseña para ' + (u.nombre || u.email)}><RotateCcw size={14} /></button>}
                    </div>
                  </td>
                </tr>
              )
            })}
            {!lista.length && <tr><td colSpan={8} className="muted centrado" style={{ padding: 30 }}>No hay usuarios{q && ' con esa búsqueda'}.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  )
}
function LimiteChat({ u, onGuardar }) {
  const [v, setV] = useState(u.chat?.limite_propio ?? '')
  useEffect(() => { setV(u.chat?.limite_propio ?? '') }, [u.chat?.limite_propio])
  const guardar = () => {
    const nuevo = v === '' ? null : Math.max(0, Math.min(1000, Number(v) || 0))
    if (nuevo !== (u.chat?.limite_propio ?? null)) onGuardar(nuevo)
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
      <span className="chico"><b>{u.chat?.usados_hoy ?? 0}</b> / {u.chat?.limite ?? '—'}</span>
      <input type="number" min={0} max={1000} value={v} placeholder="gral." title="Límite diario propio (vacío = el general)"
        aria-label={'Límite del asistente de ' + (u.nombre || u.email)} style={{ width: 70, padding: '5px 8px' }}
        onChange={e => setV(e.target.value)} onBlur={guardar} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} />
    </div>
  )
}

const SearchIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>

// ---------------- Alta de usuarios ----------------
function NuevoUsuario({ inicial, empresas, onCerrar, onCreado }) {
  const toast = useToast()
  const [f, setF] = useState({ nombre: '', email: '', empresa_id: inicial.empresa_id ?? '' })
  const [creando, setCreando] = useState(false)
  async function crear(e) {
    e.preventDefault()
    setCreando(true)
    try {
      const r = await llamarFuncion('admin-usuarios', { modo: 'crear', ...f, empresa_id: f.empresa_id || null })
      toast(`Cuenta de ${f.nombre} creada`)
      onCreado({ nombre: f.nombre, email: r.email, password: r.password, nueva: true })
    } catch (err) { toast(err.message, 'error') }
    setCreando(false)
  }
  return (
    <Modal onCerrar={onCerrar}>
      <form onSubmit={crear}>
        <h3>Nuevo usuario</h3>
        <p>Creamos la cuenta con una contraseña inicial que te mostramos una sola vez para que se la pases.</p>
        <label>Nombre<input autoFocus required value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Marta Gómez" /></label>
        <label>Email<input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="marta@estudio.com" /></label>
        <label>Empresa
          <select value={f.empresa_id} onChange={e => setF({ ...f, empresa_id: e.target.value })} aria-label="Empresa del usuario">
            <option value="">Sin empresa</option>
            {empresas.map(e => <option key={e.id} value={e.id} disabled={!e.activa}>{e.nombre}{e.activa ? '' : ' (suspendida)'}</option>)}
          </select>
        </label>
        <div className="acciones fin">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario" disabled={creando}>{creando ? <Loader2 size={15} className="spin" /> : <UserPlus size={15} />} Crear cuenta</button>
        </div>
      </form>
    </Modal>
  )
}

function Credenciales({ nombre, email, password, nueva, onCerrar }) {
  const toast = useToast()
  const link = window.location.origin
  const mensaje = `Hola${nombre ? ' ' + nombre.split(' ')[0] : ''}! ${nueva ? 'Te creé una cuenta en Prospecta' : 'Te generé una contraseña nueva para Prospecta'}.\n\nEntrá en: ${link}\nEmail: ${email}\nContraseña: ${password}\n\nCuando entres, cambiala en Mi cuenta.`
  return (
    <Modal onCerrar={onCerrar}>
      <div className="icono-grande" style={{ background: 'var(--ok-soft)', color: 'var(--ok)', margin: '0 0 14px' }}><CheckCircle2 size={26} /></div>
      <h3>{nueva ? 'Cuenta creada' : 'Contraseña nueva'}</h3>
      <p>Pasale estos datos a {nombre || 'la persona'}. <b>La contraseña no se vuelve a mostrar.</b></p>
      <label>Email<input readOnly value={email} onFocus={e => e.target.select()} /></label>
      <label>Contraseña<input readOnly value={password} onFocus={e => e.target.select()} aria-label="Contraseña generada" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 15, letterSpacing: '.04em' }} /></label>
      <div className="acciones fin">
        <button className="btn" onClick={() => copiar(toast, password, 'Contraseña copiada')}><Copy size={15} /> Copiar contraseña</button>
        <button className="btn primario" onClick={() => copiar(toast, mensaje, 'Mensaje copiado: pegalo en WhatsApp o mail')}><Copy size={15} /> Copiar mensaje con el acceso</button>
      </div>
    </Modal>
  )
}

// ---------------- Claves ----------------
function LimiteGeneral({ actual, guardando, onGuardar }) {
  const [n, setN] = useState(actual)
  useEffect(() => setN(actual), [actual])
  return (
    <div className="clave-fila" data-clave="limite_chat">
      <span className="clave-icono" style={{ color: '#0f766e', background: '#e6f6f3' }}><Bot size={20} /></span>
      <div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>Límite del Asistente IA</b><span className="chip">{actual} consultas por día por usuario</span></div>
        <div className="muted chico" style={{ marginTop: 3 }}>Vale para todos. A un usuario puntual le podés poner otro límite en la pestaña Usuarios.</div>
        <form onSubmit={e => { e.preventDefault(); onGuardar(Math.max(0, Math.min(1000, Number(n) || 0))) }}>
          <input type="number" min={0} max={1000} value={n} onChange={e => setN(e.target.value)} aria-label="Límite diario del asistente" style={{ flex: '0 1 160px' }} />
          <button className="btn oscuro" disabled={guardando || Number(n) === actual}>Guardar límite</button>
        </form>
      </div>
    </div>
  )
}

const SERVICIOS = [
  { nombre: 'anthropic', titulo: 'Claude (Anthropic)', icono: Sparkles, color: '#8b2c3c', fondo: '#fbeff1', placeholder: 'sk-ant-api03-…',
    ayuda: <>Busca negocios, escribe los mensajes y responde en el Asistente. Creala en <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> → API Keys.</> },
]

function Claves({ claves, recargar }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const { refrescarServicios, servicios } = useApp()
  const [valores, setValores] = useState({})
  const [ver, setVer] = useState({})
  const [guardando, setGuardando] = useState(null)
  const estado = n => claves.find(c => c.nombre === n) ?? {}
  const modeloActual = estado('modelo_ia').final || 'claude-sonnet-5-5'
  const [modelo, setModelo] = useState(modeloActual)

  async function guardar(nombre, valor, msg) {
    setGuardando(nombre)
    const { error } = await supabase.rpc('admin_guardar_clave', { p_nombre: nombre, p_valor: valor })
    setGuardando(null)
    if (error) return toast(mensajeError(error), 'error')
    setValores(v => ({ ...v, [nombre]: '' }))
    toast(msg)
    await Promise.all([recargar(), refrescarServicios()])
  }
  async function quitar(s) {
    if (!(await confirmar({ titulo: `¿Quitar la clave de ${s.titulo}?`, texto: 'El sistema deja de usar ese servicio hasta que cargues otra.', peligro: true, aceptar: 'Quitar' }))) return
    guardar(s.nombre, '', 'Clave quitada')
  }

  return (
    <section className="tarjeta">
      <Aviso tipo="info">Las claves se guardan en la base, sólo las leen las funciones del servidor y nunca se muestran completas (ni a vos). Valen para todas las empresas.</Aviso>
      {SERVICIOS.map(s => {
        const e = estado(s.nombre)
        const Icono = s.icono
        const v = valores[s.nombre] ?? ''
        const sospechosa = s.nombre === 'anthropic' && v && !v.trim().startsWith('sk-ant-')
        return (
          <div className="clave-fila" key={s.nombre} data-clave={s.nombre}>
            <span className="clave-icono" style={{ color: s.color, background: s.fondo }}><Icono size={20} /></span>
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b>{s.titulo}</b>
                {e.configurada
                  ? <span className="chip ok"><CheckCircle2 size={12} /> Cargada · termina en …{e.final}</span>
                  : <span className="chip">Sin cargar</span>}
                {e.actualizado && <span className="muted chico">actualizada {fechaHora(e.actualizado)}</span>}
              </div>
              <div className="muted chico" style={{ marginTop: 3 }}>{s.ayuda}</div>
              <form onSubmit={ev => { ev.preventDefault(); if (v.trim()) guardar(s.nombre, v, `Clave de ${s.titulo} guardada`) }}>
                <div className="campo-pass" style={{ flex: '1 1 260px' }}>
                  <input type={ver[s.nombre] ? 'text' : 'password'} autoComplete="off" spellCheck={false} placeholder={e.configurada ? 'Pegá una nueva para reemplazarla' : s.placeholder}
                    value={v} onChange={ev => setValores({ ...valores, [s.nombre]: ev.target.value })} aria-label={'Clave de ' + s.titulo} style={{ width: '100%' }} />
                  <button type="button" onClick={() => setVer({ ...ver, [s.nombre]: !ver[s.nombre] })} aria-label="Mostrar u ocultar">{ver[s.nombre] ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
                <button className="btn primario" disabled={!v.trim() || guardando === s.nombre}>{guardando === s.nombre ? <Loader2 size={15} className="spin" /> : <KeyRound size={15} />} Guardar</button>
                {e.configurada && <button type="button" className="btn peligro" onClick={() => quitar(s)}><Trash2 size={15} /> Quitar</button>}
              </form>
              {sospechosa && <small style={{ color: 'var(--warn)', display: 'block', marginTop: 6 }}>Las claves de Claude suelen empezar con “sk-ant-”. Revisá que la hayas copiado entera.</small>}
            </div>
          </div>
        )
      })}

      <div className="clave-fila" data-clave="modelo_ia">
        <span className="clave-icono" style={{ color: '#7c3aed', background: '#f1ebff' }}><Cpu size={20} /></span>
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><b>Modelo de Claude</b><span className="chip">{modeloActual}</span></div>
          <div className="muted chico" style={{ marginTop: 3 }}>Qué modelo escribe los mensajes. Sonnet alcanza y sobra para esto.</div>
          <form onSubmit={ev => { ev.preventDefault(); guardar('modelo_ia', modelo, 'Modelo actualizado') }}>
            <select value={MODELOS.some(m => m[0] === modelo) ? modelo : '__otro'} onChange={e => setModelo(e.target.value === '__otro' ? '' : e.target.value)} aria-label="Modelo de Claude">
              {MODELOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              <option value="__otro">Otro (escribir el id)…</option>
            </select>
            {!MODELOS.some(m => m[0] === modelo) && <input value={modelo} onChange={e => setModelo(e.target.value.trim())} placeholder="id del modelo" aria-label="Id del modelo" />}
            <button className="btn oscuro" disabled={!modelo || modelo === modeloActual || guardando === 'modelo_ia'}>Guardar modelo</button>
          </form>
        </div>
      </div>

      <LimiteGeneral actual={Number(estado('limite_chat').final) || 30} guardando={guardando === 'limite_chat'} onGuardar={n => guardar('limite_chat', String(n), `Límite del asistente: ${n} consultas por día`)} />

      <div className="estado-servicio" style={{ marginTop: 10 }}>
        <span className="punto" style={{ background: servicios.ia ? '#22c55e' : servicios.ia === false ? '#f59e0b' : '#a1a1aa', width: 10, height: 10 }} />
        <div><b>Estado en vivo</b><span>Claude: {servicios.ia ? `conectado (${servicios.modelo || modeloActual})` : 'sin clave'} · lo usan el Asistente, la búsqueda de negocios y los borradores</span></div>
        <span className="espacio" />
        <button className="btn chico" onClick={async () => { await refrescarServicios(); toast('Estado actualizado', 'info') }}>Volver a verificar</button>
      </div>
    </section>
  )
}
