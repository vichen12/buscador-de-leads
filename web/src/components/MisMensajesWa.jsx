import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Plus, Save, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { useToast } from './ui.jsx'
import { useApp } from '../App.jsx'
import { Link } from 'react-router-dom'
import { MAX_MENSAJES_WA, VARIABLES_WA, mensajesWa, quienSoy, rellenarWa } from '../lib/mensajesWa.js'

const PARA = [['con_web', 'Empresas con web'], ['sin_web', 'Empresas sin web'], ['', 'Cualquiera']]
// Si todavía no tenés empresas en tu lista, la vista previa usa estas
const EJEMPLOS = {
  con_web: { nombre: 'Panadería La Espiga', rubro: 'panadería', zona: 'Godoy Cruz', web_actual: 'https://laespiga.com.ar' },
  sin_web: { nombre: 'Taller Ruiz', rubro: 'taller mecánico', zona: 'Godoy Cruz', web_actual: '' },
}

/** Donde escribís tus mensajes de WhatsApp. Después, en cada empresa, elegís cuál mandar. */
export default function MisMensajesWa() {
  const toast = useToast()
  const app = useApp()
  const { perfil, refrescar } = app
  const yo = quienSoy(app)
  // Para la vista previa: empresas reales de tu lista (una con web y una sin web)
  const [reales, setReales] = useState({})
  useEffect(() => {
    const campos = 'nombre, rubro, zona, web_actual'
    Promise.all([
      supabase.from('prospectos').select(campos).not('web_actual', 'is', null).neq('web_actual', '').order('created_at', { ascending: false }).limit(1),
      supabase.from('prospectos').select(campos).or('web_actual.is.null,web_actual.eq.').order('created_at', { ascending: false }).limit(1),
    ]).then(([a, b]) => setReales({ con_web: a.data?.[0], sin_web: b.data?.[0] }), () => {})
  }, [])
  const [lista, setLista] = useState(() => mensajesWa(perfil))
  const [guardando, setGuardando] = useState(false)
  const [sucio, setSucio] = useState(false)
  const areas = useRef([])
  useEffect(() => { if (!sucio) setLista(mensajesWa(perfil)) }, [perfil])

  const cambiar = (i, k, v) => { setLista(l => l.map((m, j) => j === i ? { ...m, [k]: v } : m)); setSucio(true) }
  const insertar = (i, variable) => {
    const el = areas.current[i], t = lista[i].texto ?? '', tag = `{{${variable}}}`
    const a = el?.selectionStart ?? t.length, b = el?.selectionEnd ?? t.length
    cambiar(i, 'texto', t.slice(0, a) + tag + t.slice(b))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + tag.length, a + tag.length) })
  }

  async function guardar() {
    const limpia = lista.map(m => ({ titulo: m.titulo.trim() || 'Mensaje', para: m.para ?? '', texto: m.texto.trim() }))
    setGuardando(true)
    const { error } = await supabase.from('perfiles').update({ config_email: { ...(perfil.config_email ?? {}), whatsapp_mensajes: limpia } }).eq('id', perfil.id)
    setGuardando(false)
    if (error) return toast(mensajeError(error), 'error')
    setSucio(false); refrescar()
    toast('Guardados. Ahora en cada empresa, en WhatsApp, elegís cuál mandar.', 'ok')
  }

  return (
    <section className="tarjeta mis-wa">
      <div className="mis-wa-cab">
        <span className="mis-wa-icono"><MessageCircle size={18} /></span>
        <div>
          <h2>Tus mensajes de WhatsApp</h2>
          <p className="muted chico">Escribilos con tus palabras. Después, en cada empresa, en la pestaña WhatsApp, tocás el que querés y se abre WhatsApp con ese texto. Te sugiere el que va según si la empresa tiene web o no.</p>
        </div>
      </div>

      <p className="mis-wa-yo">
        <small className="muted">Se completa solo:</small> vos sos <b>{yo.mi_nombre || 'sin nombre'}</b>{' '}
        de <b>{yo.mi_empresa || 'sin empresa cargada'}</b> · la empresa a la que le escribís sale de cada ficha.
        {(!yo.mi_nombre || !yo.mi_empresa) && <> <Link to="/cuenta">Completalo en Mi cuenta</Link>.</>}
      </p>

      <div className="mis-wa-grilla">
        {lista.map((m, i) => (
          <div key={i} className="mis-wa-item">
            <div className="mis-wa-fila">
              <input value={m.titulo} onChange={e => cambiar(i, 'titulo', e.target.value)} maxLength={40} aria-label="Nombre del mensaje" placeholder="Nombre (ej.: Tiene web vieja)" />
              {lista.length > 1 && <button type="button" className="btn fantasma chico" onClick={() => { setLista(l => l.filter((_, j) => j !== i)); setSucio(true) }} aria-label="Borrar este mensaje"><Trash2 size={14} /></button>}
            </div>
            <div className="mis-wa-para" role="radiogroup" aria-label="Para qué empresas">
              {PARA.map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={(m.para ?? '') === k} className={(m.para ?? '') === k ? 'on' : ''} onClick={() => cambiar(i, 'para', k)}>{l}</button>)}
            </div>
            <textarea ref={el => (areas.current[i] = el)} rows={6} value={m.texto} maxLength={1500} onChange={e => cambiar(i, 'texto', e.target.value)}
              placeholder={m.para === 'sin_web'
                ? 'Ej.: Hola, ¿cómo andan? Soy {{mi_nombre}} de {{mi_empresa}}. Vi que {{empresa}} no tiene página web y les armamos una en 2 semanas…'
                : 'Ej.: Hola, ¿cómo andan? Soy {{mi_nombre}} de {{mi_empresa}}. Entré a {{web}} y se ve un poco vieja en el celular…'} />
            <div className="mis-wa-vars">
              <small className="muted">Sumar dato:</small>
              {VARIABLES_WA.map(([k, l]) => <button key={k} type="button" className="chip" onClick={() => insertar(i, k)}>{l}</button>)}
            </div>
            {m.texto.trim() && !/\{\{\s*empresa\s*\}\}/.test(m.texto) && <small className="mis-wa-aviso">Sumá el <b>nombre de la empresa</b>: así cada mensaje sale distinto. La app no deja mandar el mismo texto exacto a dos empresas (para que WhatsApp no te marque como spam).</small>}
            {m.texto.trim() && <Previa m={m} reales={reales} yo={yo} />}
          </div>
        ))}
      </div>

      <div className="acciones">
        {lista.length < MAX_MENSAJES_WA && <button type="button" className="btn fantasma" onClick={() => { setLista(l => [...l, { titulo: '', para: '', texto: '' }]); setSucio(true) }}><Plus size={15} /> Otro mensaje</button>}
        <span className="espacio" />
        <button type="button" className="btn primario" onClick={guardar} disabled={!sucio || guardando}>{guardando ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Guardar</button>
      </div>
    </section>
  )
}

function Previa({ m, reales, yo }) {
  const clave = m.para === 'sin_web' ? 'sin_web' : 'con_web'
  const p = reales[clave] ?? EJEMPLOS[clave]
  return (
    <div className="mis-wa-previa">
      <small className="muted">Así le llega a «{p.nombre}»{reales[clave] ? ' (de tu lista)' : ' (ejemplo)'}:</small>
      <div className="burbuja">{rellenarWa(m.texto, p, yo)}</div>
    </div>
  )
}
