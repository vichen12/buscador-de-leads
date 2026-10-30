import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, ShieldCheck, Repeat, Moon, Cake, UserPlus, Upload, ArrowRight, Wallet, Store } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { saludoHora } from '../lib/util.js'
import { Esqueleto, ErrorCarga, Contador } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const ORIGENES = { manual: 'A mano', compra: 'Compra', formulario: 'Formulario', importado: 'Importados', referido: 'Referidos', aliado: 'Aliados', creador: 'Creadores' }
const plata = n => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR')
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0)

export default function TableroB2C() {
  const { perfil, comercial } = useApp()
  const [t, setT] = useState(null)
  const [error, setError] = useState(null)
  const cargar = () => supabase.rpc('tablero_b2c').then(({ data, error }) => (error ? setError(error) : setT(data)))
  useEffect(() => { cargar() }, [])
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

      {comercial === null && (
        <div className="aviso-negocio">
          <Store size={22} />
          <div style={{ flex: 1 }}><b>Contanos de tu negocio</b><p>Qué vendés y a quién. Claude lo usa para escribirles a tus clientes con tu estilo.</p></div>
          <Link className="btn primario" to="/negocio">Completar mi negocio <ArrowRight size={15} /></Link>
        </div>
      )}

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
