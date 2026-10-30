import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ShieldCheck, Repeat, Moon, Cake, UserPlus, Upload, ArrowRight, Wallet, Store, Handshake, Megaphone, Send } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { saludoHora } from '../lib/util.js'
import { Esqueleto, ErrorCarga, Contador } from '../components/ui.jsx'
import { useApp } from '../App.jsx'
import { Dona, BarrasH, AreaDoble } from '../components/Graficos.jsx'

const ORIGENES = { manual: 'A mano', compra: 'Compra', formulario: 'Formulario', importado: 'Importados', referido: 'Referidos', aliado: 'Aliados', creador: 'Creadores' }
const plata = n => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

export default function TableroB2C() {
  const { perfil, comercial } = useApp()
  const [t, setT] = useState(null)
  const [error, setError] = useState(null)
  const [extra, setExtra] = useState(null)
  const cargar = () => supabase.rpc('tablero_b2c').then(({ data, error }) => (error ? setError(error) : setT(data)))
  useEffect(() => {
    cargar()
    // Para los gráficos: altas por mes, recompra por frecuencia y top clientes
    supabase.from('clientes').select('id, nombre, compras, total_gastado, created_at, ultima_compra, acepta_email, acepta_whatsapp, baja_at').limit(5000).then(({ data }) => {
      const cs = data ?? []
      const meses = []
      for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); meses.push({ clave: d.toISOString().slice(0, 7), etiqueta: d.toLocaleDateString('es-AR', { month: 'short' }), titulo: d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }), nuevos: 0, compraron: 0 }) }
      for (const c of cs) {
        const m = meses.find(x => x.clave === String(c.created_at).slice(0, 7)); if (m) m.nuevos++
        const u = meses.find(x => x.clave === String(c.ultima_compra ?? '').slice(0, 7)); if (u) u.compraron++
      }
      const frec = [['1 compra', x => x.compras === 1], ['2 compras', x => x.compras === 2], ['3 a 5', x => x.compras >= 3 && x.compras <= 5], ['Más de 5', x => x.compras > 5]].map(([label, f]) => ({ label, valor: cs.filter(f).length }))
      const top = [...cs].sort((a, b) => Number(b.total_gastado) - Number(a.total_gastado)).slice(0, 5).filter(x => Number(x.total_gastado) > 0).map(x => ({ label: x.nombre, valor: Number(x.total_gastado), sub: `${x.compras} compras` }))
      setExtra({ meses, frec, top })
    })
  }, [])
  const nombre = (perfil?.nombre || '').split(' ')[0]

  if (error) return <ErrorCarga error={error} onReintentar={cargar} />
  if (!t) return <Esqueleto />
  const maxOrigen = Math.max(1, ...Object.values(t.por_origen))

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>{saludoHora()}{nombre ? `, ${nombre}` : ''}</h1>
          <p className="saludo">Tus clientes: quién vuelve a comprar, quién se enfrió y a quién le podés escribir.</p>
        </div>
        <div className="acciones">
          <Link className="btn" to="/clientes?importar=1"><Upload size={15} /> Importar</Link>
          <Link className="btn primario" to="/clientes?nuevo=1"><UserPlus size={15} /> Sumar cliente</Link>
        </div>
      </header>

      <PrimerosPasosB2C t={t} comercial={comercial} />

      {t.total === 0 ? (
        <div className="tarjeta vacio">
          <div className="icono-grande"><Heart size={26} /></div>
          <h3>Empezá cargando tus clientes</h3>
          <p>Subí la lista de tu sistema de ventas o tu tienda online. Con eso ves quién recompra, quién se enfrió y armás campañas sólo para quienes aceptaron recibir mensajes.</p>
          <div className="acciones" style={{ justifyContent: 'center' }}>
            <Link className="btn primario" to="/clientes?importar=1"><Upload size={16} /> Importar clientes</Link>
            <Link className="btn" to="/clientes?nuevo=1"><UserPlus size={16} /> Sumar a mano</Link>
          </div>
        </div>
      ) : <>
        <div className="kpis stagger">
          <Kpi icono={Heart} titulo="Clientes" valor={t.total} pie={`${t.nuevos_30} nuevos en 30 días`} />
          <Kpi icono={ShieldCheck} titulo="Aceptan mensajes" valor={t.con_consentimiento} pie={`${pct(t.con_consentimiento, t.total)}% · ${t.acepta_email} email · ${t.acepta_whatsapp} WhatsApp`} />
          <Kpi icono={Repeat} titulo="Recompraron" valor={t.recompraron} pie={`${pct(t.recompraron, t.compraron)}% de los que compraron`} />
          <Kpi icono={Moon} titulo="Dormidos" valor={t.dormidos} pie="Sin comprar hace más de 90 días" />
          <Kpi icono={Wallet} titulo="Ticket promedio" valor={plata(t.ticket_promedio)} pie={`${plata(t.facturado)} en total`} />
        </div>

        <div className="kpis kpis-3">
          <Link to="/campanas" className="kpi"><div className="kpi-top"><span>Mensajes de campañas (30 días)</span><span className="kpi-icono" style={{ color: 'var(--acc)', background: 'var(--acc-soft)' }}><Send size={16} /></span></div><b>{t.campanas_30 ?? 0}</b><small>Sólo a clientes con permiso</small></Link>
          <Link to="/aliados" className="kpi"><div className="kpi-top"><span>Aliados activos</span><span className="kpi-icono" style={{ color: 'var(--acc)', background: 'var(--acc-soft)' }}><Handshake size={16} /></span></div><b>{t.aliados_activos ?? 0}</b><small>{t.por_origen?.aliado ?? 0} clientes vinieron por ellos</small></Link>
          <Link to="/creadores" className="kpi"><div className="kpi-top"><span>Creadores acordados</span><span className="kpi-icono" style={{ color: 'var(--acc)', background: 'var(--acc-soft)' }}><Megaphone size={16} /></span></div><b>{t.creadores_acordados ?? 0}</b><small>{t.por_origen?.creador ?? 0} clientes vinieron por ellos</small></Link>
        </div>

        {extra && (
          <div className="grilla-2">
            <section className="tarjeta">
              <div className="tarjeta-titulo"><h3>Últimos 6 meses</h3></div>
              <AreaDoble datos={extra.meses} series={[{ clave: 'nuevos', nombre: 'Clientes nuevos', color: '#5ec8b8' }, { clave: 'compraron', nombre: 'Última compra en el mes', color: '#0b6f66' }]} />
            </section>
            <section className="tarjeta">
              <div className="tarjeta-titulo"><h3>Permiso para escribirles</h3><Link to="/clientes" className="chico">Ver clientes</Link></div>
              <Dona centro={`${t.total ? Math.round((t.con_consentimiento / t.total) * 100) : 0}%`} sub="con permiso" items={[
                { label: 'Email y WhatsApp', valor: Math.max(0, t.acepta_email + t.acepta_whatsapp - t.con_consentimiento), color: '#0b6f66' },
                { label: 'Sólo email', valor: Math.max(0, t.con_consentimiento - t.acepta_whatsapp), color: '#5ec8b8' },
                { label: 'Sólo WhatsApp', valor: Math.max(0, t.con_consentimiento - t.acepta_email), color: '#f59e0b' },
                { label: 'Sin permiso', valor: t.total - t.con_consentimiento, color: '#ddd6cb' },
              ]} />
            </section>
          </div>
        )}
        {extra && (
          <div className="grilla-2">
            <section className="tarjeta">
              <div className="tarjeta-titulo"><h3>Cuántas veces compran</h3></div>
              <BarrasH items={extra.frec} />
            </section>
            <section className="tarjeta">
              <div className="tarjeta-titulo"><h3>Tus mejores clientes</h3></div>
              {extra.top.length ? <BarrasH items={extra.top} formato={plata} /> : <p className="muted">Cargá compras y total gastado para ver quiénes te compran más.</p>}
            </section>
          </div>
        )}

        <div className="grilla-2">
          <section className="tarjeta">
            <div className="tarjeta-titulo"><h3>Para hacer hoy</h3></div>
            <div className="accion-lista">
              {t.dormidos > 0 && <Link to="/clientes" className="accion-item"><span className="aviso-icono"><Moon size={15} /></span><div><b className="fuerte">{t.dormidos} clientes dormidos</b><div className="muted chico">Hace más de 90 días que no compran: un mensaje de reactivación suele traer a varios de vuelta.</div></div><span className="espacio" /><ArrowRight size={16} /></Link>}
              {t.cumplen_semana > 0 && <Link to="/clientes" className="accion-item"><span className="aviso-icono"><Cake size={15} /></span><div><b className="fuerte">{t.cumplen_semana} cumplen años esta semana</b><div className="muted chico">Un saludo con un beneficio es de lo que más se responde.</div></div><span className="espacio" /><ArrowRight size={16} /></Link>}
              {t.total - t.con_consentimiento > 0 && <Link to="/clientes" className="accion-item"><span className="aviso-icono"><ShieldCheck size={15} /></span><div><b className="fuerte">{t.total - t.con_consentimiento} sin permiso para escribirles</b><div className="muted chico">Pediles el OK en la próxima compra: sin eso no se les puede mandar nada.</div></div><span className="espacio" /><ArrowRight size={16} /></Link>}
              {!t.dormidos && !t.cumplen_semana && t.total === t.con_consentimiento && <p className="muted">Todo al día.</p>}
            </div>
          </section>
          <section className="tarjeta">
            <div className="tarjeta-titulo"><h3>De dónde vienen</h3></div>
            <div className="embudo">
              {Object.entries(t.por_origen).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <div key={k} className="embudo-fila"><span>{ORIGENES[k] ?? k}</span><span className="embudo-barra"><span style={{ width: Math.max(2, (n / maxOrigen) * 100) + '%', background: 'var(--acc)' }} /></span><b>{n}</b></div>
              ))}
            </div>
          </section>
        </div>
      </>}
    </>
  )
}

function Kpi({ icono: Icono, titulo, valor, pie }) {
  return (
    <div className="kpi">
      <div className="kpi-top"><span>{titulo}</span><span className="kpi-icono" style={{ color: 'var(--acc)', background: 'var(--acc-soft)' }}><Icono size={16} /></span></div>
      <b>{typeof valor === 'number' ? <Contador valor={valor} /> : valor}</b>
      {pie && <small>{pie}</small>}
    </div>
  )
}

function PrimerosPasosB2C({ t, comercial }) {
  const [oculto, setOculto] = useState(() => { try { return localStorage.getItem('prospecta-pasos-b2c') === '1' } catch { return false } })
  const pasos = [
    ['Contanos de tu negocio', 'Qué vendés y a quién: Claude escribe con tu estilo.', '/negocio', comercial != null],
    ['Cargá tus clientes', 'Importá la lista de tu sistema o tienda online.', '/clientes?importar=1', t.total > 0],
    ['Marcá quién te dio permiso', 'Sin permiso no se le puede escribir a nadie.', '/clientes', t.con_consentimiento > 0],
    ['Mandá tu primera campaña', 'Por ejemplo, a los que compraron una sola vez.', '/campanas', (t.campanas_30 ?? 0) > 0],
    ['Sumá un aliado', 'Un negocio que te pueda recomendar.', '/aliados', (t.aliados_activos ?? 0) > 0 || (t.por_origen?.aliado ?? 0) > 0],
  ]
  const hechos = pasos.filter(p => p[3]).length
  if (comercial === undefined || oculto || hechos === pasos.length) return null
  return (
    <section className="tarjeta primeros-pasos">
      <div className="tarjeta-titulo"><h3>Primeros pasos <span className="chip">{hechos} de {pasos.length}</span></h3><button type="button" className="btn fantasma chico" onClick={() => { try { localStorage.setItem('prospecta-pasos-b2c', '1') } catch {} setOculto(true) }}>Ocultar</button></div>
      <div className="cupo-barra" style={{ marginBottom: 12 }}><span style={{ width: (hechos / pasos.length) * 100 + '%' }} /></div>
      <ol className="pasos-lista">{pasos.map(([titulo, sub, to, ok], i) => (
        <li key={to} className={ok ? 'hecho' : ''}><span className="paso-num">{ok ? '✓' : i + 1}</span><div><b>{titulo}</b><small className="muted">{sub}</small></div>{!ok && <Link to={to} className="btn chico primario">Hacerlo <ArrowRight size={13} /></Link>}</li>
      ))}</ol>
    </section>
  )
}
