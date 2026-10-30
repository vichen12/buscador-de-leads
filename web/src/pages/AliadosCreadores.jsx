import { useEffect, useMemo, useState } from 'react'
import { Handshake, Megaphone, Plus, Pencil, Trash2, Sparkles, Loader2, Copy, MessageCircle, Mail, Search, AtSign, Globe } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { fecha, mensajeError } from '../lib/util.js'
import { Avatar, Esqueleto, ErrorCarga, Vacio, Modal, useToast, useConfirmar } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

// Aliados: negocios que comparten clientes con el tuyo sin competir (te recomiendan a cambio de comisión, canje o reciprocidad).
// Creadores: gente con audiencia que puede mostrar lo que vendés. Ninguno de los dos se contacta solo: Claude escribe, vos enviás.
const CONFIG = {
  aliados: {
    tabla: 'aliados', tipoIA: 'aliado', titulo: 'Aliados', icono: Handshake, singular: 'aliado',
    bajada: 'Negocios que tienen a tus mismos clientes y te pueden recomendar: una peluquería para un spa, una inmobiliaria para una mudadora.',
    estados: [['identificado', 'Para contactar', '#a8a196'], ['contactado', 'Contactado', '#3b82f6'], ['conversando', 'Conversando', '#f59e0b'], ['activo', 'Aliado activo', '#15803d'], ['pausado', 'En pausa', '#7c3aed'], ['descartado', 'Descartado', '#c0262d']],
    vacio: { nombre: '', rubro: '', zona: '', contacto: '', email: '', telefono: '', web: '', instagram: '', estado: 'identificado', comision_tipo: 'porcentaje', comision_valor: 10, codigo: '', acuerdo: '', notas: '', proximo_contacto: '' },
    campos: [['nombre', 'Nombre del negocio', 'text', true], ['rubro', 'Rubro'], ['zona', 'Zona'], ['contacto', 'Persona de contacto'], ['email', 'Email', 'email'], ['telefono', 'Teléfono / WhatsApp'], ['web', 'Web'], ['instagram', 'Instagram'], ['codigo', 'Código o link para sus clientes'], ['proximo_contacto', 'Próximo contacto', 'date']],
  },
  creadores: {
    tabla: 'creadores', tipoIA: 'creador', titulo: 'Creadores', icono: Megaphone, singular: 'creador',
    bajada: 'Gente con audiencia en tu zona o tu nicho que puede mostrar lo que vendés, por canje, pago o comisión.',
    estados: [['identificado', 'Para contactar', '#a8a196'], ['contactado', 'Contactado', '#3b82f6'], ['negociando', 'Negociando', '#f59e0b'], ['acordado', 'Acordado', '#7c3aed'], ['publicado', 'Publicado', '#15803d'], ['descartado', 'Descartado', '#c0262d']],
    vacio: { nombre: '', red: 'instagram', usuario: '', link: '', seguidores: '', nicho: '', zona: '', email: '', estado: 'identificado', propuesta: '', costo: 0, codigo: '', resultado: '', notas: '', publicado_at: '' },
    campos: [['nombre', 'Nombre', 'text', true], ['usuario', 'Usuario (@)'], ['link', 'Link al perfil'], ['seguidores', 'Seguidores', 'number'], ['nicho', 'De qué habla'], ['zona', 'Zona'], ['email', 'Email de contacto', 'email'], ['codigo', 'Código de descuento'], ['costo', 'Costo ($)', 'number'], ['publicado_at', 'Fecha de publicación', 'date']],
  },
}
const plata = n => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR')

export function Aliados() { return <TableroSocios cual="aliados" /> }
export function Creadores() { return <TableroSocios cual="creadores" /> }

function TableroSocios({ cual }) {
  const cfg = CONFIG[cual]
  const { session } = useApp()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [lista, setLista] = useState(null)
  const [clientes, setClientes] = useState({})
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [editando, setEditando] = useState(null)
  const [escribir, setEscribir] = useState(null)

  const cargar = async () => {
    setError(null)
    const col = cual === 'aliados' ? 'aliado_id' : 'creador_id'
    const [{ data, error }, { data: cs }] = await Promise.all([
      supabase.from(cfg.tabla).select('*').order('updated_at', { ascending: false }),
      supabase.from('clientes').select(`${col}, total_gastado`).not(col, 'is', null),
    ])
    if (error) return setError(error)
    const m = {}
    for (const c of cs ?? []) { const k = c[col]; m[k] ??= { n: 0, total: 0 }; m[k].n++; m[k].total += Number(c.total_gastado) || 0 }
    setClientes(m); setLista(data)
  }
  useEffect(() => { setLista(null); cargar() }, [cual])

  const visibles = useMemo(() => (lista ?? []).filter(x => !q || [x.nombre, x.rubro, x.zona, x.nicho, x.usuario].join(' ').toLowerCase().includes(q.toLowerCase())), [lista, q])
  async function mover(x, estado) {
    const { error } = await supabase.from(cfg.tabla).update({ estado }).eq('id', x.id)
    if (error) return toast(mensajeError(error), 'error')
    setLista(l => l.map(y => (y.id === x.id ? { ...y, estado } : y)))
  }
  async function borrar(x) {
    if (!(await confirmar({ titulo: `¿Borrar a ${x.nombre}?`, aceptar: 'Borrar', peligro: true }))) return
    const { error } = await supabase.from(cfg.tabla).delete().eq('id', x.id)
    if (error) return toast(mensajeError(error), 'error')
    toast('Borrado'); cargar()
  }

  const activos = (lista ?? []).filter(x => ['activo', 'acordado', 'publicado'].includes(x.estado)).length
  const traidos = Object.values(clientes).reduce((a, c) => a + c.n, 0)
  const vendido = Object.values(clientes).reduce((a, c) => a + c.total, 0)

  return (
    <>
      <header className="cabecera">
        <div><h1>{cfg.titulo}</h1><p className="saludo">{cfg.bajada}</p></div>
        <div className="acciones"><button type="button" className="btn primario" onClick={() => setEditando({ ...cfg.vacio })}><Plus size={15} /> Sumar {cfg.singular}</button></div>
      </header>

      {error ? <ErrorCarga error={error} onReintentar={cargar} /> : !lista ? <Esqueleto filas={5} /> : !lista.length ? (
        <Vacio icono={cfg.icono} titulo={`Todavía no sumaste ${cfg.titulo.toLowerCase()}`} accion={<button className="btn primario" onClick={() => setEditando({ ...cfg.vacio })}><Plus size={15} /> Sumar el primero</button>}>
          {cual === 'aliados' ? 'Pensá en negocios cerca tuyo que atienden a la misma gente pero no venden lo mismo. Claude te ayuda a escribirles la propuesta.' : 'Anotá cuentas de tu zona o tu nicho que te gustaría que te muestren. Claude te arma el mensaje para proponerles.'}
        </Vacio>
      ) : <>
        <div className="kpis kpis-3">
          <div className="kpi"><div className="kpi-top"><span>{cual === 'aliados' ? 'Aliados activos' : 'Acordados o publicados'}</span></div><b>{activos}</b><small>de {lista.length} en total</small></div>
          <div className="kpi"><div className="kpi-top"><span>Clientes que trajeron</span></div><b>{traidos}</b><small>Marcados en Mis clientes</small></div>
          <div className="kpi"><div className="kpi-top"><span>Lo que compraron</span></div><b>{plata(vendido)}</b><small>{cual === 'aliados' ? 'Base para calcular comisiones' : 'Para medir si valió la pena'}</small></div>
        </div>
        <div className="campo-buscar" style={{ position: 'relative', maxWidth: 360, marginBottom: 14 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--mut)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" style={{ paddingLeft: 34 }} />
        </div>
        <div className="kanban-b2c">
          {cfg.estados.map(([k, label, color]) => {
            const items = visibles.filter(x => x.estado === k)
            return (
              <section key={k} className="columna-b2c">
                <div className="columna-b2c-cab"><i style={{ background: color }} />{label}<span>{items.length}</span></div>
                {items.map(x => {
                  const c = clientes[x.id]
                  return (
                    <article key={x.id} className="socio">
                      <div className="socio-cab"><Avatar nombre={x.nombre} /><div><b>{x.nombre}</b><small className="muted">{[x.rubro || x.nicho, x.zona, x.seguidores ? `${Number(x.seguidores).toLocaleString('es-AR')} seguidores` : ''].filter(Boolean).join(' · ')}</small></div></div>
                      {cual === 'aliados' && x.comision_tipo !== 'ninguna' && <div className="chico muted">Comisión: {x.comision_tipo === 'porcentaje' ? `${x.comision_valor}%` : x.comision_tipo === 'fijo' ? plata(x.comision_valor) : 'canje'}{c ? ` · a pagar ${x.comision_tipo === 'porcentaje' ? plata(c.total * x.comision_valor / 100) : x.comision_tipo === 'fijo' ? plata(c.n * x.comision_valor) : '—'}` : ''}</div>}
                      {c && <div className="chico"><b>{c.n}</b> clientes · {plata(c.total)}</div>}
                      {x.proximo_contacto && <div className="chico muted">Próximo contacto: {fecha(x.proximo_contacto)}</div>}
                      <div className="socio-acciones">
                        {x.owner_id === session.user.id && <>
                          <button type="button" className="btn chico ia" onClick={() => setEscribir(x)}><Sparkles size={13} /> Escribirle</button>
                          <select aria-label="Mover a" value={x.estado} onChange={e => mover(x, e.target.value)}>{cfg.estados.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                          <button type="button" className="btn fantasma chico" onClick={() => setEditando(x)} aria-label="Editar"><Pencil size={14} /></button>
                          <button type="button" className="btn fantasma chico" onClick={() => borrar(x)} aria-label="Borrar"><Trash2 size={14} /></button>
                        </>}
                      </div>
                    </article>
                  )
                })}
              </section>
            )
          })}
        </div>
      </>}

      {editando && <EditarSocio cfg={cfg} cual={cual} inicial={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />}
      {escribir && <EscribirCon tipo={cfg.tipoIA} item={escribir} onCerrar={() => setEscribir(null)} onUsado={() => { if (escribir.estado === 'identificado') mover(escribir, 'contactado') }} />}
    </>
  )
}

function EditarSocio({ cfg, cual, inicial, onCerrar, onGuardado }) {
  const toast = useToast()
  const [f, setF] = useState(() => Object.fromEntries(Object.entries({ ...cfg.vacio, ...inicial }).map(([k, v]) => [k, v ?? ''])))
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  async function guardar(e) {
    e.preventDefault()
    setGuardando(true)
    const fila = Object.fromEntries(Object.keys(cfg.vacio).map(k => [k, f[k] === '' ? (typeof cfg.vacio[k] === 'number' ? 0 : ['proximo_contacto', 'publicado_at', 'seguidores'].includes(k) ? null : '') : f[k]]))
    for (const k of ['seguidores', 'costo', 'comision_valor']) if (k in fila && fila[k] !== null) fila[k] = Number(fila[k]) || 0
    const { error } = inicial.id ? await supabase.from(cfg.tabla).update(fila).eq('id', inicial.id) : await supabase.from(cfg.tabla).insert(fila)
    setGuardando(false)
    if (error) return toast(mensajeError(error), 'error')
    toast('Guardado', 'ok'); onGuardado()
  }
  return (
    <Modal onCerrar={onCerrar} ancho={600}>
      <form onSubmit={guardar}>
        <h3 style={{ marginTop: 0 }}>{inicial.id ? `Editar ${cfg.singular}` : `Sumar ${cfg.singular}`}</h3>
        <div className="dos-col" style={{ gap: 12 }}>
          {cfg.campos.map(([k, label, tipo = 'text', req]) => <label key={k}>{label}<input type={tipo} value={f[k]} onChange={e => set(k, e.target.value)} required={!!req} autoFocus={k === 'nombre'} /></label>)}
          {cual === 'creadores' && <label>Red<select value={f.red} onChange={e => set('red', e.target.value)}>{['instagram', 'tiktok', 'youtube', 'x', 'otra'].map(r => <option key={r}>{r}</option>)}</select></label>}
          {cual === 'aliados' && <>
            <label>Comisión<select value={f.comision_tipo} onChange={e => set('comision_tipo', e.target.value)}><option value="porcentaje">Porcentaje de lo que compran</option><option value="fijo">Monto fijo por cliente</option><option value="canje">Canje / reciprocidad</option><option value="ninguna">Sin comisión</option></select></label>
            {['porcentaje', 'fijo'].includes(f.comision_tipo) && <label>{f.comision_tipo === 'porcentaje' ? 'Porcentaje (%)' : 'Monto por cliente ($)'}<input type="number" min="0" step="any" value={f.comision_valor} onChange={e => set('comision_valor', e.target.value)} /></label>}
          </>}
        </div>
        <label>{cual === 'aliados' ? 'Acuerdo' : 'Propuesta'}<textarea rows={2} value={cual === 'aliados' ? f.acuerdo : f.propuesta} onChange={e => set(cual === 'aliados' ? 'acuerdo' : 'propuesta', e.target.value)} placeholder={cual === 'aliados' ? 'Ej.: les damos 10% de lo que compren sus clientes con el código' : 'Ej.: canje por un producto + 10% de lo que vendan con su código'} /></label>
        {cual === 'creadores' && <label>Resultado<textarea rows={2} value={f.resultado} onChange={e => set('resultado', e.target.value)} placeholder="Qué pasó después de la publicación" /></label>}
        <label>Notas<textarea rows={2} value={f.notas} onChange={e => set('notas', e.target.value)} /></label>
        <div className="acciones fin"><button type="button" className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" disabled={guardando}>{guardando && <Loader2 size={15} className="spin" />} Guardar</button></div>
      </form>
    </Modal>
  )
}

/** Claude escribe la propuesta; vos la copiás o la abrís en WhatsApp / tu mail. Nada se envía solo. */
export function EscribirCon({ tipo, item, onCerrar, onUsado }) {
  const toast = useToast()
  const [canal, setCanal] = useState(item?.email ? 'email' : 'whatsapp')
  const [detalle, setDetalle] = useState('')
  const [texto, setTexto] = useState(null)
  const [cargando, setCargando] = useState(false)
  async function generar() {
    setCargando(true)
    try { const r = await llamarFuncion('generar-mensajes', { modo: 'b2c', tipo, id: item?.id, canal, detalle }); setTexto({ asunto: r.asunto, cuerpo: r.cuerpo }) }
    catch (e) { toast(e.message, 'error') }
    setCargando(false)
  }
  const tel = String(item?.telefono ?? '').replace(/\D/g, '')
  const copiar = () => { navigator.clipboard.writeText((texto.asunto ? texto.asunto + '\n\n' : '') + texto.cuerpo); toast('Copiado', 'ok'); onUsado?.() }
  return (
    <Modal onCerrar={onCerrar} ancho={560}>
      <h3 style={{ marginTop: 0 }}><Sparkles size={18} style={{ verticalAlign: -3 }} /> Escribirle a {item?.nombre}</h3>
      <div className="chips-filtro" style={{ marginBottom: 12 }}>
        <button type="button" className={canal === 'email' ? 'activo' : ''} onClick={() => setCanal('email')}><Mail size={13} /> Email</button>
        <button type="button" className={canal === 'whatsapp' ? 'activo' : ''} onClick={() => setCanal('whatsapp')}><MessageCircle size={13} /> {tipo === 'creador' ? 'Mensaje directo' : 'WhatsApp'}</button>
      </div>
      <label>¿Qué le querés proponer? (opcional)<textarea rows={2} value={detalle} onChange={e => setDetalle(e.target.value)} placeholder={tipo === 'aliado' ? 'Ej.: 10% de comisión por cada cliente que nos mande' : 'Ej.: canje por un producto y un código de descuento para su audiencia'} /></label>
      {!texto ? <button type="button" className="btn ia ancho" onClick={generar} disabled={cargando}>{cargando ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} Que lo escriba Claude</button> : <>
        {canal === 'email' && <label>Asunto<input value={texto.asunto} onChange={e => setTexto({ ...texto, asunto: e.target.value })} /></label>}
        <label>Mensaje<textarea rows={8} value={texto.cuerpo} onChange={e => setTexto({ ...texto, cuerpo: e.target.value })} /></label>
        <div className="acciones fin" style={{ flexWrap: 'wrap' }}>
          <button type="button" className="btn fantasma" onClick={generar} disabled={cargando}>{cargando ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} Otra versión</button>
          <button type="button" className="btn" onClick={copiar}><Copy size={14} /> Copiar</button>
          {canal === 'whatsapp' && tel && <a className="btn primario" href={`https://wa.me/${tel}?text=${encodeURIComponent(texto.cuerpo)}`} target="_blank" rel="noreferrer" onClick={() => onUsado?.()}><MessageCircle size={14} /> Abrir WhatsApp</a>}
          {canal === 'whatsapp' && !tel && item?.link && <a className="btn primario" href={item.link} target="_blank" rel="noreferrer" onClick={copiar}>{item.red === 'instagram' ? <AtSign size={14} /> : <Globe size={14} />} Copiar y abrir perfil</a>}
          {canal === 'email' && item?.email && <a className="btn primario" href={`mailto:${item.email}?subject=${encodeURIComponent(texto.asunto)}&body=${encodeURIComponent(texto.cuerpo)}`} onClick={() => onUsado?.()}><Mail size={14} /> Abrir en mi mail</a>}
        </div>
        <p className="muted chico">Lo enviás vos: Prospecta nunca manda mensajes de WhatsApp ni de redes por su cuenta.</p>
      </>}
    </Modal>
  )
}
