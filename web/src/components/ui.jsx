import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, Loader2, X, Circle, Send, MessageSquareReply, Trophy, Ban, ChevronDown, Check, ShieldOff, MailCheck, MailWarning, MailX } from 'lucide-react'
import { ESTADOS } from '../lib/util.js'

// ---------- Toasts ----------
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random()
    setToasts(t => [...t, { id, texto, tipo }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tipo === 'error' ? 7000 : 4000)
  }, [])
  return (
    <ToastCtx.Provider value={avisar}>
      {children}
      <div className="toasts" role="status">
        {toasts.map(t => (
          <div key={t.id} className={'toast ' + t.tipo}>
            {t.tipo === 'error' ? <AlertCircle size={18} /> : t.tipo === 'info' ? <Info size={18} /> : <CheckCircle2 size={18} />}
            <span>{t.texto}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ---------- Modal de confirmación (reemplaza a confirm()) ----------
const ConfirmCtx = createContext(async () => false)
export const useConfirmar = () => useContext(ConfirmCtx)

export function ConfirmProvider({ children }) {
  const [pedido, setPedido] = useState(null)
  const confirmar = useCallback(opts => new Promise(resolve => setPedido({ ...opts, resolve })), [])
  const cerrar = valor => { pedido.resolve(valor); setPedido(null) }
  return (
    <ConfirmCtx.Provider value={confirmar}>
      {children}
      {pedido && (
        <Modal onCerrar={() => cerrar(false)}>
          <h3>{pedido.titulo}</h3>
          {pedido.texto && <p>{pedido.texto}</p>}
          <div className="acciones fin">
            <button className="btn" onClick={() => cerrar(false)}>{pedido.cancelar || 'Cancelar'}</button>
            <button className={'btn ' + (pedido.peligro ? 'primario' : 'oscuro')} onClick={() => cerrar(true)} autoFocus>
              {pedido.aceptar || 'Confirmar'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  )
}

export function Modal({ children, onCerrar, ancho }) {
  return (
    <div className="modal-fondo" onMouseDown={e => e.target === e.currentTarget && onCerrar?.()}>
      <div className="modal" style={ancho ? { width: `min(${ancho}px, 100%)` } : undefined} role="dialog" aria-modal="true">
        {onCerrar && (
          <button className="btn fantasma chico" style={{ float: 'right', margin: '-8px -10px 0 0' }} onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>
        )}
        {children}
      </div>
    </div>
  )
}

// ---------- Varios ----------
const PALETA = ['#fd4a22', '#b45309', '#0f766e', '#4338ca', '#be185d', '#15803d', '#7c3aed', '#0369a1', '#a16207', '#c8320f']
export function Avatar({ nombre = '', grande, className = '' }) {
  const limpio = nombre.replace(/[^\p{L}\p{N} ]/gu, '').trim()
  const palabras = limpio.split(/\s+/).filter(Boolean)
  const ini = ((palabras[0]?.[0] ?? '?') + (palabras[1]?.[0] ?? '')).toUpperCase()
  const color = PALETA[[...nombre].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 3) % PALETA.length]
  return <span className={'avatar ' + (grande ? 'grande ' : '') + className} style={{ background: color }}>{ini}</span>
}

export const ICONO_ESTADO = { pendiente: Circle, contactado: Send, respondio: MessageSquareReply, cliente: Trophy, no_interesado: Ban, no_contactar: ShieldOff }

export function EstadoBadge({ estado }) {
  const e = ESTADOS[estado] ?? ESTADOS.pendiente
  const Icono = ICONO_ESTADO[estado] ?? Circle
  return <span className="estado" style={{ color: e.color, background: e.fondo, borderColor: e.borde }}><Icono />{e.label}</span>
}

/** Selector de estado con colores e íconos (reemplaza al <select> nativo) */
export function SelectorEstado({ valor, onCambiar }) {
  const [abierto, setAbierto] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!abierto) return
    const cerrar = e => { if (!ref.current?.contains(e.target)) setAbierto(false) }
    const esc = e => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', cerrar); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', cerrar); document.removeEventListener('keydown', esc) }
  }, [abierto])
  const actual = ESTADOS[valor] ?? ESTADOS.pendiente
  return (
    <div className="selector-estado" ref={ref} data-valor={valor} style={{ marginBottom: 16 }}>
      <span className="muted chico" style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Estado</span>
      <button type="button" aria-expanded={abierto} aria-haspopup="listbox" aria-label={'Estado: ' + actual.label} onClick={() => setAbierto(a => !a)}>
        <EstadoBadge estado={valor} /><span className="muted chico">{actual.ayuda}</span><ChevronDown size={16} className="chev" />
      </button>
      {abierto && (
        <div className="menu" role="listbox">
          {Object.entries(ESTADOS).map(([k, v]) => {
            const Icono = ICONO_ESTADO[k]
            return (
              <button key={k} type="button" role="option" aria-selected={k === valor} data-estado={k} onClick={() => { setAbierto(false); onCambiar(k) }}>
                <span className="opcion-estado">
                  <span className="kpi-icono" style={{ color: v.color, background: v.fondo, width: 30, height: 30 }}><Icono size={15} /></span>
                  <span><b style={{ fontWeight: 600 }}>{v.label}</b><small>{v.ayuda}</small></span>
                </span>
                {k === valor && <Check size={16} style={{ color: v.color }} />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function Cargando({ texto = 'Cargando…' }) {
  return <div className="cargando"><Loader2 size={18} className="spin" /> {texto}</div>
}

export function Esqueleto({ filas = 4 }) {
  return (
    <div className="esqueleto-pagina" aria-busy="true" aria-label="Cargando">
      <div className="skeleton" style={{ height: 34, width: 260 }} />
      <div className="kpis" style={{ marginBottom: 0 }}>{[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton" style={{ height: 104, borderRadius: 16 }} />)}</div>
      {Array.from({ length: filas }, (_, i) => <div key={i} className="skeleton" style={{ height: 58, borderRadius: 14, opacity: 1 - i * 0.18 }} />)}
    </div>
  )
}

/** Número que sube animado hasta su valor */
export function Contador({ valor = 0 }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    const fin = Number(valor) || 0
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || fin === 0) { setN(fin); return }
    let raf, t0
    const paso = t => { t0 ??= t; const p = Math.min(1, (t - t0) / 700); setN(Math.round(fin * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(paso) }
    raf = requestAnimationFrame(paso)
    return () => cancelAnimationFrame(raf)
  }, [valor])
  return <>{n}</>
}

export function Interruptor({ on, onCambiar, disabled, etiqueta }) {
  return <button type="button" role="switch" aria-checked={!!on} aria-label={etiqueta} className={'interruptor' + (on ? ' on' : '')} disabled={disabled} onClick={() => onCambiar(!on)} />
}

export function Aviso({ tipo = '', children }) {
  const Icono = tipo === 'error' ? AlertCircle : tipo === 'ok' ? CheckCircle2 : Info
  return <div className={'aviso ' + tipo}><Icono size={17} /><div>{children}</div></div>
}

export function QueTieneChip({ valor }) {
  if (!valor) return <span className="muted">—</span>
  const clase = /instagram/i.test(valor) ? 'ig' : /sin web/i.test(valor) ? 'sin' : ''
  return <span className={'chip ' + clase}>{valor}</span>
}

/** Indicador de verificación del email: válido / dudoso / inválido (con el motivo al pasar el mouse) */
export function EstadoEmail({ estado, motivo, conTexto }) {
  if (!estado) return null
  const e = { valido: ['Válido', '#15803d', MailCheck], dudoso: ['Dudoso', '#b45309', MailWarning], invalido: ['Inválido', '#c0262d', MailX] }[estado]
  if (!e) return null
  const [label, color, Icono] = e
  return <span className="email-estado" style={{ color }} title={motivo || label} aria-label={`Email ${label.toLowerCase()}${motivo ? ': ' + motivo : ''}`}><Icono size={13} />{conTexto && <span>{label}</span>}</span>
}

/** Estado vacío: qué es esto y qué hacer */
export function Vacio({ icono: Icono = Info, titulo, children, accion }) {
  return (
    <div className="vacio">
      {Icono && <Icono size={30} className="vacio-icono" />}
      {titulo && <h3>{titulo}</h3>}
      {children && <p>{children}</p>}
      {accion}
    </div>
  )
}

/** Error al cargar, con un mensaje entendible y forma de reintentar */
export function ErrorCarga({ error, onReintentar }) {
  return (
    <div className="aviso error error-carga"><AlertCircle size={17} />
      <div>No pudimos cargar esto{error ? `: ${typeof error === 'string' ? error : error.message || ''}` : '.'}
        {onReintentar && <> <button type="button" className="link" onClick={onReintentar}>Reintentar</button></>}
      </div>
    </div>
  )
}
