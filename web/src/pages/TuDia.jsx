import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sun, MessageSquareReply, ListTodo, CalendarClock, Sparkles, Inbox, MapPin, Flame, Target, ArrowRight, CheckCircle2, FileText, Send, Users, Search, Mail, Trophy, Handshake } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { hoyLocal, fecha, saludoHora } from '../lib/util.js'
import { Esqueleto } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const PRIORIDAD = { interesado: 0, reunion: 0, pide_info: 1, derivar: 2, otro: 3, no_interesado: 4 }

/** "Tu día": lo más importante primero, en el orden en que conviene hacerlo */
export default function TuDia() {
  const { session, perfil, porRevisar, tablero } = useApp()
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
      supabase.from('prospectos').select('estado').eq('owner_id', yo).limit(5000),
      supabase.from('busquedas').select('rubro, zona, created_at').eq('owner_id', yo).order('created_at', { ascending: false }).limit(1),
    ]).then(([r, t, s, b, v, pr, racha, metas, logros, rev, sinContactar, lista, ultima]) => setD({
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
          { icono: Send, valor: d.logros.envios ?? 0, texto: 'envíos esta semana', to: '/envios' },
          { icono: MessageSquareReply, valor: d.logros.respuestas ?? 0, texto: 'respuestas esta semana', to: '/respuestas' },
          { icono: Handshake, valor: d.logros.reuniones ?? 0, texto: 'reuniones esta semana', to: '/prospectos?estado=reunion' },
          { icono: Users, valor: d.totalLista, texto: `en tu lista${d.porEstado.cliente ? ` · ${d.porEstado.cliente} clientes` : ''}`, to: '/prospectos' },
          quedan !== null ? { icono: Mail, valor: quedan, texto: `emails que podés mandar hoy (de ${lim.limite_hoy})`, to: '/envios' } : { icono: Trophy, valor: d.logros.clientes ?? 0, texto: 'clientes nuevos esta semana', to: '/prospectos?estado=cliente' },
        ].map(x => <Link key={x.texto} to={x.to} className="dia-dato"><x.icono size={16} /><b>{x.valor}</b><span>{x.texto}</span></Link>)}
      </section>
      {d.totalLista > 0 && (
        <div className="dia-embudo" title="Cómo está tu lista">
          {[['pendiente', 'Sin contactar'], ['contactado', 'Contactadas'], ['respondio', 'Respondieron'], ['reunion', 'Reunión'], ['propuesta', 'Propuesta'], ['cliente', 'Clientes']].map(([k, t]) => (
            <Link key={k} to={`/prospectos?estado=${k}`} className={'dia-etapa' + (d.porEstado[k] ? '' : ' cero')}><b>{d.porEstado[k] ?? 0}</b><span>{t}</span></Link>
          ))}
        </div>
      )}

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

export function inicioSemana() {
  const d = new Date(); const dia = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dia); d.setHours(0, 0, 0, 0)
  return d.toISOString()
}
