import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Plus, Save, Trash2, Loader2, UserRound, Building2, Globe, MonitorSmartphone, Sparkles, AlertTriangle, RotateCcw, Store, Search } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { Avatar, useToast } from './ui.jsx'
import { useApp } from '../App.jsx'
import { CLAVE_MUNDO_WA, MAX_MENSAJES_WA, VARIABLES_WA, mensajesWa, quienSoy, rellenarWa } from '../lib/mensajesWa.js'

const PARA = [['con_web', 'Con web', Globe], ['sin_web', 'Sin web', MonitorSmartphone], ['', 'Cualquiera', Sparkles]]
// Si todavía no tenés empresas en tu lista, la vista previa usa estas
const EJEMPLOS = {
  con_web: { nombre: 'Panadería La Espiga', rubro: 'panadería', zona: 'Godoy Cruz', web_actual: 'https://laespiga.com.ar' },
  sin_web: { nombre: 'Taller Ruiz', rubro: 'taller mecánico', zona: 'Godoy Cruz', web_actual: '' },
}
const ETIQUETA = Object.fromEntries(VARIABLES_WA)

/** Donde escribís tus mensajes de WhatsApp. Después, en cada empresa, elegís cuál mandar. */
export default function MisMensajesWa() {
  const toast = useToast()
  const app = useApp()
  const { perfil, refrescar } = app
  const detectado = quienSoy({ ...app, perfil: { ...perfil, config_email: {} } })
  const guardadoYo = perfil?.config_email?.whatsapp_yo ?? {}

  // Un juego de mensajes por lado: «mi negocio» y «búsqueda libre»
  const leerListas = () => ({ negocio: mensajesWa(perfil, 'negocio'), libre: mensajesWa(perfil, 'libre') })
  const [listas, setListas] = useState(leerListas)
  const [mundo, setMundo] = useState('negocio')
  const lista = listas[mundo]
  const setLista = f => setListas(ls => ({ ...ls, [mundo]: typeof f === 'function' ? f(ls[mundo]) : f }))
  const [yoForm, setYoForm] = useState(() => ({ mi_nombre: guardadoYo.mi_nombre ?? '', mi_empresa: guardadoYo.mi_empresa ?? '' }))
  const [activo, setActivo] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [reales, setReales] = useState({})
  const area = useRef(null)

  useEffect(() => {
    if (sucio) return
    setListas(leerListas())
    const g = perfil?.config_email?.whatsapp_yo ?? {}
    setYoForm({ mi_nombre: g.mi_nombre ?? '', mi_empresa: g.mi_empresa ?? '' })
  }, [perfil])
  // Para la vista previa: empresas reales de tu lista (una con web y una sin web)
  useEffect(() => {
    const campos = 'nombre, rubro, zona, web_actual'
    Promise.all([
      supabase.from('prospectos').select(campos).not('web_actual', 'is', null).neq('web_actual', '').order('created_at', { ascending: false }).limit(1),
      supabase.from('prospectos').select(campos).or('web_actual.is.null,web_actual.eq.').order('created_at', { ascending: false }).limit(1),
    ]).then(([a, b]) => setReales({ con_web: a.data?.[0], sin_web: b.data?.[0] }), () => {})
  }, [])

  // Lo que escribas acá manda; si lo dejás vacío, se usa lo que detecta de tu cuenta
  const yo = { mi_nombre: yoForm.mi_nombre.trim() || detectado.mi_nombre, mi_empresa: yoForm.mi_empresa.trim() || detectado.mi_empresa }
  const i = Math.min(activo, lista.length - 1)
  const m = lista[i]
  const cambiar = (k, v) => { setLista(l => l.map((x, j) => j === i ? { ...x, [k]: v } : x)); setSucio(true) }
  const cambiarYo = (k, v) => { setYoForm(f => ({ ...f, [k]: v })); setSucio(true) }
  const insertar = variable => {
    const el = area.current, t = m.texto ?? '', tag = `{{${variable}}}`
    const a = el?.selectionStart ?? t.length, b = el?.selectionEnd ?? t.length
    cambiar('texto', t.slice(0, a) + tag + t.slice(b))
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(a + tag.length, a + tag.length) })
  }
  const agregar = () => { setLista(l => [...l, { titulo: `Mensaje ${l.length + 1}`, para: '', texto: '' }]); setActivo(lista.length); setSucio(true) }
  const borrar = () => { setLista(l => l.filter((_, j) => j !== i)); setActivo(Math.max(0, i - 1)); setSucio(true) }

  async function guardar() {
    const limpiar = l => l.map(x => ({ titulo: x.titulo.trim() || 'Mensaje', para: x.para ?? '', texto: x.texto.trim() }))
    const whatsapp_yo = { mi_nombre: yoForm.mi_nombre.trim(), mi_empresa: yoForm.mi_empresa.trim() }
    setGuardando(true)
    const { error } = await supabase.from('perfiles').update({ config_email: { ...(perfil.config_email ?? {}), [CLAVE_MUNDO_WA.negocio]: limpiar(listas.negocio), [CLAVE_MUNDO_WA.libre]: limpiar(listas.libre), whatsapp_yo } }).eq('id', perfil.id)
    setGuardando(false)
    if (error) return toast(mensajeError(error), 'error')
    setSucio(false); refrescar()
    toast('Guardado. En cada empresa, pestaña WhatsApp, elegís cuál mandar.', 'ok')
  }
  function descartar() {
    setListas(leerListas()); setYoForm({ mi_nombre: guardadoYo.mi_nombre ?? '', mi_empresa: guardadoYo.mi_empresa ?? '' }); setSucio(false)
  }

  const clave = m?.para === 'sin_web' ? 'sin_web' : 'con_web'
  const ejemplo = reales[clave] ?? EJEMPLOS[clave]
  const sinEmpresa = m?.texto.trim() && !/\{\{\s*empresa\s*\}\}/.test(m.texto)

  return (
    <div className="wa-pag">
      {/* Quién escribe */}
      <section className="tarjeta wa-yo">
        <div className="wa-yo-cab">
          <span className="wa-icono"><UserRound size={17} /></span>
          <div><h2>Quién escribe</h2><p className="muted chico">Va en «Soy … de …». Si lo dejás vacío, usa lo de tu cuenta.</p></div>
        </div>
        <div className="wa-yo-campos">
          <label><span><UserRound size={13} /> Tu nombre</span>
            <input value={yoForm.mi_nombre} onChange={e => cambiarYo('mi_nombre', e.target.value)} maxLength={60} placeholder={detectado.mi_nombre || 'Ej.: Vicente'} />
          </label>
          <label><span><Building2 size={13} /> Tu empresa</span>
            <input value={yoForm.mi_empresa} onChange={e => cambiarYo('mi_empresa', e.target.value)} maxLength={80} placeholder={detectado.mi_empresa || 'Ej.: Estudio Web Cuyo'} />
          </label>
        </div>
      </section>

      {/* Los mensajes, en pestañas: un juego para cada lado */}
      <section className="tarjeta wa-editor">
        <div className="wa-mundos">
          <div className="wa-seg wa-seg-grande" role="radiogroup" aria-label="Para qué búsquedas">
            <button type="button" role="radio" aria-checked={mundo === 'negocio'} className={mundo === 'negocio' ? 'on' : ''} onClick={() => { setMundo('negocio'); setActivo(0) }}><Store size={14} /> Clientes para mi negocio</button>
            <button type="button" role="radio" aria-checked={mundo === 'libre'} className={mundo === 'libre' ? 'on' : ''} onClick={() => { setMundo('libre'); setActivo(0) }}><Search size={14} /> Búsqueda libre</button>
          </div>
          <small className="muted">{mundo === 'negocio' ? 'Se usan con las empresas que encontraste buscando clientes para tu negocio.' : 'Se usan con las empresas de tus búsquedas libres (proveedores, aliados, lo que sea).'}</small>
        </div>
        <div className="wa-tabs" role="tablist" aria-label="Tus mensajes">
          {lista.map((x, j) => (
            <button key={j} type="button" role="tab" aria-selected={j === i} className={j === i ? 'on' : ''} onClick={() => setActivo(j)}>
              <MessageCircle size={14} /> <span>{x.titulo || `Mensaje ${j + 1}`}</span>
              {!x.texto.trim() && <i className="wa-punto" title="Vacío" />}
            </button>
          ))}
          {lista.length < MAX_MENSAJES_WA && <button type="button" className="wa-tab-mas" onClick={agregar} aria-label="Agregar otro mensaje"><Plus size={15} /></button>}
        </div>

        {m && (
          <div className="wa-cuerpo">
            <div className="wa-col">
              <div className="wa-fila">
                <input className="wa-titulo" value={m.titulo} onChange={e => cambiar('titulo', e.target.value)} maxLength={40} aria-label="Nombre del mensaje" placeholder="Nombre del mensaje" />
                {lista.length > 1 && <button type="button" className="btn fantasma chico" onClick={borrar} title="Borrar este mensaje"><Trash2 size={14} /></button>}
              </div>

              <div className="wa-campo">
                <span className="wa-etiqueta">Se sugiere para</span>
                <div className="wa-seg" role="radiogroup" aria-label="Para qué empresas">
                  {PARA.map(([k, l, I]) => (
                    <button key={k} type="button" role="radio" aria-checked={(m.para ?? '') === k} className={(m.para ?? '') === k ? 'on' : ''} onClick={() => cambiar('para', k)}><I size={13} /> {l}</button>
                  ))}
                </div>
              </div>

              <div className="wa-campo">
                <span className="wa-etiqueta">Mensaje</span>
                <div className="wa-caja">
                  <textarea ref={area} rows={9} value={m.texto} maxLength={1500} onChange={e => cambiar('texto', e.target.value)}
                    placeholder="Escribí tu mensaje. Usá los botones de abajo para que el nombre de la empresa, su web o tu nombre se completen solos." />
                  <div className="wa-vars">
                    {VARIABLES_WA.map(([k, l]) => <button key={k} type="button" onClick={() => insertar(k)}><Plus size={11} /> {l}</button>)}
                  </div>
                </div>
                <small className="muted wa-ayuda">Lo que aparece como <code>{'{{empresa}}'}</code> se reemplaza solo: {Object.values(ETIQUETA).slice(0, 4).join(', ')}… · {m.texto.length}/1500</small>
              </div>

              {sinEmpresa && (
                <div className="wa-aviso"><AlertTriangle size={15} />
                  <span>Sumá el <b>nombre de la empresa</b> así cada mensaje sale distinto: la app no deja mandar el mismo texto exacto a dos empresas.</span>
                  <button type="button" className="btn chico" onClick={() => insertar('empresa')}><Plus size={12} /> Empresa</button>
                </div>
              )}
            </div>

            <div className="wa-col wa-col-previa">
              <span className="wa-etiqueta">Así le llega a {reales[clave] ? 'una empresa de tu lista' : 'una empresa de ejemplo'}</span>
              <div className="preview wa-telefono">
                <div className="preview-cab"><Avatar nombre={ejemplo.nombre} /><div><span>{ejemplo.nombre}</span><small>{ejemplo.web_actual ? 'tiene web' : 'sin web'} · vista previa</small></div></div>
                <div className="preview-cuerpo">
                  {m.texto.trim()
                    ? <div className="burbuja" key={m.texto.length % 7}>{rellenarWa(m.texto, ejemplo, yo)}<small><span>12:30</span> ✓✓</small></div>
                    : <span className="muted chico centrado" style={{ margin: 'auto' }}>Escribí el mensaje y lo ves acá</span>}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      <div className={'wa-barra' + (sucio ? ' visible' : '')}>
        <span>{sucio ? 'Tenés cambios sin guardar' : 'Todo guardado'}</span>
        <span className="espacio" />
        {sucio && <button type="button" className="btn fantasma chico" onClick={descartar}><RotateCcw size={13} /> Descartar</button>}
        <button type="button" className="btn primario" onClick={guardar} disabled={!sucio || guardando}>{guardando ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Guardar</button>
      </div>
    </div>
  )
}
