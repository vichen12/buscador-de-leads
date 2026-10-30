import { useEffect, useMemo, useState } from 'react'
import { Bot, Crown, Building2, Users, Ticket, KeyRound, Plus, Copy, Link2, Pencil, Sparkles, MapPin, Cpu, Trash2, Loader2, CheckCircle2, Eye, EyeOff, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fecha, fechaHora, mensajeError } from '../lib/util.js'
import { Avatar, Esqueleto, Interruptor, Modal, Aviso, Contador, useConfirmar, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const nuevoCodigo = () => 'MZA-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('')
const linkInvitacion = c => `${window.location.origin}/?invitacion=${c}`
const MODELOS = [
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 — equilibrado (recomendado)'],
  ['claude-opus-5-5', 'Claude Opus 5.5 — máxima calidad'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 — más rápido y barato'],
]

export default function Admin() {
  const toast = useToast()
  const [tab, setTab] = useState('empresas')
  const [datos, setDatos] = useState(null)

  async function cargar() {
    const [e, u, c, k, ch] = await Promise.all([
      supabase.rpc('admin_empresas'),
      supabase.rpc('admin_usuarios'),
      supabase.from('codigos_invitacion').select('*').order('created_at', { ascending: false }),
      supabase.rpc('admin_estado_claves'),
      supabase.rpc('admin_uso_chat'),
    ])
    const error = e.error || u.error || c.error || k.error
    if (error) toast(mensajeError(error), 'error')
    const chat = new Map((ch.data ?? []).map(x => [x.id, x]))
    setDatos({ empresas: e.data ?? [], usuarios: (u.data ?? []).map(x => ({ ...x, chat: chat.get(x.id) })), codigos: c.data ?? [], claves: k.data ?? [] })
  }
  useEffect(() => { cargar() }, [])

  if (!datos) return <Esqueleto />
  const { empresas, usuarios, codigos, claves } = datos
  const claveIA = claves.find(c => c.nombre === 'anthropic')
  const tabs = [
    ['empresas', 'Empresas', Building2, empresas.length],
    ['usuarios', 'Usuarios', Users, usuarios.length],
    ['codigos', 'Invitaciones', Ticket, codigos.filter(c => c.activo && c.usos < c.usos_max).length],
    ['claves', 'Claves y servicios', KeyRound, claveIA?.configurada ? null : '!'],
  ]
  const total = k => empresas.reduce((s, x) => s + Number(x[k] || 0), 0)

  return (
    <>
      <header className="cabecera">
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Crown size={26} style={{ color: 'var(--acc)' }} /> Super admin</h1>
          <p>Dás de alta empresas, habilitás o suspendés su acceso y cargás las claves que usa todo el sistema.</p>
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
        {tab === 'empresas' && <Empresas empresas={empresas} recargar={cargar} />}
        {tab === 'usuarios' && <Usuarios usuarios={usuarios} empresas={empresas} recargar={cargar} />}
        {tab === 'codigos' && <Codigos codigos={codigos} empresas={empresas} recargar={cargar} />}
        {tab === 'claves' && <Claves claves={claves} recargar={cargar} />}
      </div>
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
function Empresas({ empresas, recargar }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [edit, setEdit] = useState(null)
  const [invitacion, setInvitacion] = useState(null)
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
    if (nueva) crearInvitacion({ id, nombre: edit.nombre.trim() })
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

  async function crearInvitacion(e) {
    const codigo = nuevoCodigo()
    const { error } = await supabase.from('codigos_invitacion').insert({ codigo, descripcion: e.nombre, usos_max: 10, empresa_id: e.id })
    if (error) return toast(mensajeError(error), 'error')
    setInvitacion({ codigo, empresa: e.nombre })
    recargar()
  }

  return (
    <>
      <div className="barra-herramientas" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Cada empresa tiene sus propios usuarios. Cada usuario ve sólo sus prospectos.</span>
        <button className="btn primario" onClick={() => setEdit({ nombre: '', contacto: '', notas: '' })}><Plus size={16} /> Nueva empresa</button>
      </div>
      {!empresas.length ? (
        <div className="tarjeta vacio"><div className="icono-grande"><Building2 size={26} /></div><h3>Todavía no hay empresas</h3><p>Creá la primera y te damos el link de invitación para mandarle.</p></div>
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
                <button className="btn chico oscuro" onClick={() => crearInvitacion(e)} disabled={!e.activa}><UserPlus size={14} /> Invitar</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {edit && (
        <Modal onCerrar={() => setEdit(null)}>
          <form onSubmit={guardar}>
            <h3>{edit.id ? 'Editar empresa' : 'Nueva empresa'}</h3>
            <p>{edit.id ? 'Los cambios se ven al instante.' : 'Al crearla te damos un código de invitación para que se registren sus usuarios.'}</p>
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
      {invitacion && <InvitacionLista {...invitacion} onCerrar={() => setInvitacion(null)} />}
    </>
  )
}

function InvitacionLista({ codigo, empresa, onCerrar }) {
  const toast = useToast()
  return (
    <Modal onCerrar={onCerrar}>
      <div className="icono-grande" style={{ background: 'var(--ok-soft)', color: 'var(--ok)', margin: '0 0 14px' }}><CheckCircle2 size={26} /></div>
      <h3>Invitación lista para {empresa}</h3>
      <p>Mandale este link. Al abrirlo, el código ya viene cargado y sólo tiene que elegir su email y contraseña. Sirve para 10 personas.</p>
      <label>Código<input readOnly value={codigo} onFocus={e => e.target.select()} /></label>
      <label>Link<input readOnly value={linkInvitacion(codigo)} onFocus={e => e.target.select()} /></label>
      <div className="acciones fin">
        <button className="btn" onClick={() => copiar(toast, codigo, 'Código copiado')}><Copy size={15} /> Copiar código</button>
        <button className="btn primario" onClick={() => copiar(toast, linkInvitacion(codigo), 'Link copiado')}><Link2 size={15} /> Copiar link</button>
      </div>
    </Modal>
  )
}

// ---------------- Usuarios ----------------
function Usuarios({ usuarios, empresas, recargar }) {
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
  async function alternar(u) {
    if (u.activo && !(await confirmar({ titulo: `¿Suspender a ${u.nombre || u.email}?`, texto: 'No va a poder entrar hasta que lo reactives. Sus datos quedan guardados.', peligro: true, aceptar: 'Suspender' }))) return
    actualizar(u, { activo: !u.activo }, u.activo ? 'Usuario suspendido' : 'Usuario reactivado')
  }

  return (
    <section className="tarjeta sin-pad">
      <div className="barra-herramientas" style={{ padding: '16px 18px 0', marginBottom: 12 }}>
        <div className="buscador"><SearchIcon /><input placeholder="Buscar por nombre, email o empresa" value={q} onChange={e => setQ(e.target.value)} /></div>
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
                  <td><Interruptor on={u.activo} disabled={yo} onCambiar={() => alternar(u)} etiqueta={(u.activo ? 'Suspender a ' : 'Reactivar a ') + (u.nombre || u.email)} /></td>
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

// ---------------- Códigos ----------------
function Codigos({ codigos, empresas, recargar }) {
  const toast = useToast()
  const [modal, setModal] = useState(null)
  const nombreEmpresa = id => empresas.find(e => e.id === id)?.nombre

  async function crear(ev) {
    ev.preventDefault()
    if (!modal.empresa_id) return toast('Elegí a qué empresa pertenece la invitación', 'error')
    const { error } = await supabase.from('codigos_invitacion').insert({ codigo: modal.codigo, descripcion: modal.descripcion, usos_max: Number(modal.usos_max) || 1, empresa_id: modal.empresa_id })
    if (error) return toast(mensajeError(error), 'error')
    toast('Invitación creada'); setModal(null); recargar()
  }
  async function alternar(c) {
    const { error } = await supabase.from('codigos_invitacion').update({ activo: !c.activo }).eq('codigo', c.codigo)
    if (error) toast(mensajeError(error), 'error'); else { toast(c.activo ? 'Código desactivado' : 'Código activado'); recargar() }
  }

  return (
    <>
      <div className="barra-herramientas" style={{ justifyContent: 'space-between' }}>
        <span className="muted">Con un código, la persona se registra sola y queda dentro de esa empresa.</span>
        <button className="btn primario" disabled={!empresas.length} onClick={() => setModal({ codigo: nuevoCodigo(), descripcion: '', usos_max: 5, empresa_id: empresas.find(e => e.activa)?.id ?? '' })}><Plus size={16} /> Nueva invitación</button>
      </div>
      <section className="tarjeta sin-pad">
        <div className="scroll-x">
          <table className="tabla">
            <thead><tr><th>Código</th><th>Empresa</th><th>Para</th><th>Usos</th><th>Estado</th><th>Creado</th><th></th></tr></thead>
            <tbody>
              {codigos.map(c => (
                <tr key={c.codigo} className={c.activo ? '' : 'apagado'}>
                  <td><code>{c.codigo}</code></td>
                  <td className="nowrap">{nombreEmpresa(c.empresa_id) || <span className="muted">—</span>}</td>
                  <td>{c.descripcion || <span className="muted">—</span>}</td>
                  <td className="nowrap">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="cupo-barra" style={{ width: 54, margin: 0 }}><span style={{ width: Math.min(100, c.usos / c.usos_max * 100) + '%' }} /></div>{c.usos}/{c.usos_max}
                    </div>
                  </td>
                  <td>{c.activo ? (c.usos >= c.usos_max ? <span className="chip con_web">Agotado</span> : <span className="chip nuevo">Activo</span>) : <span className="chip">Desactivado</span>}</td>
                  <td className="nowrap muted">{fecha(c.created_at)}</td>
                  <td>
                    <div className="acciones" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button className="btn chico" onClick={() => copiar(toast, linkInvitacion(c.codigo), 'Link de invitación copiado')}><Link2 size={14} /> Link</button>
                      <button className="btn chico" onClick={() => copiar(toast, c.codigo, 'Código copiado')} aria-label="Copiar código"><Copy size={14} /></button>
                      <Interruptor on={c.activo} onCambiar={() => alternar(c)} etiqueta={(c.activo ? 'Desactivar ' : 'Activar ') + c.codigo} />
                    </div>
                  </td>
                </tr>
              ))}
              {!codigos.length && <tr><td colSpan={7} className="muted centrado" style={{ padding: 30 }}>Todavía no hay códigos.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {modal && (
        <Modal onCerrar={() => setModal(null)}>
          <form onSubmit={crear}>
            <h3>Nueva invitación</h3>
            <p>Compartí el link: el código queda precargado en el registro.</p>
            <label>Empresa
              <select value={modal.empresa_id} onChange={e => setModal({ ...modal, empresa_id: e.target.value })} required aria-label="Empresa de la invitación">
                <option value="">Elegí una empresa…</option>
                {empresas.map(e => <option key={e.id} value={e.id} disabled={!e.activa}>{e.nombre}{e.activa ? '' : ' (suspendida)'}</option>)}
              </select>
            </label>
            <div className="form-grid">
              <label>Código<input value={modal.codigo} onChange={e => setModal({ ...modal, codigo: e.target.value.toUpperCase().trim() })} required /></label>
              <label>Usos máximos<input type="number" min={1} max={500} value={modal.usos_max} onChange={e => setModal({ ...modal, usos_max: e.target.value })} /></label>
            </div>
            <label>Para quién (opcional)<input value={modal.descripcion} onChange={e => setModal({ ...modal, descripcion: e.target.value })} placeholder="Ej.: equipo de ventas" /></label>
            <div className="acciones fin">
              <button type="button" className="btn" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn primario">Crear invitación</button>
            </div>
          </form>
        </Modal>
      )}
    </>
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
    ayuda: <>Escribe y reescribe los mensajes. Creala en <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> → API Keys.</> },
  { nombre: 'google_places', titulo: 'Google Places', icono: MapPin, color: '#1d4ed8', fondo: '#ebf1ff', placeholder: 'AIza…',
    ayuda: <>Opcional. Busca negocios en Maps y detecta si tienen web. Activá “Places API (New)” en <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud</a>.</> },
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
        <div><b>Estado en vivo</b><span>Claude: {servicios.ia ? `conectado (${servicios.modelo || modeloActual})` : 'sin clave'} · Google Places: {servicios.places ? 'conectado' : 'sin clave'}</span></div>
        <span className="espacio" />
        <button className="btn chico" onClick={async () => { await refrescarServicios(); toast('Estado actualizado', 'info') }}>Volver a verificar</button>
      </div>
    </section>
  )
}
