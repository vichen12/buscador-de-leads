import { useEffect, useRef, useState } from 'react'
import { NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { Plug, Store, Bot, LayoutDashboard, Users, CalendarClock, Upload, Search, UserCircle, Crown, LogOut, Sparkles, ChevronDown, Building2, Inbox, Mail, Send } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { Avatar, useToast } from './ui.jsx'
import Logo from './Logo.jsx'
import AsistenteFlotante from './AsistenteFlotante.jsx'

export default function Layout({ children }) {
  const { perfil, tablero, session, servicios, acceso, correo, refrescar, porRevisar } = useApp()
  const toastRevision = useToast()
  // Si el email está conectado, revisar respuestas al entrar (como mucho cada 15 minutos)
  useEffect(() => {
    if (!correo?.leer_respuestas) return
    const ultima = correo.ultima_revision ? new Date(correo.ultima_revision).getTime() : 0
    if (Date.now() - ultima < 15 * 60000 || sessionStorage.getItem('revisando')) return
    sessionStorage.setItem('revisando', '1')
    llamarFuncion('correo', { modo: 'revisar' }).then(r => {
      if (r.respondieron?.length) { toastRevision(`📬 Te respondieron: ${r.respondieron.join(', ')}`); refrescar() }
    }).catch(() => {}).finally(() => setTimeout(() => sessionStorage.removeItem('revisando'), 15 * 60000))
  }, [correo?.owner_id])
  const limite = perfil?.limite_diario ?? 15
  const enviados = tablero?.enviados_hoy ?? 0
  const pct = Math.min(100, (enviados / limite) * 100)
  const vencidos = tablero?.seguimientos_vencidos ?? 0
  const nombre = perfil?.nombre || session.user.email
  const loc = useLocation()

  const trabajo = [
    ['/', 'Tablero', LayoutDashboard],
    ['/prospectos', 'Para contactar', Users],
    ['/envios', 'Envío masivo', Send],
    ['/seguimientos', 'Seguimientos', CalendarClock, vencidos],
    ['/asistente', 'Asistente IA', Bot],
  ]
  const cargar = [
    ['/negocio', 'Mi negocio', Store],
    ['/buscar', 'Buscar clientes', Search, 0, 'solo-escritorio'],
    ['/revisar', 'Por revisar', Inbox, porRevisar],
    ['/importar', 'Importar', Upload, 0, 'solo-escritorio'],
  ]
  const cuenta = [['/cuenta', 'Mi cuenta', UserCircle, 0, perfil?.es_admin ? 'solo-escritorio' : ''], ['/email', 'Email', Mail, 0, 'solo-escritorio'], ['/conexiones', 'Conexiones', Plug, 0, 'solo-escritorio']]
  if (perfil?.es_admin) cuenta.push(['/admin', 'Super admin', Crown])

  const enlace = ([to, label, Icono, badge, clase]) => (
    <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'activo ' : '') + (clase || '')}>
      <Icono size={18} /> {label}
      {badge > 0 && <span className="cuenta">{badge}</span>}
    </NavLink>
  )

  return (
    <div className="app">
      <aside className="lateral">
        <Link to="/" className="marca"><Logo size={24} /></Link>
        <nav>
          <div className="nav-titulo">Trabajo</div>
          {trabajo.map(enlace)}
          <div className="nav-titulo">Prospectar</div>
          {cargar.map(enlace)}
          <div className="nav-titulo">Cuenta</div>
          {cuenta.map(enlace)}
        </nav>
        <div className="cupo" title="Envíos confirmados hoy / límite diario">
          <div className="cupo-top"><span>Envíos de hoy</span><b>{perfil ? `${enviados} / ${limite}` : '…'}</b></div>
          <div className="cupo-barra"><span style={{ width: pct + '%' }} /></div>
          <small>Cada mensaje lo revisás y lo enviás vos, de a pocos.</small>
          {servicios.ia !== null && (
            <span className={'ia-pill ' + (servicios.ia ? 'on' : 'off')}><Sparkles size={12} /> {servicios.ia ? 'Claude conectado' : 'Claude sin clave'}</span>
          )}
        </div>
      </aside>
      <div style={{ minWidth: 0 }}>
        <Topbar nombre={nombre} perfil={perfil} session={session} empresa={acceso?.empresa} enviados={enviados} limite={limite} />
        <main className="contenido">
          <div className="pagina" key={loc.pathname}>{children}</div>
        </main>
        <AsistenteFlotante />
      </div>
    </div>
  )
}

function Topbar({ nombre, perfil, session, empresa, enviados, limite }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [sombra, setSombra] = useState(false)
  const ref = useRef(null)
  const input = useRef(null)

  useEffect(() => {
    const onScroll = () => setSombra(window.scrollY > 4)
    const onKey = e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus() } }
    window.addEventListener('scroll', onScroll, { passive: true }); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('keydown', onKey) }
  }, [])
  useEffect(() => {
    if (!abierto) return
    const cerrar = e => { if (!ref.current?.contains(e.target)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  return (
    <header className={'topbar' + (sombra ? ' sombra' : '')}>
      <Link to="/" className="marca marca-movil"><Logo size={20} /></Link>
      <form className="buscador" role="search" onSubmit={e => { e.preventDefault(); nav('/prospectos?q=' + encodeURIComponent(q.trim())); input.current?.blur() }}>
        <Search size={16} />
        <input ref={input} placeholder="Buscar un negocio…" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar un negocio" />
        <span className="atajo">⌘K</span>
      </form>
      <div className="menu-usuario" ref={ref}>
        <button type="button" aria-expanded={abierto} aria-label="Menú de la cuenta" onClick={() => setAbierto(a => !a)}>
          <Avatar nombre={nombre} />
          <span className="quien"><b>{perfil?.nombre || 'Mi cuenta'}</b><span>{empresa || perfil?.estudio || session.user.email}</span></span>
          <ChevronDown size={15} className="muted" />
        </button>
        {abierto && (
          <div className="menu" onClick={() => setAbierto(false)}>
            <div className="cab"><b>{perfil?.nombre || 'Mi cuenta'}</b><span>{session.user.email}</span></div>
            {empresa && <div className="cab" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Building2 size={15} className="muted" /><span>{empresa}</span></div>}
            <Link to="/cuenta"><UserCircle size={16} /> Mi cuenta</Link>
            {perfil?.es_admin && <Link to="/admin"><Crown size={16} /> Super admin</Link>}
            <div className="cab" style={{ border: 0, margin: 0 }}><span>Envíos de hoy: {enviados} / {limite}</span></div>
            <hr />
            <button type="button" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Salir</button>
          </div>
        )}
      </div>
    </header>
  )
}
