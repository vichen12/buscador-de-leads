import { useEffect, useState } from 'react'
import { Package, Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { Esqueleto, ErrorCarga, Vacio, Modal, useToast, useConfirmar } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const VACIO = { nombre: '', descripcion: '', precio: 0, moneda: 'ARS', unidad: 'unidad', activo: true }
const plata = (n, m) => (m === 'USD' ? 'US$ ' : '$ ') + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** Catálogo: lo que vendés, con precio, para armar propuestas en un minuto */
export default function Catalogo() {
  const { session } = useApp()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null)
  const cargar = () => supabase.from('productos').select('*').order('nombre').then(({ data, error }) => (error ? setError(error) : setLista(data)))
  useEffect(() => { cargar() }, [])
  async function guardar(e) {
    e.preventDefault()
    const f = editando
    const fila = { nombre: f.nombre.trim(), descripcion: f.descripcion, precio: Number(f.precio) || 0, moneda: f.moneda, unidad: f.unidad || 'unidad', activo: !!f.activo }
    const { error } = f.id ? await supabase.from('productos').update(fila).eq('id', f.id) : await supabase.from('productos').insert(fila)
    if (error) return toast(mensajeError(error), 'error')
    setEditando(null); cargar(); toast('Guardado', 'ok')
  }
  async function borrar(x) {
    if (!(await confirmar({ titulo: `¿Borrar "${x.nombre}"?`, texto: 'Las propuestas que ya lo usan no cambian.', aceptar: 'Borrar', peligro: true }))) return
    await supabase.from('productos').delete().eq('id', x.id); cargar()
  }
  return (
    <>
      <header className="cabecera">
        <div><h1>Catálogo</h1><p className="saludo">Tus productos y servicios con precio. Los elegís al armar una propuesta desde la ficha de cada empresa.</p></div>
        <div className="acciones"><button type="button" className="btn primario" onClick={() => setEditando({ ...VACIO })}><Plus size={15} /> Sumar producto</button></div>
      </header>
      {error ? <ErrorCarga error={error} onReintentar={cargar} /> : !lista ? <Esqueleto filas={4} /> : !lista.length ? (
        <Vacio icono={Package} titulo="Tu catálogo está vacío" accion={<button className="btn primario" onClick={() => setEditando({ ...VACIO })}><Plus size={15} /> Sumar el primero</button>}>Cargá lo que vendés una vez y armá presupuestos en un minuto.</Vacio>
      ) : (
        <section className="tarjeta sin-pad"><div className="scroll-x"><table className="tabla">
          <thead><tr><th>Producto o servicio</th><th>Precio</th><th>Unidad</th><th>Estado</th><th></th></tr></thead>
          <tbody>{lista.map(x => (
            <tr key={x.id}>
              <td><b className="fuerte">{x.nombre}</b>{x.descripcion && <div className="muted chico">{x.descripcion}</div>}</td>
              <td className="fuerte">{plata(x.precio, x.moneda)}</td><td className="muted">{x.unidad}</td>
              <td>{x.activo ? <span className="chip ok">Activo</span> : <span className="chip">Pausado</span>}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{x.owner_id === session.user.id && <>
                <button type="button" className="btn fantasma chico" onClick={() => setEditando(x)} aria-label="Editar"><Pencil size={15} /></button>
                <button type="button" className="btn fantasma chico" onClick={() => borrar(x)} aria-label="Borrar"><Trash2 size={15} /></button></>}</td>
            </tr>
          ))}</tbody>
        </table></div></section>
      )}
      {editando && (
        <Modal onCerrar={() => setEditando(null)} ancho={520}>
          <form onSubmit={guardar}>
            <h3 style={{ marginTop: 0 }}>{editando.id ? 'Editar producto' : 'Sumar producto'}</h3>
            <label>Nombre<input value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} required autoFocus /></label>
            <label>Descripción<textarea rows={2} value={editando.descripcion} onChange={e => setEditando({ ...editando, descripcion: e.target.value })} /></label>
            <div className="dos-col" style={{ gap: 12 }}>
              <label>Precio<input type="number" min="0" step="any" value={editando.precio} onChange={e => setEditando({ ...editando, precio: e.target.value })} /></label>
              <label>Moneda<select value={editando.moneda} onChange={e => setEditando({ ...editando, moneda: e.target.value })}>{['ARS', 'USD', 'CLP', 'MXN', 'UYU', 'COP', 'PEN', 'EUR'].map(m => <option key={m}>{m}</option>)}</select></label>
              <label>Unidad<input value={editando.unidad} onChange={e => setEditando({ ...editando, unidad: e.target.value })} placeholder="unidad, hora, m², mes…" /></label>
              <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={!!editando.activo} onChange={e => setEditando({ ...editando, activo: e.target.checked })} /> Activo</label>
            </div>
            <div className="acciones fin"><button type="button" className="btn" onClick={() => setEditando(null)}>Cancelar</button><button className="btn primario">Guardar</button></div>
          </form>
        </Modal>
      )}
    </>
  )
}
