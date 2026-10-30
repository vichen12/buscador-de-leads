import { useRef, useState } from 'react'
import { ImagePlus, Paperclip, Trash2, Loader2, FileText, FileImage, File, Upload, Check, X } from 'lucide-react'
import { tamanoLegible, MAX_MB } from '../lib/archivos.js'
import { mensajeError } from '../lib/util.js'
import { useToast } from './ui.jsx'

const icono = mime => /^image\//.test(mime) ? FileImage : /pdf|word|text|sheet|presentation/.test(mime) ? FileText : File

/** Firma de email: texto + una imagen al final (logo, banner), todo en el mismo cuadro */
export function EditorFirma({ arch, valor, onChange, placeholder }) {
  const toast = useToast()
  const input = useRef(null)
  const [subiendo, setSubiendo] = useState(false)
  async function elegir(e) {
    const a = e.target.files?.[0]; e.target.value = ''
    if (!a) return
    setSubiendo(true)
    try { await arch.subir(a, 'firma'); toast('Imagen agregada al final de tu firma') } catch (err) { toast(mensajeError(err), 'error') }
    setSubiendo(false)
  }
  return (
    <div className="editor-firma">
      <textarea rows={4} value={valor} onChange={onChange} placeholder={placeholder} aria-label="Firma de email" />
      {arch.firma && (
        <div className="editor-firma-img">
          {arch.firmaUrl ? <img src={arch.firmaUrl} alt="Imagen de tu firma" /> : <FileImage size={20} />}
          <button type="button" className="quitar" aria-label="Quitar la imagen" title="Quitar la imagen"
            onClick={async () => { try { await arch.borrar(arch.firma); toast('Imagen quitada de la firma') } catch (err) { toast(mensajeError(err), 'error') } }}><X size={13} /></button>
        </div>
      )}
      <div className="editor-firma-barra">
        <input ref={input} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={elegir} />
        <button type="button" className="btn chico fantasma" onClick={() => input.current?.click()} disabled={subiendo}>
          {subiendo ? <Loader2 size={14} className="spin" /> : <ImagePlus size={14} />} {arch.firma ? 'Cambiar imagen' : 'Agregar imagen al final'}
        </button>
        <span className="muted">Logo o firma en PNG/JPG</span>
      </div>
    </div>
  )
}

/** Adjuntar desde donde escribís el email: elegís archivos ya subidos o subís uno nuevo (PDF, brochure…) */
export function AdjuntarEnEmail({ arch, elegidos, onAlternar, onSubido }) {
  const toast = useToast()
  const input = useRef(null)
  const [nuevo, setNuevo] = useState(null)
  const [subiendo, setSubiendo] = useState(false)
  async function subir() {
    setSubiendo(true)
    try {
      const fila = await arch.subir(nuevo.archivo, 'adjunto', nuevo.descripcion.trim())
      onSubido?.(fila.id); setNuevo(null)
      toast('Adjuntado. Queda guardado para tus próximos emails')
    } catch (err) { toast(mensajeError(err), 'error') }
    setSubiendo(false)
  }
  return (
    <div className="adjuntar">
      <input ref={input} type="file" hidden accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg,.zip,application/pdf,image/*"
        onChange={e => { const a = e.target.files?.[0]; e.target.value = ''; if (a) setNuevo({ archivo: a, descripcion: '' }) }} />
      <div className="adjuntar-lista">
        {arch.adjuntos.map(a => {
          const on = elegidos.includes(a.id)
          return (
            <span key={a.id} className={'chip-adj' + (on ? ' on' : '')}>
              <button type="button" onClick={() => onAlternar(a.id)} title={a.descripcion || 'Tocá para adjuntarlo o sacarlo'}>
                {on ? <Check size={13} /> : <Paperclip size={13} />} {a.nombre} <span className="muted">{tamanoLegible(a.tamano)}</span>
              </button>
              <button type="button" className="chip-adj-x" aria-label={'Borrar ' + a.nombre} title="Borrar de tus archivos"
                onClick={async () => { if (!confirm(`¿Borrar "${a.nombre}" de tus archivos?`)) return; try { await arch.borrar(a); toast('Archivo borrado') } catch (err) { toast(mensajeError(err), 'error') } }}><X size={12} /></button>
            </span>
          )
        })}
        {!nuevo && <button type="button" className="chip-subir" onClick={() => input.current?.click()}><Paperclip size={13} /> Adjuntar PDF o archivo</button>}
      </div>
      {nuevo && (
        <div className="adjuntar-nuevo">
          <FileText size={16} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{nuevo.archivo.name}</b> <span className="muted chico">{tamanoLegible(nuevo.archivo.size)}</span>
            <input value={nuevo.descripcion} onChange={e => setNuevo({ ...nuevo, descripcion: e.target.value })} autoFocus
              placeholder="¿De qué se trata? (opcional) Ej.: brochure de servicios; así Claude sabe cuándo sugerirlo" />
          </div>
          <button type="button" className="btn chico" onClick={() => setNuevo(null)}>Cancelar</button>
          <button type="button" className="btn chico primario" onClick={subir} disabled={subiendo}>{subiendo ? <Loader2 size={14} className="spin" /> : <Upload size={14} />} Adjuntar</button>
        </div>
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
