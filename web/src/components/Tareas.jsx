import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, MessageCircle, Network, Check, Copy, CalendarClock, Users, ListTodo, Mail, Undo2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fecha, mensajeError, hoyLocal } from '../lib/util.js'
import { linkWhatsApp } from '@shared/clasificar.js'
import { useToast } from './ui.jsx'

export const TIPO_TAREA = {
  llamar: ['Llamar', Phone], whatsapp: ['WhatsApp', MessageCircle], email: ['Email', Mail], reunion: ['Reunión', Users],
  linkedin_visita: ['Ver LinkedIn', Network], linkedin_conexion: ['Conectar en LinkedIn', Network], linkedin_mensaje: ['Mensaje en LinkedIn', Network], otra: ['Tarea', ListTodo],
}

/**
 * Una tarea con su acción directa: abrir WhatsApp con el texto listo (lo mandás vos), llamar, copiar el texto de
 * LinkedIn y abrir el perfil. Nunca se envía nada solo.
 */
export function TareaItem({ t, onCambio, conEmpresa = true }) {
  const toast = useToast()
  const [hecha, setHecha] = useState(!!t.hecha_at)
  const p = t.prospectos ?? {}
  const [label, Icono] = TIPO_TAREA[t.tipo] ?? TIPO_TAREA.otra
  const vencida = !hecha && t.vence < hoyLocal()

  async function marcar(v) {
    setHecha(v)
    const { error } = await supabase.from('tareas').update({ hecha_at: v ? new Date().toISOString() : null }).eq('id', t.id)
    if (error) { setHecha(!v); toast(mensajeError(error), 'error'); return }
    if (v && t.prospecto_id) await supabase.from('interacciones').insert({ prospecto_id: t.prospecto_id, tipo: 'tarea', detalle: `Hecho: ${t.titulo}` })
    if (v) toast('Tarea hecha', 'ok', { deshacer: () => marcar(false) })
    onCambio?.()
  }
  async function copiar() { try { await navigator.clipboard.writeText(t.texto); toast('Texto copiado') } catch { toast('No pude copiar: seleccionalo a mano', 'error') } }

  const wa = t.tipo === 'whatsapp' && p.telefono ? linkWhatsApp(p.telefono, t.texto) : ''
  const linkedin = t.tipo.startsWith('linkedin') ? (p.linkedin || `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(p.nombre ?? '')}`) : ''
  return (
    <div className={'tarea' + (hecha ? ' hecha' : '') + (vencida ? ' vencida' : '')}>
      <button type="button" className="req-check" aria-pressed={hecha} aria-label={hecha ? 'Marcar como pendiente' : 'Marcar como hecha'} onClick={() => marcar(!hecha)}>{hecha && <Check size={13} />}</button>
      <div className="tarea-cuerpo">
        <div className="tarea-cab"><span className="chip"><Icono size={12} /> {label}</span><b>{t.titulo}</b></div>
        {conEmpresa && t.prospecto_id && <Link to={`/prospectos/${t.prospecto_id}`} className="muted chico">{p.nombre}{p.rubro ? ` · ${p.rubro}` : ''}</Link>}
        {t.texto && <p className="tarea-texto">{t.texto}</p>}
        <div className="tarea-acciones">
          <span className={'chico ' + (vencida ? 'texto-error' : 'muted')}><CalendarClock size={12} /> {vencida ? `Venció el ${fecha(t.vence)}` : t.vence === hoyLocal() ? 'Para hoy' : fecha(t.vence)}</span>
          <span className="espacio" />
          {t.texto && <button type="button" className="btn chico fantasma" onClick={copiar}><Copy size={13} /> Copiar</button>}
          {t.tipo === 'llamar' && p.telefono && <a className="btn chico" href={`tel:${p.telefono.split('/')[0].replace(/[^\d+]/g, '')}`}><Phone size={13} /> Llamar</a>}
          {wa && <a className="btn chico wa" href={wa} target="_blank" rel="noreferrer" onClick={() => !hecha && setTimeout(() => marcar(true), 800)}><MessageCircle size={13} /> Abrir WhatsApp</a>}
          {t.tipo === 'whatsapp' && !wa && <span className="muted chico">Sin celular cargado</span>}
          {linkedin && <a className="btn chico" href={linkedin} target="_blank" rel="noreferrer" onClick={() => t.texto && copiar()}><Network size={13} /> Abrir LinkedIn</a>}
          {hecha && <button type="button" className="btn chico fantasma" onClick={() => marcar(false)}><Undo2 size={13} /> Deshacer</button>}
        </div>
      </div>
    </div>
  )
}
