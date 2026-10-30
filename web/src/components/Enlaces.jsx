import { Globe, MapPin, AtSign, Link2, ExternalLink } from 'lucide-react'

const Facebook = props => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...props}><path d="M14 8h3V4h-3c-2.8 0-4 1.7-4 4.3V10H7v4h3v8h4v-8h3l1-4h-4V8.6c0-.4.3-.6.6-.6H14z" /></svg>
const LinkedIn = props => <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" {...props}><path d="M4.5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM3 9h3v12H3zM9 9h2.9v1.7h.1c.4-.8 1.4-1.9 3.2-1.9 3.4 0 4 2.2 4 5.1V21h-3v-6.2c0-1.5 0-3.3-2-3.3s-2.3 1.6-2.3 3.2V21H9z" /></svg>

const host = u => { try { return new URL(u.includes('://') ? u : 'https://' + u).hostname.replace(/^www\./, '') } catch { return u } }
const href = u => (u.includes('://') ? u : 'https://' + u)

/** Botoncitos con los links de una empresa: web, Google Maps, redes y de dónde salió */
export default function Enlaces({ e, conTexto = false, fuente = true }) {
  const web = e.web ?? e.web_actual
  const items = [
    web && ['web', Globe, host(web), web, 'Página web'],
    e.google_maps_url && ['maps', MapPin, 'Maps', e.google_maps_url, 'Ver en Google Maps'],
    e.instagram && ['ig', AtSign, 'Instagram', e.instagram, 'Instagram'],
    e.facebook && ['fb', Facebook, 'Facebook', e.facebook, 'Facebook'],
    e.linkedin && ['in', LinkedIn, 'LinkedIn', e.linkedin, 'LinkedIn'],
    fuente && e.fuente_url && ['fuente', Link2, 'Fuente', e.fuente_url, 'Dónde se encontró'],
  ].filter(Boolean)
  if (!items.length) return <span className="muted chico">Sin links</span>
  return (
    <span className="enlaces">
      {items.map(([k, Icono, texto, url, titulo]) => (
        <a key={k} className={'enlace ' + k + (conTexto ? ' con-texto' : '')} href={href(url)} target="_blank" rel="noreferrer" title={titulo} onClick={ev => ev.stopPropagation()}>
          <Icono size={14} />{conTexto && <span>{texto}</span>}{conTexto && k === 'web' && <ExternalLink size={10} />}
        </a>
      ))}
    </span>
  )
}
