import { Link } from 'react-router-dom'
import {
  LayoutDashboard, Sun, Flame, Ban, Workflow, BookOpen, MapPin, Target, Upload, Bot,
  Store, Package, Mail, UsersRound, Plug, Gauge, UserCircle, Crown, LifeBuoy, ChevronRight, Smartphone, Download,
} from 'lucide-react'
import { useApp } from '../App.jsx'
import { useInstalar } from '../lib/instalar.js'

/**
 * Todo lo que no está en el menú principal (que quedó en 7 cosas): herramientas que se usan de vez en
 * cuando y la configuración. Nada se borró: sigue todo acá, a un toque.
 */
export default function Mas() {
  const { perfil } = useApp()
  const app = useInstalar()
  const esAdminEquipo = perfil?.rol === 'admin' || perfil?.es_admin
  const grupos = [
    ['Herramientas', 'Para cuando las necesites', [
      ['/tablero', 'Tablero', 'El resumen de tu actividad', LayoutDashboard],
      ['/hoy', 'Tu día', 'Lo que te toca hoy, en orden', Sun],
      ['/interesados', 'Interesados', 'Las que mostraron interés', Flame],
      ['/revisar?tab=descartado', 'Rechazadas', 'Las que descartaste en la búsqueda', Ban],
      ['/secuencias', 'Secuencias', 'Seguimientos que se mandan solos', Workflow],
      ['/plantillas', 'Plantillas', 'Mensajes listos para reusar', BookOpen],
      ['/visitas', 'Visitas', 'Recorridos para visitar en persona', MapPin],
      ['/metas', 'Metas', 'Cuánto querés lograr por semana', Target],
      ['/importar', 'Importar', 'Subir una lista de Excel o CSV', Upload],
      ['/asistente', 'Asistente IA', 'Preguntale a Claude sobre tu lista', Bot],
    ]],
    ['Configuración', 'Se arma una vez', [
      ['/negocio', 'Mi negocio', 'Qué vendés y a quién: guía las búsquedas', Store],
      ['/catalogo', 'Catálogo', 'Tus productos y precios', Package],
      ['/email', 'Email', 'Tu casilla para mandar y recibir', Mail],
      ...(esAdminEquipo && perfil?.empresa_id ? [['/equipo', 'Equipo', 'Quiénes usan la cuenta', UsersRound]] : []),
      ['/conexiones', 'Conexiones', 'Formulario web, WhatsApp y Claude', Plug],
      ['/uso', 'Uso y límites', 'Cuánto te queda y cuándo se renueva', Gauge],
      ['/cuenta', 'Tu cuenta', 'Datos, contraseña y país', UserCircle],
      ['/ayuda', 'Ayuda', 'Cómo se usa cada cosa', LifeBuoy],
      ...(perfil?.es_admin ? [['/admin', 'Super admin', 'Claves, cuentas y planes', Crown]] : []),
    ]],
  ]
  return (
    <div className="home">
      <header className="home-cab">
        <div>
          <h1>Más</h1>
          <p className="home-sub">Herramientas que usás de vez en cuando y la configuración de tu cuenta.</p>
        </div>
      </header>
      {!app.instalada && (app.puede || app.iphone) && (
        <section className="home-card instalar-app">
          <Smartphone size={22} aria-hidden="true" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>Instalá Prospecta como app</h3>
            <small>{app.puede ? 'Queda en tu pantalla de inicio y abre sin el navegador.' : 'En iPhone: tocá Compartir y después «Agregar a inicio».'}</small>
          </div>
          {app.puede && <button className="btn primario" onClick={app.instalar}><Download size={15} /> Instalar</button>}
        </section>
      )}
      <div className="home-grid">
        {grupos.map(([titulo, sub, items]) => (
          <section key={titulo} className="home-card">
            <header><div><h3>{titulo}</h3><small>{sub}</small></div></header>
            <div className="accion-lista">
              {items.map(([to, nombre, ayuda, Icono]) => (
                <Link key={to} to={to} className="accion-item mas-item">
                  <Icono size={17} aria-hidden="true" />
                  <div><b className="fuerte">{nombre}</b><div className="muted chico">{ayuda}</div></div>
                  <span className="espacio" />
                  <ChevronRight size={15} className="muted" aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
