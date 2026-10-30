import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight, PartyPopper } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fecha, fechaHora, hoyLocal } from '../lib/util.js'
import { Avatar, Cargando } from '../components/ui.jsx'

export default function Seguimientos() {
  const [lista, setLista] = useState(null)
  const [proximos, setProximos] = useState([])
  useEffect(() => {
    const hoy = hoyLocal()
    supabase.from('prospectos').select('id, nombre, rubro, telefono, ultimo_contacto, proximo_seguimiento')
      .eq('estado', 'contactado').lte('proximo_seguimiento', hoy).order('proximo_seguimiento')
      .then(({ data }) => setLista(data ?? []))
    supabase.from('prospectos').select('id, nombre, rubro, proximo_seguimiento')
      .eq('estado', 'contactado').gt('proximo_seguimiento', hoy).order('proximo_seguimiento').limit(30)
      .then(({ data }) => setProximos(data ?? []))
  }, [])

  if (!lista) return <Cargando />
  return (
    <>
      <header className="cabecera">
        <div><h1>Seguimientos</h1><p>Contactados que todavía no respondieron. Un solo seguimiento amable; si no contestan, se marcan como no interesados.</p></div>
      </header>
      <section className="tarjeta">
        <div className="tarjeta-titulo"><h3><CalendarClock size={16} /> Para hoy</h3><span className="chip">{lista.length}</span></div>
        {lista.length === 0 ? (
          <div className="vacio" style={{ padding: 24 }}><div className="icono-grande"><PartyPopper size={24} /></div><h3>Estás al día</h3><p>No hay seguimientos vencidos.</p></div>
        ) : (
          <div className="accion-lista">
            {lista.map(p => (
              <Link key={p.id} to={`/prospectos/${p.id}?tab=seguimiento`} className="accion-item">
                <Avatar nombre={p.nombre} />
                <div><b className="fuerte">{p.nombre}</b><div className="muted chico">{p.rubro} · último contacto {fechaHora(p.ultimo_contacto)}</div></div>
                <span className="espacio" /><span className="btn chico">Preparar seguimiento</span><ChevronRight size={16} />
              </Link>
            ))}
          </div>
        )}
      </section>
      {proximos.length > 0 && (
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3>Próximos</h3><span className="chip">{proximos.length}</span></div>
          <div className="accion-lista">
            {proximos.map(p => (
              <Link key={p.id} to={`/prospectos/${p.id}`} className="accion-item">
                <Avatar nombre={p.nombre} />
                <div><b className="fuerte">{p.nombre}</b><div className="muted chico">{p.rubro}</div></div>
                <span className="espacio" /><span className="chip"><CalendarClock size={12} /> {fecha(p.proximo_seguimiento)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
