import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UploadCloud, FileSpreadsheet, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { CAMPOS, aplicarMapeo, autoMapeo, leerArchivo, marcarDuplicados } from '../lib/importar.js'
import { mensajeError } from '../lib/util.js'
import { Aviso, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const ETIQUETA = { nuevo: 'Nuevo', duplicado: 'Duplicado', invalido: 'Inválido', con_web: 'Tiene web propia' }

export default function Importar() {
  const toast = useToast()
  const { refrescar } = useApp()
  const [archivo, setArchivo] = useState(null)
  const [datos, setDatos] = useState(null)
  const [mapeo, setMapeo] = useState({})
  const [preview, setPreview] = useState(null)
  const [incluirConWeb, setIncluirConWeb] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [sobre, setSobre] = useState(false)

  async function elegir(f) {
    if (!f) return
    setError(''); setResultado(null); setPreview(null)
    try {
      const d = await leerArchivo(f)
      if (!d.filas.length) throw new Error('El archivo no tiene filas con datos.')
      setArchivo(f.name); setDatos(d); setMapeo(autoMapeo(d.columnas))
    } catch (err) { setError('No pude leer el archivo: ' + err.message) }
  }

  async function revisar() {
    setCargando(true)
    const { data: existentes } = await supabase.from('prospectos').select('nombre, direccion, telefono')
    setPreview(marcarDuplicados(aplicarMapeo(datos.filas, mapeo), existentes ?? []))
    setCargando(false)
  }

  async function importar() {
    const filas = preview.filter(p => p._estado === 'nuevo' || (incluirConWeb && p._estado === 'con_web')).map(({ _estado, _motivo, ...p }) => p)
    setCargando(true)
    const total = { insertados: 0, duplicados: 0, invalidos: 0 }
    try {
      for (let i = 0; i < filas.length; i += 200) {
        const { data, error } = await supabase.rpc('importar_prospectos', { filas: filas.slice(i, i + 200), origen: 'csv' })
        if (error) throw error
        for (const k in total) total[k] += data[k]
      }
      setResultado(total); refrescar()
      toast(`Se cargaron ${total.insertados} prospectos`)
    } catch (e) { setError(mensajeError(e)) }
    setCargando(false)
  }

  const cuenta = preview ? preview.reduce((a, p) => ({ ...a, [p._estado]: (a[p._estado] ?? 0) + 1 }), {}) : {}
  const aImportar = (cuenta.nuevo ?? 0) + (incluirConWeb ? cuenta.con_web ?? 0 : 0)
  const paso = resultado ? 4 : preview ? 3 : datos ? 2 : 1

  return (
    <>
      <header className="cabecera"><div><h1>Importar prospectos</h1><p>CSV o Excel, con las columnas que tengas. Los repetidos se saltean solos.</p></div></header>
      <div className="pasos">
        {['Archivo', 'Columnas', 'Revisión', 'Listo'].map((t, i) => (
          <div key={t} className={'paso' + (paso === i + 1 ? ' activo' : paso > i + 1 ? ' hecho' : '')}><span>{paso > i + 1 ? '✓' : i + 1}</span>{t}{i < 3 && <ArrowRight size={14} className="muted" />}</div>
        ))}
      </div>

      <section className="tarjeta">
        <label className={'zona-archivo' + (sobre ? ' sobre' : '')}
          onDragOver={e => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)}
          onDrop={e => { e.preventDefault(); setSobre(false); elegir(e.dataTransfer.files[0]) }}>
          <input type="file" accept=".csv,.txt,.xlsx" onChange={e => elegir(e.target.files[0])} />
          {archivo ? <FileSpreadsheet size={34} /> : <UploadCloud size={34} />}
          <div className="fuerte">{archivo || 'Arrastrá tu archivo o hacé clic para elegirlo'}</div>
          <div className="muted chico">{datos ? `${datos.filas.length} filas · ${datos.columnas.length} columnas` : 'CSV o Excel (.xlsx)'}</div>
        </label>
        {error && <div style={{ marginTop: 14 }}><Aviso tipo="error">{error}</Aviso></div>}
      </section>

      {datos && !resultado && (
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3>Asociá las columnas</h3><span className="muted chico">Las reconocimos solas; corregí si hace falta.</span></div>
          <div className="mapeo">
            {CAMPOS.map(c => (
              <label key={c.key}>{c.label}{c.obligatorio && ' *'}
                <select value={mapeo[c.key] ?? ''} onChange={e => { setMapeo({ ...mapeo, [c.key]: e.target.value || undefined }); setPreview(null) }}>
                  <option value="">— no importar —</option>
                  {datos.columnas.map(col => <option key={col} value={col}>{col}</option>)}
                </select>
                {mapeo[c.key] && <small>ej: {String(datos.filas[0][mapeo[c.key]] ?? '').slice(0, 40) || '(vacío)'}</small>}
              </label>
            ))}
          </div>
          <button className="btn oscuro" onClick={revisar} disabled={!mapeo.nombre || cargando}>{cargando && <Loader2 size={15} className="spin" />} Revisar duplicados</button>
          {!mapeo.nombre && <span className="muted chico"> Falta asociar el Nombre.</span>}
        </section>
      )}

      {preview && !resultado && (
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3>Revisá y confirmá</h3>
            <div className="acciones">{Object.entries(cuenta).map(([k, v]) => <span key={k} className={'chip ' + k}>{ETIQUETA[k]}: {v}</span>)}</div>
          </div>
          {cuenta.con_web > 0 && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={incluirConWeb} onChange={e => setIncluirConWeb(e.target.checked)} />
              Importar también los que tienen dominio propio</label>
          )}
          <div className="scroll">
            <table className="tabla compacta">
              <thead><tr><th></th><th>Nombre</th><th>Rubro</th><th>Teléfono</th><th>Hoy tiene</th><th>Motivo</th></tr></thead>
              <tbody>{preview.slice(0, 300).map((p, i) => (
                <tr key={i} className={p._estado !== 'nuevo' ? 'apagado' : ''}>
                  <td><span className={'chip ' + p._estado}>{ETIQUETA[p._estado]}</span></td>
                  <td className="fuerte">{p.nombre}</td><td>{p.rubro}</td><td className="nowrap">{p.telefono}</td><td>{p.que_tiene_hoy}</td>
                  <td className="muted chico">{p._motivo}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <button className="btn primario" onClick={importar} disabled={!aImportar || cargando}>{cargando && <Loader2 size={15} className="spin" />}{`Importar ${aImportar}`}</button>
        </section>
      )}

      {resultado && (
        <section className="tarjeta vacio">
          <div className="icono-grande" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}><CheckCircle2 size={26} /></div>
          <h3>Se cargaron {resultado.insertados} prospectos</h3>
          <p>{resultado.duplicados > 0 ? `${resultado.duplicados} ya existían y se saltearon. ` : ''}Ahora seleccionalos y generá los borradores.</p>
          <Link className="btn primario" to="/prospectos?orden=reciente">Ver prospectos y generar borradores <ArrowRight size={16} /></Link>
        </section>
      )}
    </>
  )
}
