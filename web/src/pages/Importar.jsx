import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UploadCloud, FileSpreadsheet, CheckCircle2, Loader2, ClipboardPaste, Download, Info, ArrowRight, RotateCcw, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { CAMPOS, aplicarMapeo, autoMapeo, leerArchivo, leerCSV, marcarDuplicados } from '../lib/importar.js'
import { RUBROS, ZONAS, zonaCompleta } from '../lib/catalogo.js'
import { descargarCSV, mensajeError } from '../lib/util.js'
import { Aviso, useToast } from '../components/ui.jsx'
import Autocompletar from '../components/Autocompletar.jsx'
import Desplegable from '../components/Desplegable.jsx'
import { useApp } from '../App.jsx'

const ETIQUETA = { nuevo: 'Nuevo', duplicado: 'Ya lo tenés', invalido: 'Sin nombre', con_web: 'Tiene web propia' }
const EJEMPLO = [
  { Nombre: 'Barbería El Tano', Rubro: 'barbería', Zona: 'Godoy Cruz', Dirección: 'San Martín 1200', Teléfono: '261 555-1234', Instagram: '@eltanobarber', Web: '', Notas: 'Lo vi en Instagram' },
  { Nombre: 'Estética Luna', Rubro: 'centro de estética', Zona: 'Maipú', Dirección: '', Teléfono: '+54 9 261 555-9876', Instagram: 'https://instagram.com/esteticaluna', Web: 'https://linktr.ee/esteticaluna', Notas: '' },
]
const TODOS_RUBROS = RUBROS.flatMap(g => g.items)
const TODAS_ZONAS = ZONAS.flatMap(g => g.items)

export default function Importar() {
  const toast = useToast()
  const { refrescar, session } = useApp()
  const [modo, setModo] = useState('archivo')
  const [archivo, setArchivo] = useState(null)
  const [pegado, setPegado] = useState('')
  const [datos, setDatos] = useState(null)
  const [mapeo, setMapeo] = useState({})
  const [fijos, setFijos] = useState({ rubro: '', zona: '' })
  const [preview, setPreview] = useState(null)
  const [incluirConWeb, setIncluirConWeb] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [sobre, setSobre] = useState(false)

  function cargarDatos(d, nombre) {
    if (!d.filas.length) throw new Error('No encontré filas con datos debajo de los títulos.')
    setArchivo(nombre); setDatos(d); setMapeo(autoMapeo(d.columnas)); setPreview(null); setResultado(null)
  }

  async function elegir(f) {
    if (!f) return
    setError('')
    if (/\.xls$/i.test(f.name)) { setError('Ese es un Excel viejo (.xls). Abrilo y guardalo como .xlsx o .csv, y volvé a subirlo.'); return }
    try { cargarDatos(await leerArchivo(f), f.name) } catch (err) { setError('No pude leer el archivo: ' + err.message) }
  }

  function usarPegado() {
    setError('')
    try {
      const texto = pegado.trim()
      // Lo copiado de Excel o Google Sheets viene separado por tabulaciones
      const d = texto.includes('\t') ? leerCSV(texto.split('\n').map(l => l.split('\t').map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')) : leerCSV(texto)
      cargarDatos(d, 'Datos pegados')
    } catch (err) { setError('No pude leer lo que pegaste: ' + err.message) }
  }

  async function revisar() {
    setCargando(true)
    const { data: existentes } = await supabase.from('prospectos').select('nombre, direccion, telefono').eq('owner_id', session.user.id)
    const filas = aplicarMapeo(datos.filas, mapeo).map(p => ({
      ...p,
      rubro: p.rubro || fijos.rubro,
      zona: p.zona || (fijos.zona ? zonaCompleta(fijos.zona) : ''),
    }))
    setPreview(marcarDuplicados(filas, existentes ?? []))
    setCargando(false)
  }

  async function importar() {
    const filas = preview.filter(p => p._estado === 'nuevo' || (incluirConWeb && p._estado === 'con_web')).map(({ _estado, _motivo, ...p }) => p)
    setCargando(true); setError('')
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

  function reiniciar() { setArchivo(null); setDatos(null); setPreview(null); setResultado(null); setPegado(''); setError('') }

  const cuenta = preview ? preview.reduce((a, p) => ({ ...a, [p._estado]: (a[p._estado] ?? 0) + 1 }), {}) : {}
  const aImportar = (cuenta.nuevo ?? 0) + (incluirConWeb ? cuenta.con_web ?? 0 : 0)
  const paso = resultado ? 4 : preview ? 3 : datos ? 2 : 1

  return (
    <>
      <header className="cabecera">
        <div><h1>Importar prospectos</h1><p>Traé tu lista de negocios desde Excel, Google Sheets o un CSV. Reconocemos las columnas solas y salteamos los repetidos.</p></div>
        <button className="btn" onClick={() => descargarCSV('plantilla-prospecta.csv', EJEMPLO)}><Download size={15} /> Planilla de ejemplo</button>
      </header>

      <div className="pasos">
        {['Tus datos', 'Columnas', 'Revisión', 'Listo'].map((t, i) => (
          <div key={t} className={'paso' + (paso === i + 1 ? ' activo' : paso > i + 1 ? ' hecho' : '')}><span>{paso > i + 1 ? '✓' : i + 1}</span>{t}{i < 3 && <ArrowRight size={14} className="muted" />}</div>
        ))}
      </div>

      {!datos && (
        <section className="tarjeta">
          <div className="segmentado" style={{ marginBottom: 16 }}>
            <button className={modo === 'archivo' ? 'on' : ''} onClick={() => setModo('archivo')}>Subir archivo</button>
            <button className={modo === 'pegar' ? 'on' : ''} onClick={() => setModo('pegar')}>Pegar desde una planilla</button>
          </div>
          {modo === 'archivo' ? (
            <label className={'zona-archivo' + (sobre ? ' sobre' : '')}
              onDragOver={e => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)}
              onDrop={e => { e.preventDefault(); setSobre(false); elegir(e.dataTransfer.files[0]) }}>
              <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={e => { elegir(e.target.files[0]); e.target.value = '' }} />
              <UploadCloud size={34} />
              <div className="fuerte">Arrastrá tu archivo acá o hacé clic para elegirlo</div>
              <div className="muted chico">Excel (.xlsx) o CSV. La primera fila tiene que tener los títulos de las columnas.</div>
            </label>
          ) : (
            <>
              <textarea rows={8} value={pegado} onChange={e => setPegado(e.target.value)}
                placeholder={'Seleccioná las celdas en Excel o Google Sheets (incluí la fila de títulos), copiá y pegá acá.\n\nNombre\tTeléfono\tInstagram\nBarbería El Tano\t261 555-1234\t@eltanobarber'} />
              <button className="btn oscuro" style={{ marginTop: 10 }} onClick={usarPegado} disabled={!pegado.trim()}><ClipboardPaste size={15} /> Usar estos datos</button>
            </>
          )}
          <div className="ayuda-importar">
            <Info size={15} />
            <div>
              <b>¿Qué columnas sirven?</b> Sólo el <b>nombre</b> es obligatorio. Suman mucho el teléfono o WhatsApp, el Instagram, el rubro y la zona.
              También podés traer dirección, email, la web que tengan, el puntaje y las reseñas de Google. Si te falta el rubro o la zona, los elegís en el paso siguiente para todas las filas.
            </div>
          </div>
          {error && <div style={{ marginTop: 14 }}><Aviso tipo="error">{error}</Aviso></div>}
        </section>
      )}

      {datos && !resultado && (
        <section className="tarjeta">
          <div className="tarjeta-titulo">
            <h3><FileSpreadsheet size={16} /> {archivo} <span className="muted chico" style={{ fontWeight: 400 }}>· {datos.filas.length} filas · {datos.columnas.length} columnas</span></h3>
            <button className="btn chico fantasma" onClick={reiniciar}><RotateCcw size={14} /> Empezar de nuevo</button>
          </div>
          <p className="muted" style={{ marginTop: -6 }}>Decinos qué columna de tu planilla corresponde a cada dato. Ya completamos las que reconocimos; revisalas y cambiá lo que haga falta.</p>
          <div className="mapeo">
            {CAMPOS.map(c => (
              <div key={c.key} className={'campo' + (mapeo[c.key] ? ' mapeado' : '')}>{c.label}{c.obligatorio && <span className="obligatorio"> *</span>}
                <Desplegable className="ancho" ariaLabel={c.label} value={mapeo[c.key] ?? ''} onChange={v => { setMapeo({ ...mapeo, [c.key]: v || undefined }); setPreview(null) }}
                  opciones={[{ value: '', label: 'No lo tengo' }, ...datos.columnas.map(col => ({ value: col, label: col, ayuda: String(datos.filas[0]?.[col] ?? '').slice(0, 40) }))]} />
                {mapeo[c.key] && <small>ej.: {String(datos.filas[0][mapeo[c.key]] ?? '').slice(0, 40) || '(vacío)'}</small>}
              </div>
            ))}
          </div>
          {(!mapeo.rubro || !mapeo.zona) && (
            <div className="fijos">
              <div className="etiqueta">Tu planilla no trae {[!mapeo.rubro && 'rubro', !mapeo.zona && 'zona'].filter(Boolean).join(' ni ')}. ¿Querés ponerle uno a todas las filas?</div>
              <div className="fijos-campos">
                {!mapeo.rubro && <label>Rubro para todas<Autocompletar opciones={TODOS_RUBROS} placeholder="ej. barbería" value={fijos.rubro} onChange={v => { setFijos(f => ({ ...f, rubro: v })); setPreview(null) }} /></label>}
                {!mapeo.zona && <label>Zona para todas<Autocompletar opciones={TODAS_ZONAS} placeholder="ej. Godoy Cruz" value={fijos.zona} onChange={v => { setFijos(f => ({ ...f, zona: v })); setPreview(null) }} /></label>}
              </div>
            </div>
          )}
          {!preview && (
            <div className="acciones" style={{ marginTop: 6 }}>
              <button className="btn primario" onClick={revisar} disabled={!mapeo.nombre || cargando}>{cargando && <Loader2 size={15} className="spin" />} Revisar antes de cargar <ArrowRight size={15} /></button>
              {!mapeo.nombre && <span className="muted chico">Falta elegir qué columna es el <b>Nombre</b>.</span>}
            </div>
          )}
        </section>
      )}

      {preview && !resultado && (
        <section className="tarjeta">
          <div className="tarjeta-titulo"><h3>Revisá y confirmá</h3>
            <div className="acciones">{Object.entries(cuenta).map(([k, v]) => <span key={k} className={'chip ' + k}>{ETIQUETA[k]}: {v}</span>)}</div>
          </div>
          <p className="muted" style={{ marginTop: -6 }}>Se cargan los <b>nuevos</b>. Los que ya tenés (mismo teléfono, o mismo nombre y dirección) y las filas sin nombre se saltean.</p>
          {cuenta.con_web > 0 && (
            <label className="check-linea"><input type="checkbox" checked={incluirConWeb} onChange={e => setIncluirConWeb(e.target.checked)} />
              Cargar también los {cuenta.con_web} que ya tienen web propia (normalmente no son prospectos)</label>
          )}
          <div className="scroll">
            <table className="tabla compacta">
              <thead><tr><th></th><th>Nombre</th><th>Rubro</th><th>Zona</th><th>Teléfono</th><th>Hoy tiene</th><th>Motivo</th></tr></thead>
              <tbody>{preview.slice(0, 300).map((p, i) => (
                <tr key={i} className={p._estado !== 'nuevo' && !(incluirConWeb && p._estado === 'con_web') ? 'apagado' : ''}>
                  <td><span className={'chip ' + p._estado}>{ETIQUETA[p._estado]}</span></td>
                  <td className="fuerte">{p.nombre}</td><td>{p.rubro}</td><td>{p.zona.replace(/, Mendoza$/, '')}</td><td className="nowrap">{p.telefono}</td><td>{p.que_tiene_hoy}</td>
                  <td className="muted chico">{p._motivo}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {preview.length > 300 && <small className="muted">Mostramos las primeras 300 filas; se cargan todas.</small>}
          <div className="acciones" style={{ marginTop: 14 }}>
            <button className="btn primario" onClick={importar} disabled={!aImportar || cargando}>{cargando && <Loader2 size={15} className="spin" />}{aImportar ? `Cargar ${aImportar} prospectos` : 'No hay nada nuevo para cargar'}</button>
            <button className="btn fantasma" onClick={() => setPreview(null)}>Volver a las columnas</button>
          </div>
          {error && <div style={{ marginTop: 14 }}><Aviso tipo="error">{error}</Aviso></div>}
        </section>
      )}

      {resultado && (
        <section className="tarjeta vacio">
          <div className="icono-grande" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}><CheckCircle2 size={26} /></div>
          <h3>Se cargaron {resultado.insertados} prospectos</h3>
          <p>{resultado.duplicados > 0 ? `${resultado.duplicados} ya existían y se saltearon. ` : ''}Ya están en tu Tablero y en Prospectos. El paso siguiente es armar los mensajes.</p>
          <div className="acciones" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={reiniciar}>Importar otra planilla</button>
            <Link className="btn primario" to="/prospectos?orden=reciente"><Sparkles size={15} /> Ver prospectos y armar mensajes</Link>
          </div>
        </section>
      )}
    </>
  )
}
