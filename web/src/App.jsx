import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { supabase, configurado, llamarFuncion } from './lib/supabase.js'
import { ToastProvider, ConfirmProvider, Cargando } from './components/ui.jsx'
import { CambiarEstadoProvider } from './components/CambiarEstado.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Tablero from './pages/Tablero.jsx'
import Prospectos from './pages/Prospectos.jsx'
import Prospecto from './pages/Prospecto.jsx'
import Seguimientos from './pages/Seguimientos.jsx'
import Importar from './pages/Importar.jsx'
import Revisar from './pages/Revisar.jsx'
import Email from './pages/Email.jsx'
import Envios from './pages/Envios.jsx'
import { contarPorRevisar } from './lib/hallazgos.js'
import BuscarPlaces from './pages/BuscarPlaces.jsx'
import Cuenta from './pages/Cuenta.jsx'
import Admin from './pages/Admin.jsx'
import Asistente from './pages/Asistente.jsx'
import MiNegocio from './pages/MiNegocio.jsx'
import Conexiones from './pages/Conexiones.jsx'
import { Baja, Terminos, Privacidad, FormularioPublico } from './pages/Publico.jsx'
import TuDia from './pages/TuDia.jsx'
import Metas from './pages/Metas.jsx'
import Catalogo from './pages/Catalogo.jsx'
import Visitas from './pages/Visitas.jsx'
import Ayuda from './pages/Ayuda.jsx'
import Landing from './pages/Landing.jsx'
import Respuestas from './pages/Respuestas.jsx'
import Secuencias from './pages/Secuencias.jsx'
import Equipo from './pages/Equipo.jsx'
import Reportes from './pages/Reportes.jsx'
import Clientes from './pages/Clientes.jsx'
import { NuevaClave, DosPasos } from './components/Seguridad.jsx'
import TableroB2C from './pages/TableroB2C.jsx'
import { Aliados, Creadores } from './pages/AliadosCreadores.jsx'
import Campanas from './pages/Campanas.jsx'
import { Ban, LogOut } from 'lucide-react'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <CambiarEstadoProvider>
          <Raiz />
        </CambiarEstadoProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}

// Páginas públicas: se ven sin iniciar sesión (link de baja de los mails, términos y privacidad)
const PUBLICAS = /^\/(baja\/|f\/|conoce$|terminos$|privacidad$)/
function Raiz() {
  const { pathname } = useLocation()
  if (PUBLICAS.test(pathname)) return (
    <Routes>
      <Route path="/baja/:token" element={<Baja />} />
      <Route path="/f/:token" element={<FormularioPublico />} />
      <Route path="/conoce" element={<Landing />} />
      <Route path="/terminos" element={<Terminos />} />
      <Route path="/privacidad" element={<Privacidad />} />
    </Routes>
  )
  return <Privada />
}

function Privada() {
  const [session, setSession] = useState(undefined)
  const [recuperando, setRecuperando] = useState(() => /type=recovery/.test(window.location.hash))
  const [nivel, setNivel] = useState(null) // verificación en dos pasos: null = revisando, 'ok' o 'falta'
  const [perfil, setPerfil] = useState(null)
  const [tablero, setTablero] = useState(null)
  const [servicios, setServicios] = useState({ ia: null, places: null })
  const [acceso, setAcceso] = useState(null)
  const [correo, setCorreo] = useState(null)
  const [porRevisar, setPorRevisar] = useState(0)
  const [contadores, setContadores] = useState({})
  const [comercial, setComercial] = useState(undefined) // perfil comercial: undefined = cargando, null = sin completar

  useEffect(() => {
    if (!configurado) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((e, s) => { setSession(s); if (e === 'PASSWORD_RECOVERY') setRecuperando(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  const refrescar = useCallback(async () => {
    if (!session) return
    const [{ data: p }, { data: t }, { data: a }, { data: c }] = await Promise.all([
      supabase.from('perfiles').select('*').eq('id', session.user.id).single(),
      supabase.rpc('tablero'),
      supabase.rpc('mi_acceso'),
      supabase.from('perfil_comercial').select('*').eq('owner_id', session.user.id).maybeSingle(),
    ])
    setComercial(c ?? null)
    contarPorRevisar().then(setPorRevisar)
    supabase.rpc('contadores').then(({ data }) => setContadores(data ?? {}))
    supabase.from('conexiones_correo').select('*').eq('owner_id', session.user.id).maybeSingle().then(({ data }) => setCorreo(data ?? null))
    setPerfil(p)
    setTablero(t)
    setAcceso(a ?? { habilitado: true })
  }, [session])

  const refrescarServicios = useCallback(() =>
    llamarFuncion('generar-mensajes', { modo: 'estado' }).then(setServicios).catch(() => setServicios({ ia: false, places: false })), [])

  useEffect(() => { refrescar() }, [refrescar])
  // Si la cuenta tiene verificación en dos pasos y esta sesión todavía no la pasó, se pide el código
  useEffect(() => {
    if (!session) return
    supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setNivel(data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2' ? 'falta' : 'ok')).catch(() => setNivel('ok'))
  }, [session?.access_token])
  useEffect(() => {
    if (!session) return
    refrescarServicios()
  }, [session, refrescarServicios])

  if (!configurado) return <SinConfigurar />
  if (session === undefined) return <div className="centro-pantalla"><Cargando /></div>
  if (!session) return <Login />
  if (recuperando) return <NuevaClave onListo={() => { setRecuperando(false); window.history.replaceState(null, '', '/') }} />
  if (nivel === null) return <div className="centro-pantalla"><Cargando /></div>
  if (nivel === 'falta') return <DosPasos onListo={() => setNivel('ok')} />

  if (!acceso) return <div className="centro-pantalla"><Cargando /></div>
  if (acceso.habilitado === false) return <Suspendido acceso={acceso} email={session.user.email} />

  const valor = { session, perfil, tablero, enviadosHoy: tablero?.enviados_hoy ?? 0, refrescar, servicios, refrescarServicios, acceso, comercial, setComercial, correo, setCorreo, porRevisar, setPorRevisar, contadores }
  return (
    <Ctx.Provider value={valor}>
      <Layout>
        <Routes>
          <Route path="/" element={perfil?.modo === 'b2c' ? <TableroB2C /> : <Tablero />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/hoy" element={<TuDia />} />
          <Route path="/ayuda" element={<Ayuda />} />
          <Route path="/metas" element={<Metas />} />
          <Route path="/catalogo" element={<Catalogo />} />
          <Route path="/visitas" element={<Visitas />} />
          <Route path="/campanas" element={<Campanas />} />
          <Route path="/aliados" element={<Aliados />} />
          <Route path="/creadores" element={<Creadores />} />
          <Route path="/prospectos" element={<Prospectos />} />
          <Route path="/prospectos/:id" element={<Prospecto />} />
          <Route path="/seguimientos" element={<Seguimientos />} />
          <Route path="/respuestas" element={<Respuestas />} />
          <Route path="/secuencias" element={<Secuencias />} />
          <Route path="/importar" element={<Importar />} />
          <Route path="/buscar" element={<BuscarPlaces />} />
          <Route path="/revisar" element={<Revisar />} />
          <Route path="/email" element={<Email />} />
          <Route path="/envios" element={<Envios />} />
          <Route path="/cuenta" element={<Cuenta />} />
          <Route path="/negocio" element={<MiNegocio />} />
          <Route path="/conexiones" element={<Conexiones />} />
          <Route path="/asistente" element={<Asistente />} />
          <Route path="/admin" element={perfil?.es_admin ? <Admin /> : <Navigate to="/" />} />
          <Route path="/equipo" element={<Equipo />} />
          <Route path="/reportes" element={<Reportes />} />
          <Route path="/ajustes" element={<Navigate to="/cuenta" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </Ctx.Provider>
  )
}

function Suspendido({ acceso, email }) {
  const empresa = acceso.empresa_activa === false
  return (
    <div className="centro-pantalla">
      <div className="tarjeta suspendido">
        <div className="icono-grande" style={{ background: 'var(--err-soft)', color: 'var(--err)' }}><Ban size={26} /></div>
        <h2>{empresa ? 'Tu empresa está suspendida' : 'Tu cuenta está suspendida'}</h2>
        <p>
          {empresa
            ? <>El acceso de <b>{acceso.empresa || 'tu empresa'}</b> a Prospecta está pausado por ahora. Tus datos siguen guardados.</>
            : <>Un administrador pausó el acceso de <b>{email}</b>. Tus datos siguen guardados.</>}
          {' '}Si creés que es un error, escribile a quien te dio el acceso.
        </p>
        <button className="btn" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Salir</button>
      </div>
    </div>
  )
}

function SinConfigurar() {
  return (
    <div className="centro-pantalla">
      <div className="tarjeta" style={{ maxWidth: 520 }}>
        <h2>Falta configurar Supabase</h2>
        <p>Creá <code>web/.env.local</code> con <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> (copiá <code>.env.example</code>) y reiniciá <code>npm run dev</code>.</p>
      </div>
    </div>
  )
}
