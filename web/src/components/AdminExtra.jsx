import { useEffect, useState } from 'react'
import { Loader2, Save, AlertTriangle, MessageSquareHeart, CreditCard } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fechaHora, mensajeError } from '../lib/util.js'
import { useToast, Interruptor } from './ui.jsx'
import { AreaDoble } from './Graficos.jsx'

/** Super admin · uso de la plataforma día por día */
export function Metricas() {
  const [m, setM] = useState(null)
  useEffect(() => { supabase.rpc('admin_metricas').then(({ data }) => setM(data)) }, [])
  if (!m) return <Loader2 size={18} className="spin" />
  const items = [['Usuarios activos', m.usuarios], ['Empresas', m.empresas], ['Usaron la app (7 días)', m.activos_7], ['Empresas en pipelines', m.prospectos], ['Clientes B2C', m.clientes_b2c], ['Envíos (30 días)', m.envios_30], ['Respuestas (30 días)', m.respuestas_30], ['Consultas de IA (30 días)', m.ia_30], ['Errores (7 días)', m.errores_7], ['Sugerencias nuevas', m.feedback_nuevo]]
  return (
    <>
      <div className="metricas-admin">{items.map(([l, v]) => <div key={l} className="kpi"><div className="kpi-top"><span>{l}</span></div><b>{Number(v || 0).toLocaleString('es-AR')}</b></div>)}</div>
      <section className="tarjeta">
        <h3 className="titulo-tarjeta">Últimos 30 días</h3>
        <AreaDoble datos={m.por_dia.map(d => ({ ...d, etiqueta: new Date(d.dia + 'T12:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }) }))} series={[{ clave: 'envios', nombre: 'Envíos', color: '#ff9a7a' }, { clave: 'activos', nombre: 'Personas activas', color: '#16161a' }]} />
      </section>
    </>
  )
}

/** Super admin · sugerencias y errores */
export function Soporte() {
  const toast = useToast()
  const [fb, setFb] = useState(null)
  const [errores, setErrores] = useState(null)
  const cargar = () => {
    supabase.from('feedback').select('*, perfiles:owner_id(nombre)').order('created_at', { ascending: false }).limit(100).then(({ data, error }) => setFb(error ? [] : data))
    supabase.from('errores_app').select('*').order('created_at', { ascending: false }).limit(100).then(({ data }) => setErrores(data ?? []))
  }
  useEffect(() => { cargar() }, [])
  async function marcar(f, estado) {
    const { error } = await supabase.from('feedback').update({ estado }).eq('id', f.id)
    if (error) toast(mensajeError(error), 'error'); else cargar()
  }
  return (
    <div className="dos-col">
      <section className="tarjeta">
        <h3 className="titulo-tarjeta"><MessageSquareHeart size={16} /> Sugerencias y consultas</h3>
        {!fb ? <Loader2 size={16} className="spin" /> : !fb.length ? <p className="muted">Nadie escribió todavía.</p> : fb.map(f => (
          <div key={f.id} className="fila-soporte">
            <div><span className={'chip ' + (f.tipo === 'error' ? 'mal' : f.tipo === 'idea' ? 'ok' : 'info')}>{f.tipo}</span> <small className="muted">{f.perfiles?.nombre || ''} · {fechaHora(f.created_at)} · {f.pagina}</small></div>
            <p>{f.texto}</p>
            <select value={f.estado} onChange={e => marcar(f, e.target.value)}><option value="nuevo">Nuevo</option><option value="visto">Visto</option><option value="resuelto">Resuelto</option></select>
          </div>
        ))}
      </section>
      <section className="tarjeta">
        <h3 className="titulo-tarjeta"><AlertTriangle size={16} /> Errores en la app</h3>
        {!errores ? <Loader2 size={16} className="spin" /> : !errores.length ? <p className="muted">Sin errores registrados. 🎉</p> : errores.map(e => (
          <details key={e.id} className="fila-soporte"><summary><b>{e.mensaje}</b> <small className="muted">{e.pagina} · {fechaHora(e.created_at)}</small></summary><pre>{e.detalle}</pre></details>
        ))}
      </section>
    </div>
  )
}

/** Super admin · planes (el cobro queda apagado hasta decidir proveedor) */
export function Planes() {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const cargar = () => supabase.from('planes').select('*').order('orden').then(({ data }) => setLista(data ?? []))
  useEffect(() => { cargar() }, [])
  const set = (i, k, v) => setLista(l => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)))
  async function guardar(p) {
    const { error } = await supabase.from('planes').update({ nombre: p.nombre, descripcion: p.descripcion, precio_mensual: Number(p.precio_mensual) || 0, moneda: p.moneda, usuarios_max: Number(p.usuarios_max) || 1, ia_mes: Number(p.ia_mes) || 0, destacado: p.destacado, activo: p.activo }).eq('id', p.id)
    if (error) toast(mensajeError(error), 'error'); else toast('Plan guardado', 'ok')
  }
  if (!lista) return <Loader2 size={16} className="spin" />
  return (
    <>
      <div className="aviso-legal" style={{ marginBottom: 14 }}><CreditCard size={16} /><span>Los planes se muestran en la página pública. <b>El cobro está apagado</b>: queda pendiente elegir Mercado Pago o Stripe. Mientras tanto, el plan de cada empresa se asigna a mano en la pestaña Empresas.</span></div>
      <div className="grilla-planes">{lista.map((p, i) => (
        <section key={p.id} className="tarjeta">
          <label>Nombre<input value={p.nombre} onChange={e => set(i, 'nombre', e.target.value)} /></label>
          <label>Descripción<input value={p.descripcion} onChange={e => set(i, 'descripcion', e.target.value)} /></label>
          <div className="dos-col" style={{ gap: 10 }}>
            <label>Precio por mes<input type="number" value={p.precio_mensual} onChange={e => set(i, 'precio_mensual', e.target.value)} /></label>
            <label>Moneda<select value={p.moneda} onChange={e => set(i, 'moneda', e.target.value)}><option>USD</option><option>ARS</option></select></label>
            <label>Usuarios<input type="number" value={p.usuarios_max} onChange={e => set(i, 'usuarios_max', e.target.value)} /></label>
            <label>IA por mes<input type="number" value={p.ia_mes} onChange={e => set(i, 'ia_mes', e.target.value)} /></label>
          </div>
          <div style={{ display: 'flex', gap: 16, margin: '6px 0 12px' }}>
            <Interruptor on={p.destacado} onCambiar={v => set(i, 'destacado', v)} etiqueta="Destacado" />
            <Interruptor on={p.activo} onCambiar={v => set(i, 'activo', v)} etiqueta="Visible" />
          </div>
          <button type="button" className="btn primario chico" onClick={() => guardar(p)}><Save size={14} /> Guardar</button>
        </section>
      ))}</div>
    </>
  )
}
