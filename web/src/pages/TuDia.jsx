import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sun, MessageSquareReply, ListTodo, CalendarClock, Sparkles, Inbox, MapPin, Flame, Target, ArrowRight, CheckCircle2, FileText } from 'lucide-react'
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
    ]).then(([r, t, s, b, v, pr, racha, metas, logros]) => setD({
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
    porRevisar > 0 && { icono: Inbox, titulo: `Revisá ${porRevisar} empresas encontradas`, sub: 'Sumá a tu lista las que te sirven.', to: '/revisar', items: [] },
  ].filter(Boolean)
  const nombreMeta = { envios: 'Envíos', respuestas: 'Respuestas', reuniones: 'Reuniones', clientes: 'Clientes' }

  return (
    <>
      <header className="cabecera">
        <div><h1><Sun size={26} style={{ verticalAlign: -4, color: 'var(--acc)' }} /> {saludoHora()}{perfil?.nombre ? `, ${perfil.nombre.split(' ')[0]}` : ''}</h1>
          <p className="saludo">{bloques.length ? `Tenés ${bloques.length} ${bloques.length === 1 ? 'cosa' : 'cosas'} para hoy, en el orden en que conviene hacerlas.` : 'Estás al día. Buen momento para buscar empresas nuevas.'}</p></div>
        <div className="racha" title="Días hábiles seguidos con al menos un envío"><Flame size={18} /> <b>{d.racha}</b> {d.racha === 1 ? 'día' : 'días'} seguidos</div>
      </header>

      {d.metas.length > 0 && (
        <section className="tarjeta metas-mini">
          <div className="tarjeta-titulo"><h3><Target size={16} /> Tus metas de la semana</h3><Link to="/metas" className="chico">Editar</Link></div>
          <div className="metas-grilla">{d.metas.map(m => {
            const v = d.logros[m.tipo] ?? 0, pct = Math.min(100, (v / m.objetivo) * 100)
            return <div key={m.id}><div className="cupo-top"><span>{nombreMeta[m.tipo]}</span><b>{v} / {m.objetivo}</b></div><div className="cupo-barra"><span style={{ width: pct + '%', background: pct >= 100 ? 'var(--ok)' : undefined }} /></div></div>
          })}</div>
        </section>
      )}

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
