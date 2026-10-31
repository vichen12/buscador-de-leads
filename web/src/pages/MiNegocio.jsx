import { useEffect, useState } from 'react'
import { zonasDe, nombrePais } from '../lib/catalogo.js'
import { Link, useNavigate } from 'react-router-dom'
import { Sparkles, Loader2, Plus, X, Check, Pencil, RotateCcw, Target, MapPin, SlidersHorizontal, ThumbsUp, Ban, MessageSquareText, ArrowRight, Store, Trash2, Globe } from 'lucide-react'
import SelectorZona from '../components/SelectorZona.jsx'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { Aviso, Cargando, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const VACIO = { empresa: '', que_vende: '', cliente_ideal: '', tamanos: [], zonas: [], senales: '', no_quiere: '', ejemplos: '', canales: ['WhatsApp'], diferencial: '', web: '' }

export default function MiNegocio() {
  const { comercial, setComercial, perfil } = useApp()
  const [editandoForm, setEditandoForm] = useState(false)
  if (comercial === undefined) return <Cargando />
  const tieneEstrategia = comercial?.estrategia?.rubros?.length > 0
  if (!tieneEstrategia || editandoForm) {
    return <Formulario inicial={{ ...VACIO, empresa: perfil?.estudio || '', ...(comercial?.respuestas ?? {}) }} volver={tieneEstrategia ? () => setEditandoForm(false) : null}
      onListo={c => { setComercial(c); setEditandoForm(false) }} />
  }
  return <Estrategia comercial={comercial} onRehacer={() => setEditandoForm(true)} onGuardado={setComercial} />
}

/* ---------------- Formulario (una sola pregunta) ---------------- */
const EJEMPLOS = [
  'Vendo e instalo bombas de agua y riego por goteo para fincas y bodegas',
  'Hago páginas web para negocios chicos que sólo tienen Instagram',
  'Distribuyo artículos de limpieza a restaurantes, hoteles y oficinas',
  'Vendo seguros para empresas con flotas de camiones',
]
const zonasRapidas = (pais, region, otros) => [...new Set([...zonasDe(pais, region).slice(0, 4), ...(otros ?? []).map(nombrePais), 'Latinoamérica'])]
const webValida = v => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(String(v ?? '').trim())

function Formulario({ inicial, volver, onListo }) {
  const toast = useToast()
  const { session, perfil } = useApp()
  const ZONAS_RAPIDAS = zonasRapidas(perfil?.pais, perfil?.region, perfil?.paises)
  const [texto, setTexto] = useState(inicial.que_vende ? [inicial.que_vende, inicial.cliente_ideal].filter(Boolean).join('. ') : '')
  const [zonas, setZonas] = useState(inicial.zonas?.length ? inicial.zonas : [zonasDe(perfil?.pais, perfil?.region, perfil?.paises)[0]])
  const [web, setWeb] = useState(inicial.web || '')
  const [masDatos, setMasDatos] = useState(!!inicial.ejemplos || false)
  const [extra, setExtra] = useState({ empresa: inicial.empresa || '', diferencial: inicial.diferencial || '', no_quiere: inicial.no_quiere || '', ejemplos: inicial.ejemplos || '' })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const alternar = z => setZonas(x => x.includes(z) ? x.filter(y => y !== z) : [...x, z])
  const listo = texto.trim().length >= 10 || webValida(web)

  async function armar(e) {
    e?.preventDefault()
    if (!listo) return
    setCargando(true); setError('')
    const respuestas = { que_vende: texto.trim(), cliente_ideal: '', zonas, web: webValida(web) ? web.trim() : '', ...extra }
    try {
      const { estrategia } = await llamarFuncion('estrategia', { respuestas })
      onListo({ owner_id: session.user.id, respuestas, estrategia })
      toast('¡Listo! Esta es tu estrategia. Cambiá lo que quieras.')
      window.scrollTo({ top: 0 })
    } catch (err) { setError(mensajeError(err)) }
    setCargando(false)
  }

  return (
    <form className="onboarding" onSubmit={armar}>
      {volver && <button type="button" className="btn fantasma volver" onClick={volver}>← Volver a mi estrategia</button>}
      <div className="onb-icono"><Sparkles size={22} /></div>
      <h1>¿Qué vendés y a quién?</h1>
      <p className="muted">Contalo como se lo dirías a un amigo, o pegá tu página web. Claude arma el resto: qué rubros buscar, dónde y cómo escribirles.</p>

      <textarea className="onb-texto" rows={3} autoFocus value={texto} onChange={e => setTexto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) armar() }}
        placeholder="Ej.: Vendo e instalo bombas de agua y riego por goteo para fincas y bodegas" />
      {!texto && (
        <div className="chips-sel chicos onb-ejemplos">
          <small className="muted">Ejemplos:</small>
          {EJEMPLOS.map(x => <button type="button" key={x} className="chip-sel" onClick={() => setTexto(x)}>{x}</button>)}
        </div>
      )}

      <div className="onb-web">
        <Globe size={17} />
        <input value={web} onChange={e => setWeb(e.target.value)} placeholder="¿Tenés página web? Pegala y Claude la lee (ej.: tuempresa.com)" inputMode="url" spellCheck={false} />
        {webValida(web) && <span className="onb-web-ok"><Check size={13} strokeWidth={3} /> La va a leer</span>}
      </div>

      <div className="etiqueta onb-label">¿Dónde vendés?</div>
      <small className="muted onb-sub">Elegí todos los que quieras: ciudades, provincias, países o toda Latinoamérica.</small>
      <div className="chips-sel" style={{ marginTop: 0, justifyContent: 'center' }}>
        {[...new Set([...ZONAS_RAPIDAS, ...zonas])].map(z => <button type="button" key={z} className={'chip-sel' + (zonas.includes(z) ? ' on' : '')} onClick={() => alternar(z)}>{zonas.includes(z) && <Check size={13} />}{z}</button>)}
      </div>
      <div className="onb-zona">
        <SelectorZona pais={perfil?.pais} region={perfil?.region} multi seleccionadas={zonas} onChange={z => alternar(z)} placeholder="+ Sumar otro país, provincia o ciudad" />
      </div>

      {masDatos ? (
        <div className="onb-extra">
          <label>Nombre de tu empresa<input value={extra.empresa} onChange={e => setExtra({ ...extra, empresa: e.target.value })} placeholder="Ej.: Bombas Cuyo" /></label>
          <label>¿Por qué te eligen?<input value={extra.diferencial} onChange={e => setExtra({ ...extra, diferencial: e.target.value })} placeholder="Ej.: servicio técnico en 24 hs" /></label>
          <label>¿A quién NO le querés vender?<input value={extra.no_quiere} onChange={e => setExtra({ ...extra, no_quiere: e.target.value })} placeholder="Ej.: particulares" /></label>
          <label className="ancho-completo">Empresas que ya son tus clientes (o que te encantaría tener)<input value={extra.ejemplos} onChange={e => setExtra({ ...extra, ejemplos: e.target.value })} maxLength={400} placeholder="Ej.: Distrosol, Disur, Andreani Mendoza — el buscador trae parecidas" /></label>
        </div>
      ) : (
        <button type="button" className="link onb-mas" onClick={() => setMasDatos(true)}>+ Sumar más detalles (opcional)</button>
      )}

      {error && <Aviso tipo="error">{error}</Aviso>}
      <button className="btn ia grande onb-boton" disabled={!listo || cargando}>
        {cargando ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />} {cargando ? 'Claude está armando tu estrategia…' : 'Listo, armá mi estrategia'}
      </button>
      <small className="muted">Tarda unos 30 segundos. Después podés cambiar todo.</small>
    </form>
  )
}

/* ---------------- Estrategia editable ---------------- */
function Estrategia({ comercial, onRehacer, onGuardado }) {
  const toast = useToast()
  const nav = useNavigate()
  const [e, setE] = useState(comercial.estrategia)
  const [cambios, setCambios] = useState(false)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { setE(comercial.estrategia); setCambios(false) }, [comercial])
  const set = (k, v) => { setE(x => ({ ...x, [k]: v })); setCambios(true) }

  async function guardar() {
    setGuardando(true)
    const { error } = await supabase.from('perfil_comercial').update({ estrategia: e }).eq('owner_id', comercial.owner_id)
    setGuardando(false)
    if (error) { toast(mensajeError(error), 'error'); return }
    onGuardado({ ...comercial, estrategia: e }); setCambios(false)
    toast('Estrategia guardada. La búsqueda ya la usa.')
  }

  const grupos = [...new Set(e.rubros.map(r => r.grupo || 'Otros'))]

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>{comercial.respuestas?.empresa || 'Mi negocio'}</h1>
          <p>Tu estrategia de prospección. Claude la usa para buscar y para escribir los mensajes. Cambiá lo que quieras.</p>
        </div>
        <div className="acciones">
          <button className="btn" onClick={onRehacer}><RotateCcw size={15} /> Cambiar mis respuestas</button>
          <button className="btn primario" onClick={() => nav('/buscar')}>Buscar clientes <ArrowRight size={15} /></button>
        </div>
      </header>

      <section className="tarjeta resumen-negocio">
        <Store size={20} />
        <div style={{ flex: 1 }}>
          <Editable valor={e.resumen} onCambiar={v => set('resumen', v)} multilinea className="resumen-texto" />
          <div className="cliente-ideal"><b>Cliente ideal:</b> <Editable valor={e.cliente_ideal} onCambiar={v => set('cliente_ideal', v)} /></div>
        </div>
      </section>

      <div className="grid-estrategia">
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3><Target size={16} /> Rubros a buscar</h3><span className="muted chico">{e.rubros.length} rubros</span></div>
          {grupos.map(g => (
            <div key={g} className="zona-grupo">
              <small>{g}</small>
              <div className="chips-sel">
                {e.rubros.filter(r => (r.grupo || 'Otros') === g).map(r => (
                  <span key={r.nombre} className="chip-sel on chip-quitar" title={r.por_que}>{r.nombre}
                    <button type="button" aria-label={'Quitar ' + r.nombre} onClick={() => set('rubros', e.rubros.filter(x => x.nombre !== r.nombre))}><X size={12} /></button></span>
                ))}
              </div>
            </div>
          ))}
          <Agregar placeholder="Agregar un rubro (ej. bodega)" onAgregar={v => !e.rubros.some(r => r.nombre === v.toLowerCase()) && set('rubros', [...e.rubros, { nombre: v.toLowerCase(), grupo: 'Agregados por vos', por_que: '' }])} />
        </section>

        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3><MapPin size={16} /> Zonas</h3></div>
          <div className="chips-sel" style={{ marginTop: 0 }}>
            {e.zonas.map(z => <span key={z} className="chip-sel on chip-quitar">{z}<button type="button" aria-label={'Quitar ' + z} onClick={() => set('zonas', e.zonas.filter(x => x !== z))}><X size={12} /></button></span>)}
          </div>
          <div className="fila-agregar zona-agregar">
            <SelectorZona multi seleccionadas={e.zonas} onChange={v => set('zonas', e.zonas.includes(v) ? e.zonas.filter(x => x !== v) : [...e.zonas, v])} placeholder="Agregar país, provincia, ciudad o Latinoamérica" />
          </div>
        </section>
      </div>

      <section className="tarjeta">
        <div className="tarjeta-titulo"><h3><SlidersHorizontal size={16} /> Filtros</h3><span className="muted chico">Los encendidos vienen marcados en cada búsqueda. Los podés cambiar ahí también.</span></div>
        <div className="lista-filtros">
          {e.filtros.map((f, i) => (
            <div key={f.id + i} className={'filtro-fila' + (f.activo ? ' on' : '')}>
              <button type="button" className="req-check" aria-pressed={f.activo} aria-label="Activar filtro" onClick={() => set('filtros', e.filtros.map((x, j) => j === i ? { ...x, activo: !x.activo } : x))}>{f.activo && <Check size={13} />}</button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Editable valor={f.titulo} onCambiar={v => set('filtros', e.filtros.map((x, j) => j === i ? { ...x, titulo: v } : x))} className="fuerte" />
                <Editable valor={f.descripcion} onCambiar={v => set('filtros', e.filtros.map((x, j) => j === i ? { ...x, descripcion: v } : x))} className="muted chico" multilinea />
              </div>
              <button type="button" className="btn chico fantasma" aria-label="Borrar filtro" onClick={() => set('filtros', e.filtros.filter((_, j) => j !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <Agregar placeholder="Nuevo filtro (ej. Tiene más de una sucursal)" onAgregar={v => set('filtros', [...e.filtros, { id: 'f_' + Date.now().toString(36), titulo: v, descripcion: '', activo: true }])} />
      </section>

      <div className="grid-estrategia">
        <ListaEditable icono={ThumbsUp} titulo="Señales de buen prospecto" items={e.criterios} onCambiar={v => set('criterios', v)} placeholder="Agregar una señal" />
        <ListaEditable icono={Ban} titulo="A quién descartar" items={e.descartar} onCambiar={v => set('descartar', v)} placeholder="Agregar a quién descartar" />
      </div>

      <section className="tarjeta">
        <div className="tarjeta-titulo"><h3><MessageSquareText size={16} /> Cómo escribirles</h3></div>
        <label>Por dónde entrarle<textarea rows={3} value={e.angulo} onChange={ev => set('angulo', ev.target.value)} /></label>
        <label style={{ marginBottom: 0 }}>Tono<input value={e.tono} onChange={ev => set('tono', ev.target.value)} /></label>
      </section>

      {cambios && (
        <div className="barra-guardar">
          <span>Tenés cambios sin guardar</span>
          <button className="btn fantasma" onClick={() => { setE(comercial.estrategia); setCambios(false) }}>Descartar</button>
          <button className="btn primario" onClick={guardar} disabled={guardando}>{guardando && <Loader2 size={15} className="spin" />} Guardar estrategia</button>
        </div>
      )}
    </>
  )
}

function Editable({ valor, onCambiar, multilinea, className = '' }) {
  const [editando, setEditando] = useState(false)
  const [v, setV] = useState(valor)
  useEffect(() => setV(valor), [valor])
  if (editando) {
    const fin = () => { setEditando(false); if (v.trim() !== valor) onCambiar(v.trim()) }
    const props = { autoFocus: true, value: v, onChange: e => setV(e.target.value), onBlur: fin, onKeyDown: e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fin() } if (e.key === 'Escape') { setV(valor); setEditando(false) } } }
    return multilinea ? <textarea rows={2} className="editable-campo" {...props} /> : <input className="editable-campo" {...props} />
  }
  return <span className={'editable ' + className} role="button" tabIndex={0} onClick={() => setEditando(true)} onKeyDown={e => e.key === 'Enter' && setEditando(true)} title="Tocá para editar">{valor || <i className="muted">Sin completar</i>}<Pencil size={12} className="lapiz" /></span>
}

function Agregar({ placeholder, onAgregar }) {
  const [v, setV] = useState('')
  const ok = () => { if (v.trim()) { onAgregar(v.trim()); setV('') } }
  return (
    <div className="fila-agregar">
      <input value={v} onChange={e => setV(e.target.value)} placeholder={placeholder} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ok() } }} />
      <button type="button" className="btn" onClick={ok} disabled={!v.trim()}><Plus size={15} /> Agregar</button>
    </div>
  )
}

function ListaEditable({ icono: I, titulo, items, onCambiar, placeholder }) {
  return (
    <section className="tarjeta">
      <div className="tarjeta-titulo"><h3><I size={16} /> {titulo}</h3></div>
      <ul className="lista-editable">
        {items.map((c, i) => (
          <li key={i}>
            <Editable valor={c} onCambiar={v => onCambiar(items.map((x, j) => j === i ? v : x))} multilinea />
            <button type="button" className="btn chico fantasma" aria-label="Borrar" onClick={() => onCambiar(items.filter((_, j) => j !== i))}><X size={13} /></button>
          </li>
        ))}
      </ul>
      <Agregar placeholder={placeholder} onAgregar={v => onCambiar([...items, v])} />
    </section>
  )
}
