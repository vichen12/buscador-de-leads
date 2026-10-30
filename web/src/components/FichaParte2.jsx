import { useCallback, useEffect, useMemo, useState } from 'react'
import { Phone, CalendarCheck, Loader2, Sparkles, Copy, Tag, X, Plus, MessageSquare, AtSign, FileText, Printer, Trash2, MapPin, Paperclip, Upload, Download, Check } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { fecha, fechaHora, mensajeError, hoyLocal } from '../lib/util.js'
import { Avatar, Modal, useToast, useConfirmar } from './ui.jsx'
import { useApp } from '../App.jsx'

const plata = (n, m = 'ARS') => (m === 'USD' ? 'US$ ' : '$ ') + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })

/* ---------------- Guion de llamada y brief de reunión (Claude) ---------------- */
export function HerramientasIA({ p }) {
  const toast = useToast()
  const [abierto, setAbierto] = useState(null) // { modo, datos }
  const [cargando, setCargando] = useState('')
  async function pedir(modo) {
    setCargando(modo)
    try { const r = await llamarFuncion('generar-mensajes', { modo, prospecto_id: p.id }); setAbierto({ modo, datos: r[modo] }) }
    catch (e) { toast(e.message, 'error') }
    setCargando('')
  }
  return (
    <>
      <div className="herramientas-ia">
        <button type="button" className="btn chico" onClick={() => pedir('guion')} disabled={!!cargando}>{cargando === 'guion' ? <Loader2 size={14} className="spin" /> : <Phone size={14} />} Guion de llamada</button>
        <button type="button" className="btn chico" onClick={() => pedir('brief')} disabled={!!cargando}>{cargando === 'brief' ? <Loader2 size={14} className="spin" /> : <CalendarCheck size={14} />} Preparar reunión</button>
      </div>
      {abierto && (
        <Modal onCerrar={() => setAbierto(null)} ancho={640}>
          <h3 style={{ marginTop: 0 }}><Sparkles size={18} style={{ verticalAlign: -3 }} /> {abierto.modo === 'guion' ? `Guion para llamar a ${p.nombre}` : `Para tu reunión con ${p.nombre}`}</h3>
          <div className="documento-ia" id="doc-ia">
            {abierto.modo === 'guion' ? <Guion g={abierto.datos} /> : <Brief b={abierto.datos} />}
          </div>
          <div className="acciones fin">
            <button type="button" className="btn" onClick={() => { navigator.clipboard.writeText(document.getElementById('doc-ia')?.innerText ?? ''); toast('Copiado', 'ok') }}><Copy size={14} /> Copiar</button>
            <button type="button" className="btn fantasma" onClick={() => pedir(abierto.modo)} disabled={!!cargando}>{cargando ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} Otra versión</button>
          </div>
        </Modal>
      )}
    </>
  )
}
const Lista = ({ titulo, items }) => items?.length ? <><h4>{titulo}</h4><ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></> : null
function Guion({ g }) {
  return <>
    <h4>Para arrancar</h4><p>{g.apertura}</p>
    <Lista titulo="Preguntas" items={g.preguntas} />
    <h4>Qué ofrecer</h4><p>{g.propuesta}</p>
    {g.objeciones?.length > 0 && <><h4>Si te dicen…</h4>{g.objeciones.map((o, i) => <p key={i}><b>“{o.dicen}”</b><br />{o.respuesta}</p>)}</>}
    <h4>Para cerrar</h4><p>{g.cierre}</p>
    {g.si_no_atiende && <><h4>Si no atiende</h4><p>{g.si_no_atiende}</p></>}
  </>
}
function Brief({ b }) {
  return <>
    <p className="destacado">{b.resumen}</p>
    <Lista titulo="Lo que sabemos" items={b.lo_que_sabemos} />
    {b.objetivo && <><h4>Objetivo de la reunión</h4><p>{b.objetivo}</p></>}
    <Lista titulo="Preguntas para hacerles" items={b.preguntas} />
    <Lista titulo="Posibles frenos" items={b.riesgos} />
    <Lista titulo="Qué llevar" items={b.llevar} />
    {b.siguiente_paso && <><h4>Siguiente paso a proponer</h4><p>{b.siguiente_paso}</p></>}
  </>
}

/* ---------------- Etiquetas ---------------- */
export function Etiquetas({ p, onCambio, editable }) {
  const toast = useToast()
  const [lista, setLista] = useState(p.etiquetas ?? [])
  const [nueva, setNueva] = useState('')
  const [sugeridas, setSugeridas] = useState([])
  useEffect(() => { setLista(p.etiquetas ?? []) }, [p.id])
  useEffect(() => {
    supabase.from('prospectos').select('etiquetas').not('etiquetas', 'eq', '{}').limit(500).then(({ data }) => {
      const c = {}; for (const r of data ?? []) for (const t of r.etiquetas ?? []) c[t] = (c[t] ?? 0) + 1
      setSugeridas(Object.entries(c).sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 20))
    })
  }, [])
  async function guardar(nuevas) {
    setLista(nuevas)
    const { error } = await supabase.from('prospectos').update({ etiquetas: nuevas }).eq('id', p.id)
    if (error) toast(mensajeError(error), 'error'); else onCambio?.(nuevas)
  }
  const sumar = t => { const x = t.trim().toLowerCase().slice(0, 30); if (x && !lista.includes(x)) guardar([...lista, x]); setNueva('') }
  return (
    <div className="etiquetas">
      <Tag size={13} className="muted" />
      {lista.map(t => <span key={t} className="etiqueta">{t}{editable && <button type="button" onClick={() => guardar(lista.filter(x => x !== t))} aria-label={`Quitar ${t}`}><X size={11} /></button>}</span>)}
      {editable && (
        <form onSubmit={e => { e.preventDefault(); sumar(nueva) }} className="etiqueta-nueva">
          <input list="etiquetas-sugeridas" value={nueva} onChange={e => setNueva(e.target.value)} placeholder="+ etiqueta" aria-label="Nueva etiqueta" maxLength={30} />
          <datalist id="etiquetas-sugeridas">{sugeridas.filter(s => !lista.includes(s)).map(s => <option key={s} value={s} />)}</datalist>
        </form>
      )}
    </div>
  )
}

/* ---------------- Comentarios internos con @menciones ---------------- */
export function Comentarios({ p }) {
  const { session } = useApp()
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [equipo, setEquipo] = useState([])
  const [texto, setTexto] = useState('')
  const [menciones, setMenciones] = useState([])
  const [enviando, setEnviando] = useState(false)
  const cargar = useCallback(() => supabase.from('comentarios').select('*').eq('prospecto_id', p.id).order('created_at').then(({ data }) => setLista(data ?? [])), [p.id])
  useEffect(() => { cargar(); supabase.rpc('responsables').then(({ data }) => setEquipo(data ?? [])) }, [cargar])
  const nombre = id => equipo.find(x => x.id === id)?.nombre || 'Alguien'
  const otros = equipo.filter(x => x.id !== session.user.id)
  async function enviar(e) {
    e.preventDefault()
    if (!texto.trim()) return
    setEnviando(true)
    const { error } = await supabase.from('comentarios').insert({ prospecto_id: p.id, texto: texto.trim(), menciones })
    setEnviando(false)
    if (error) return toast(mensajeError(error), 'error')
    setTexto(''); setMenciones([]); cargar()
    if (menciones.length) toast(`Les avisamos a ${menciones.map(nombre).join(', ')}`, 'ok')
  }
  return (
    <section className="tarjeta" id="comentarios">
      <div className="tarjeta-titulo"><h3><MessageSquare size={16} /> Comentarios del equipo</h3>{lista?.length > 0 && <span className="chip">{lista.length}</span>}</div>
      {lista?.length ? (
        <div className="comentarios">{lista.map(c => (
          <div key={c.id} className="comentario"><Avatar nombre={nombre(c.owner_id)} /><div><b>{nombre(c.owner_id)}</b> <small className="muted">{fechaHora(c.created_at)}</small><p>{c.texto}</p>{c.menciones?.length > 0 && <small className="muted"><AtSign size={11} /> {c.menciones.map(nombre).join(', ')}</small>}</div></div>
        ))}</div>
      ) : <p className="muted chico">Dejá notas para tu equipo. Si mencionás a alguien, le llega un aviso.</p>}
      <form onSubmit={enviar} className="comentar">
        <textarea rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Escribí un comentario…" maxLength={2000} />
        <div className="comentar-pie">
          {otros.length > 0 && <div className="chips-filtro"><span className="muted chico"><AtSign size={12} /> Avisarle a:</span>{otros.map(o => <button key={o.id} type="button" className={menciones.includes(o.id) ? 'activo' : ''} onClick={() => setMenciones(m => m.includes(o.id) ? m.filter(x => x !== o.id) : [...m, o.id])}>{o.nombre}</button>)}</div>}
          <button className="btn oscuro chico" disabled={enviando || !texto.trim()}>{enviando && <Loader2 size={13} className="spin" />} Comentar</button>
        </div>
      </form>
    </section>
  )
}

/* ---------------- Propuestas / presupuestos ---------------- */
const ESTADO_PROP = { borrador: ['Borrador', ''], enviada: ['Enviada', 'info'], aceptada: ['Aceptada', 'ok'], rechazada: ['Rechazada', 'mal'] }
export function Propuestas({ p, onCambio }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [editando, setEditando] = useState(null)
  const cargar = useCallback(() => supabase.from('propuestas').select('*').eq('prospecto_id', p.id).order('created_at', { ascending: false }).then(({ data }) => setLista(data ?? [])), [p.id])
  useEffect(() => { cargar() }, [cargar])
  async function estado(pr, e) {
    const { error } = await supabase.from('propuestas').update({ estado: e }).eq('id', pr.id)
    if (error) return toast(mensajeError(error), 'error')
    toast(e === 'enviada' ? 'Marcada como enviada: la empresa pasó a "Propuesta enviada".' : e === 'aceptada' ? '¡Aceptada! La empresa pasó a Cliente.' : 'Listo', 'ok')
    cargar(); onCambio?.()
  }
  return (
    <section className="tarjeta">
      <div className="tarjeta-titulo"><h3><FileText size={16} /> Propuestas</h3><button type="button" className="btn chico" onClick={() => setEditando({ titulo: 'Propuesta comercial', items: [{ nombre: '', descripcion: '', cantidad: 1, precio: 0, descuento: 0 }], moneda: p.moneda || 'ARS', validez_dias: 15, condiciones: '' })}><Plus size={14} /> Nueva</button></div>
      {!lista ? <Loader2 size={15} className="spin" /> : !lista.length ? <p className="muted chico">Armá un presupuesto con tu catálogo, imprimilo o guardalo en PDF y mandalo. Al marcarla enviada, la empresa pasa a "Propuesta enviada".</p> : (
        <div className="lista-propuestas">{lista.map(pr => (
          <div key={pr.id} className="fila-propuesta">
            <div><b>#{pr.numero} · {pr.titulo}</b><small className="muted">{plata(pr.total, pr.moneda)} · {fecha(pr.created_at)}</small></div>
            <span className={'chip ' + ESTADO_PROP[pr.estado][1]}>{ESTADO_PROP[pr.estado][0]}</span>
            <div className="acciones-fila">
              <button type="button" className="btn fantasma chico" onClick={() => setEditando(pr)}>Abrir</button>
              <button type="button" className="btn fantasma chico" onClick={() => imprimir(pr, p)} aria-label="Imprimir"><Printer size={14} /></button>
              {pr.estado === 'borrador' && <button type="button" className="btn chico" onClick={() => estado(pr, 'enviada')}>Marcar enviada</button>}
              {pr.estado === 'enviada' && <><button type="button" className="btn chico" onClick={() => estado(pr, 'aceptada')}><Check size={13} /> Aceptó</button><button type="button" className="btn fantasma chico" onClick={() => estado(pr, 'rechazada')}>Rechazó</button></>}
            </div>
          </div>
        ))}</div>
      )}
      {editando && <EditorPropuesta p={p} inicial={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />}
    </section>
  )
}

const totalDe = items => items.reduce((a, i) => a + (Number(i.cantidad) || 0) * (Number(i.precio) || 0) * (1 - (Number(i.descuento) || 0) / 100), 0)
function EditorPropuesta({ p, inicial, onCerrar, onGuardado }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [f, setF] = useState(inicial)
  const [catalogo, setCatalogo] = useState([])
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { supabase.from('productos').select('*').eq('activo', true).order('nombre').then(({ data }) => setCatalogo(data ?? [])) }, [])
  const setItem = (i, k, v) => setF(x => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }))
  const total = totalDe(f.items)
  async function guardar() {
    const items = f.items.filter(i => i.nombre.trim()).map(i => ({ ...i, cantidad: Number(i.cantidad) || 0, precio: Number(i.precio) || 0, descuento: Number(i.descuento) || 0 }))
    if (!items.length) return toast('Agregá al menos un ítem.', 'error')
    setGuardando(true)
    const fila = { prospecto_id: p.id, titulo: f.titulo || 'Propuesta comercial', items, moneda: f.moneda, total: totalDe(items), validez_dias: Number(f.validez_dias) || 15, condiciones: f.condiciones }
    const { error } = f.id ? await supabase.from('propuestas').update(fila).eq('id', f.id) : await supabase.from('propuestas').insert(fila)
    setGuardando(false)
    if (error) return toast(mensajeError(error), 'error')
    toast('Propuesta guardada', 'ok'); onGuardado()
  }
  async function borrar() {
    if (!(await confirmar({ titulo: '¿Borrar esta propuesta?', aceptar: 'Borrar', peligro: true }))) return
    await supabase.from('propuestas').delete().eq('id', f.id); onGuardado()
  }
  return (
    <Modal onCerrar={onCerrar} ancho={820}>
      <h3 style={{ marginTop: 0 }}>{f.id ? `Propuesta #${f.numero}` : 'Nueva propuesta'} para {p.nombre}</h3>
      <div className="dos-col" style={{ gap: 12 }}>
        <label>Título<input value={f.titulo} onChange={e => setF({ ...f, titulo: e.target.value })} /></label>
        <label>Moneda<select value={f.moneda} onChange={e => setF({ ...f, moneda: e.target.value })}><option>ARS</option><option>USD</option><option>CLP</option><option>MXN</option><option>UYU</option><option>COP</option><option>PEN</option><option>EUR</option></select></label>
      </div>
      <div className="tabla-scroll">
        <table className="tabla compacta tabla-items">
          <thead><tr><th>Ítem</th><th>Cant.</th><th>Precio</th><th>Desc. %</th><th>Subtotal</th><th></th></tr></thead>
          <tbody>{f.items.map((it, i) => (
            <tr key={i}>
              <td><input list="catalogo-items" value={it.nombre} placeholder="Producto o servicio" onChange={e => {
                const prod = catalogo.find(c => c.nombre === e.target.value)
                if (prod) setF(x => ({ ...x, items: x.items.map((y, j) => (j === i ? { ...y, nombre: prod.nombre, descripcion: prod.descripcion, precio: prod.precio } : y)) }))
                else setItem(i, 'nombre', e.target.value)
              }} /><input className="chico" value={it.descripcion} placeholder="Detalle (opcional)" onChange={e => setItem(i, 'descripcion', e.target.value)} /></td>
              <td><input type="number" min="0" step="any" value={it.cantidad} onChange={e => setItem(i, 'cantidad', e.target.value)} style={{ width: 70 }} /></td>
              <td><input type="number" min="0" step="any" value={it.precio} onChange={e => setItem(i, 'precio', e.target.value)} style={{ width: 110 }} /></td>
              <td><input type="number" min="0" max="100" step="any" value={it.descuento} onChange={e => setItem(i, 'descuento', e.target.value)} style={{ width: 70 }} /></td>
              <td className="fuerte">{plata((Number(it.cantidad) || 0) * (Number(it.precio) || 0) * (1 - (Number(it.descuento) || 0) / 100), f.moneda)}</td>
              <td><button type="button" className="btn fantasma chico" onClick={() => setF(x => ({ ...x, items: x.items.filter((_, j) => j !== i) }))} aria-label="Quitar"><X size={14} /></button></td>
            </tr>
          ))}</tbody>
        </table>
        <datalist id="catalogo-items">{catalogo.map(c => <option key={c.id} value={c.nombre}>{plata(c.precio, c.moneda)}</option>)}</datalist>
      </div>
      <button type="button" className="btn chico" onClick={() => setF(x => ({ ...x, items: [...x.items, { nombre: '', descripcion: '', cantidad: 1, precio: 0, descuento: 0 }] }))}><Plus size={14} /> Ítem</button>
      {!catalogo.length && <span className="muted chico" style={{ marginLeft: 8 }}>Cargá tus productos en Catálogo para elegirlos acá.</span>}
      <div className="total-propuesta">Total: <b>{plata(total, f.moneda)}</b></div>
      <div className="dos-col" style={{ gap: 12 }}>
        <label>Válida por (días)<input type="number" min="1" value={f.validez_dias} onChange={e => setF({ ...f, validez_dias: e.target.value })} /></label>
        <label>Condiciones<textarea rows={2} value={f.condiciones} onChange={e => setF({ ...f, condiciones: e.target.value })} placeholder="Forma de pago, plazo de entrega, IVA…" /></label>
      </div>
      <div className="acciones fin">
        {f.id && <button type="button" className="btn fantasma" onClick={borrar}><Trash2 size={14} /> Borrar</button>}
        <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
        <button type="button" className="btn primario" onClick={guardar} disabled={guardando}>{guardando && <Loader2 size={15} className="spin" />} Guardar</button>
      </div>
    </Modal>
  )
}

/** Abre la propuesta en una página limpia lista para imprimir o guardar como PDF */
async function imprimir(pr, p) {
  const { data: perfil } = await supabase.from('perfiles').select('nombre, estudio, email_contacto, firma').single()
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const filas = pr.items.map(i => `<tr><td><b>${esc(i.nombre)}</b>${i.descripcion ? `<br><small>${esc(i.descripcion)}</small>` : ''}</td><td>${i.cantidad}</td><td>${plata(i.precio, pr.moneda)}</td><td>${i.descuento ? i.descuento + '%' : '—'}</td><td>${plata(i.cantidad * i.precio * (1 - (i.descuento || 0) / 100), pr.moneda)}</td></tr>`).join('')
  const vence = new Date(new Date(pr.created_at).getTime() + pr.validez_dias * 864e5).toLocaleDateString('es-AR')
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Propuesta #${pr.numero} · ${esc(p.nombre)}</title><style>
    body{font:14px/1.5 Inter,system-ui,sans-serif;color:#16161a;max-width:780px;margin:40px auto;padding:0 24px}
    h1{font-size:24px;margin:0 0 4px} .muted{color:#6f695f} table{width:100%;border-collapse:collapse;margin:24px 0}
    th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6f695f;border-bottom:2px solid #16161a;padding:8px}
    td{border-bottom:1px solid #e8e3db;padding:10px 8px;vertical-align:top} .total{text-align:right;font-size:20px;font-weight:700}
    .cab{display:flex;justify-content:space-between;gap:20px;border-bottom:1px solid #e8e3db;padding-bottom:18px} @media print{button{display:none}}
  </style></head><body>
  <div class="cab"><div><h1>${esc(pr.titulo)}</h1><div class="muted">Propuesta #${pr.numero} · ${new Date(pr.created_at).toLocaleDateString('es-AR')}</div></div>
  <div style="text-align:right"><b>${esc(perfil?.estudio || perfil?.nombre || '')}</b><br><span class="muted">${esc(perfil?.email_contacto || '')}</span></div></div>
  <p style="margin-top:18px">Para: <b>${esc(p.nombre)}</b>${p.direccion ? `<br><span class="muted">${esc(p.direccion)}</span>` : ''}</p>
  <table><thead><tr><th>Detalle</th><th>Cant.</th><th>Precio</th><th>Desc.</th><th>Subtotal</th></tr></thead><tbody>${filas}</tbody></table>
  <div class="total">Total ${plata(pr.total, pr.moneda)}</div>
  ${pr.condiciones ? `<h3>Condiciones</h3><p>${esc(pr.condiciones).replace(/\n/g, '<br>')}</p>` : ''}
  <p class="muted">Válida hasta el ${vence}.</p>
  ${perfil?.firma ? `<p style="white-space:pre-line;margin-top:30px">${esc(perfil.firma)}</p>` : ''}
  <button onclick="print()" style="margin-top:20px;padding:10px 18px;border-radius:10px;border:0;background:#fd4a22;color:#fff;font-weight:600;cursor:pointer">Imprimir o guardar en PDF</button>
  </body></html>`)
  w.document.close()
}

/* ---------------- Visitas en persona ---------------- */
const RESULTADOS = { '': 'Sin resultado', atendieron: 'Me atendieron', no_estaba: 'No estaba quien buscaba', volver: 'Volver otro día', interesado: 'Interesado', no_interesado: 'No le interesa' }
export function VisitasDeEmpresa({ p }) {
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [nueva, setNueva] = useState({ fecha: hoyLocal(), notas: '' })
  const cargar = useCallback(() => supabase.from('visitas').select('*').eq('prospecto_id', p.id).order('fecha', { ascending: false }).then(({ data }) => setLista(data ?? [])), [p.id])
  useEffect(() => { cargar() }, [cargar])
  async function agendar(e) {
    e.preventDefault()
    const { error } = await supabase.from('visitas').insert({ prospecto_id: p.id, fecha: nueva.fecha, notas: nueva.notas })
    if (error) return toast(mensajeError(error), 'error')
    setNueva({ fecha: hoyLocal(), notas: '' }); cargar(); toast('Visita agendada: la ves en Visitas, con la ruta del día.', 'ok')
  }
  async function resultado(v, r) {
    await supabase.from('visitas').update({ resultado: r, hecha: !!r }).eq('id', v.id)
    if (r) await supabase.from('interacciones').insert({ prospecto_id: p.id, tipo: 'nota', detalle: `Visita del ${fecha(v.fecha)}: ${RESULTADOS[r]}${v.notas ? ` · ${v.notas}` : ''}` })
    cargar()
  }
  return (
    <section className="tarjeta">
      <div className="tarjeta-titulo"><h3><MapPin size={16} /> Visitas</h3></div>
      {lista?.map(v => (
        <div key={v.id} className="fila-visita">
          <span><b>{fecha(v.fecha)}</b>{v.notas && <small className="muted"> · {v.notas}</small>}</span>
          <select value={v.resultado} onChange={e => resultado(v, e.target.value)} aria-label="Resultado de la visita">{Object.entries(RESULTADOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
      ))}
      <form onSubmit={agendar} className="nueva-visita">
        <input type="date" value={nueva.fecha} onChange={e => setNueva({ ...nueva, fecha: e.target.value })} aria-label="Fecha" />
        <input value={nueva.notas} onChange={e => setNueva({ ...nueva, notas: e.target.value })} placeholder="A quién buscar, qué llevar…" />
        <button className="btn chico oscuro">Agendar visita</button>
      </form>
    </section>
  )
}

/* ---------------- Archivos de la empresa ---------------- */
export function ArchivosEmpresa({ p }) {
  const { session } = useApp()
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  const cargar = useCallback(() => supabase.from('archivos').select('*').eq('prospecto_id', p.id).order('created_at', { ascending: false }).then(({ data }) => setLista(data ?? [])), [p.id])
  useEffect(() => { cargar() }, [cargar])
  async function subir(f) {
    if (!f) return
    if (f.size > 15 * 1048576) return toast('El máximo es 15 MB.', 'error')
    setSubiendo(true)
    const path = `${session.user.id}/empresa/${p.id}/${crypto.randomUUID().slice(0, 8)}-${f.name.replace(/[^\w.-]+/g, '_').slice(-80)}`
    const { error } = await supabase.storage.from('archivos').upload(path, f, { contentType: f.type || 'application/octet-stream' })
    if (!error) {
      const { error: e2 } = await supabase.from('archivos').insert({ tipo: 'empresa', prospecto_id: p.id, nombre: f.name, path, mime: f.type || 'application/octet-stream', tamano: f.size })
      if (e2) { await supabase.storage.from('archivos').remove([path]); toast(mensajeError(e2), 'error') }
    } else toast(mensajeError(error), 'error')
    setSubiendo(false); cargar()
  }
  async function bajar(a) {
    const { data } = await supabase.storage.from('archivos').createSignedUrl(a.path, 600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank'); else toast('Sólo quien lo subió puede abrirlo.', 'info')
  }
  async function borrar(a) {
    await supabase.storage.from('archivos').remove([a.path]); await supabase.from('archivos').delete().eq('id', a.id); cargar()
  }
  return (
    <section className="tarjeta">
      <div className="tarjeta-titulo"><h3><Paperclip size={16} /> Archivos</h3>
        <label className="btn chico" style={{ margin: 0 }}>{subiendo ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Subir<input type="file" hidden onChange={e => { subir(e.target.files[0]); e.target.value = '' }} /></label></div>
      {!lista?.length ? <p className="muted chico">Planos, fotos, propuestas firmadas: todo lo de esta empresa en un lugar.</p> : lista.map(a => (
        <div key={a.id} className="fila-archivo"><FileText size={14} /><span>{a.nombre}</span><small className="muted">{fecha(a.created_at)}</small>
          <button type="button" className="btn fantasma chico" onClick={() => bajar(a)} aria-label="Descargar"><Download size={14} /></button>
          {a.owner_id === session.user.id && <button type="button" className="btn fantasma chico" onClick={() => borrar(a)} aria-label="Borrar"><Trash2 size={14} /></button>}
        </div>
      ))}
    </section>
  )
}
