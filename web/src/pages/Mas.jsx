import { Link } from 'react-router-dom'
import {
  LayoutDashboard, Sun, Flame, Ban, Workflow, BookOpen, MapPin, Target, Upload, Bot,
  Store, Package, Mail, UsersRound, Plug, Gauge, UserCircle, Crown, LifeBuoy, ChevronRight,
} from 'lucide-react'
import { useApp } from '../App.jsx'

/**
 * Todo lo que no está en el menú principal (que quedó en 7 cosas): herramientas que se usan de vez en
 * cuando y la configuración. Nada se borró: sigue todo acá, a un toque.
 */
export default function Mas() {
  const { perfil } = useApp()
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
