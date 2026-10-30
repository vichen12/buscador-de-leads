import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './styles.css'
import { supabase } from './lib/supabase.js'

// Registro liviano de errores para el super admin (como mucho 5 por sesión, sin datos personales)
let errores = 0
async function registrarError(mensaje, detalle) {
  if (errores >= 5 || !supabase) return
  errores++
  try {
    const { data } = await supabase.auth.getSession()
    if (!data?.session) return
    await supabase.from('errores_app').insert({ mensaje: String(mensaje).slice(0, 500), detalle: String(detalle ?? '').slice(0, 4000), pagina: window.location.pathname.replace(/[0-9a-f-]{36}/g, ':id') })
  } catch { /* nada */ }
}
window.addEventListener('error', e => registrarError(e.message, e.error?.stack))
window.addEventListener('unhandledrejection', e => registrarError(e.reason?.message ?? e.reason, e.reason?.stack))

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
