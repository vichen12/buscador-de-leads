import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, Users, Send, MessageCircle, Trophy, CalendarClock, ArrowRight, Upload, Search, Sparkles, ChevronRight, Flame, Inbox, ListTodo } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { ESTADOS, ESTADOS_VISIBLES, fecha, hoyLocal, saludoHora } from '../lib/util.js'
import { Avatar, Esqueleto, Aviso, Contador } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

export default function Tablero() {
  const { perfil, tablero: t, refrescar, servicios, comercial, porRevisar, session } = useApp()
  const [vencidos, setVencidos] = useState([])
  const [listos, setListos] = useState([])
  const [rubros, setRubros] = useState([])
  const [tasas, setTasas] = useState(null)
  const [tareas, setTareas] = useState([])

  useEffect(() => {
    refrescar()
    const hoy = hoyLocal(), menos = n => { const d = new Date(hoy + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
    Promise.all([7, 30].map(n => supabase.rpc('reporte', { p_desde: menos(n - 1), p_hasta: hoy, p_owner: session.user.id })))
      .then(([a, b]) => a.data && b.data && setTasas({ d7: a.data.totales, d30: b.data.totales }))
    supabase.from('tareas').select('id, titulo, tipo, vence, prospecto_id, prospectos(nombre)').eq('owner_id', session.user.id).is('hecha_at', null)
      .lte('vence', hoyLocal()).order('vence').limit(5).then(({ data }) => setTareas(data ?? []))
    supabase.from('prospectos').select('id, nombre, rubro, proximo_seguimiento').eq('owner_id', session.user.id)
      .eq('estado', 'contactado').lte('proximo_seguimiento', hoyLocal())
      .order('proximo_seguimiento').limit(6).then(({ data }) => setVencidos(data ?? []))
    supabase.from('prospectos').select('id, nombre, rubro, resenas, mensajes!inner(tipo)').eq('owner_id', session.user.id)
      .eq('estado', 'pendiente').eq('mensajes.tipo', 'whatsapp').order('resenas', { ascending: false, nullsFirst: false }).limit(6)
      .then(({ data }) => setListos(data ?? []))
    supabase.from('prospectos').select('rubro, estado').eq('owner_id', session.user.id).then(({ data }) => {
      const m = {}
      for (const p of data ?? []) {
        const r = (m[p.rubro || 'Sin rubro'] ??= { total: 0, contactados: 0, respondieron: 0 })
        r.total++
        if (p.estado !== 'pendiente') r.contactados++
        if (p.estado === 'respondio' || p.estado === 'cliente') r.respondieron++
      }
      setRubros(Object.entries(m).sort((a, b) => b[1].total - a[1].total))
    })
  }, [])

  if (!t) return <Esqueleto />
  const tasa = t.contactados ? Math.round((t.respondieron / t.contactados) * 100) : 0
  const maxDia = Math.max(1, ...t.envios_7_dias.map(d => d.envios))
  const lim = t.email
  const quedan = lim ? Math.max(0, lim.limite_hoy - lim.enviados_hoy) : Math.max(0, t.limite_diario - t.enviados_hoy)
  const nombre = (perfil?.nombre || '').split(' ')[0]

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>{saludoHora()}{nombre ? `, ${nombre}` : ''}</h1>
          <p className="saludo">{t.total === 0 ? 'Empecemos cargando tus primeros prospectos.'
            : quedan > 0 ? `Hoy te quedan ${quedan} envíos. ${t.seguimientos_vencidos ? `Y ${t.seguimientos_vencidos} seguimientos esperan respuesta.` : ''}`
            : 'Llegaste al cupo de hoy. Mañana seguimos.'}</p>
        </div>
        <div className="acciones">
          <Link className="btn" to="/importar"><Upload size={16} /> Importar</Link>
          <Link className="btn primario" to="/prospectos?estado=pendiente"><Send size={16} /> Contactar pendientes</Link>
        </div>
      </header>

      {comercial === null && (
        <div className="aviso-negocio">
          <Store size={22} />
          <div style={{ flex: 1 }}><b>Empezá por contarnos de tu negocio</b><p>Qué vendés, a quién y dónde. Claude arma tu estrategia (rubros, zonas y filtros) y la usa para buscar clientes y escribir los mensajes.</p></div>
          <Link className="btn primario" to="/negocio">Completar mi negocio <ArrowRight size={15} /></Link>
        </div>
      )}

      {porRevisar > 0 && (
        <Link to="/revisar" className="aviso-revisar">
          <Inbox size={18} />
          <span><b>{porRevisar} {porRevisar === 1 ? 'empresa encontrada' : 'empresas encontradas'} por revisar.</b> Sumá a tu lista las que te sirven y descartá el resto.</span>
          <span className="espacio" /><span className="link">Revisar <ArrowRight size={14} /></span>
        </Link>
      )}

      {servicios.ia === false && t.total > 0 && (
        <Aviso tipo="info">Los borradores se están armando con plantillas. Cuando el super admin cargue la clave de Claude en el panel, los escribe la IA para cada negocio. {perfil?.es_admin ? <Link to="/admin">Cargar la clave</Link> : <Link to="/cuenta">Ver estado</Link>}</Aviso>
      )}

      {t.total === 0 ? (
        <div className="tarjeta vacio">
          <div className="icono-grande"><Users size={26} /></div>
          <h3>Todavía no cargaste prospectos</h3>
          <p>Subí un CSV o Excel con tu lista, o pedile a Claude que busque negocios sin web propia.</p>
          <div className="acciones" style={{ justifyContent: 'center' }}>
            <Link className="btn primario" to="/importar"><Upload size={16} /> Importar lista</Link>
            <Link className="btn" to="/buscar"><Search size={16} /> Buscar negocios con IA</Link>
          </div>
        </div>
      ) : <>
        <div className="kpis stagger">
          <Kpi icono={Users} color="#52525b" fondo="#f1f1f3" titulo="Prospectos" valor={t.total} />
          {lim
            ? <Kpi icono={Send} color="#1d4ed8" fondo="#e8efff" titulo="Emails de hoy" valor={<>{lim.enviados_hoy}<small> / {lim.limite_hoy}</small></>} pie={lim.calentando ? `Casilla en calentamiento · semana ${lim.etapa} de 3` : `Hoy: ${lim.enviados_hoy} de ${lim.limite_hoy} envíos`} />
            : <Kpi icono={Send} color="#1d4ed8" fondo="#e8efff" titulo="Envíos de hoy" valor={<>{t.enviados_hoy}<small> / {t.limite_diario}</small></>} />}
          {tasas
            ? <Kpi icono={MessageCircle} color="#b45309" fondo="#fdf3e2" titulo="Respuesta · 30 días" valor={`${tasas.d30.contactados ? Math.round((tasas.d30.respondieron / tasas.d30.contactados) * 100) : 0}%`} pie={`${tasas.d30.respondieron} de ${tasas.d30.contactados} · últimos 7 días: ${tasas.d7.contactados ? Math.round((tasas.d7.respondieron / tasas.d7.contactados) * 100) + '%' : '—'}`} />
            : <Kpi icono={MessageCircle} color="#b45309" fondo="#fdf3e2" titulo="Tasa de respuesta" valor={`${tasa}%`} pie={`${t.respondieron ?? 0} de ${t.contactados ?? 0} contactados`} />}
          <Kpi icono={Trophy} color="#15803d" fondo="#e8f6ec" titulo="Clientes" valor={t.clientes ?? 0} />
          <Kpi icono={CalendarClock} color="#8b2c3c" fondo="#f8ecee" titulo="Seguimientos para hoy" valor={t.seguimientos_vencidos ?? 0} alerta={t.seguimientos_vencidos > 0} />
        </div>

        <div className="grilla-2">
          <section className="tarjeta">
            <div className="tarjeta-titulo"><h3>Embudo</h3><Link to="/prospectos?vista=pipeline" className="chico">Ver pipeline <ArrowRight size={13} style={{ verticalAlign: -2 }} /></Link></div>
            <div className="embudo">
              {Object.entries(ESTADOS_VISIBLES).map(([k, e]) => {
                const n = t.por_estado[k] ?? 0
                return (
                  <Link key={k} to={`/prospectos?estado=${k}`} className="embudo-fila">
                    <span>{e.label}</span>
                    <span className="embudo-barra"><span style={{ width: (t.total ? Math.max(2, (n / t.total) * 100) : 0) + '%', background: e.barra }} /></span>
                    <b>{n}</b>
                  </Link>
                )
              })}
            </div>
          </section>
          <section className="tarjeta">
            <div className="tarjeta-titulo"><h3>Envíos de los últimos 7 días</h3><span className="chip">{t.envios_7_dias.reduce((a, d) => a + d.envios, 0)} en total</span></div>
            <div className="columnas">
              {t.envios_7_dias.map(d => (
                <div key={d.dia} className="col">
                  <span className="col-n">{d.envios || ''}</span>
                  <span className={'col-b' + (d.envios ? '' : ' vacia')} style={{ height: Math.max(3, (d.envios / maxDia) * 100) + '%' }} />
                  <span className="col-l">{new Date(d.dia + 'T12:00').toLocaleDateString('es-AR', { weekday: 'short' })}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="grilla-2">
          <section className="tarjeta">
            <div className="tarjeta-titulo"><h3><Flame size={16} /> Listos para enviar</h3><Link to="/prospectos?estado=pendiente" className="chico">Ver todos</Link></div>
            {listos.length === 0 ? <p className="muted">Generá borradores desde Prospectos y van a aparecer acá, ordenados por reseñas.</p> : (
              <div className="accion-lista">
                {listos.map(p => (
                  <Link key={p.id} to={`/prospectos/${p.id}`} className="accion-item">
                    <Avatar nombre={p.nombre} />
                    <div><b className="fuerte">{p.nombre}</b><div className="muted chico">{p.rubro} · {p.resenas ?? 0} reseñas</div></div>
                    <span className="espacio" /><span className="chip ia"><Sparkles size={12} /> borrador</span><ChevronRight size={16} />
                  </Link>
                ))}
              </div>
            )}
          </section>
          <section className="tarjeta">
            <div className="tarjeta-titulo"><h3><CalendarClock size={16} /> Para hacer hoy</h3><Link to="/seguimientos" className="chico">Ver todo</Link></div>
            {vencidos.length === 0 && tareas.length === 0 ? <p className="muted">Nada pendiente. Las tareas de tus secuencias y los seguimientos de quien no responda en {perfil?.dias_seguimiento ?? 5} días aparecen acá.</p> : (
              <div className="accion-lista">
                {tareas.map(ta => (
                  <Link key={ta.id} to={ta.prospecto_id ? `/prospectos/${ta.prospecto_id}` : '/seguimientos'} className="accion-item">
                    <span className="aviso-icono"><ListTodo size={15} /></span>
                    <div><b className="fuerte">{ta.titulo}</b><div className="muted chico">{ta.vence < hoyLocal() ? `Vencida el ${fecha(ta.vence)}` : 'Para hoy'}{ta.prospectos?.nombre ? ` · ${ta.prospectos.nombre}` : ''}</div></div>
                    <span className="espacio" /><ChevronRight size={16} />
                  </Link>
                ))}
                {vencidos.map(p => (
                  <Link key={p.id} to={`/prospectos/${p.id}?tab=seguimiento`} className="accion-item">
                    <Avatar nombre={p.nombre} />
                    <div><b className="fuerte">{p.nombre}</b><div className="muted chico">{p.rubro} · tocaba el {fecha(p.proximo_seguimiento)}</div></div>
                    <span className="espacio" /><ChevronRight size={16} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="tarjeta sin-pad">
          <div className="tarjeta-titulo" style={{ padding: '18px 22px 0' }}><h3>Por rubro</h3><Link to="/reportes" className="chico">Ver reportes completos <ArrowRight size={13} style={{ verticalAlign: -2 }} /></Link></div>
          <div className="scroll-x">
            <table className="tabla">
              <thead><tr><th>Rubro</th><th>Total</th><th>Contactados</th><th>Respondieron</th><th>Respuesta</th></tr></thead>
              <tbody>{rubros.map(([r, v]) => (
                <tr key={r}><td className="fuerte">{r}</td><td>{v.total}</td><td>{v.contactados}</td><td>{v.respondieron}</td>
                  <td>{v.contactados ? Math.round((v.respondieron / v.contactados) * 100) + '%' : '—'}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>
      </>}
    </>
  )
}

function Kpi({ icono: Icono, color, fondo, titulo, valor, pie, alerta }) {
  return (
    <div className={'kpi' + (alerta ? ' alerta' : '')}>
      <div className="kpi-top"><span>{titulo}</span><span className="kpi-icono" style={{ color, background: fondo }}><Icono size={16} /></span></div>
      <b>{typeof valor === 'number' ? <Contador valor={valor} /> : valor}</b>
      {pie && <small>{pie}</small>}
    </div>
  )
}
