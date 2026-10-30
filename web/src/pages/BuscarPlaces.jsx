import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Loader2, MapPin, Download } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { Aviso, QueTieneChip, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const SUGERIDOS = ['barbería', 'peluquería', 'centro de estética', 'estudio de tatuajes', 'consultorio odontológico', 'dermatología',
  'kinesiología', 'veterinaria', 'estudio de arquitectura', 'estudio contable', 'estudio jurídico', 'inmobiliaria', 'gimnasio',
  'estudio de pilates', 'cabañas', 'bodega boutique', 'restaurante de autor', 'tienda de indumentaria', 'óptica']

export default function BuscarPlaces() {
  const toast = useToast()
  const { servicios, refrescar } = useApp()
  const [f, setF] = useState({ rubro: '', zona: 'Godoy Cruz, Mendoza', paginas: 1, min_resenas: 10 })
  const [res, setRes] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  async function buscar(e) {
    e.preventDefault()
    setCargando(true); setError(''); setRes(null)
    try {
      const r = await llamarFuncion('buscar-places', f)
      setRes(r.resultados)
      setSel(new Set(r.resultados.filter(x => x.es_prospecto).map(x => x.place_id)))
      toast(`${r.resultados.length} negocios sin web propia`, 'info')
    } catch (err) { setError(mensajeError(err)) }
    setCargando(false)
  }

  async function importar() {
    const filas = res.filter(r => sel.has(r.place_id)).map(({ es_prospecto, ...r }) => r)
    const { data, error } = await supabase.rpc('importar_prospectos', { filas, origen: 'google_places' })
    if (error) { toast(mensajeError(error), 'error'); return }
    toast(`Importados ${data.insertados}${data.duplicados ? ` · ${data.duplicados} ya estaban` : ''}`)
    setRes(null); refrescar()
  }

  return (
    <>
      <header className="cabecera"><div><h1>Buscar en Google</h1><p>Negocios por rubro y zona que no tienen web propia, con la API oficial de Google Places.</p></div></header>
      {servicios.places === false && (
        <Aviso tipo="info">Para buscar hace falta la clave de Google Places: la carga el super admin en su panel (Claves y servicios). Mientras tanto podés <Link to="/importar">importar un CSV</Link>.</Aviso>
      )}
      <section className="tarjeta">
        <form className="barra-herramientas" style={{ marginBottom: 0 }} onSubmit={buscar}>
          <div className="buscador"><Search size={16} />
            <input list="rubros" placeholder="Rubro (ej. barbería)" value={f.rubro} onChange={e => setF({ ...f, rubro: e.target.value })} required />
          </div>
          <datalist id="rubros">{SUGERIDOS.map(s => <option key={s} value={s} />)}</datalist>
          <div className="buscador" style={{ flex: '1 1 220px' }}><MapPin size={16} />
            <input placeholder="Zona" value={f.zona} onChange={e => setF({ ...f, zona: e.target.value })} required />
          </div>
          <select value={f.paginas} onChange={e => setF({ ...f, paginas: Number(e.target.value) })} aria-label="Cantidad">
            <option value={1}>Hasta 20</option><option value={2}>Hasta 40</option><option value={3}>Hasta 60</option>
          </select>
          <button className="btn primario" disabled={cargando}>{cargando ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Buscar</button>
        </form>
        {error && <div style={{ marginTop: 14 }}><Aviso tipo="error">{error}</Aviso></div>}
      </section>

      {res && (
        <section className="tarjeta sin-pad">
          <div className="scroll-x">
            <table className="tabla">
              <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={sel.size === res.length && res.length > 0} aria-label="Todos"
                onChange={() => setSel(sel.size === res.length ? new Set() : new Set(res.map(r => r.place_id)))} /></th>
                <th>Negocio</th><th>Teléfono</th><th>Hoy tiene</th><th>Google</th></tr></thead>
              <tbody>{res.map(r => (
                <tr key={r.place_id}>
                  <td><input type="checkbox" checked={sel.has(r.place_id)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.place_id) ? n.delete(r.place_id) : n.add(r.place_id); return n })} /></td>
                  <td><a href={r.google_maps_url} target="_blank" rel="noreferrer" className="fuerte">{r.nombre}</a><div className="muted chico">{r.direccion}</div></td>
                  <td className="nowrap">{r.telefono}</td>
                  <td><QueTieneChip valor={r.que_tiene_hoy} /></td>
                  <td className="nowrap">{r.resenas ?? '—'}{r.rating ? <span className="muted"> · {r.rating}★</span> : ''}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ padding: '14px 18px', textAlign: 'right' }}><button className="btn primario" onClick={importar} disabled={!sel.size}><Download size={16} /> Importar {sel.size}</button></div>
        </section>
      )}
    </>
  )
}
