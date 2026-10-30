import { useRef, useState } from 'react'
import { ImagePlus, Paperclip, Trash2, Loader2, FileText, FileImage, File, Upload, Check } from 'lucide-react'
import { tamanoLegible, MAX_MB } from '../lib/archivos.js'
import { mensajeError } from '../lib/util.js'
import { useToast } from './ui.jsx'

const icono = mime => /^image\//.test(mime) ? FileImage : /pdf|word|text|sheet|presentation/.test(mime) ? FileText : File

/** Subir / cambiar la imagen de la firma (logo, banner con datos) */
export function FirmaImagen({ arch }) {
  const toast = useToast()
  const input = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  async function elegir(e) {
    const a = e.target.files?.[0]; e.target.value = ''
    if (!a) return
    setSubiendo(true)
    try { await arch.subir(a, 'firma'); toast('Firma con imagen guardada: va al final de cada email') } catch (err) { toast(mensajeError(err), 'error') }
    setSubiendo(false)
  }
  return (
    <div className="firma-imagen">
      <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={elegir} />
      {arch.firma ? (
        <div className="firma-imagen-cargada">
          {arch.firmaUrl ? <img src={arch.firmaUrl} alt="Tu firma" /> : <FileImage size={22} />}
          <div><b>{arch.firma.nombre}</b><small>{tamanoLegible(arch.firma.tamano)} · va abajo de cada email</small></div>
          <span className="espacio" />
          <button type="button" className="btn chico" onClick={() => input.current?.click()} disabled={subiendo}>{subiendo ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Cambiar</button>
          <button type="button" className="btn chico fantasma peligro" onClick={async () => { try { await arch.borrar(arch.firma); toast('Firma con imagen quitada') } catch (err) { toast(mensajeError(err), 'error') } }} aria-label="Quitar la imagen de la firma"><Trash2 size={14} /></button>
        </div>
      ) : (
        <button type="button" className="subir-caja" onClick={() => input.current?.click()} disabled={subiendo}>
          {subiendo ? <Loader2 size={20} className="spin" /> : <ImagePlus size={20} />}
          <span><b>Subí tu firma con imagen</b><small>Tu logo o la firma que usás en el mail (PNG o JPG). Se agrega sola al final de cada email.</small></span>
        </button>
      )}
    </div>
  )
}

/** Archivos que Claude puede adjuntar (catálogo, presentación, lista de precios) con su descripción */
export function ArchivosAdjuntos({ arch }) {
  const toast = useToast()
  const input = useRef(null)
  const [nuevo, setNuevo] = useState(null) // { archivo, descripcion }
  const [subiendo, setSubiendo] = useState(false)
  const [editando, setEditando] = useState({})

  async function subir() {
    if (!nuevo.descripcion.trim()) return toast('Contale a Claude de qué se trata el archivo', 'error')
    setSubiendo(true)
    try { await arch.subir(nuevo.archivo, 'adjunto', nuevo.descripcion.trim()); setNuevo(null); toast('Archivo listo: Claude lo va a adjuntar cuando sume') } catch (err) { toast(mensajeError(err), 'error') }
    setSubiendo(false)
  }
  async function guardarDesc(a) {
    try { await arch.describir(a, editando[a.id].trim()); setEditando(e => { const n = { ...e }; delete n[a.id]; return n }); toast('Descripción guardada') } catch (err) { toast(mensajeError(err), 'error') }
  }

  return (
    <div className="archivos-lista">
      <input ref={input} type="file" hidden onChange={e => { const a = e.target.files?.[0]; e.target.value = ''; if (a) setNuevo({ archivo: a, descripcion: '' }) }} />
      {arch.adjuntos.map(a => {
        const Icono = icono(a.mime)
        const ed = editando[a.id]
        return (
          <div key={a.id} className="archivo-fila">
            <span className="archivo-icono"><Icono size={18} /></span>
            <div className="archivo-cuerpo">
              <div className="archivo-cab"><b>{a.nombre}</b><small className="muted">{tamanoLegible(a.tamano)}</small></div>
              {ed !== undefined ? (
                <div className="archivo-editar">
                  <textarea rows={2} value={ed} onChange={e => setEditando({ ...editando, [a.id]: e.target.value })} autoFocus />
                  <button type="button" className="btn chico primario" onClick={() => guardarDesc(a)}><Check size={14} /> Guardar</button>
                </div>
              ) : (
                <button type="button" className="archivo-desc" onClick={() => setEditando({ ...editando, [a.id]: a.descripcion })} title="Editar la descripción">
                  {a.descripcion || <span className="muted">Agregá de qué se trata para que Claude sepa cuándo mandarlo</span>}
                </button>
              )}
            </div>
            <button type="button" className="btn chico fantasma peligro" aria-label={'Borrar ' + a.nombre}
              onClick={async () => { try { await arch.borrar(a); toast('Archivo borrado') } catch (err) { toast(mensajeError(err), 'error') } }}><Trash2 size={14} /></button>
          </div>
        )
      })}
      {nuevo ? (
        <div className="archivo-fila nuevo">
          <span className="archivo-icono"><Paperclip size={18} /></span>
          <div className="archivo-cuerpo">
            <div className="archivo-cab"><b>{nuevo.archivo.name}</b><small className="muted">{tamanoLegible(nuevo.archivo.size)}</small></div>
            <label style={{ margin: '8px 0 0' }}>¿De qué se trata y cuándo conviene mandarlo?
              <textarea rows={2} autoFocus value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })}
                placeholder="Ej.: Catálogo de sistemas de almacenamiento automático. Mandalo a empresas con depósito grande o que hablen de falta de espacio." />
            </label>
            <div className="acciones" style={{ marginTop: 8 }}>
              <button type="button" className="btn chico" onClick={() => setNuevo(null)}>Cancelar</button>
              <button type="button" className="btn chico primario" onClick={subir} disabled={subiendo}>{subiendo ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Subir archivo</button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" className="subir-caja" onClick={() => input.current?.click()}>
          <Paperclip size={20} />
          <span><b>Agregar un archivo</b><small>Catálogo, presentación, lista de precios… (hasta {MAX_MB} MB). Le contás de qué se trata y Claude lo adjunta cuando suma.</small></span>
        </button>
      )}
    </div>
  )
}
