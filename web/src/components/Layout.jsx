import { useEffect, useRef, useState } from 'react'
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Plug, Store, Bot, LayoutDashboard, BarChart3, Users, CalendarClock, Upload, Search, UserCircle, Crown, LogOut, Sparkles, ChevronDown, Building2,
  Inbox, Mail, Send, MessageSquareReply, Workflow, Bell, Plus, ListTodo, UsersRound, MoreHorizontal, X, Flame, ShieldCheck, FileText, DoorOpen, Heart, UserPlus, ArrowLeftRight,
} from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { Avatar, useToast, useConfirmar } from './ui.jsx'
import Logo from './Logo.jsx'
import AsistenteFlotante from './AsistenteFlotante.jsx'
import Paleta from './Paleta.jsx'
import NuevoProspecto from './NuevoProspecto.jsx'

export default function Layout({ children }) {
  const { perfil, tablero, session, servicios, acceso, correo, refrescar, porRevisar, contadores } = useApp()
  const toastRevision = useToast()
  const [paleta, setPaleta] = useState(false)
  const [mas, setMas] = useState(false)
  const [nuevo, setNuevo] = useState(false)
  const loc = useLocation()
  const navegar = useNavigate()
  useEffect(() => setMas(false), [loc.pathname])

  // Si el email está conectado, revisar respuestas al entrar (como mucho cada 15 minutos; el servidor igual lo hace cada 10)
  useEffect(() => {
    if (!correo?.leer_respuestas) return
    const ultima = correo.ultima_revision ? new Date(correo.ultima_revision).getTime() : 0
    if (Date.now() - ultima < 15 * 60000 || sessionStorage.getItem('revisando')) return
    sessionStorage.setItem('revisando', '1')
    llamarFuncion('correo', { modo: 'revisar' }).then(r => {
      if (r.respondieron?.length) { toastRevision(`📬 Te respondieron: ${r.respondieron.join(', ')}`); refrescar() }
      if (r.bajas?.length) { toastRevision(`Pidieron no recibir más mensajes: ${r.bajas.join(', ')}. Quedaron en "No contactar".`, 'info'); refrescar() }
      if (r.rebotes?.length) { toastRevision(`Rebotaron los mails a: ${r.rebotes.join(', ')}. Marcamos esos emails como inválidos.`, 'info'); refrescar() }
    }).catch(() => {}).finally(() => setTimeout(() => sessionStorage.removeItem('revisando'), 15 * 60000))
  }, [correo?.owner_id])
  // Contadores al día cada 2 minutos (respuestas nuevas, tareas)
  useEffect(() => { const t = setInterval(refrescar, 120000); return () => clearInterval(t) }, [refrescar])
  // Ctrl/Cmd + K: búsqueda global
  useEffect(() => {
    const onKey = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaleta(true) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const vencidos = (tablero?.seguimientos_vencidos ?? 0) + (contadores?.tareas_hoy ?? 0)
  const sinLeer = contadores?.respuestas_sin_leer ?? 0
  const nombre = perfil?.nombre || session.user.email
  const esAdminEquipo = perfil?.rol === 'admin' || perfil?.es_admin
  const modo = perfil?.modo === 'b2c' ? 'b2c' : 'b2b'

  // [ruta, texto, ícono, contador, en el celular va en la barra de abajo]
  const config = ['Configuración', [
    ['/negocio', 'Mi negocio', Store],
    ['/email', 'Email', Mail],
    ...(esAdminEquipo && perfil?.empresa_id ? [['/equipo', 'Equipo', UsersRound]] : []),
    ['/conexiones', 'Conexiones', Plug],
    ...(perfil?.es_admin ? [['/admin', 'Super admin', Crown]] : []),
  ]]
  const secciones = modo === 'b2c' ? [
    ['Inicio', [['/', 'Tablero', LayoutDashboard, 0, true]]],
    ['Mis clientes', [
      ['/clientes', 'Clientes', Heart, 0, true],
      ['/asistente', 'Asistente IA', Bot, 0, true],
    ]],
    config,
  ] : [
    ['Inicio', [['/', 'Tablero', LayoutDashboard, 0, true], ['/reportes', 'Reportes', BarChart3]]],
    ['Prospectar', [
      ['/negocio', 'Mi negocio', Store],
      ['/buscar', 'Buscar clientes', Search],
      ['/revisar', 'Por revisar', Inbox, porRevisar, true],
      ['/importar', 'Importar', Upload],
    ]],
    ['Trabajo diario', [
      ['/prospectos', 'Pipeline', Users, 0, true],
      ['/seguimientos', 'Seguimientos', CalendarClock, vencidos, true],
      ['/respuestas', 'Respuestas', MessageSquareReply, sinLeer, true],
      ['/envios', 'Envío masivo', Send],
      ['/secuencias', 'Secuencias', Workflow],
      ['/asistente', 'Asistente IA', Bot],
    ]],
    ['Configuración', [
      ['/email', 'Email', Mail],
      ...(esAdminEquipo && perfil?.empresa_id ? [['/equipo', 'Equipo', UsersRound]] : []),
      ['/conexiones', 'Conexiones', Plug],
      ...(perfil?.es_admin ? [['/admin', 'Super admin', Crown]] : []),
    ]],
  ]
  const enlace = ([to, label, Icono, badge]) => (
    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'activo' : '')}>
      <Icono size={18} /> <span className="nav-texto">{label}</span>
      {badge > 0 && <span className="cuenta" aria-label={`${badge} pendientes`}>{badge > 99 ? '99+' : badge}</span>}
    </NavLink>
  )
  const todos = secciones.flatMap(([, items]) => items)
  const enBarra = todos.filter(x => x[4])
  const enMas = todos.filter(x => !x[4])
  const hayMas = enMas.some(x => x[3] > 0)

  return (
    <div className={'app modo-' + modo}>
      <aside className="lateral">
        <Link to="/" className="marca"><Logo size={24} /></Link>
        {(acceso?.empresa || perfil?.estudio) && <div className="espacio-trabajo"><Building2 size={13} /> <span>{acceso?.empresa || perfil?.estudio}</span></div>}
        <SelectorModo perfil={perfil} />
        <nav aria-label="Secciones">
          {secciones.map(([titulo, items]) => (
            <div key={titulo} className="nav-grupo">
              <div className="nav-titulo">{titulo}</div>
              {items.map(enlace)}
            </div>
          ))}
        </nav>
        <TarjetaHoy />
      </aside>

      {/* Celular: barra de abajo con lo que más se usa en la calle + "Más" */}
      <nav className="barra-movil" aria-label="Secciones principales">
        {enBarra.map(enlace)}
        <button type="button" className={'mas-movil' + (mas ? ' activo' : '')} onClick={() => setMas(v => !v)} aria-expanded={mas}>
          <MoreHorizontal size={18} /> <span className="nav-texto">Más</span>{hayMas && <span className="cuenta punto" />}
        </button>
      </nav>
      {mas && (
        <div className="hoja-mas" role="dialog" aria-label="Más secciones" onClick={e => e.target === e.currentTarget && setMas(false)}>
          <div className="hoja-mas-panel">
            <div className="hoja-mas-cab"><b>Más</b><button className="btn fantasma chico" onClick={() => setMas(false)} aria-label="Cerrar"><X size={16} /></button></div>
            <div className="hoja-mas-grilla">{enMas.map(enlace)}</div>
            <TarjetaHoy compacta />
          </div>
        </div>
      )}

      <div style={{ minWidth: 0 }}>
        <Topbar modo={modo} nombre={nombre} perfil={perfil} session={session} empresa={acceso?.empresa} onBuscar={() => setPaleta(true)} onNuevo={() => setNuevo(true)} />
        <main className="contenido">
          <div className="pagina" key={loc.pathname}>{children}</div>
        </main>
        <AsistenteFlotante />
      </div>
      {paleta && <Paleta modo={modo} onCerrar={() => setPaleta(false)} />}
      {nuevo && <NuevoProspecto onCerrar={() => setNuevo(false)} onCreado={p => { setNuevo(false); refrescar(); if (p?.id) navegar(`/prospectos/${p.id}`) }} />}
    </div>
  )
}

/** B2B y B2C son dos espacios de trabajo separados: cada uno con su menú, sus datos y su color */
export const MODOS = {
  b2b: { corto: 'B2B', titulo: 'Empresas', sub: 'Vendés a empresas', icono: Building2 },
  b2c: { corto: 'B2C', titulo: 'Consumidores', sub: 'Vendés a personas', icono: Heart },
}
export function useCambiarModo() {
  const { refrescar } = useApp()
  const toast = useToast()
  const nav = useNavigate()
  return async (m, habilitar = false) => {
    const { error } = await supabase.rpc(habilitar ? 'habilitar_modo' : 'cambiar_modo', { p_modo: m })
    if (error) return toast(error.message, 'error')
    await refrescar(); nav('/')
    toast(`Estás en ${MODOS[m].titulo} (${MODOS[m].corto})`, 'ok')
  }
}
function SelectorModo({ perfil }) {
  const cambiar = useCambiarModo()
  const modos = perfil?.modos ?? ['b2b']
  const actual = perfil?.modo === 'b2c' ? 'b2c' : 'b2b'
  if (modos.length < 2) {
    const M = MODOS[actual]
    return <div className="modo-fijo" title={M.sub}><M.icono size={13} /> {M.titulo} · {M.corto}</div>
  }
  return (
    <div className="selector-modo" role="radiogroup" aria-label="Espacio de trabajo">
      {['b2b', 'b2c'].map(m => {
        const M = MODOS[m]
        return (
          <button key={m} type="button" role="radio" aria-checked={actual === m} className={'opcion-modo ' + m + (actual === m ? ' activo' : '')} onClick={() => actual !== m && cambiar(m)}>
            <M.icono size={14} /><span><b>{M.titulo}</b><small>{M.corto}</small></span>
          </button>
        )
      })}
    </div>
  )
}

/** Lo del día en una tarjeta: emails contra el límite de la casilla, uso de IA del mes y estado de Claude */
function TarjetaHoy({ compacta }) {
  const { tablero, perfil, servicios } = useApp()
  const [ia, setIa] = useState(null)
  useEffect(() => { supabase.rpc('mi_cupo_chat').then(({ data }) => setIa(data ?? null)) }, [tablero])
  const lim = tablero?.email
  const limite = lim ? lim.limite_hoy : perfil?.limite_diario ?? 15
  const enviados = lim ? lim.enviados_hoy : tablero?.enviados_hoy ?? 0
  const pct = Math.min(100, (enviados / Math.max(1, limite)) * 100)
  const iaMes = ia?.empresa_limite ? Math.min(100, (ia.empresa_usados / ia.empresa_limite) * 100) : null
  return (
    <div className={'cupo' + (compacta ? ' compacta' : '')}>
      <div className="cupo-fila">
        <div className="cupo-top"><span>{lim ? 'Emails de hoy' : 'Envíos de hoy'}</span><b>{tablero ? `${enviados} / ${limite}` : '…'}</b></div>
        <div className="cupo-barra"><span style={{ width: pct + '%' }} /></div>
        {lim?.calentando
          ? <small className="cupo-nota"><Flame size={11} /> Casilla en calentamiento · semana {lim.etapa} de 3</small>
          : <small className="cupo-nota">{lim ? `Límite de tu casilla: ${lim.elegido} por día` : 'Cada mensaje lo revisás y lo enviás vos.'}</small>}
      </div>
      {iaMes !== null && (
        <div className="cupo-fila">
          <div className="cupo-top"><span>IA del mes</span><b>{Math.round(iaMes)}%</b></div>
          <div className={'cupo-barra' + (iaMes >= 80 ? ' alerta' : '')}><span style={{ width: iaMes + '%' }} /></div>
          {iaMes >= 80 && <small className="cupo-nota alerta">{iaMes >= 100 ? 'Se terminó la IA del plan este mes.' : 'Usaste más del 80 % del plan.'}</small>}
        </div>
      )}
      {servicios.ia !== null && (
        <span className={'ia-pill ' + (servicios.ia ? 'on' : 'off')}><Sparkles size={12} /> {servicios.ia ? 'Claude conectado' : 'Claude sin clave'}</span>
      )}
    </div>
  )
}

function Topbar({ modo, nombre, perfil, session, empresa, onBuscar, onNuevo }) {
  const cambiarModo = useCambiarModo()
  const nav = useNavigate()
  const confirmar = useConfirmar()
  const { tablero, contadores, porRevisar } = useApp()
  const [abierto, setAbierto] = useState('') // '' | usuario | nuevo | avisos
  const [sombra, setSombra] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onScroll = () => setSombra(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    if (!abierto) return
    const cerrar = e => { if (!ref.current?.contains(e.target)) setAbierto('') }
    const esc = e => e.key === 'Escape' && setAbierto('')
    document.addEventListener('mousedown', cerrar); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', cerrar); document.removeEventListener('keydown', esc) }
  }, [abierto])
  const alternar = k => setAbierto(a => a === k ? '' : k)

  const sinLeer = contadores?.respuestas_sin_leer ?? 0
  const tareas = (contadores?.tareas_hoy ?? 0) + (tablero?.seguimientos_vencidos ?? 0)
  const cola = contadores?.cola ?? 0
  const avisos = modo === 'b2c' ? [] : [
    sinLeer > 0 && { to: '/respuestas?clase=sin_leer', icono: MessageSquareReply, texto: `${sinLeer} ${sinLeer === 1 ? 'respuesta nueva' : 'respuestas nuevas'}`, sub: 'Claude ya las clasificó' },
    tareas > 0 && { to: '/seguimientos', icono: ListTodo, texto: `${tareas} ${tareas === 1 ? 'cosa' : 'cosas'} para hacer hoy`, sub: 'Tareas y seguimientos vencidos' },
    porRevisar > 0 && { to: '/revisar', icono: Inbox, texto: `${porRevisar} ${porRevisar === 1 ? 'empresa' : 'empresas'} por revisar`, sub: 'Lo que encontró la búsqueda' },
    cola > 0 && { to: '/envios', icono: Send, texto: `${cola} ${cola === 1 ? 'mail' : 'mails'} saliendo`, sub: 'Se envían solos, con pausas' },
  ].filter(Boolean)
  const totalAvisos = modo === 'b2c' ? 0 : sinLeer + tareas + porRevisar

  async function salirDeTodos() {
    if (!(await confirmar({ titulo: '¿Cerrar sesión en todos los dispositivos?', texto: 'Se cierra en esta computadora, en el celular y en cualquier otro lugar donde hayas entrado.', aceptar: 'Cerrar en todos' }))) return
    await supabase.auth.signOut({ scope: 'global' })
  }

  return (
    <header className={'topbar' + (sombra ? ' sombra' : '')} ref={ref}>
      <Link to="/" className="marca marca-movil"><Logo size={20} /></Link>
      <button type="button" className="buscador-boton" onClick={onBuscar} aria-label="Buscar una empresa o contacto (Ctrl+K)">
        <Search size={16} /><span>{modo === 'b2c' ? 'Buscar cliente por nombre, email o teléfono…' : 'Buscar empresa, contacto, web o teléfono…'}</span><kbd>⌘K</kbd>
      </button>
      <span className="espacio" />

      <div className="topbar-acciones">
        <div className="menu-pop">
          <button type="button" className="btn primario chico boton-nuevo" aria-expanded={abierto === 'nuevo'} onClick={() => alternar('nuevo')}><Plus size={15} /> <span>Nuevo</span></button>
          {abierto === 'nuevo' && (
            <div className="menu menu-derecha" onClick={() => setAbierto('')}>
              {modo === 'b2c' ? <>
              <Link to="/clientes?nuevo=1"><UserPlus size={16} /> Cliente a mano</Link>
              <Link to="/clientes?importar=1"><Upload size={16} /> Importar clientes</Link>
              </> : <>
              <button type="button" onClick={onNuevo}><Building2 size={16} /> Empresa a mano</button>
              <Link to="/buscar"><Search size={16} /> Buscar clientes con IA</Link>
              <Link to="/importar"><Upload size={16} /> Importar Excel o CSV</Link>
              <Link to="/seguimientos"><ListTodo size={16} /> Tarea</Link>
              <Link to="/envios"><Send size={16} /> Envío masivo</Link>
              <Link to="/secuencias"><Workflow size={16} /> Secuencia</Link>
              </>}
            </div>
          )}
        </div>

        <div className="menu-pop">
          <button type="button" className="boton-icono" aria-label={`Avisos${totalAvisos ? `: ${totalAvisos}` : ''}`} aria-expanded={abierto === 'avisos'} onClick={() => alternar('avisos')}>
            <Bell size={18} />{totalAvisos > 0 && <span className="campana-num">{totalAvisos > 99 ? '99+' : totalAvisos}</span>}
          </button>
          {abierto === 'avisos' && (
            <div className="menu menu-derecha menu-avisos" onClick={() => setAbierto('')}>
              <div className="cab"><b>Para atender</b></div>
              {avisos.length ? avisos.map(a => {
                const I = a.icono
                return <Link key={a.to} to={a.to} className="aviso-item"><span className="aviso-icono"><I size={15} /></span><span><b>{a.texto}</b><small>{a.sub}</small></span></Link>
              }) : <div className="vacio-avisos"><ShieldCheck size={20} /><span>Estás al día. No hay nada pendiente.</span></div>}
            </div>
          )}
        </div>

        <div className="menu-pop menu-usuario">
          <button type="button" aria-expanded={abierto === 'usuario'} aria-label="Menú de la cuenta" onClick={() => alternar('usuario')}>
            <Avatar nombre={nombre} />
            <span className="quien"><b>{perfil?.nombre || 'Mi cuenta'}</b><span>{empresa || perfil?.estudio || session.user.email}</span></span>
            <ChevronDown size={15} className="muted chev-usuario" />
          </button>
          {abierto === 'usuario' && (
            <div className="menu menu-derecha" onClick={() => setAbierto('')}>
              <div className="cab"><b>{perfil?.nombre || 'Mi cuenta'}</b><span>{session.user.email}</span>{perfil?.rol && perfil?.empresa_id && <span className="chip" style={{ marginTop: 6 }}>{perfil.rol === 'admin' ? 'Admin' : 'Vendedor'}{empresa ? ` · ${empresa}` : ''}</span>}</div>
              <Link to="/cuenta"><UserCircle size={16} /> Mi cuenta</Link>
              <Link to="/email"><Mail size={16} /> Email y firma</Link>
              {(perfil?.rol === 'admin' || perfil?.es_admin) && perfil?.empresa_id && <Link to="/equipo"><UsersRound size={16} /> Equipo</Link>}
              {perfil?.es_admin && <Link to="/admin"><Crown size={16} /> Super admin</Link>}
              {(perfil?.modos ?? ['b2b']).length > 1
                ? <button type="button" onClick={() => cambiarModo(modo === 'b2c' ? 'b2b' : 'b2c')}><ArrowLeftRight size={16} /> Pasar a {MODOS[modo === 'b2c' ? 'b2b' : 'b2c'].titulo} ({modo === 'b2c' ? 'B2B' : 'B2C'})</button>
                : (perfil?.rol === 'admin' || perfil?.es_admin) && <button type="button" onClick={() => cambiarModo(modo === 'b2c' ? 'b2b' : 'b2c', true)}><ArrowLeftRight size={16} /> Activar también {modo === 'b2c' ? 'ventas a empresas (B2B)' : 'ventas a consumidores (B2C)'}</button>}
              <Link to="/terminos"><FileText size={16} /> Términos y privacidad</Link>
              <hr />
              <button type="button" onClick={salirDeTodos}><DoorOpen size={16} /> Cerrar sesión en todos lados</button>
              <button type="button" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Salir</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
