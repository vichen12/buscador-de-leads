import { Link } from 'react-router-dom'
import { Check, X, Phone, Mail, MapPin, Star, Undo2, ArrowRight, Loader2 } from 'lucide-react'
import Enlaces from './Enlaces.jsx'

/** Una empresa encontrada, para revisar: sumarla a la lista o marcar que no sirve */
export default function TarjetaHallazgo({ h, sel, onSel, onAprobar, onDescartar, onRecuperar, ocupado }) {
  const dir = [h.direccion, h.zona && !h.direccion?.toLowerCase().includes(h.zona.toLowerCase()) ? h.zona : ''].filter(Boolean).join(' · ')
  return (
    <article className={'hallazgo ' + h.estado + (sel ? ' sel' : '')}>
      {onSel && h.estado === 'por_revisar' && (
        <input type="checkbox" className="hallazgo-check" checked={!!sel} onChange={onSel} aria-label={'Seleccionar ' + h.nombre} />
      )}
      <div className="hallazgo-cuerpo">
        <div className="hallazgo-cab">
          <h3>{h.prospecto_id ? <Link to={`/prospectos/${h.prospecto_id}`}>{h.nombre}</Link> : h.nombre}</h3>
          {h.puntaje > 0 && <span className="puntaje" title={`Encaje ${h.puntaje} de 5`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={12} fill="currentColor" className={n > h.puntaje ? 'off' : ''} />)}</span>}
        </div>
        <div className="hallazgo-sub">
          {h.rubro && <span className="tipo">{h.rubro}</span>}
          {dir && <span><MapPin size={12} /> {dir}</span>}
        </div>
        {h.encaje && <p className="hallazgo-encaje">{h.encaje}</p>}
        <div className="hallazgo-contacto">
          {h.telefono ? <a href={`tel:${h.telefono.split('/')[0].replace(/[^\d+]/g, '')}`}><Phone size={13} /> {h.telefono}</a> : <span className="muted"><Phone size={13} /> Sin teléfono</span>}
          {h.email && <a href={`mailto:${h.email}`}><Mail size={13} /> {h.email}</a>}
        </div>
        <Enlaces e={h} conTexto />
        {h.nota && <p className="hallazgo-nota">{h.nota}</p>}
        {h.estado === 'descartado' && h.motivo && <p className="hallazgo-nota">No sirve: {h.motivo}</p>}
      </div>
      <div className="hallazgo-acciones">
        {h.estado === 'por_revisar' && <>
          <button className="btn primario" onClick={onAprobar} disabled={ocupado}>{ocupado ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Sumar a mi lista</button>
          <button className="btn fantasma" onClick={onDescartar} disabled={ocupado}><X size={15} /> No sirve</button>
        </>}
        {h.estado === 'aprobado' && <>
          <span className="chip ok"><Check size={12} /> En tu lista</span>
          {h.prospecto_id && <Link className="btn fantasma chico" to={`/prospectos/${h.prospecto_id}`}>Ver ficha <ArrowRight size={13} /></Link>}
        </>}
        {h.estado === 'descartado' && <>
          <span className="chip duplicado">No sirve</span>
          {onRecuperar && <button className="btn fantasma chico" onClick={onRecuperar} disabled={ocupado}><Undo2 size={13} /> Recuperar</button>}
        </>}
      </div>
    </article>
  )
}
