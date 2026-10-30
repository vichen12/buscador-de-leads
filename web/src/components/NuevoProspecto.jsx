import { useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { clasificarWeb, instagramDe } from '@shared/clasificar.js'
import { Modal, Aviso } from './ui.jsx'

const VACIO = { nombre: '', rubro: '', zona: '', direccion: '', telefono: '', email: '', instagram: '', web_actual: '', notas: '' }

export default function NuevoProspecto({ onCerrar, onCreado }) {
  const [f, setF] = useState(VACIO)
  const [error, setError] = useState('')
  const c = k => e => setF({ ...f, [k]: e.target.value })
  const web = clasificarWeb(f.web_actual)

  async function guardar(e) {
    e.preventDefault()
    let ig = f.instagram.trim()
    if (ig && !ig.includes('instagram.com')) ig = `https://www.instagram.com/${ig.replace('@', '')}/`
    const fila = { ...f, instagram: ig || instagramDe(f.web_actual), que_tiene_hoy: web.queTiene, fuente: 'manual' }
    const { data, error } = await supabase.from('prospectos').insert(fila).select().single()
    if (error) setError(mensajeError(error)); else onCreado(data)
  }

  return (
    <Modal onCerrar={onCerrar} ancho={620}>
      <form onSubmit={guardar}>
        <h3>Nuevo prospecto</h3>
        <p className="muted" style={{ margin: '0 0 18px' }}>Cargalo a mano. Si ya existe (mismo teléfono, o nombre y dirección) te avisamos.</p>
        <div className="form-grid">
          <label>Nombre *<input value={f.nombre} onChange={c('nombre')} required autoFocus /></label>
          <label>Rubro<input value={f.rubro} onChange={c('rubro')} placeholder="Barbería, Pilates…" /></label>
          <label>Teléfono<input value={f.telefono} onChange={c('telefono')} placeholder="0261 15-555-1234" /></label>
          <label>Instagram<input value={f.instagram} onChange={c('instagram')} placeholder="@usuario o link" /></label>
          <label>Zona<input value={f.zona} onChange={c('zona')} placeholder="Godoy Cruz" /></label>
          <label>Dirección<input value={f.direccion} onChange={c('direccion')} /></label>
          <label>Email<input type="email" value={f.email} onChange={c('email')} /></label>
          <label>Web que figura en Google<input value={f.web_actual} onChange={c('web_actual')} placeholder="Vacío si no tiene" /></label>
        </div>
        {f.web_actual && (web.esProspecto
          ? <Aviso tipo="info">Hoy tiene: <b>{web.queTiene}</b></Aviso>
          : <Aviso>Tiene dominio propio: no es el perfil que buscás, pero podés guardarlo igual.</Aviso>)}
        <label>Notas<textarea rows={2} value={f.notas} onChange={c('notas')} /></label>
        {error && <Aviso tipo="error">{error}</Aviso>}
        <div className="acciones fin">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button className="btn primario">Guardar</button>
        </div>
      </form>
    </Modal>
  )
}
