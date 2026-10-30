import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Heart, UserPlus, Upload, Search, ShieldCheck, Mail, MessageCircle, Loader2, Trash2, Ban, Pencil, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { leerArchivo, limpiar } from '../lib/importar.js'
import { fecha, hoyLocal, mensajeError } from '../lib/util.js'
import { Avatar, Esqueleto, ErrorCarga, Vacio, Modal, useToast, useConfirmar } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const FUENTES = ['Me los dio al comprar', 'Formulario de mi web', 'En el local / mostrador', 'Me escribió por WhatsApp', 'Sorteo o promo con bases', 'Otro']
const ORIGENES = { manual: 'Cargado a mano', compra: 'Compra', formulario: 'Formulario', importado: 'Importado', referido: 'Referido', aliado: 'Aliado', creador: 'Creador' }
const FILTROS = [
  ['todos', 'Todos'], ['consentimiento', 'Aceptan mensajes'], ['sin', 'Sin permiso'],
  ['recompra', 'Compraron más de una vez'], ['dormidos', 'Dormidos (+90 días)'], ['baja', 'Se dieron de baja'],
]
const VACIO = { nombre: '', email: '', telefono: '', ciudad: '', compras: 0, total_gastado: 0, ultima_compra: '', cumpleanos: '', notas: '', acepta_email: false, acepta_whatsapp: false, consentimiento_fuente: '', origen: 'manual' }
const plata = n => '$ ' + Math.round(Number(n) || 0).toLocaleString('es-AR')

export default function Clientes() {
  const { session } = useApp()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [params, setParams] = useSearchParams()
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [editando, setEditando] = useState(null)
  const [importar, setImportar] = useState(false)

  const cargar = async () => {
    setError(null)
    const { data, error } = await supabase.from('clientes').select('*').order('created_at', { ascending: false }).limit(2000)
    if (error) setError(error); else setLista(data)
  }
  useEffect(() => { cargar() }, [])
  useEffect(() => {
    if (params.get('nuevo')) setEditando({ ...VACIO })
    if (params.get('importar')) setImportar(true)
    const id = params.get('id')
    if (id && lista) { const c = lista.find(x => x.id === id); if (c) setEditando(c) }
    if (params.get('nuevo') || params.get('importar') || (id && lista)) setParams({}, { replace: true })
  }, [params, lista])

  const hace90 = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10) }, [])
  const visibles = useMemo(() => {
    const t = limpiar(q)
    return (lista ?? []).filter(c => {
      if (filtro === 'consentimiento' && !(!c.baja_at && (c.acepta_email || c.acepta_whatsapp))) return false
      if (filtro === 'sin' && (c.baja_at || c.acepta_email || c.acepta_whatsapp)) return false
      if (filtro === 'recompra' && !(c.compras > 1)) return false
      if (filtro === 'dormidos' && !(c.ultima_compra && c.ultima_compra < hace90)) return false
      if (filtro === 'baja' && !c.baja_at) return false
      if (t && !limpiar([c.nombre, c.email, c.telefono, c.ciudad].join(' ')).includes(t)) return false
      return true
    })
  }, [lista, q, filtro, hace90])

  async function darDeBaja(c) {
    if (!(await confirmar({ titulo: `¿Dar de baja a ${c.nombre}?`, texto: 'No se le va a poder escribir más por ningún canal. Queda registrado cuándo lo pidió.', aceptar: 'Dar de baja', peligro: true }))) return
    const { error } = await supabase.from('clientes').update({ baja_at: new Date().toISOString() }).eq('id', c.id)
    if (error) return toast(mensajeError(error), 'error')
    toast('Listo: no se le va a escribir más.', 'ok'); cargar()
  }
  async function borrar(c) {
    if (!(await confirmar({ titulo: `¿Borrar a ${c.nombre}?`, texto: 'Se borran todos sus datos de Prospecta. Si sólo no quiere recibir mensajes, mejor dalo de baja.', aceptar: 'Borrar', peligro: true }))) return
    const { error } = await supabase.from('clientes').delete().eq('id', c.id)
    if (error) return toast(mensajeError(error), 'error')
    toast('Cliente borrado', 'ok'); cargar()
  }

  const conPermiso = (lista ?? []).filter(c => !c.baja_at && (c.acepta_email || c.acepta_whatsapp)).length

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Mis clientes</h1>
          <p className="saludo">Las personas que ya te compraron o te dejaron sus datos. {lista ? `${lista.length} en total · ${conPermiso} aceptan mensajes.` : ''}</p>
        </div>
        <div className="acciones">
          <button type="button" className="btn" onClick={() => setImportar(true)}><Upload size={15} /> Importar</button>
          <button type="button" className="btn primario" onClick={() => setEditando({ ...VACIO })}><UserPlus size={15} /> Sumar cliente</button>
        </div>
      </header>

      <div className="aviso-legal" style={{ marginBottom: 16 }}>
        <ShieldCheck size={16} />
        <span>En modo consumidores sólo trabajás con personas que <b>ya te conocen</b>. Prospecta no busca particulares en internet, y no deja escribirle a nadie que no haya aceptado recibir mensajes por ese canal.</span>
      </div>

      {error ? <ErrorCarga error={error} onReintentar={cargar} /> : !lista ? <Esqueleto filas={6} /> : !lista.length ? (
        <Vacio icono={Heart} titulo="Todavía no cargaste clientes" accion={<div className="acciones" style={{ justifyContent: 'center' }}><button className="btn primario" onClick={() => setEditando({ ...VACIO })}><UserPlus size={15} /> Sumar el primero</button><button className="btn" onClick={() => setImportar(true)}><Upload size={15} /> Importar desde Excel</button></div>}>
          Subí la lista de tu sistema de ventas, tu tienda online o tu planilla. Con eso Claude te arma campañas de recompra, reactivación y referidos.
        </Vacio>
      ) : <>
        <div className="barra-filtros" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <div className="campo-buscar" style={{ flex: '1 1 260px', position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--mut)' }} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre, email, teléfono o ciudad…" style={{ paddingLeft: 34 }} />
          </div>
          <div className="chips-filtro">{FILTROS.map(([k, l]) => <button key={k} type="button" className={filtro === k ? 'activo' : ''} onClick={() => setFiltro(k)}>{l}</button>)}</div>
        </div>
        {!visibles.length ? <Vacio icono={Search} titulo="No hay clientes con ese filtro" /> : (
          <section className="tarjeta sin-pad">
            <div className="scroll-x">
              <table className="tabla">
                <thead><tr><th>Cliente</th><th>Contacto</th><th>Permiso</th><th>Compras</th><th>Última compra</th><th>Origen</th><th></th></tr></thead>
                <tbody>{visibles.map(c => (
                  <tr key={c.id}>
                    <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Avatar nombre={c.nombre} /><div><b className="fuerte">{c.nombre}</b>{c.ciudad && <div className="muted chico">{c.ciudad}</div>}</div></div></td>
                    <td className="chico">{c.email && <div><Mail size={12} /> {c.email}</div>}{c.telefono && <div><MessageCircle size={12} /> {c.telefono}</div>}</td>
                    <td><Permiso c={c} /></td>
                    <td>{c.compras ? <><b>{c.compras}</b> <span className="muted chico">· {plata(c.total_gastado)}</span></> : <span className="muted">—</span>}</td>
                    <td>{c.ultima_compra ? fecha(c.ultima_compra) : <span className="muted">—</span>}</td>
                    <td className="chico muted">{ORIGENES[c.origen] ?? c.origen}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {c.owner_id === session.user.id && <>
                        <button type="button" className="btn fantasma chico" onClick={() => setEditando(c)} aria-label="Editar"><Pencil size={15} /></button>
                        {!c.baja_at && <button type="button" className="btn fantasma chico" onClick={() => darDeBaja(c)} aria-label="Dar de baja" title="Dar de baja"><Ban size={15} /></button>}
                        <button type="button" className="btn fantasma chico" onClick={() => borrar(c)} aria-label="Borrar" title="Borrar"><Trash2 size={15} /></button>
                      </>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </section>
        )}
      </>}

      {editando && <EditarCliente inicial={editando} onCerrar={() => setEditando(null)} onGuardado={() => { setEditando(null); cargar() }} />}
      {importar && <ImportarClientes onCerrar={() => setImportar(false)} onListo={() => { setImportar(false); cargar() }} />}
    </>
  )
}

function Permiso({ c }) {
  if (c.baja_at) return <span className="consent baja" title={`Pidió la baja el ${fecha(c.baja_at)}`}><Ban size={11} /> Baja</span>
  if (!c.acepta_email && !c.acepta_whatsapp) return <span className="consent no">Sin permiso</span>
  return <span className="consent si" title={c.consentimiento_fuente ? `${c.consentimiento_fuente} · ${fecha(c.consentimiento_at)}` : ''}><ShieldCheck size={11} /> {[c.acepta_email && 'Email', c.acepta_whatsapp && 'WhatsApp'].filter(Boolean).join(' y ')}</span>
}

function EditarCliente({ inicial, onCerrar, onGuardado }) {
  const toast = useToast()
  const [f, setF] = useState({ ...VACIO, ...Object.fromEntries(Object.entries(inicial).map(([k, v]) => [k, v ?? ''])) })
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))
  const pide = f.acepta_email || f.acepta_whatsapp

  async function guardar(e) {
    e.preventDefault()
    if (!f.email.trim() && !f.telefono.trim()) return toast('Poné al menos un email o un teléfono.', 'error')
    if (pide && !f.consentimiento_fuente) return toast('Contanos cómo te dio el permiso para escribirle.', 'error')
    setGuardando(true)
    const fila = {
      nombre: f.nombre.trim(), email: f.email.trim() || null, telefono: f.telefono.trim() || null, ciudad: f.ciudad.trim() || null,
      compras: Number(f.compras) || 0, total_gastado: Number(f.total_gastado) || 0, ultima_compra: f.ultima_compra || null, cumpleanos: f.cumpleanos || null,
      notas: f.notas, acepta_email: !!f.acepta_email, acepta_whatsapp: !!f.acepta_whatsapp, consentimiento_fuente: pide ? f.consentimiento_fuente : null, origen: f.origen || 'manual',
    }
    const { error } = inicial.id ? await supabase.from('clientes').update(fila).eq('id', inicial.id) : await supabase.from('clientes').insert(fila)
    setGuardando(false)
    if (error) return toast(/clientes_email_unico/.test(error.message) ? 'Ya tenés un cliente con ese email.' : mensajeError(error), 'error')
    toast(inicial.id ? 'Cliente actualizado' : 'Cliente sumado', 'ok'); onGuardado()
  }

  return (
    <Modal onCerrar={onCerrar} ancho={560}>
      <form onSubmit={guardar}>
        <h3 style={{ marginTop: 0 }}>{inicial.id ? 'Editar cliente' : 'Sumar cliente'}</h3>
        <label>Nombre<input value={f.nombre} onChange={e => set('nombre', e.target.value)} required autoFocus maxLength={160} /></label>
        <div className="dos-col" style={{ gap: 12 }}>
          <label>Email<input type="email" value={f.email} onChange={e => set('email', e.target.value)} /></label>
          <label>Teléfono / WhatsApp<input value={f.telefono} onChange={e => set('telefono', e.target.value)} placeholder="261 555 1234" /></label>
          <label>Ciudad<input value={f.ciudad} onChange={e => set('ciudad', e.target.value)} /></label>
          <label>Cumpleaños<input type="date" value={f.cumpleanos} onChange={e => set('cumpleanos', e.target.value)} /></label>
          <label>Compras<input type="number" min="0" value={f.compras} onChange={e => set('compras', e.target.value)} /></label>
          <label>Total gastado ($)<input type="number" min="0" step="any" value={f.total_gastado} onChange={e => set('total_gastado', e.target.value)} /></label>
          <label>Última compra<input type="date" value={f.ultima_compra} max={hoyLocal()} onChange={e => set('ultima_compra', e.target.value)} /></label>
          <label>Origen<select value={f.origen} onChange={e => set('origen', e.target.value)}>{Object.entries(ORIGENES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        </div>
        <fieldset className="tarjeta" style={{ padding: 14, margin: '6px 0 12px' }}>
          <legend className="chico fuerte" style={{ padding: '0 6px' }}><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> Permiso para escribirle</legend>
          {inicial.baja_at ? <p className="chico" style={{ margin: 0, color: 'var(--err)' }}>Se dio de baja el {fecha(inicial.baja_at)}. No se le puede volver a escribir salvo que lo pida de nuevo.</p> : <>
            <label className="check"><input type="checkbox" checked={!!f.acepta_email} onChange={e => set('acepta_email', e.target.checked)} disabled={!f.email} /> Aceptó recibir emails</label>
            <label className="check"><input type="checkbox" checked={!!f.acepta_whatsapp} onChange={e => set('acepta_whatsapp', e.target.checked)} disabled={!f.telefono} /> Aceptó recibir WhatsApp</label>
            {pide && <label>¿Cómo te dio el permiso?<select value={f.consentimiento_fuente} onChange={e => set('consentimiento_fuente', e.target.value)} required><option value="">Elegí una opción</option>{FUENTES.map(x => <option key={x}>{x}</option>)}</select></label>}
            <p className="muted chico" style={{ margin: '6px 0 0' }}>Marcalo sólo si la persona te lo dijo. Queda registrado cuándo y cómo, por si alguna vez te lo piden.</p>
          </>}
        </fieldset>
        <label>Notas<textarea rows={2} value={f.notas} onChange={e => set('notas', e.target.value)} placeholder="Gustos, talle, qué suele comprar…" /></label>
        <div className="acciones fin"><button type="button" className="btn" onClick={onCerrar}>Cancelar</button><button className="btn primario" disabled={guardando}>{guardando && <Loader2 size={15} className="spin" />} Guardar</button></div>
      </form>
    </Modal>
  )
}

const MAPEO_CLIENTES = {
  nombre: ['nombre', 'nombreyapellido', 'cliente', 'name', 'fullname', 'apellidoynombre'],
  email: ['email', 'mail', 'correo', 'correoelectronico', 'emailaddress'],
  telefono: ['telefono', 'tel', 'celular', 'whatsapp', 'phone', 'movil'],
  ciudad: ['ciudad', 'localidad', 'city', 'zona', 'barrio', 'provincia'],
  compras: ['compras', 'pedidos', 'ordenes', 'orders', 'cantidaddecompras', 'totalorders'],
  total_gastado: ['total', 'totalgastado', 'gastado', 'monto', 'totalspent', 'facturado'],
  ultima_compra: ['ultimacompra', 'fechaultimacompra', 'lastorder', 'lastorderdate', 'ultimopedido'],
}
const ETIQ = { nombre: 'Nombre', email: 'Email', telefono: 'Teléfono', ciudad: 'Ciudad', compras: 'Compras', total_gastado: 'Total gastado', ultima_compra: 'Última compra' }
const fechaISO = v => { const s = String(v ?? '').trim(); const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/); if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null }
const numero = v => Number(String(v ?? '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')) || 0

function ImportarClientes({ onCerrar, onListo }) {
  const toast = useToast()
  const [archivo, setArchivo] = useState(null)
  const [mapeo, setMapeo] = useState({})
  const [permiso, setPermiso] = useState({ email: false, whatsapp: false, fuente: '' })
  const [subiendo, setSubiendo] = useState(false)

  async function elegir(file) {
    if (!file) return
    try {
      const r = await leerArchivo(file)
      const m = {}
      for (const [campo, alias] of Object.entries(MAPEO_CLIENTES)) { const col = r.columnas.find(c => alias.includes(limpiar(c))); if (col) m[campo] = col }
      setArchivo(r); setMapeo(m)
    } catch { toast('No pude leer ese archivo. Probá guardarlo como .xlsx o .csv.', 'error') }
  }

  async function subir() {
    if (!mapeo.nombre) return toast('Elegí qué columna tiene el nombre.', 'error')
    if ((permiso.email || permiso.whatsapp) && !permiso.fuente) return toast('Contanos cómo te dieron el permiso.', 'error')
    const vistos = new Set()
    const filas = archivo.filas.map(x => {
      const v = k => (mapeo[k] ? x[mapeo[k]] : '')
      const email = String(v('email')).trim().toLowerCase() || null, telefono = String(v('telefono')).trim() || null
      return {
        nombre: String(v('nombre')).trim().slice(0, 160), email, telefono, ciudad: String(v('ciudad')).trim() || null, origen: 'importado',
        compras: Math.max(0, Math.round(numero(v('compras')))), total_gastado: numero(v('total_gastado')), ultima_compra: fechaISO(v('ultima_compra')),
        acepta_email: permiso.email && !!email, acepta_whatsapp: permiso.whatsapp && !!telefono,
        consentimiento_fuente: (permiso.email && email) || (permiso.whatsapp && telefono) ? permiso.fuente : null,
      }
    }).filter(f => f.nombre && (f.email || f.telefono) && (!f.email || (!vistos.has(f.email) && vistos.add(f.email))))
    if (!filas.length) return toast('No encontré filas con nombre y email o teléfono.', 'error')
    setSubiendo(true)
    let ok = 0, repetidos = 0
    for (let i = 0; i < filas.length; i += 200) {
      const { data, error } = await supabase.from('clientes').upsert(filas.slice(i, i + 200), { onConflict: 'owner_id,email', ignoreDuplicates: true }).select('id')
      if (error) {
        // Sin índice compatible para upsert (filas sin email): se insertan de a una
        for (const f of filas.slice(i, i + 200)) { const { error: e } = await supabase.from('clientes').insert(f); if (e) repetidos++; else ok++ }
      } else { ok += data?.length ?? 0; repetidos += filas.slice(i, i + 200).length - (data?.length ?? 0) }
    }
    setSubiendo(false)
    toast(`Importados ${ok} clientes${repetidos ? ` · ${repetidos} ya estaban o tenían datos inválidos` : ''}.`, 'ok')
    onListo()
  }

  return (
    <Modal onCerrar={onCerrar} ancho={620}>
      <h3 style={{ marginTop: 0 }}><FileSpreadsheet size={18} style={{ verticalAlign: -3 }} /> Importar clientes</h3>
      {!archivo ? (
        <label className="zona-archivo" style={{ display: 'block', border: '2px dashed var(--line-2)', borderRadius: 14, padding: 28, textAlign: 'center', cursor: 'pointer' }}>
          <Upload size={22} /><div className="fuerte" style={{ marginTop: 6 }}>Elegí un Excel (.xlsx) o CSV</div>
          <div className="muted chico">La primera fila con los títulos: nombre, email, teléfono, ciudad, compras, total, última compra.</div>
          <input type="file" accept=".csv,.txt,.xlsx" hidden onChange={e => { elegir(e.target.files[0]); e.target.value = '' }} />
        </label>
      ) : <>
        <p className="muted chico">{archivo.filas.length} filas. Revisá qué columna va en cada dato:</p>
        <div className="dos-col" style={{ gap: 10 }}>
          {Object.keys(MAPEO_CLIENTES).map(k => (
            <label key={k}>{ETIQ[k]}<select value={mapeo[k] ?? ''} onChange={e => setMapeo(m => ({ ...m, [k]: e.target.value || undefined }))}><option value="">— No está —</option>{archivo.columnas.map(c => <option key={c}>{c}</option>)}</select></label>
          ))}
        </div>
        <fieldset className="tarjeta" style={{ padding: 14, margin: '10px 0' }}>
          <legend className="chico fuerte" style={{ padding: '0 6px' }}><ShieldCheck size={13} style={{ verticalAlign: -2 }} /> ¿Estas personas aceptaron recibir mensajes tuyos?</legend>
          <label className="check"><input type="checkbox" checked={permiso.email} onChange={e => setPermiso(p => ({ ...p, email: e.target.checked }))} /> Sí, aceptaron recibir emails</label>
          <label className="check"><input type="checkbox" checked={permiso.whatsapp} onChange={e => setPermiso(p => ({ ...p, whatsapp: e.target.checked }))} /> Sí, aceptaron recibir WhatsApp</label>
          {(permiso.email || permiso.whatsapp) && <label>¿Cómo te lo dieron?<select value={permiso.fuente} onChange={e => setPermiso(p => ({ ...p, fuente: e.target.value }))}><option value="">Elegí una opción</option>{FUENTES.map(x => <option key={x}>{x}</option>)}</select></label>}
          <p className="muted chico" style={{ margin: '6px 0 0' }}>Si no estás seguro, dejalo sin marcar: se importan igual y les pedís permiso después.</p>
        </fieldset>
        <div className="acciones fin"><button type="button" className="btn" onClick={() => setArchivo(null)}>Elegir otro archivo</button><button type="button" className="btn primario" onClick={subir} disabled={subiendo}>{subiendo && <Loader2 size={15} className="spin" />} Importar {archivo.filas.length}</button></div>
      </>}
    </Modal>
  )
}
