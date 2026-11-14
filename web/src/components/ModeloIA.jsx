// Con qué modelo de Claude responde el asistente. Cada mensaje cobra créditos según lo que usó de verdad
// (lo largo de la charla y de la respuesta) y el modelo: el más capaz cuesta más. Los mismos nombres que en Buscar.
import { useState } from 'react'
import { Zap, Sparkles, Gem } from 'lucide-react'
import Desplegable from './Desplegable.jsx'

export const CALIDADES_CHAT = [
  { id: 'rapida', nombre: 'Rápida', creditos: 1, icono: Zap, ayuda: 'Claude Haiku · rápido y económico' },
  { id: 'mejor', nombre: 'Mejor', creditos: 2, icono: Sparkles, ayuda: 'Claude Sonnet · razona mejor' },
  { id: 'maxima', nombre: 'Máxima', creditos: 3, icono: Gem, ayuda: 'Claude Opus · el más potente' },
]
const CLAVE = 'prospecta-calidad-chat'
const guardada = () => { try { const c = localStorage.getItem(CLAVE); return CALIDADES_CHAT.some(x => x.id === c) ? c : 'rapida' } catch { return 'rapida' } }

/** [calidad, elegir] recordada en este navegador (la comparten el chat flotante y la pantalla del asistente) */
export function useCalidadChat() {
  const [calidad, setCalidad] = useState(guardada)
  const elegir = c => { setCalidad(c); try { localStorage.setItem(CLAVE, c) } catch { /* sin almacenamiento */ } }
  return [calidad, elegir]
}

export const nombreCalidad = id => CALIDADES_CHAT.find(c => c.id === id)?.nombre ?? 'Rápida'
export const creditosTexto = n => `${n} ${n === 1 ? 'crédito' : 'créditos'}`

export function SelectorModelo({ calidad, onChange, disabled, cupo }) {
  const quedan = cupo && !cupo.sin_tope ? Math.max(0, (cupo.limite ?? 0) - (cupo.usados ?? 0)) : null
  return (
    <div className="selector-modelo">
      <Desplegable compacto ariaLabel="Modelo de Claude" value={calidad} onChange={onChange} disabled={disabled} anchoMenu={290} alinear="izq"
        opciones={CALIDADES_CHAT.map(c => {
          const I = c.icono
          return { value: c.id, label: `${c.nombre} · ≈${creditosTexto(c.creditos)}`, icono: <I size={14} />, ayuda: c.ayuda }
        })} />
      {quedan !== null && <span className="selector-modelo-quedan">Te quedan {quedan.toLocaleString('es-AR')}</span>}
    </div>
  )
}
