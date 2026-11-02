import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sun, MessageSquareReply, ListTodo, CalendarClock, Sparkles, Inbox, MapPin, Flame, Target, ArrowRight, CheckCircle2, FileText, Send, Users, Search, Mail, Trophy, Handshake } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { hoyLocal, fecha, saludoHora } from '../lib/util.js'
import { Esqueleto } from '../components/ui.jsx'
import { useApp } from '../App.jsx'
import { AreaDoble, Dona, BarrasH, Sparkline, Embudo, BarrasDias } from '../components/Graficos.jsx'
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
      items: d.respuestas.slice(0, 4).map(x => ({ k: x.id, texto: x.prospectos?.nombre, sub: x.motivo, to: `/prospectos/${x.prospecto_id}` })) },
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

  return (
    <>
      <header className="cabecera">
        <div><h1><Sun size={26} style={{ verticalAlign: -4, color: 'var(--acc)' }} /> {saludoHora()}{perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''}</h1>
          <p className="saludo">{bloques.length ? `Tenés ${bloques.length} ${bloques.length === 1 ? 'cosa' : 'cosas'} para hoy, en el orden en que conviene hacerlas.` : 'Estás al día. Buen momento para buscar empresas nuevas.'}</p></div>
        <div className="racha" title="Días hábiles seguidos con al menos un envío"><Flame size={18} /> <b>{d.racha}</b> {d.racha === 1 ? 'día' : 'días'} seguidos</div>
      </header>

      <section className="dia-resumen">
        {[
          { icono: Send, valor: d.logros.envios ?? 0, texto: 'envíos esta semana', to: '/envios', linea: d.graf.envios7 },
          { icono: MessageSquareReply, valor: d.logros.respuestas ?? 0, texto: 'respuestas esta semana', to: '/respuestas', linea: d.graf.respuestas7 },
          { icono: Handshake, valor: d.logros.reuniones ?? 0, texto: 'reuniones esta semana', to: '/prospectos?estado=reunion' },
          { icono: Users, valor: d.totalLista, texto: `en tu lista${d.porEstado.cliente ? ` · ${d.porEstado.cliente} clientes` : ''}`, to: '/prospectos' },
          quedan !== null ? { icono: Mail, valor: quedan, texto: `emails que podés mandar hoy (de ${lim.limite_hoy})`, to: '/envios' } : { icono: Trophy, valor: d.logros.clientes ?? 0, texto: 'clientes nuevos esta semana', to: '/prospectos?estado=cliente' },
        ].map(x => <Link key={x.texto} to={x.to} className="dia-dato"><x.icono size={16} /><b>{x.valor}</b>{x.linea && <Sparkline valores={x.linea} color="var(--acc)" ancho={64} alto={22} />}<span>{x.texto}</span></Link>)}
      </section>
      <section className="dia-graficos">
        <div className="tarjeta dia-g grande">
          <div className="dia-g-cab"><div><h3>Tu actividad</h3><small>Últimos 14 días</small></div>
            <div className="dia-g-totales"><span><b>{d.graf.actividad.reduce((a, x) => a + x.envios, 0)}</b> envíos</span><span><b>{d.graf.actividad.reduce((a, x) => a + x.respuestas, 0)}</b> respuestas</span></div></div>
          {d.graf.total14 > 0
            ? <AreaDoble datos={d.graf.actividad} series={[{ clave: 'envios', nombre: 'Envíos', color: '#ff7a50' }, { clave: 'respuestas', nombre: 'Respuestas', color: '#16161a' }, { clave: 'sumadas', nombre: 'Empresas sumadas', color: '#22a06b' }]} alto={170} />
            : <div className="dia-g-vacio"><Sparkles size={18} /> Cuando mandes mensajes y sumes empresas, acá vas a ver tu ritmo día por día.</div>}
        </div>
        <div className="tarjeta dia-g">
          <div className="dia-g-cab"><div><h3>Tu lista por etapa</h3><small>De sin contactar a cliente</small></div></div>
          {d.totalLista > 0 ? <Embudo onElegir={e => nav(`/prospectos?estado=${e.clave}`)} etapas={[
            { clave: 'pendiente', label: 'Sin contactar', valor: d.porEstado.pendiente ?? 0, color: '#ffd2c2' },
            { clave: 'contactado', label: 'Contactadas', valor: d.porEstado.contactado ?? 0, color: '#ffab8f' },
            { clave: 'respondio', label: 'Respondieron', valor: d.porEstado.respondio ?? 0, color: '#ff7a50' },
            { clave: 'reunion', label: 'Reunión', valor: d.porEstado.reunion ?? 0, color: '#f0531c' },
            { clave: 'propuesta', label: 'Propuesta', valor: d.porEstado.propuesta ?? 0, color: '#c93d10' },
            { clave: 'cliente', label: 'Clientes', valor: d.porEstado.cliente ?? 0, color: '#22a06b' },
          ]} /> : <div className="dia-g-vacio"><Users size={18} /> Sumá empresas a tu lista y acá ves cómo avanzan.</div>}
        </div>
        <div className="tarjeta dia-g">
          <div className="dia-g-cab"><div><h3>Lo que trajo el buscador</h3><small>Últimos 30 días</small></div></div>
          {Object.values(d.graf.estados).some(Boolean) ? <Dona tam={132} sub="encontradas" items={[
            { label: 'Sumadas a tu lista', valor: d.graf.estados.aprobado ?? 0, color: '#22a06b' },
            { label: 'Por revisar', valor: d.graf.estados.por_revisar ?? 0, color: '#ffab8f' },
            { label: 'Rechazadas', valor: d.graf.estados.descartado ?? 0, color: '#d6cfc4' },
          ]} /> : <div className="dia-g-vacio"><Search size={18} /> Todavía no buscaste empresas este mes.</div>}
          {d.graf.actividad.some(x => x.sumadas || x.rechazadas) && <BarrasDias alto={70} datos={d.graf.actividad} series={[{ clave: 'sumadas', nombre: 'Sumadas', color: '#22a06b' }, { clave: 'rechazadas', nombre: 'Rechazadas', color: '#d6cfc4' }]} />}
        </div>
        <div className="tarjeta dia-g rubros">
          <div className="dia-g-cab"><div><h3>Rubros en tu lista</h3><small>Qué tipo de empresas estás trabajando</small></div></div>
          {d.rubros.length ? <BarrasH items={d.rubros.map(([label, valor], i) => ({ label, valor, color: ['#ff7a50', '#ff9a75', '#ffb59a', '#ffcbb8', '#ffdccf', '#ffe9e1'][i] }))} /> : <div className="dia-g-vacio"><Users size={18} /> Sin empresas todavía.</div>}
        </div>
      </section>

      {d.metas.length > 0 && (
        <section className="tarjeta metas-mini">
          <div className="tarjeta-titulo"><h3><Target size={16} /> Tus metas de la semana</h3><Link to="/metas" className="chico">Editar</Link></div>
          <div className="metas-grilla">{d.metas.map(m => {
            const v = d.logros[m.tipo] ?? 0, pct = Math.min(100, (v / m.objetivo) * 100)
            return <div key={m.id}><div className="cupo-top"><span>{nombreMeta[m.tipo]}</span><b>{v} / {m.objetivo}</b></div><div className="cupo-barra"><span style={{ width: pct + '%', background: pct >= 100 ? 'var(--ok)' : undefined }} /></div></div>
          })}</div>
        </section>
      )}

      {d.metas.length === 0 && (
        <Link to="/metas" className="dia-sugerencia"><Target size={16} /><span><b>Poné una meta para la semana</b> (por ejemplo, 30 envíos y 3 reuniones) y acá vas a ver cómo venís.</span><ArrowRight size={14} /></Link>
      )}
      <Link to="/buscar" className="dia-sugerencia"><Search size={16} /><span><b>Buscá empresas nuevas</b>{d.ultima ? ` · la última fue "${d.ultima.rubro}" en ${d.ultima.zona}, ${fecha(d.ultima.created_at)}` : ' · contale a Claude qué empresas querés y dónde'}</span><ArrowRight size={14} /></Link>

      {!bloques.length ? (
        <div className="tarjeta vacio"><div className="icono-grande"><CheckCircle2 size={26} /></div><h3>Nada pendiente</h3><p>Aprovechá para buscar empresas nuevas o armar una secuencia.</p>
          <div className="acciones" style={{ justifyContent: 'center' }}><Link className="btn primario" to="/buscar">Buscar clientes</Link></div></div>
      ) : (
        <ol className="tu-dia">
          {bloques.map((b, i) => (
            <li key={i} className="tarjeta">
              <div className="tu-dia-cab"><span className="paso-num">{i + 1}</span><b.icono size={18} /><div><h3>{b.titulo}</h3><p className="muted chico">{b.sub}</p></div><Link to={b.to} className="btn chico primario">Ir <ArrowRight size={13} /></Link></div>
              {b.items.length > 0 && <div className="accion-lista">{b.items.map(it => <Link key={it.k} to={it.to} className="accion-item"><div><b className="fuerte">{it.texto}</b>{it.sub && <div className="muted chico">{it.sub}</div>}</div><span className="espacio" /><ArrowRight size={14} /></Link>)}</div>}
            </li>
          ))}
        </ol>
      )}
    </>
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
