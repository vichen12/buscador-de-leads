import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Loader2, MapPin, Download, Sparkles, ExternalLink } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError, handleIG } from '../lib/util.js'
import { Aviso, QueTieneChip, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const SUGERIDOS = ['barbería', 'peluquería', 'centro de estética', 'estudio de tatuajes', 'consultorio odontológico', 'dermatología',
  'kinesiología', 'veterinaria', 'estudio de arquitectura', 'estudio contable', 'estudio jurídico', 'inmobiliaria', 'gimnasio',
  'estudio de pilates', 'cabañas', 'bodega boutique', 'restaurante de autor', 'tienda de indumentaria', 'óptica']

const PASOS = ['Buscando en Google, Instagram y directorios…', 'Revisando si tienen web propia…', 'Juntando teléfonos e Instagram…', 'Armando la lista…']

export default function BuscarPlaces() {
  const toast = useToast()
  const { servicios, refrescar, perfil } = useApp()
  const [f, setF] = useState({ rubro: '', zona: 'Godoy Cruz, Mendoza', cantidad: 10 })
  const [res, setRes] = useState(null)
  const [sel, setSel] = useState(new Set())
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [paso, setPaso] = useState(0)
  const [cupo, setCupo] = useState(null)

  async function buscar(e) {
    e.preventDefault()
    setCargando(true); setError(''); setRes(null); setPaso(0)
    const t = setInterval(() => setPaso(p => Math.min(p + 1, PASOS.length - 1)), 9000)
    try {
      const r = await llamarFuncion('buscar-negocios', f)
      setRes(r.resultados); setCupo(r.cupo)
      setSel(new Set(r.resultados.filter(x => x.es_prospecto).map(x => x.id)))
      toast(r.resultados.length ? `Claude encontró ${r.resultados.length} negocios` : 'No encontró negocios nuevos: probá con otra zona o rubro', 'info')
    } catch (err) { setError(mensajeError(err)) }
    clearInterval(t)
    setCargando(false)
  }

  async function importar() {
    const filas = res.filter(r => sel.has(r.id)).map(({ id, es_prospecto, fuente, nota, ...r }) => ({
      ...r, notas: [nota, fuente && `Fuente: ${fuente}`].filter(Boolean).join('\n'),
    }))
    const { data, error } = await supabase.rpc('importar_prospectos', { filas, origen: 'busqueda_ia' })
    if (error) { toast(mensajeError(error), 'error'); return }
    toast(`Importados ${data.insertados}${data.duplicados ? ` · ${data.duplicados} ya estaban` : ''}`)
    setRes(null); refrescar()
  }

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Buscar negocios</h1>
          <p>Claude busca en la web negocios del rubro y la zona que elijas que todavía no tienen página propia.</p>
        </div>
        {cupo && <span className="chip ia"><Sparkles size={12} /> {cupo.usados} / {cupo.limite} consultas de IA hoy</span>}
      </header>
      {servicios.ia === false && (
        <Aviso>Falta la clave de Claude. {perfil?.es_admin ? <Link to="/admin">Cargala en Super admin → Claves</Link> : 'Pedile al administrador que la cargue.'} Mientras tanto podés <Link to="/importar">importar un CSV</Link>.</Aviso>
      )}
      <section className="tarjeta">
        <form className="barra-herramientas" style={{ marginBottom: 0 }} onSubmit={buscar}>
          <div className="buscador"><Search size={16} />
            <input list="rubros" placeholder="Rubro (ej. barbería)" aria-label="Rubro" value={f.rubro} onChange={e => setF({ ...f, rubro: e.target.value })} required />
          </div>
          <datalist id="rubros">{SUGERIDOS.map(s => <option key={s} value={s} />)}</datalist>
          <div className="buscador" style={{ flex: '1 1 220px' }}><MapPin size={16} />
            <input placeholder="Zona" aria-label="Zona" value={f.zona} onChange={e => setF({ ...f, zona: e.target.value })} required />
          </div>
          <select value={f.cantidad} onChange={e => setF({ ...f, cantidad: Number(e.target.value) })} aria-label="Cantidad">
            <option value={10}>Hasta 10</option><option value={15}>Hasta 15</option><option value={20}>Hasta 20</option>
          </select>
          <button className="btn ia" disabled={cargando || servicios.ia === false}>{cargando ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} Buscar con Claude</button>
        </form>
        {cargando && (
          <div className="buscando">
            <div className="pensando"><i /><i /><i /></div>
            <div><b>{PASOS[paso]}</b><small className="muted">Puede tardar entre 30 segundos y 2 minutos. Usa 1 consulta de IA.</small></div>
          </div>
        )}
        {error && <div style={{ marginTop: 14 }}><Aviso tipo="error">{error}</Aviso></div>}
      </section>

      {res && res.length > 0 && (
        <section className="tarjeta sin-pad">
          <div className="scroll-x">
            <table className="tabla">
              <thead><tr><th style={{ width: 36 }}><input type="checkbox" checked={sel.size === res.length && res.length > 0} aria-label="Todos"
                onChange={() => setSel(sel.size === res.length ? new Set() : new Set(res.map(r => r.id)))} /></th>
                <th>Negocio</th><th>Teléfono</th><th>Instagram</th><th>Hoy tiene</th></tr></thead>
              <tbody>{res.map(r => (
                <tr key={r.id} className={r.es_prospecto ? '' : 'apagado'}>
                  <td><input type="checkbox" checked={sel.has(r.id)} onChange={() => setSel(s => { const n = new Set(s); n.has(r.id) ? n.delete(r.id) : n.add(r.id); return n })} /></td>
                  <td style={{ minWidth: 260 }}>
                    <span className="fuerte">{r.nombre}</span>
                    {r.fuente && <a href={r.fuente} target="_blank" rel="noreferrer" title="Dónde lo encontró" style={{ marginLeft: 6 }}><ExternalLink size={12} /></a>}
                    <div className="muted chico">{r.direccion}</div>
                    {r.nota && <div className="chico" style={{ color: 'var(--ink-2)', marginTop: 2 }}>{r.nota}</div>}
                  </td>
                  <td className="nowrap">{r.telefono || <span className="muted">—</span>}</td>
                  <td className="nowrap">{r.instagram ? <a href={r.instagram} target="_blank" rel="noreferrer">{handleIG(r.instagram)}</a> : <span className="muted">—</span>}</td>
                  <td><QueTieneChip valor={r.que_tiene_hoy} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <small className="muted">Revisá los datos antes de escribir: Claude los toma de fuentes públicas y puede equivocarse.</small>
            <button className="btn primario" onClick={importar} disabled={!sel.size}><Download size={16} /> Importar {sel.size}</button>
          </div>
        </section>
      )}
    </>
  )
}
