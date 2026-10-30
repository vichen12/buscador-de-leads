import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, MessageSquareReply, Globe, Heart, ArrowRight, Inbox } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fechaHora } from '../lib/util.js'
import { Esqueleto, Vacio, Avatar } from '../components/ui.jsx'
import { usePaginado, Paginador } from '../components/Paginador.jsx'
import { useApp } from '../App.jsx'

const ETIQ = { interesado: ['Interesado', 'ok'], reunion: ['Quiere reunión', 'ok'], pide_info: ['Pide info', 'info'], derivar: ['Derivó', ''], formulario: ['Escribió en tu web', 'info'], b2c: ['Cliente nuevo', ''] }

/** Bandeja única: todos los que mostraron interés (respuestas, formulario de la web y clientes B2C nuevos), en un solo lugar */
export default function Interesados() {
  const { session, perfil } = useApp()
  const [items, setItems] = useState(null)
  const [filtro, setFiltro] = useState('')
  useEffect(() => {
    const yo = session.user.id
    const hace = new Date(Date.now() - 60 * 864e5).toISOString()
    Promise.all([
      supabase.from('respuestas').select('id, clasificacion, motivo, texto, recibida_at, leida, prospecto_id, prospectos(nombre, estado)').eq('owner_id', yo).in('clasificacion', ['interesado', 'reunion', 'pide_info', 'derivar']).gte('recibida_at', hace).order('recibida_at', { ascending: false }).limit(300),
      supabase.from('prospectos').select('id, nombre, estado, created_at, notas').eq('owner_id', yo).eq('fuente', 'formulario').gte('created_at', hace).order('created_at', { ascending: false }).limit(300),
      perfil?.modos?.includes('b2c') ? supabase.from('clientes').select('id, nombre, origen, created_at, email').eq('owner_id', yo).in('origen', ['formulario', 'referido', 'aliado', 'creador']).gte('created_at', hace).order('created_at', { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
    ]).then(([r, f, c]) => {
      const lista = [
        ...(r.data ?? []).map(x => ({ k: 'r' + x.id, tipo: x.clasificacion, nombre: x.prospectos?.nombre, texto: x.motivo || x.texto?.slice(0, 160), fecha: x.recibida_at, to: `/prospectos/${x.prospecto_id}`, nuevo: !x.leida, canal: 'respuesta' })),
        ...(f.data ?? []).map(x => ({ k: 'f' + x.id, tipo: 'formulario', nombre: x.nombre, texto: x.notas, fecha: x.created_at, to: `/prospectos/${x.id}`, nuevo: x.estado === 'respondio', canal: 'formulario' })),
        ...(c.data ?? []).map(x => ({ k: 'c' + x.id, tipo: 'b2c', nombre: x.nombre, texto: `Llegó por ${x.origen}${x.email ? ` · ${x.email}` : ''}`, fecha: x.created_at, to: `/clientes?id=${x.id}`, nuevo: false, canal: 'b2c' })),
      ].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      setItems(lista)
    })
  }, [])
  const visibles = useMemo(() => (items ?? []).filter(x => !filtro || x.canal === filtro), [items, filtro])
  const pag = usePaginado(visibles, 30, [filtro])
  const cuenta = k => (items ?? []).filter(x => x.canal === k).length
  return (
    <>
      <header className="cabecera"><div><h1><Flame size={26} style={{ verticalAlign: -4, color: 'var(--acc)' }} /> Interesados</h1><p className="saludo">Todos los que mostraron interés en los últimos 60 días, vengan de donde vengan. Es lo primero que conviene atender.</p></div></header>
      <div className="chips-filtro" style={{ marginBottom: 14 }}>
        <button type="button" className={!filtro ? 'activo' : ''} onClick={() => setFiltro('')}><Inbox size={13} /> Todos {items ? `(${items.length})` : ''}</button>
        <button type="button" className={filtro === 'respuesta' ? 'activo' : ''} onClick={() => setFiltro('respuesta')}><MessageSquareReply size={13} /> Respondieron ({cuenta('respuesta')})</button>
        <button type="button" className={filtro === 'formulario' ? 'activo' : ''} onClick={() => setFiltro('formulario')}><Globe size={13} /> Tu web ({cuenta('formulario')})</button>
        {perfil?.modos?.includes('b2c') && <button type="button" className={filtro === 'b2c' ? 'activo' : ''} onClick={() => setFiltro('b2c')}><Heart size={13} /> Clientes nuevos ({cuenta('b2c')})</button>}
      </div>
      {!items ? <Esqueleto filas={5} /> : !visibles.length ? (
        <Vacio icono={Flame} titulo="Todavía no hay interesados">Cuando alguien te conteste con interés, te escriba desde tu web o llegue un cliente por un aliado, aparece acá.</Vacio>
      ) : (
        <section className="tarjeta">
          <div className="accion-lista">{pag.items.map(x => (
            <Link key={x.k} to={x.to} className={'accion-item' + (x.nuevo ? ' nuevo' : '')}>
              <Avatar nombre={x.nombre || '?'} />
              <div style={{ minWidth: 0 }}><b className="fuerte">{x.nombre}</b> <span className={'chip ' + (ETIQ[x.tipo]?.[1] ?? '')}>{ETIQ[x.tipo]?.[0] ?? x.tipo}</span>
                <div className="muted chico" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.texto}</div></div>
              <span className="espacio" /><small className="muted">{fechaHora(x.fecha)}</small><ArrowRight size={15} />
            </Link>
          ))}</div>
          <Paginador {...pag} />
        </section>
      )}
    </>
  )
}
