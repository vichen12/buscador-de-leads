import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sun, MessageSquareReply, ListTodo, CalendarClock, Sparkles, Inbox, MapPin, Flame, Target, ArrowRight, CheckCircle2, FileText, Send, Users, Search, Mail, Trophy, Handshake } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { hoyLocal, fecha, saludoHora } from '../lib/util.js'
import { Esqueleto } from '../components/ui.jsx'
import { useApp } from '../App.jsx'
import { Sparkline, Embudo, Columnas, BarraPartes } from '../components/Graficos.jsx'
import { useNavigate } from 'react-router-dom'

const PRIORIDAD = { interesado: 0, reunion: 0, pide_info: 1, derivar: 2, otro: 3, no_interesado: 4 }

/** "Tu día": lo más importante primero, en el orden en que conviene hacerlo */
export default function TuDia() {
  const { session, perfil, porRevisar, tablero } = useApp()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  useEffect(() => {
    const yo = session.user.id, hoy = hoyLocal()
    Promise.all([
      supabase.from('respuestas').select('id, clasificacion, motivo, prospecto_id, prospectos(nombre)').eq('owner_id', yo).eq('leida', false).order('recibida_at', { ascending: false }).limit(20),
      supabase.from('tareas').select('id, titulo, tipo, vence, prospecto_id, prospectos(nombre)').eq('owner_id', yo).is('hecha_at', null).lte('vence', hoy).order('vence').limit(20),
      supabase.from('prospectos').select('id, nombre, rubro, proximo_seguimiento').eq('owner_id', yo).eq('estado', 'contactado').lte('proximo_seguimiento', hoy).order('proximo_seguimiento').limit(10),
      supabase.from('prospectos').select('id, nombre, rubro, mensajes!inner(tipo, enviado_at)').eq('owner_id', yo).eq('estado', 'pendiente').eq('mensajes.tipo', 'email').is('mensajes.enviado_at', null).limit(10),
      supabase.from('visitas').select('id, fecha, prospectos(id, nombre, direccion)').eq('owner_id', yo).eq('fecha', hoy).eq('hecha', false),
      supabase.from('propuestas').select('id, numero, titulo, prospecto_id, updated_at, prospectos(nombre)').eq('owner_id', yo).eq('estado', 'enviada').lt('updated_at', new Date(Date.now() - 5 * 864e5).toISOString()).limit(5),
      supabase.rpc('mi_racha'),
      supabase.from('metas').select('*').eq('owner_id', yo).eq('periodo', 'semana'),
      supabase.rpc('logros', { p_owner: yo, p_desde: inicioSemana() }),
      // Empresas encontradas para revisar (con nombre, para ver qué hay sin entrar)
      supabase.from('hallazgos').select('id, nombre, rubro, direccion, zona, puntaje').eq('owner_id', yo).eq('estado', 'por_revisar').order('puntaje', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(4),
      // De tu lista, las que todavía no contactaste
      supabase.from('prospectos').select('id, nombre, rubro, zona, telefono, email', { count: 'exact' }).eq('owner_id', yo).eq('estado', 'pendiente').order('puntaje', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }).limit(4),
      // Cómo está tu lista
      supabase.from('prospectos').select('estado, rubro').eq('owner_id', yo).limit(5000),
      supabase.from('busquedas').select('rubro, zona, created_at').eq('owner_id', yo).order('created_at', { ascending: false }).limit(1),
      // Para los gráficos: últimos 14 días
      supabase.from('interacciones').select('created_at').eq('owner_id', yo).eq('tipo', 'enviado').gte('created_at', haceDias(13)).limit(5000),
      supabase.from('respuestas').select('recibida_at').eq('owner_id', yo).gte('recibida_at', haceDias(13)).limit(5000),
      supabase.from('hallazgos').select('estado, created_at, revisado_at').eq('owner_id', yo).gte('created_at', haceDias(29)).limit(5000),
    ]).then(([r, t, s, b, v, pr, racha, metas, logros, rev, sinContactar, lista, ultima, env, resp, hall]) => setD({
      graf: armarGraficos(env.data ?? [], resp.data ?? [], hall.data ?? []),
      rubros: Object.entries((lista.data ?? []).reduce((a, x) => { const k = (x.rubro || 'Sin rubro').trim(); a[k] = (a[k] ?? 0) + 1; return a }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6),
      revisar: rev.data ?? [], sinContactar: sinContactar.data ?? [], sinContactarTotal: sinContactar.count ?? 0,
      porEstado: (lista.data ?? []).reduce((a, x) => { a[x.estado] = (a[x.estado] ?? 0) + 1; return a }, {}), totalLista: (lista.data ?? []).length,
      ultima: ultima.data?.[0] ?? null,
      respuestas: (r.data ?? []).sort((a, b) => (PRIORIDAD[a.clasificacion] ?? 3) - (PRIORIDAD[b.clasificacion] ?? 3)),
      tareas: t.data ?? [], seguimientos: s.data ?? [], borradores: b.data ?? [], visitas: v.data ?? [], propuestas: pr.data ?? [],
      racha: racha.data ?? 0, metas: metas.data ?? [], logros: logros.data ?? {},
    }))
  }, [])

  if (!d) return <Esqueleto filas={6} />
  const lim = tablero?.email
  const quedan = lim ? Math.max(0, lim.limite_hoy - lim.enviados_hoy) : null
  const bloques = [
    d.respuestas.length && { icono: MessageSquareReply, titulo: `Contestá ${d.respuestas.length === 1 ? 'la respuesta' : `las ${d.respuestas.length} respuestas`}`, sub: 'Primero las de gente interesada: es lo que más rápido se convierte en venta.', to: '/respuestas?clase=sin_leer',
      items: d.respuestas.slice(0, 4).map(x => ({ k: x.id, texto: x.prospectos?.nombre, sub: x.motivo, to: x.prospecto_id ? `/prospectos/${x.prospecto_id}` : '/respuestas' })) },
    d.visitas.length && { icono: MapPin, titulo: `${d.visitas.length} ${d.visitas.length === 1 ? 'visita' : 'visitas'} para hoy`, sub: 'Con la ruta armada en Google Maps.', to: '/visitas',
      items: d.visitas.map(x => ({ k: x.id, texto: x.prospectos?.nombre, sub: x.prospectos?.direccion, to: `/prospectos/${x.prospectos?.id}` })) },
    d.tareas.length && { icono: ListTodo, titulo: `${d.tareas.length} ${d.tareas.length === 1 ? 'tarea' : 'tareas'} para hoy`, sub: 'Llamadas, WhatsApp y LinkedIn de tus secuencias.', to: '/seguimientos',
      items: d.tareas.slice(0, 5).map(x => ({ k: x.id, texto: x.titulo, sub: x.vence < hoyLocal() ? `Vencida el ${fecha(x.vence)}` : 'Hoy', to: x.prospecto_id ? `/prospectos/${x.prospecto_id}` : '/seguimientos' })) },
    d.propuestas.length && { icono: FileText, titulo: 'Propuestas sin respuesta', sub: 'Mandaste estas hace más de 5 días: un mensaje corto para saber qué les pareció.', to: '/prospectos?estado=propuesta',
      items: d.propuestas.map(x => ({ k: x.id, texto: `${x.prospectos?.nombre} · #${x.numero}`, sub: `Enviada el ${fecha(x.updated_at)}`, to: `/prospectos/${x.prospecto_id}` })) },
    d.seguimientos.length && { icono: CalendarClock, titulo: `${d.seguimientos.length} seguimientos vencidos`, sub: 'No contestaron: un segundo mensaje suma muchas respuestas.', to: '/seguimientos',
      items: d.seguimientos.slice(0, 4).map(x => ({ k: x.id, texto: x.nombre, sub: `Tocaba el ${fecha(x.proximo_seguimiento)}`, to: `/prospectos/${x.id}?tab=seguimiento` })) },
    d.borradores.length && quedan !== 0 && { icono: Sparkles, titulo: `Mandá ${quedan !== null ? Math.min(quedan, d.borradores.length) : d.borradores.length} emails nuevos`, sub: quedan !== null ? `Te quedan ${quedan} envíos hoy en tu casilla.` : 'Tenés borradores listos para revisar.', to: '/envios',
      items: d.borradores.slice(0, 4).map(x => ({ k: x.id, texto: x.nombre, sub: x.rubro, to: `/prospectos/${x.id}?tab=email` })) },
    porRevisar > 0 && { icono: Inbox, titulo: `Revisá ${porRevisar} ${porRevisar === 1 ? 'empresa encontrada' : 'empresas encontradas'}`, sub: 'Sumá a tu lista las que te sirven y descartá las que no: así la próxima búsqueda trae más parecidas a las buenas.', to: '/revisar',
      items: d.revisar.map(x => ({ k: x.id, texto: x.nombre, sub: [x.rubro, x.direccion || x.zona].filter(Boolean).join(' · '), to: '/revisar' })) },
    d.sinContactarTotal > 0 && { icono: Send, titulo: `Escribile a ${d.sinContactarTotal === 1 ? 'la empresa' : `las ${d.sinContactarTotal} empresas`} de tu lista sin contactar`, sub: 'Ya las elegiste: Claude te arma el primer mensaje para cada una.', to: '/prospectos?estado=pendiente',
      items: d.sinContactar.map(x => ({ k: x.id, texto: x.nombre, sub: [x.rubro, x.zona, x.email ? 'con email' : x.telefono ? 'con teléfono' : 'sin datos de contacto'].filter(Boolean).join(' · '), to: `/prospectos/${x.id}` })) },
  ].filter(Boolean)
  const nombreMeta = { envios: 'Envíos', respuestas: 'Respuestas', reuniones: 'Reuniones', clientes: 'Clientes' }

  const primero = bloques[0]
  const env = d.graf.actividad.reduce((a, x) => a + x.envios, 0), resp = d.graf.actividad.reduce((a, x) => a + x.respuestas, 0)
  const tasa = env ? Math.round((resp / env) * 100) : 0
  const buscador = d.graf.estados
  const totalBuscador = (buscador.aprobado ?? 0) + (buscador.por_revisar ?? 0) + (buscador.descartado ?? 0)
  const hoy = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="home">
      <header className="home-cab">
        <div>
          <p className="home-fecha">{hoy}</p>
          <h1>{saludoHora()}{perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''}</h1>
          <p className="home-sub">{bloques.length ? `Tenés ${bloques.length} ${bloques.length === 1 ? 'cosa' : 'cosas'} para hoy, ordenadas por lo que más conviene.` : 'Estás al día. Buen momento para buscar empresas nuevas.'}</p>
        </div>
        <div className="home-racha" title="Días hábiles seguidos con al menos un envío"><Flame size={16} /> <b>{d.racha}</b> {d.racha === 1 ? 'día seguido' : 'días seguidos'}</div>
      </header>

      <section className="home-top">
        <article className="home-foco">
          <small>{primero ? 'Lo primero de hoy' : 'Todo al día'}</small>
          <h2>{primero ? primero.titulo : 'Buscá empresas nuevas'}</h2>
          <p>{primero ? primero.sub : d.ultima ? `Tu última búsqueda fue "${d.ultima.rubro}" en ${d.ultima.zona}.` : 'Contale a Claude qué empresas querés y dónde.'}</p>
          <div className="home-foco-pie">
            <Link className="home-foco-btn" to={primero ? primero.to : '/buscar'}>{primero ? 'Empezar' : 'Buscar clientes'} <ArrowRight size={16} /></Link>
            {quedan !== null && <span><Mail size={14} /> Podés mandar <b>{quedan}</b> emails hoy</span>}
          </div>
        </article>
        <div className="home-kpis">
          <Link to="/envios" className="home-kpi"><small>Envíos esta semana</small><div><b>{d.logros.envios ?? 0}</b><Sparkline valores={d.graf.envios7} color="#fd4a22" ancho={70} alto={26} /></div></Link>
          <Link to="/respuestas" className="home-kpi"><small>Respuestas esta semana</small><div><b>{d.logros.respuestas ?? 0}</b>{env > 0 && <span className="home-kpi-tag">{tasa}% responde</span>}</div></Link>
          <Link to="/prospectos?estado=reunion" className="home-kpi"><small>Reuniones esta semana</small><div><b>{d.logros.reuniones ?? 0}</b></div></Link>
          <Link to="/prospectos" className="home-kpi"><small>En tu lista</small><div><b>{d.totalLista}</b>{d.porEstado.cliente > 0 && <span className="home-kpi-tag verde">{d.porEstado.cliente} clientes</span>}</div></Link>
        </div>
      </section>

      {bloques.length > 0 && (
        <section className="home-seccion">
          <h2 className="home-titulo">Para hoy</h2>
          <ol className="home-tareas">
            {bloques.map((b, i) => (
              <li key={i} className="home-tarea">
                <Link to={b.to} className="home-tarea-cab">
                  <span className="home-tarea-num">{i + 1}</span>
                  <span className="home-tarea-icono"><b.icono size={17} /></span>
                  <div><h3>{b.titulo}</h3><p>{b.sub}</p></div>
                  <ArrowRight size={16} className="home-tarea-flecha" />
                </Link>
                {b.items.length > 0 && <div className="home-tarea-items">{b.items.slice(0, 3).map(it => <Link key={it.k} to={it.to}><b>{it.texto}</b>{it.sub && <span>{it.sub}</span>}</Link>)}</div>}
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="home-seccion">
        <h2 className="home-titulo">Cómo venís</h2>
        <div className="home-grid">
          <article className="home-card ancho">
            <header><div><h3>Envíos y respuestas</h3><small>Últimos 14 días</small></div>
              <div className="home-card-nums"><span><b>{env}</b><em><i style={{ background: '#fd4a22' }} />envíos</em></span><span><b>{resp}</b><em><i style={{ background: '#16161a' }} />respuestas</em></span>{env > 0 && <span><b>{tasa}%</b>tasa de respuesta</span>}</div></header>
            {env + resp > 0
              ? <Columnas datos={d.graf.actividad} series={[{ clave: 'envios', nombre: 'Envíos', color: '#fd4a22' }, { clave: 'respuestas', nombre: 'Respuestas', color: '#16161a' }]} />
              : <div className="home-vacio"><Send size={18} /><span>Cuando mandes los primeros mensajes, acá vas a ver tu ritmo día por día.</span><Link to="/prospectos?estado=pendiente">Escribir ahora</Link></div>}
          </article>
          <article className="home-card">
            <header><div><h3>Tu lista por etapa</h3><small>Tocá una etapa para ver esas empresas</small></div></header>
            {d.totalLista > 0 ? <Embudo onElegir={e => nav(`/prospectos?estado=${e.clave}`)} etapas={[
              { clave: 'pendiente', label: 'Sin contactar', valor: d.porEstado.pendiente ?? 0, color: '#fd4a22' },
              { clave: 'contactado', label: 'Contactadas', valor: d.porEstado.contactado ?? 0, color: '#fd4a22' },
              { clave: 'respondio', label: 'Respondieron', valor: d.porEstado.respondio ?? 0, color: '#fd4a22' },
              { clave: 'reunion', label: 'Reunión', valor: d.porEstado.reunion ?? 0, color: '#fd4a22' },
              { clave: 'propuesta', label: 'Propuesta', valor: d.porEstado.propuesta ?? 0, color: '#fd4a22' },
              { clave: 'cliente', label: 'Clientes', valor: d.porEstado.cliente ?? 0, color: '#15803d' },
            ]} /> : <div className="home-vacio"><Users size={18} /><span>Sumá empresas a tu lista y acá ves cómo avanzan.</span></div>}
          </article>
          <article className="home-card">
            <header><div><h3>Lo que trajo el buscador</h3><small>Últimos 30 días</small></div></header>
            {totalBuscador > 0 ? <>
              <div className="home-grande"><b>{totalBuscador ? Math.round(((buscador.aprobado ?? 0) / totalBuscador) * 100) : 0}%</b><span>de las {totalBuscador} empresas encontradas te sirvieron</span></div>
              <BarraPartes partes={[
                { label: 'Sumadas', valor: buscador.aprobado ?? 0, color: '#15803d' },
                { label: 'Por revisar', valor: buscador.por_revisar ?? 0, color: '#fd4a22' },
                { label: 'Rechazadas', valor: buscador.descartado ?? 0, color: '#8f887d' },
              ]} />
            </> : <div className="home-vacio"><Search size={18} /><span>Todavía no buscaste empresas este mes.</span><Link to="/buscar">Buscar</Link></div>}
          </article>
          <article className="home-card">
            <header><div><h3>Rubros en tu lista</h3><small>Los que más estás trabajando</small></div></header>
            {d.rubros.length ? (
              <div className="home-rubros">{d.rubros.slice(0, 5).map(([label, valor]) => (
                <div key={label}><span title={label}>{label}</span><b>{valor}</b><div className="home-rubro-barra"><i style={{ width: `${(valor / Math.max(...d.rubros.map(r => r[1]))) * 100}%` }} /></div></div>
              ))}{d.rubros.length > 5 && <small className="muted">y {d.rubros.length - 5} rubros más</small>}</div>
            ) : <div className="home-vacio"><Users size={18} /><span>Sin empresas todavía.</span></div>}
          </article>
          <article className="home-card">
            <header><div><h3>Metas de la semana</h3><small>{d.metas.length ? 'Cómo venís' : 'Ponete un objetivo'}</small></div><Link to="/metas" className="chico">{d.metas.length ? 'Editar' : 'Poner metas'}</Link></header>
            {d.metas.length ? (
              <div className="home-metas">{d.metas.map(m => {
                const v = d.logros[m.tipo] ?? 0, pct = Math.min(100, (v / m.objetivo) * 100)
                return <div key={m.id}><div><span>{nombreMeta[m.tipo]}</span><b>{v}<small> / {m.objetivo}</small></b></div><div className="home-rubro-barra"><i style={{ width: pct + '%', background: pct >= 100 ? '#15803d' : undefined }} /></div></div>
              })}</div>
            ) : <div className="home-vacio"><Target size={18} /><span>Por ejemplo: 30 envíos y 3 reuniones por semana. Acá vas a ver cómo venís.</span></div>}
          </article>
        </div>
      </section>
    </div>
  )
}

const haceDias = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d.toISOString() }
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
/** Series por día para los gráficos de Tu día */
function armarGraficos(envios, respuestas, hallazgos) {
  const dias = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i)); return d })
  const clave = f => { const d = new Date(f); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }
  const contar = (lista, campo) => lista.reduce((a, x) => { if (x[campo]) { const k = clave(x[campo]); a[k] = (a[k] ?? 0) + 1 } return a }, {})
  const e = contar(envios, 'created_at'), r = contar(respuestas, 'recibida_at')
  const sum = contar(hallazgos.filter(h => h.estado === 'aprobado'), 'revisado_at'), rec = contar(hallazgos.filter(h => h.estado === 'descartado'), 'revisado_at')
  const actividad = dias.map(d => { const k = clave(d); return { etiqueta: d.getDate() + '/' + (d.getMonth() + 1), titulo: `${DIAS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`, envios: e[k] ?? 0, respuestas: r[k] ?? 0, sumadas: sum[k] ?? 0, rechazadas: rec[k] ?? 0 } })
  const estados = hallazgos.reduce((a, h) => { a[h.estado] = (a[h.estado] ?? 0) + 1; return a }, {})
  return { actividad, estados, envios7: actividad.slice(-7).map(x => x.envios), respuestas7: actividad.slice(-7).map(x => x.respuestas), total14: actividad.reduce((a, x) => a + x.envios + x.respuestas + x.sumadas + x.rechazadas, 0) }
}

export function inicioSemana() {
  const d = new Date(); const dia = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dia); d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
