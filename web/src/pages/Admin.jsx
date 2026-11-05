import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, Crown, Building2, Users, Ticket, KeyRound, Plus, Copy, Pencil, Sparkles, MapPin, Cpu, Trash2, Loader2, CheckCircle2, Eye, EyeOff, UserPlus, RotateCcw, BarChart3, CreditCard, LifeBuoy, ChevronDown, Check } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { fecha, fechaHora, mensajeError } from '../lib/util.js'
import { Avatar, Esqueleto, Interruptor, Modal, Aviso, Contador, useConfirmar, useToast } from '../components/ui.jsx'
import Desplegable from '../components/Desplegable.jsx'
import { useApp } from '../App.jsx'
import { Metricas, Planes, Soporte } from '../components/AdminExtra.jsx'
import { CamposPais, SelectorTipoVenta, TIPOS_VENTA, tipoDe, Bandera } from '../components/ElegirPais.jsx'
import { nombrePais } from '../lib/catalogo.js'

// Los planes salen de la pestaña Planes (tabla "planes"); además se puede elegir "a medida" o "sin tope"
const EXTRA_PLANES = [
  { id: 'medida', nombre: 'A medida', descripcion: 'Elegís vos cuántas consultas de IA por mes', ia_mes: null },
  { id: 'ilimitado', nombre: 'Sin tope', descripcion: 'IA sin límite. Ojo: el costo lo pagás vos', ia_mes: null },
]
const nombrePlan = (planes, id) => [...planes, ...EXTRA_PLANES].find(x => x.id === id)?.nombre ?? (id || 'Sin plan')
const fmtN = n => Number(n || 0).toLocaleString('es-AR')
/** Guarda una empresa (con tope de usuarios si la base ya tiene la versión nueva) */
async function guardarEmpresa(e) {
  const args = { p_id: e.id ?? null, p_nombre: e.nombre, p_contacto: e.contacto ?? '', p_notas: e.notas ?? '', p_activa: e.activa ?? true, p_plan: e.plan, p_limite_ia_mes: e.limite_ia_mes ?? null }
  // Sin tope de usuarios: el límite es el uso de IA de la empresa por mes (se guarda un máximo alto por compatibilidad)
  let r = await supabase.rpc('admin_guardar_empresa', { ...args, p_usuarios_max: 500 })
  if (r.error && /function|schema cache|PGRST202/i.test(r.error.message + (r.error.code ?? ''))) r = await supabase.rpc('admin_guardar_empresa', args)
  return r
}

const MODELOS = [
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 — equilibrado (recomendado)'],
  ['claude-opus-5-5', 'Claude Opus 5.5 — máxima calidad'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 — más rápido y barato'],
]

export default function Admin() {
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const TABS_VALIDAS = ['metricas', 'empresas', 'claves', 'planes', 'soporte']
  const tab = TABS_VALIDAS.includes(params.get('tab')) ? params.get('tab') : 'empresas'
  const setTab = k => setParams(p => { const n = new URLSearchParams(p); n.set('tab', k); return n }, { replace: true })
  const [datos, setDatos] = useState(null)
  const [alta, setAlta] = useState(null)
  const [credenciales, setCredenciales] = useState(null)

  async function cargar() {
    const [e, u, k, ch, pl] = await Promise.all([
      supabase.rpc('admin_empresas'),
      supabase.rpc('admin_usuarios'),
      supabase.rpc('admin_estado_claves'),
      supabase.rpc('admin_uso_chat'),
      supabase.from('planes').select('*').order('orden'),
    ])
    const error = e.error || u.error || k.error
    if (error) toast(mensajeError(error), 'error')
    const chat = new Map((ch.data ?? []).map(x => [x.id, x]))
    setDatos({ empresas: e.data ?? [], usuarios: (u.data ?? []).map(x => ({ ...x, chat: chat.get(x.id) })), claves: k.data ?? [], planes: pl.data ?? [] })
  }
  useEffect(() => { cargar() }, [])

  if (!datos) return <Esqueleto />
  const { empresas, usuarios, claves, planes } = datos
  const claveIA = claves.find(c => c.nombre === 'anthropic')
  const claveMaps = claves.find(c => c.nombre === 'google_places')
  const tabs = [
    ['metricas', 'Uso', BarChart3, null],
    ['empresas', 'Empresas y usuarios', Building2, empresas.length],
    ['claves', 'Claves y servicios', KeyRound, claveIA?.configurada && claveMaps?.configurada ? null : '!'],
    ['planes', 'Planes', CreditCard, null],
    ['soporte', 'Sugerencias y errores', LifeBuoy, null],
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
        <Mini titulo="Empresas activas" valor={empresas.filter(e => e.activa).length} pie={`de ${empresas.length}`} icono={Building2} color="#fd4a22" fondo="#fff0ea" />
        <Mini titulo="Usuarios" valor={usuarios.length} pie={`${usuarios.filter(u => !u.activo).length} suspendidos`} icono={Users} color="#1d4ed8" fondo="#ebf1ff" />
        <Mini titulo="Prospectos" valor={total('prospectos')} pie={`${total('clientes')} clientes`} icono={Ticket} color="#b45309" fondo="#fdf4e4" />
        <Mini titulo="Claude" valor={claveIA?.configurada ? 'Activo' : 'Sin clave'} pie={claveIA?.configurada ? `termina en …${claveIA.final}` : 'cargala en Claves'} icono={Sparkles} color={claveIA?.configurada ? '#15803d' : '#6f695f'} fondo={claveIA?.configurada ? '#e9f7ee' : '#f0ece5'} onClick={() => setTab('claves')} />
        <Mini titulo="Google Maps" valor={claveMaps?.configurada ? 'Conectado' : 'Conectar'} pie={claveMaps?.configurada ? `termina en …${claveMaps.final}` : 'tocá para pegar la clave'} icono={MapPin} color={claveMaps?.configurada ? '#15803d' : '#1a73e8'} fondo={claveMaps?.configurada ? '#e9f7ee' : '#e8f0fe'} onClick={() => setTab('claves')} />
      </div>

      <div className="subtabs" role="tablist">
        {tabs.map(([k, label, Icono, n]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'activo' : ''} onClick={() => setTab(k)}>
            <Icono size={16} /> {label} {n !== null && n !== undefined && <span className={'chip' + (n === '!' ? ' mal' : '')}>{n}</span>}
          </button>
        ))}
      </div>

      <div key={tab} className="pagina">
        {tab === 'empresas' && <EmpresasYUsuarios empresas={empresas} usuarios={usuarios} planes={planes} recargar={cargar} nuevoUsuario={emp => setAlta({ empresa_id: emp.id, empresa: emp.nombre })} setCredenciales={setCredenciales} />}
        {tab === 'claves' && <Claves claves={claves} recargar={cargar} />}
        {tab === 'metricas' && <Metricas />}
        {tab === 'planes' && <Planes empresas={empresas} onCambio={cargar} />}
        {tab === 'soporte' && <Soporte />}
      </div>
      {alta && <NuevoUsuario inicial={alta} empresas={empresas} usuarios={usuarios} onCerrar={() => setAlta(null)} onCreado={c => { setAlta(null); setCredenciales(c); cargar() }} />}
      {credenciales && <Credenciales {...credenciales} onCerrar={() => setCredenciales(null)} />}
    </>
  )
}

function Mini({ titulo, valor, pie, icono: Icono, color, fondo, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className={'kpi' + (onClick ? ' kpi-boton' : '')} {...(onClick ? { type: 'button', onClick } : {})}>
      <div className="kpi-top"><span>{titulo}</span><span className="kpi-icono" style={{ color, background: fondo }}><Icono size={16} /></span></div>
      <b style={typeof valor === 'string' ? { fontSize: '1.5rem' } : undefined}>{typeof valor === 'number' ? <Contador valor={valor} /> : valor}</b>
      <small>{pie}</small>
    </Tag>
  )
}

const copiar = async (toast, texto, msg) => { try { await navigator.clipboard.writeText(texto); toast(msg) } catch { toast(texto, 'info') } }

// ---------------- Empresas ----------------
function EmpresasYUsuarios({ empresas, usuarios, planes, recargar, nuevoUsuario, setCredenciales }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const { session } = useApp()
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todas')
  const [editar, setEditar] = useState(null) // empresa a editar o { nueva: true }
  const [cerradas, setCerradas] = useState([])
  const [cfg, setCfg] = useState({})
  const [configurando, setConfigurando] = useState(null)
  const cargarCfg = () => supabase.from('perfiles').select('id, pais, region, modos, paises').in('id', usuarios.map(u => u.id)).then(({ data }) => setCfg(Object.fromEntries((Array.isArray(data) ? data : []).map(x => [x.id, x]))))
  useEffect(() => { if (usuarios.length) cargarCfg() }, [usuarios])

  const t = q.trim().toLowerCase()
  const coincide = u => !t || [u.nombre, u.email].some(x => x?.toLowerCase().includes(t))
  const grupos = [
    ...empresas.filter(e => filtro === 'todas' || (filtro === 'activas' ? e.activa : !e.activa)).map(e => ({ e, miembros: usuarios.filter(u => u.empresa_id === e.id) })),
    ...(filtro === 'todas' ? [{ e: null, miembros: usuarios.filter(u => !u.empresa_id) }] : []),
  ].map(g => ({ ...g, visibles: !t || (g.e?.nombre ?? '').toLowerCase().includes(t) ? g.miembros : g.miembros.filter(coincide) }))
    .filter(g => (g.e || g.miembros.length) && (!t || (g.e?.nombre ?? '').toLowerCase().includes(t) || g.visibles.length))

  async function actualizarUsuario(u, cambios, msg) {
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
  async function alternarUsuario(u) {
    if (u.activo && !(await confirmar({ titulo: `¿Suspender a ${u.nombre || u.email}?`, texto: 'No va a poder entrar hasta que lo reactives. Sus datos quedan guardados.', peligro: true, aceptar: 'Suspender' }))) return
    actualizarUsuario(u, { activo: !u.activo }, u.activo ? 'Usuario suspendido' : 'Usuario reactivado')
  }
  async function alternarEmpresa(e) {
    if (e.activa && !(await confirmar({ titulo: `¿Suspender a ${e.nombre}?`, peligro: true, aceptar: 'Suspender',
      texto: `Sus ${e.usuarios} usuario(s) dejan de poder entrar. Los datos quedan guardados y podés reactivarla cuando quieras.` }))) return
    const { error } = await guardarEmpresa({ ...e, activa: !e.activa, limite_ia_mes: -1 })
    if (error) return toast(mensajeError(error), 'error')
    toast(e.activa ? `${e.nombre} suspendida` : `${e.nombre} habilitada`, e.activa ? 'info' : 'ok'); recargar()
  }
  const plegar = id => setCerradas(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  return (
    <>
      <div className="adm-barra">
        <div className="buscador"><SearchIcon /><input placeholder="Buscar empresa, persona o email" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="rep-pastillas">{[['todas', 'Todas'], ['activas', 'Habilitadas'], ['suspendidas', 'Suspendidas']].map(([v, l]) => <button key={v} type="button" className={filtro === v ? 'on' : ''} onClick={() => setFiltro(v)}>{l}</button>)}</div>
        <span className="espacio" />
        <button className="btn primario" onClick={() => setEditar({ nueva: true })}><Plus size={16} /> Nueva empresa</button>
      </div>

      {!grupos.length ? (
        <div className="home-vacio"><Building2 size={18} /><span>{t ? 'No hay empresas ni personas con esa búsqueda.' : 'Todavía no hay empresas. Creá la primera con su usuario.'}</span></div>
      ) : (
        <div className="adm-empresas">
          {grupos.map(({ e, miembros, visibles }) => {
            const id = e?.id ?? 'sin', cerrada = cerradas.includes(id) && !t
            const usoPct = e?.limite_ia_mes ? Math.min(100, (e.uso_ia_mes / e.limite_ia_mes) * 100) : 0
            return (
              <article key={id} className={'adm-empresa' + (e && !e.activa ? ' suspendida' : '') + (!e ? ' sin-empresa' : '')}>
                <header className="adm-empresa-cab">
                  <button type="button" className="adm-plegar" onClick={() => plegar(id)} aria-expanded={!cerrada} title={cerrada ? 'Mostrar usuarios' : 'Ocultar usuarios'}><ChevronDown size={16} /></button>
                  {e ? <Avatar nombre={e.nombre} className="cuadrado" /> : <span className="avatar cuadrado adm-sin"><Users size={16} /></span>}
                  <div className="adm-empresa-nombre">
                    <b>{e ? e.nombre : 'Usuarios sin empresa'}</b>
                    <span>{e ? `${e.contacto || 'Sin contacto'} · desde ${fecha(e.creada)}` : 'Cuentas sueltas: asignalas a una empresa desde su fila'}</span>
                  </div>
                  {e && <>
                    <div className="adm-dato"><small>Plan</small><b>{nombrePlan(planes, e.plan)}</b></div>
                    <div className="adm-dato"><small>Usuarios</small><b>{miembros.length}</b></div>
                    <div className="adm-dato ia"><small>IA este mes</small><b>{fmtN(e.uso_ia_mes)}{e.limite_ia_mes != null ? <span> / {fmtN(e.limite_ia_mes)}</span> : <span> · sin tope</span>}</b>
                      {e.limite_ia_mes != null && <div className={'cupo-barra' + (usoPct >= 100 ? ' lleno' : usoPct >= 80 ? ' casi' : '')}><span style={{ width: usoPct + '%' }} /></div>}</div>
                    <div className="adm-dato"><small>Prospectos</small><b>{fmtN(e.prospectos)}</b></div>
                    <div className="adm-acciones">
                      <Interruptor on={e.activa} onCambiar={() => alternarEmpresa(e)} etiqueta={(e.activa ? 'Suspender ' : 'Habilitar ') + e.nombre} />
                      <button className="btn chico" onClick={() => setEditar(e)}><Pencil size={14} /> Editar</button>
                      <button className="btn chico primario" onClick={() => nuevoUsuario(e)} disabled={!e.activa}><UserPlus size={14} /> Usuario</button>
                    </div>
                  </>}
                </header>
                {!cerrada && (
                  <div className="adm-miembros">
                    {!visibles.length ? <p className="muted chico adm-vacio">Todavía no tiene usuarios. <button type="button" className="link" onClick={() => nuevoUsuario(e)} disabled={!e?.activa}>Dale de alta al primero</button>.</p> : visibles.map(u => {
                      const yo = u.id === session.user.id
                      const c = cfg[u.id]
                      return (
                        <div key={u.id} className={'adm-miembro' + (u.activo ? '' : ' apagado')}>
                          <Avatar nombre={u.nombre || u.email} />
                          <div className="adm-persona">
                            <b>{u.nombre || '—'}{u.es_admin && <span className="chip ia"><Crown size={11} /> super admin</span>}{yo && <span className="chip">vos</span>}</b>
                            <span>{u.email} · {u.ultimo_ingreso ? `entró ${fechaHora(u.ultimo_ingreso)}` : 'nunca entró'}</span>
                          </div>
                          <button type="button" className="btn chico fantasma config-usuario" onClick={() => setConfigurando(u)} title="Cambiar país y tipo de venta">
                            <Bandera code={c?.pais} /> {c?.pais ? (c?.region || nombrePais(c.pais)) : <span className="muted">Sin país</span>}{c?.paises?.length > 0 && <span className="muted chico">+{c.paises.length}</span>}
                            <span className={'chip tipo-' + tipoDe(c?.modos)}>{({ b2b: 'B2B', b2c: 'B2C', ambos: 'B2B + B2C' })[tipoDe(c?.modos)]}</span>
                          </button>
                          <div className="adm-nums"><span><b>{u.prospectos}</b> prospectos</span><span><b>{u.enviados}</b> envíos</span><span><b>{u.clientes}</b> clientes</span></div>
                          {u.empresa_id ? <div className="adm-ia" title="En las empresas, la IA se comparte: el límite es el del plan por mes"><small>IA</small><span className="chico muted">del plan</span></div> : <div className="adm-ia" title="Consultas al asistente hoy / límite diario (vacío = el general)"><small>IA hoy</small><LimiteChat u={u} onGuardar={async v => {
                            const { error } = await supabase.rpc('admin_limite_chat', { p_id: u.id, p_limite: v })
                            if (error) return toast(mensajeError(error), 'error')
                            toast(v === null ? 'Vuelve al límite general' : `Límite del asistente: ${v} por día`); recargar()
                          }} /></div>}
                          <Desplegable compacto ariaLabel={'Mover a ' + (u.nombre || u.email)} value={u.empresa_id ?? ''} anchoMenu={230} alinear="der"
                            onChange={v => actualizarUsuario(u, { empresa: v || null }, v ? 'Usuario movido de empresa' : 'Usuario sin empresa')}
                            opciones={[{ value: '', label: 'Sin empresa', icono: <Building2 size={14} className="muted" /> }, ...empresas.map(x => ({ value: x.id, label: x.nombre, ayuda: x.activa ? '' : 'Suspendida', icono: <Building2 size={14} /> }))]} />
                          <div className="adm-acciones-u">
                            <Interruptor on={u.activo} disabled={yo} onCambiar={() => alternarUsuario(u)} etiqueta={(u.activo ? 'Suspender a ' : 'Reactivar a ') + (u.nombre || u.email)} />
                            {!yo && <button className="btn chico fantasma" onClick={() => restablecer(u)} title="Generar contraseña nueva" aria-label={'Nueva contraseña para ' + (u.nombre || u.email)}><RotateCcw size={14} /></button>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {editar && <EditarEmpresa empresa={editar.nueva ? null : editar} planes={planes} onCerrar={() => setEditar(null)}
        onListo={async (r) => { setEditar(null); await recargar(); if (r?.credenciales) setCredenciales(r.credenciales) }} />}
      {configurando && <ConfigurarCuenta u={configurando} actual={cfg[configurando.id]} onCerrar={() => setConfigurando(null)} onListo={() => { setConfigurando(null); cargarCfg() }} />}
    </>
  )
}

/** Alta y edición de empresa: datos, plan (de la pestaña Planes) y, al crearla, su primer usuario */
function EditarEmpresa({ empresa, planes, onCerrar, onListo }) {
  const toast = useToast()
  const nueva = !empresa
  const todos = [...planes.filter(p => p.activo || p.id === empresa?.plan || p.id === 'prueba'), ...EXTRA_PLANES]
  const planInicial = empresa?.plan && todos.some(p => p.id === empresa.plan) ? empresa.plan : (planes.find(p => p.destacado)?.id ?? planes[0]?.id ?? 'medida')
  const [f, setF] = useState({ nombre: empresa?.nombre ?? '', contacto: empresa?.contacto ?? '', notas: empresa?.notas ?? '', plan: planInicial,
    limite_ia_mes: empresa?.limite_ia_mes ?? 500 })
  const [primero, setPrimero] = useState({ nombre: '', email: '' })
  const [lugar, setLugar] = useState({ pais: 'AR', region: '', otros: [] })
  const [tipo, setTipo] = useState('b2b')
  const [guardando, setGuardando] = useState(false)
  const elegido = todos.find(p => p.id === f.plan)
  const elegir = p => setF(x => ({ ...x, plan: p.id, ...(p.ia_mes != null ? { limite_ia_mes: p.ia_mes } : {}) }))

  async function guardar(ev) {
    ev.preventDefault()
    if (!f.nombre.trim()) return
    if (nueva && primero.email && !primero.nombre.trim()) return toast('Poné el nombre del primer usuario', 'error')
    setGuardando(true)
    const limite = f.plan === 'ilimitado' ? null : Math.max(0, Number(f.limite_ia_mes) || 0)
    const { data: id, error } = await guardarEmpresa({ ...empresa, ...f, nombre: f.nombre.trim(), limite_ia_mes: limite })
    if (error) { setGuardando(false); return toast(mensajeError(error), 'error') }
    let credenciales = null
    if (nueva && primero.email.trim()) {
      try {
        const r = await llamarFuncion('admin-usuarios', { modo: 'crear', nombre: primero.nombre.trim(), email: primero.email.trim(), empresa_id: id, rol: 'admin',
          pais: lugar.pais, region: lugar.region, paises: lugar.otros, modos: TIPOS_VENTA.find(t => t[0] === tipo)[1] })
        credenciales = { nombre: primero.nombre, email: r.email, password: r.password, nueva: true }
      } catch (e) { toast(`La empresa se creó, pero no el usuario: ${e.message}`, 'error') }
    }
    setGuardando(false)
    toast(nueva ? `Empresa "${f.nombre.trim()}" creada${credenciales ? ' con su primer usuario' : ''}` : 'Cambios guardados', 'ok')
    onListo({ credenciales })
  }

  return (
    <Modal onCerrar={onCerrar} ancho={720}>
      <form onSubmit={guardar} className="adm-form">
        <h3>{nueva ? 'Nueva empresa' : `Editar ${empresa.nombre}`}</h3>
        <p className="muted">{nueva ? 'Todo en un paso: la empresa, su plan y su primer usuario.' : 'Los cambios se aplican al instante.'}</p>

        <div className="adm-paso"><span>1</span><b>La empresa</b></div>
        <div className="dos-col" style={{ gap: 12 }}>
          <label>Nombre<input autoFocus required value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: STOKA" /></label>
          <label>Contacto<input value={f.contacto} onChange={e => setF({ ...f, contacto: e.target.value })} placeholder="Responsable, mail o teléfono" /></label>
        </div>

        <div className="adm-paso"><span>2</span><b>Plan</b><small className="muted">Usuarios ilimitados: el plan fija cuánta IA usa toda la empresa por mes</small></div>
        <div className="adm-planes">{todos.map(p => {
          const on = f.plan === p.id
          return (
            <button type="button" key={p.id} className={'adm-plan' + (on ? ' on' : '') + (p.destacado ? ' destacado' : '') + (p.ia_mes == null ? ' especial' : '')} onClick={() => elegir(p)} aria-pressed={on}>
              <div className="adm-plan-top"><b>{p.nombre}</b>{p.destacado && <span className="adm-plan-badge">Recomendado</span>}<span className="adm-plan-check">{on && <Check size={13} />}</span></div>
              {p.ia_mes != null ? <>
                <div className="adm-plan-ia"><strong>{fmtN(p.ia_mes)}</strong><span>consultas de IA por mes</span></div>
                <div className="adm-plan-pie"><span>{p.precio_mensual > 0 ? `${p.moneda} ${fmtN(p.precio_mensual)} por mes` : 'Gratis'}</span></div>
              </> : <p className="adm-plan-desc">{p.descripcion}</p>}
            </button>
          )
        })}</div>
        {elegido?.id === 'medida' && (
          <label className="adm-medida">Consultas de IA por mes para toda la empresa<input type="number" min={0} step={50} value={f.limite_ia_mes ?? ''} onChange={e => setF({ ...f, limite_ia_mes: e.target.value })} /></label>
        )}
        {elegido?.id === 'ilimitado' && <p className="adm-aviso-tope">Sin tope, cada búsqueda y consulta de esta empresa se cobra en tu cuenta de Claude sin límite.</p>}

        {nueva && <>
          <div className="adm-paso"><span>3</span><b>Primer usuario</b><small className="muted">Opcional: queda como admin de la empresa</small></div>
          <div className="dos-col" style={{ gap: 12 }}>
            <label>Nombre<input value={primero.nombre} onChange={e => setPrimero({ ...primero, nombre: e.target.value })} placeholder="Ej.: Anuk Vilarasau" /></label>
            <label>Email<input type="email" value={primero.email} onChange={e => setPrimero({ ...primero, email: e.target.value })} placeholder="anuk@empresa.com" /></label>
          </div>
          {primero.email && <div className="alta-config">
            <b>Configuración de la cuenta</b>
            <small className="muted">Así entra directo, sin preguntas. El tipo de venta vale para toda la empresa.</small>
            <CamposPais pais={lugar.pais} region={lugar.region} otros={lugar.otros} onChange={setLugar} />
            <div className="campo" style={{ marginBottom: 6 }}>¿A quién le vende?</div>
            <SelectorTipoVenta valor={tipo} onChange={setTipo} />
          </div>}
        </>}

        <label style={{ marginTop: 14 }}>Notas internas<textarea rows={2} value={f.notas} onChange={e => setF({ ...f, notas: e.target.value })} placeholder="Forma de pago, acuerdos, lo que quieras recordar" /></label>
        <div className="acciones fin">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario" disabled={guardando || !f.nombre.trim()}>{guardando && <Loader2 size={15} className="spin" />}{nueva ? (primero.email ? 'Crear empresa y usuario' : 'Crear empresa') : 'Guardar'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ConfigurarCuenta({ u, actual, onCerrar, onListo }) {
  const toast = useToast()
  const [lugar, setLugar] = useState({ pais: actual?.pais || 'AR', region: actual?.region || '', otros: actual?.paises ?? [] })
  const [tipo, setTipo] = useState(tipoDe(actual?.modos))
  const [guardando, setGuardando] = useState(false)
  async function guardar() {
    setGuardando(true)
    try {
      await llamarFuncion('admin-usuarios', { modo: 'configurar', id: u.id, pais: lugar.pais, region: lugar.region, paises: lugar.otros, modos: TIPOS_VENTA.find(t => t[0] === tipo)[1] })
      toast('Cuenta configurada', 'ok'); onListo()
    } catch (e) { toast(e.message, 'error') }
    setGuardando(false)
  }
  return (
    <Modal onCerrar={onCerrar} ancho={620}>
      <h3 style={{ marginTop: 0 }}>Configurar la cuenta de {u.nombre || u.email}</h3>
      {u.empresa && <p className="muted chico">Es de {u.empresa}: el tipo de venta se aplica a todo su equipo.</p>}
      <CamposPais pais={lugar.pais} region={lugar.region} otros={lugar.otros} onChange={setLugar} />
      <div className="campo" style={{ marginBottom: 6 }}>¿A quién le vende?</div>
      <SelectorTipoVenta valor={tipo} onChange={setTipo} />
      <div className="acciones fin"><button type="button" className="btn" onClick={onCerrar}>Cancelar</button><button type="button" className="btn primario" onClick={guardar} disabled={guardando || !lugar.pais}>{guardando && <Loader2 size={15} className="spin" />} Guardar</button></div>
    </Modal>
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
function NuevoUsuario({ inicial, empresas, usuarios = [], onCerrar, onCreado }) {
  const toast = useToast()
  const fija = !!inicial.empresa_id
  const [f, setF] = useState({ nombre: '', email: '', empresa_id: inicial.empresa_id ?? '', rol: 'vendedor' })
  const [lugar, setLugar] = useState({ pais: 'AR', region: '', otros: [] })
  const [tipo, setTipo] = useState('b2b')
  const [heredar, setHeredar] = useState(fija)
  const [creando, setCreando] = useState(false)
  const companeros = usuarios.filter(u => u.empresa_id && u.empresa_id === f.empresa_id)
  async function crear(e) {
    e.preventDefault()
    setCreando(true)
    try {
      const config = heredar && companeros.length ? {} : { pais: lugar.pais, region: lugar.region, paises: lugar.otros, modos: TIPOS_VENTA.find(t => t[0] === tipo)[1] }
      const r = await llamarFuncion('admin-usuarios', { modo: 'crear', nombre: f.nombre, email: f.email, empresa_id: f.empresa_id || null, rol: f.rol, ...config })
      toast(`Cuenta de ${f.nombre} creada${f.empresa_id ? ` en ${empresas.find(x => x.id === f.empresa_id)?.nombre ?? 'la empresa'}` : ''}`)
      onCreado({ nombre: f.nombre, email: r.email, password: r.password, nueva: true })
    } catch (err) { toast(err.message, 'error') }
    setCreando(false)
  }
  return (
    <Modal onCerrar={onCerrar} ancho={640}>
      <form onSubmit={crear}>
        <h3>{fija ? `Nuevo usuario en ${inicial.empresa ?? 'la empresa'}` : 'Nuevo usuario'}</h3>
        <p>Creamos la cuenta con una contraseña inicial que te mostramos una sola vez para que se la pases.</p>
        <div className="dos-col" style={{ gap: 12 }}>
          <label>Nombre<input autoFocus required value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} placeholder="Ej.: Marta Gómez" /></label>
          <label>Email<input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="marta@empresa.com" /></label>
        </div>
        {!fija && <div className="campo">Empresa
          <Desplegable className="ancho" ariaLabel="Empresa del usuario" value={f.empresa_id} onChange={v => setF({ ...f, empresa_id: v })}
            opciones={[{ value: '', label: 'Sin empresa', icono: <Building2 size={14} className="muted" /> }, ...empresas.filter(e => e.activa).map(e => ({ value: e.id, label: e.nombre, icono: <Building2 size={14} /> }))]} />
        </div>}
        {f.empresa_id && <div className="campo">Rol en la empresa
          <div className="rep-pastillas" style={{ marginTop: 6 }}>{[['vendedor', 'Vendedor'], ['admin', 'Admin de la empresa']].map(([v, l]) => <button key={v} type="button" className={f.rol === v ? 'on' : ''} onClick={() => setF({ ...f, rol: v })}>{l}</button>)}</div>
          <small className="muted">El admin de la empresa puede sumar y gestionar a su equipo.</small>
        </div>}
        {companeros.length > 0 && (
          <label className="adm-heredar"><input type="checkbox" checked={heredar} onChange={e => setHeredar(e.target.checked)} /> Usar la misma configuración que el resto de la empresa (país y tipo de venta)</label>
        )}
        {(!heredar || !companeros.length) && <div className="alta-config">
          <b>Configuración de la cuenta</b>
          <small className="muted">Con esto entra directo, sin preguntas. Se puede cambiar después.{f.empresa_id && ' El tipo de venta vale para toda la empresa.'}</small>
          <CamposPais pais={lugar.pais} region={lugar.region} otros={lugar.otros} onChange={setLugar} />
          <div className="campo" style={{ marginBottom: 6 }}>¿A quién le vende?</div>
          <SelectorTipoVenta valor={tipo} onChange={setTipo} />
        </div>}
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
        <div className="muted chico" style={{ marginTop: 3 }}>Vale sólo para cuentas sin empresa. En las empresas el límite es el de su plan, por mes y compartido por todo el equipo.</div>
        <form onSubmit={e => { e.preventDefault(); onGuardar(Math.max(0, Math.min(1000, Number(n) || 0))) }}>
          <input type="number" min={0} max={1000} value={n} onChange={e => setN(e.target.value)} aria-label="Límite diario del asistente" style={{ flex: '0 1 160px' }} />
          <button className="btn oscuro" disabled={guardando || Number(n) === actual}>Guardar límite</button>
        </form>
      </div>
    </div>
  )
}

const SERVICIOS = [
  { nombre: 'anthropic', titulo: 'Claude (Anthropic)', icono: Sparkles, color: '#fd4a22', fondo: '#fff0ea', placeholder: 'sk-ant-api03-…',
    ayuda: <>Busca negocios, escribe los mensajes y responde en el Asistente. Creala en <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a> → API Keys.</> },
  { nombre: 'google_places', titulo: 'Google Maps (Places API)', icono: MapPin, color: '#1a73e8', fondo: '#e8f0fe', placeholder: 'AIza…',
    ayuda: <>Trae fichas reales de Google Maps para la búsqueda. Creala en <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer">Google Cloud → Credenciales</a> con <b>Places API (New)</b> habilitada y restringida a esa API.</> },
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
        const sospechosa = v && (s.nombre === 'anthropic' ? !v.trim().startsWith('sk-ant-') : s.nombre === 'google_places' ? !v.trim().startsWith('AIza') : false)
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
              {sospechosa && <small style={{ color: 'var(--warn)', display: 'block', marginTop: 6 }}>{s.nombre === 'anthropic' ? 'Las claves de Claude suelen empezar con “sk-ant-”.' : 'Las claves de Google suelen empezar con “AIza”.'} Revisá que la hayas copiado entera.</small>}
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
            <Desplegable ariaLabel="Modelo de Claude" value={MODELOS.some(m => m[0] === modelo) ? modelo : '__otro'} onChange={v => setModelo(v === '__otro' ? '' : v)} anchoMenu={320}
              opciones={[...MODELOS.map(([id, label]) => ({ value: id, label: label.split(' — ')[0], ayuda: label.split(' — ')[1] })), { value: '__otro', label: 'Otro…', ayuda: 'Escribir el id del modelo' }]} />
            {!MODELOS.some(m => m[0] === modelo) && <input value={modelo} onChange={e => setModelo(e.target.value.trim())} placeholder="id del modelo" aria-label="Id del modelo" />}
            <button className="btn oscuro" disabled={!modelo || modelo === modeloActual || guardando === 'modelo_ia'}>Guardar modelo</button>
          </form>
        </div>
      </div>

      <LimiteGeneral actual={Number(estado('limite_chat').final) || 30} guardando={guardando === 'limite_chat'} onGuardar={n => guardar('limite_chat', String(n), `Límite del asistente: ${n} consultas por día`)} />

      <div className="estado-servicio" style={{ marginTop: 10 }}>
        <span className="punto" style={{ background: servicios.ia ? '#22c55e' : servicios.ia === false ? '#f59e0b' : '#a8a196', width: 10, height: 10 }} />
        <div><b>Estado en vivo</b><span>Claude: {servicios.ia ? `conectado (${servicios.modelo || modeloActual})` : 'sin clave'} · lo usan el Asistente, la búsqueda de negocios y los borradores</span></div>
        <span className="espacio" />
        <button className="btn chico" onClick={async () => { await refrescarServicios(); toast('Estado actualizado', 'info') }}>Volver a verificar</button>
      </div>
    </section>
  )
}
