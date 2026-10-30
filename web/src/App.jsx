import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { supabase, configurado, llamarFuncion } from './lib/supabase.js'
import { ToastProvider, ConfirmProvider, Cargando } from './components/ui.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Tablero from './pages/Tablero.jsx'
import Prospectos from './pages/Prospectos.jsx'
import Prospecto from './pages/Prospecto.jsx'
import Seguimientos from './pages/Seguimientos.jsx'
import Importar from './pages/Importar.jsx'
import Revisar from './pages/Revisar.jsx'
import Email from './pages/Email.jsx'
import { contarPorRevisar } from './lib/hallazgos.js'
import BuscarPlaces from './pages/BuscarPlaces.jsx'
import Cuenta from './pages/Cuenta.jsx'
import Admin from './pages/Admin.jsx'
import Asistente from './pages/Asistente.jsx'
import MiNegocio from './pages/MiNegocio.jsx'
import Conexiones from './pages/Conexiones.jsx'
import { Ban, LogOut } from 'lucide-react'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Raiz />
      </ConfirmProvider>
    </ToastProvider>
  )
}

function Raiz() {
  const [session, setSession] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [tablero, setTablero] = useState(null)
  const [servicios, setServicios] = useState({ ia: null, places: null })
  const [acceso, setAcceso] = useState(null)
  const [correo, setCorreo] = useState(null)
  const [porRevisar, setPorRevisar] = useState(0)
  const [comercial, setComercial] = useState(undefined) // perfil comercial: undefined = cargando, null = sin completar

  useEffect(() => {
    if (!configurado) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
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
    supabase.from('conexiones_correo').select('*').eq('owner_id', session.user.id).maybeSingle().then(({ data }) => setCorreo(data ?? null))
    setPerfil(p)
    setTablero(t)
    setAcceso(a ?? { habilitado: true })
  }, [session])

  const refrescarServicios = useCallback(() =>
    llamarFuncion('generar-mensajes', { modo: 'estado' }).then(setServicios).catch(() => setServicios({ ia: false, places: false })), [])

  useEffect(() => { refrescar() }, [refrescar])
  useEffect(() => {
    if (!session) return
    refrescarServicios()
  }, [session, refrescarServicios])

  if (!configurado) return <SinConfigurar />
  if (session === undefined) return <div className="centro-pantalla"><Cargando /></div>
  if (!session) return <Login />

  if (!acceso) return <div className="centro-pantalla"><Cargando /></div>
  if (acceso.habilitado === false) return <Suspendido acceso={acceso} email={session.user.email} />

  const valor = { session, perfil, tablero, enviadosHoy: tablero?.enviados_hoy ?? 0, refrescar, servicios, refrescarServicios, acceso, comercial, setComercial, correo, setCorreo, porRevisar, setPorRevisar }
  return (
    <Ctx.Provider value={valor}>
      <Layout>
        <Routes>
          <Route path="/" element={<Tablero />} />
          <Route path="/prospectos" element={<Prospectos />} />
          <Route path="/prospectos/:id" element={<Prospecto />} />
          <Route path="/seguimientos" element={<Seguimientos />} />
          <Route path="/importar" element={<Importar />} />
          <Route path="/buscar" element={<BuscarPlaces />} />
          <Route path="/revisar" element={<Revisar />} />
          <Route path="/email" element={<Email />} />
          <Route path="/cuenta" element={<Cuenta />} />
          <Route path="/negocio" element={<MiNegocio />} />
          <Route path="/conexiones" element={<Conexiones />} />
          <Route path="/asistente" element={<Asistente />} />
          <Route path="/admin" element={perfil?.es_admin ? <Admin /> : <Navigate to="/" />} />
          <Route path="/equipo" element={<Navigate to="/admin" />} />
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
