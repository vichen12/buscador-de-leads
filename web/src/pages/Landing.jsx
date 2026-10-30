import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Sparkles, Send, MessageSquareReply, BarChart3, ShieldCheck, Building2, Heart, Handshake, Check, Loader2, CheckCircle2, ArrowRight, Users, Workflow } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import Logo from '../components/Logo.jsx'
import { AreaDoble, Dona, BarrasH } from '../components/Graficos.jsx'

const B2B = [
  [Search, 'Encuentra empresas que encajan', 'Le contás qué vendés y a quién. Claude busca en Google Maps y en la web, y te explica por qué cada una te sirve.'],
  [Sparkles, 'Escribe cada mensaje', 'Un email distinto para cada empresa, con tu tono y datos reales de ellos. Vos lo revisás.'],
  [Send, 'Manda desde tu casilla, con cuidado', 'Salen de a uno, con pausas, respetando el límite y el calentamiento de tu email. Quedan en tus Enviados.'],
  [MessageSquareReply, 'Lee las respuestas', 'Te avisa quién contestó, qué quiere y te propone la respuesta. Si alguien pide la baja, no se le escribe más.'],
  [Workflow, 'Hace el seguimiento', 'Secuencias de email, llamadas y LinkedIn que se frenan solas cuando te responden.'],
  [BarChart3, 'Te dice qué funciona', 'Qué rubros, zonas y mensajes traen más respuestas, reuniones y clientes.'],
]
const B2C = [
  [Heart, 'Tus clientes, ordenados', 'Quién compró, quién volvió, quién se enfrió. Sólo trabajás con gente que ya te conoce y te dio permiso.'],
  [Send, 'Campañas que traen de vuelta', 'Recompra, reactivación, cumpleaños, referidos y reseñas. Claude escribe, vos mandás.'],
  [Handshake, 'Aliados y creadores', 'Negocios que te recomiendan y creadores que te muestran, con comisiones y resultados.'],
]

export default function Landing() {
  const [planes, setPlanes] = useState([])
  const [f, setF] = useState({ nombre: '', empresa: '', email: '', telefono: '', modo: 'b2b', plan: '', mensaje: '' })
  const [estado, setEstado] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { supabase?.from('planes').select('*').eq('activo', true).order('orden').then(({ data }) => setPlanes(data ?? [])) }, [])
  async function pedir(e) {
    e.preventDefault()
    setEstado('enviando'); setError('')
    const { data, error } = await supabase.rpc('solicitar_acceso', { p_nombre: f.nombre, p_empresa: f.empresa, p_email: f.email, p_telefono: f.telefono, p_modo: f.modo, p_plan: f.plan, p_mensaje: f.mensaje })
    if (error || !data?.ok) { setEstado(''); setError(data?.error || 'No se pudo enviar. Probá de nuevo.') } else setEstado('ok')
  }
  const elegirPlan = p => { setF(x => ({ ...x, plan: p.id })); document.getElementById('acceso')?.scrollIntoView({ behavior: 'smooth' }) }
  return (
    <div className="landing">
      <header className="landing-cab">
        <Logo size={24} />
        <nav><a href="#como">Cómo funciona</a><a href="#demo">Demo</a><a href="#planes">Planes</a><Link to="/" className="btn chico">Entrar</Link><a href="#acceso" className="btn chico primario">Pedí acceso</a></nav>
      </header>

      <section className="landing-hero">
        <span className="chip"><Sparkles size={12} /> Con Claude, de Anthropic</span>
        <h1>Conseguí clientes para tu negocio,<br />de a uno y bien.</h1>
        <p>Prospecta encuentra a las empresas que te pueden comprar, les escribe un mensaje pensado para cada una y te ordena el seguimiento. Vos revisás y decidís; la app cuida tu casilla y la ley.</p>
        <div className="acciones" style={{ justifyContent: 'center' }}><a href="#acceso" className="btn primario btn-grande">Pedí acceso <ArrowRight size={16} /></a><a href="#demo" className="btn btn-grande">Ver el demo</a></div>
      </section>

      <section id="como" className="landing-seccion">
        <h2><Building2 size={22} /> Si le vendés a empresas</h2>
        <div className="landing-grilla">{B2B.map(([I, t, d]) => <div key={t} className="landing-card"><I size={20} /><h3>{t}</h3><p>{d}</p></div>)}</div>
        <h2 style={{ marginTop: 40 }}><Heart size={22} /> Si le vendés a personas</h2>
        <div className="landing-grilla">{B2C.map(([I, t, d]) => <div key={t} className="landing-card b2c"><I size={20} /><h3>{t}</h3><p>{d}</p></div>)}</div>
      </section>

      <section id="demo" className="landing-seccion">
        <h2>Así se ve un mes de trabajo</h2>
        <p className="muted">Datos de ejemplo de una empresa de logística que vende automatización de depósitos.</p>
        <Demo />
      </section>

      <section className="landing-seccion landing-confianza">
        <ShieldCheck size={26} />
        <div><h3>Hecho para no quemar tu casilla ni tu reputación</h3>
          <ul><li><Check size={14} /> Límite diario y calentamiento de casilla nueva</li><li><Check size={14} /> Link de baja en cada mail y lista de "No contactar" automática</li><li><Check size={14} /> WhatsApp y LinkedIn nunca automatizados: los mandás vos</li><li><Check size={14} /> En B2C, sólo a quienes te dieron permiso</li><li><Check size={14} /> Tus datos aislados de otras cuentas, verificación en dos pasos y descarga de todo cuando quieras</li></ul></div>
      </section>

      {planes.length > 0 && (
        <section id="planes" className="landing-seccion">
          <h2>Planes</h2>
          <div className="landing-planes">{planes.map(p => (
            <div key={p.id} className={'landing-plan' + (p.destacado ? ' destacado' : '')}>
              {p.destacado && <span className="chip">El más elegido</span>}
              <h3>{p.nombre}</h3><p className="muted">{p.descripcion}</p>
              <div className="precio"><b>{p.moneda === 'USD' ? 'US$' : '$'} {Number(p.precio_mensual).toLocaleString('es-AR')}</b><small>/mes</small></div>
              <ul><li><Users size={14} /> {p.usuarios_max} {p.usuarios_max === 1 ? 'usuario' : 'usuarios'}</li><li><Sparkles size={14} /> {Number(p.ia_mes).toLocaleString('es-AR')} consultas de IA por mes</li><li><Check size={14} /> {p.modos.includes('b2c') ? 'Empresas y consumidores' : 'Venta a empresas'}</li></ul>
              <button type="button" className={'btn ancho ' + (p.destacado ? 'primario' : '')} onClick={() => elegirPlan(p)}>Quiero este</button>
            </div>
          ))}</div>
        </section>
      )}

      <section id="acceso" className="landing-seccion">
        <div className="landing-acceso tarjeta">
          {estado === 'ok' ? <div className="baja-ok"><CheckCircle2 size={34} /><h2>¡Listo! Te escribimos en las próximas horas.</h2></div> : (
            <form onSubmit={pedir}>
              <h2 style={{ marginTop: 0 }}>Pedí acceso</h2>
              <div className="dos-col" style={{ gap: 12 }}>
                <label>Tu nombre<input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} required /></label>
                <label>Empresa<input value={f.empresa} onChange={e => setF({ ...f, empresa: e.target.value })} /></label>
                <label>Email<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></label>
                <label>WhatsApp<input value={f.telefono} onChange={e => setF({ ...f, telefono: e.target.value })} /></label>
              </div>
              <div className="chips-filtro" style={{ marginBottom: 12 }}>
                <button type="button" className={f.modo === 'b2b' ? 'activo' : ''} onClick={() => setF({ ...f, modo: 'b2b' })}><Building2 size={13} /> Le vendo a empresas</button>
                <button type="button" className={f.modo === 'b2c' ? 'activo' : ''} onClick={() => setF({ ...f, modo: 'b2c' })}><Heart size={13} /> Le vendo a personas</button>
              </div>
              <label>¿Qué vendés? (opcional)<textarea rows={2} value={f.mensaje} onChange={e => setF({ ...f, mensaje: e.target.value })} /></label>
              {error && <p style={{ color: 'var(--err)' }}>{error}</p>}
              <button className="btn primario ancho btn-grande" disabled={estado === 'enviando'}>{estado === 'enviando' && <Loader2 size={16} className="spin" />} Quiero probarlo</button>
            </form>
          )}
        </div>
      </section>

      <footer className="landing-pie"><Logo size={18} /><span><Link to="/terminos">Términos</Link> · <Link to="/privacidad">Privacidad</Link></span></footer>
    </div>
  )
}

/** Demo con datos de ejemplo (sin cuenta) */
function Demo() {
  const dias = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 29 + i)
    const habil = d.getDay() !== 0 && d.getDay() !== 6
    return { etiqueta: d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' }), enviados: habil ? 12 + ((i * 7) % 9) : 0, respuestas: habil ? (i * 3) % 4 : 0 }
  })
  return (
    <div className="landing-demo">
      <div className="kpis">
        {[['Envíos', '318'], ['Respondieron', '14%'], ['Reuniones', '9'], ['Propuestas', '5'], ['Clientes', '2']].map(([l, v]) => <div key={l} className="kpi"><div className="kpi-top"><span>{l}</span></div><b>{v}</b></div>)}
      </div>
      <div className="grilla-3">
        <section className="tarjeta"><h3 className="titulo-tarjeta">Envíos y respuestas</h3><AreaDoble datos={dias} series={[{ clave: 'enviados', nombre: 'Envíos', color: '#ff9a7a' }, { clave: 'respuestas', nombre: 'Respuestas', color: '#16161a' }]} alto={160} /></section>
        <section className="tarjeta"><h3 className="titulo-tarjeta">Cómo responden</h3><Dona items={[{ label: 'Interesados', valor: 18, color: '#15803d' }, { label: 'Piden info', valor: 15, color: '#1d4ed8' }, { label: 'Quieren reunión', valor: 9, color: '#0d9488' }, { label: 'No interesados', valor: 11, color: '#c0262d' }]} sub="respuestas" tam={130} /></section>
        <section className="tarjeta"><h3 className="titulo-tarjeta">Rubros que más responden</h3><BarrasH items={[{ label: 'Distribuidoras mayoristas', valor: 22 }, { label: 'Frigoríficos', valor: 17 }, { label: 'Operadores logísticos', valor: 12 }, { label: 'Fábricas de alimentos', valor: 9 }]} formato={n => n + '%'} /></section>
      </div>
    </div>
  )
}
