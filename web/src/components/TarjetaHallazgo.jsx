import { Link } from 'react-router-dom'
import { Check, X, Phone, Mail, MapPin, Star, Undo2, ArrowRight, Loader2, Megaphone, UserRound, Building2, Target, SkipForward } from 'lucide-react'
import Enlaces from './Enlaces.jsx'
import PorQue from './PorQue.jsx'
import { LogoEmpresa } from './ui.jsx'

/** Una empresa encontrada, para revisar: sumarla a la lista o marcar que no sirve */
const MOTIVOS = ['No es del rubro', 'Muy chica', 'Muy grande', 'Muy lejos', 'Ya es cliente', 'Es competencia', 'Datos malos']

export default function TarjetaHallazgo({ h, sel, onSel, onAprobar, onDescartar, onSaltear, onRecuperar, onMotivo, ocupado }) {
  const dir = [h.direccion, h.zona && !h.direccion?.toLowerCase().includes(h.zona.toLowerCase()) ? h.zona : ''].filter(Boolean).join(' · ')
  return (
    <article className={'hallazgo ' + h.estado + (sel ? ' sel' : '')}>
      {onSel && h.estado !== 'aprobado' && (
        <input type="checkbox" className="hallazgo-check" checked={!!sel} onChange={onSel} aria-label={'Seleccionar ' + h.nombre} />
      )}
      <LogoEmpresa nombre={h.nombre} web={h.web ?? h.web_actual} />
      <div className="hallazgo-cuerpo">
        <div className="hallazgo-cab">
          <h3>{h.prospecto_id ? <Link to={`/prospectos/${h.prospecto_id}`}>{h.nombre}</Link> : h.nombre}</h3>
          {h.puntaje > 0 && <span className={'encaje-pill n' + h.puntaje} title={`Qué tan bien encaja: ${h.puntaje} de 5`}>{[1, 2, 3, 4, 5].map(n => <Star key={n} size={11} fill="currentColor" className={n > h.puntaje ? 'off' : ''} />)}<b>{['', 'Poco', 'Algo', 'Bien', 'Muy bien', 'Ideal'][h.puntaje]}</b></span>}
          <PorQue razones={h.razones} />
        </div>
        <div className="hallazgo-sub">
          {h.rubro && <span className="tipo">{h.rubro}</span>}
          {dir && <span className="lugar"><MapPin size={12} /> {dir}</span>}
          {h.resenas > 0 && <span className="lugar"><Star size={12} /> {h.rating ? `${h.rating} · ` : ''}{h.resenas} reseñas</span>}
        </div>
        {h.descripcion && <p className="hallazgo-que-es">{h.descripcion}</p>}
        {h.encaje && <div className="hallazgo-te-sirve"><Target size={14} /><div><small>Por qué te serviría</small>{h.encaje}</div></div>}
        {h.senales && <p className="hallazgo-senal"><Megaphone size={13} /> {h.senales}</p>}
        {h.decisor?.nombre && <p className="hallazgo-decisor"><UserRound size={13} style={{ verticalAlign: -2 }} /> Decide: <b>{h.decisor.nombre}</b>{h.decisor.cargo ? `, ${h.decisor.cargo}` : ''}{h.decisor.fuente && <> · <a href={h.decisor.fuente} target="_blank" rel="noreferrer">fuente</a></>}</p>}
        <div className="hallazgo-pie">
          {h.telefono ? <a className="contacto-pill" href={`tel:${h.telefono.split('/')[0].replace(/[^\d+]/g, '')}`}><Phone size={13} /> {h.telefono}</a> : <span className="contacto-pill vacio"><Phone size={13} /> Sin teléfono</span>}
          {h.email && <a className="contacto-pill" href={`mailto:${h.email}`}><Mail size={13} /> {h.email}</a>}
          <Enlaces e={h} />
        </div>
        {h.nota && h.nota !== 'Parecida a las que te sirven' && <p className="hallazgo-nota">{h.nota}</p>}
        {h.estado === 'descartado' && onMotivo && (
          <div className="motivos"><small>¿Por qué no sirve? Así busco mejor:</small>
            {MOTIVOS.map(m => <button key={m} type="button" className={h.motivo === m ? 'on' : ''} onClick={() => onMotivo(h.motivo === m ? '' : m)}>{m}</button>)}
          </div>
        )}
        {h.estado === 'descartado' && !onMotivo && h.motivo && <p className="hallazgo-nota">No sirve: {h.motivo}</p>}
      </div>
      <div className="hallazgo-acciones">
        {h.estado === 'por_revisar' && <>
          <button className="btn primario" onClick={onAprobar} disabled={ocupado}>{ocupado ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Sumar a mi lista</button>
          <button className="btn fantasma" onClick={onDescartar} disabled={ocupado}><X size={15} /> No sirve</button>
          {onSaltear && <button className="btn fantasma chico saltear" onClick={onSaltear} disabled={ocupado} title="La saco de acá sin marcarla como buena ni mala: puede volver a aparecer en otra búsqueda"><SkipForward size={13} /> Saltear</button>}
        </>}
        {h.estado === 'aprobado' && <>
          <span className="chip ok"><Check size={12} /> En tu lista</span>
          {h.prospecto_id && <Link className="btn fantasma chico" to={`/prospectos/${h.prospecto_id}`}>Ver ficha <ArrowRight size={13} /></Link>}
        </>}
        {h.estado === 'descartado' && <>
          <span className="chip duplicado">Rechazada{h.motivo ? ` · ${h.motivo}` : ''}</span>
          {onAprobar && <button className="btn primario chico" onClick={onAprobar} disabled={ocupado}>{ocupado ? <Loader2 size={13} className="spin" /> : <Check size={13} />} Sumar a mi lista</button>}
          {onRecuperar && <button className="btn fantasma chico" onClick={onRecuperar} disabled={ocupado} title="Vuelve a Por revisar para decidir después"><Undo2 size={13} /> Volver a revisar</button>}
          {onSaltear && <button className="btn fantasma chico saltear" onClick={onSaltear} disabled={ocupado} title="Deja de estar rechazada y desaparece: puede volver a aparecer en otra búsqueda"><SkipForward size={13} /> Saltear</button>}
        </>}
      </div>
    </article>
  )
}
