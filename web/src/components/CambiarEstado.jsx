import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { ESTADOS, MOTIVOS_PERDIDO, mensajeError } from '../lib/util.js'
import { Modal, useToast, useConfirmar } from './ui.jsx'

const Ctx = createContext(null)

/**
 * Cambiar el estado de una o varias empresas con las reglas: "Perdido" pide motivo, "No contactar" pide confirmación,
 * queda en el historial y el aviso trae "Deshacer".
 */
export function CambiarEstadoProvider({ children }) {
  const [pedido, setPedido] = useState(null)
  const resolver = useRef(null)
  const pedirMotivo = useCallback(cuantos => new Promise(res => { resolver.current = res; setPedido({ cuantos, motivo: '', detalle: '' }) }), [])
  const cerrar = v => { setPedido(null); resolver.current?.(v) }
  return (
    <Ctx.Provider value={pedirMotivo}>
      {children}
      {pedido && (
        <Modal onCerrar={() => cerrar(null)} ancho={460}>
          <h3 style={{ marginTop: 0 }}><XCircle size={18} style={{ verticalAlign: -3, color: '#c0262d' }} /> ¿Por qué se perdió{pedido.cuantos > 1 ? `n estas ${pedido.cuantos}` : ''}?</h3>
          <p className="muted chico">Sirve para los reportes y para reactivarla más adelante si fue por el momento.</p>
          <div className="chips-sel" style={{ marginTop: 0 }}>
            {Object.entries(MOTIVOS_PERDIDO).map(([k, l]) => <button key={k} type="button" className={'chip-sel' + (pedido.motivo === k ? ' on' : '')} onClick={() => setPedido({ ...pedido, motivo: k })}>{l}</button>)}
          </div>
          <label style={{ marginTop: 12 }}>Detalle <span className="muted">(opcional)</span><input value={pedido.detalle} onChange={e => setPedido({ ...pedido, detalle: e.target.value })} placeholder="Ej.: eligieron a la competencia por precio" /></label>
          <div className="acciones fin">
            <button className="btn" onClick={() => cerrar(null)}>Cancelar</button>
            <button className="btn primario" disabled={!pedido.motivo} onClick={() => cerrar({ motivo: pedido.motivo, detalle: pedido.detalle })}>Marcar como Perdido</button>
          </div>
        </Modal>
      )}
    </Ctx.Provider>
  )
}

export function useCambiarEstado() {
  const pedirMotivo = useContext(Ctx)
  const confirmar = useConfirmar()
  const toast = useToast()
  /** lista: [{ id, nombre, estado }]. Devuelve true si cambió. */
  return useCallback(async (lista, nuevo, { silencioso } = {}) => {
    const items = lista.filter(p => p && p.estado !== nuevo)
    if (!items.length) return false
    let extra = {}
    if (nuevo === 'perdido') {
      const m = await pedirMotivo(items.length)
      if (!m) return false
      extra = { perdido_motivo: m.motivo, perdido_detalle: m.detalle }
    } else if (nuevo === 'no_contactar') {
      if (!(await confirmar({ titulo: items.length === 1 ? `¿No contactar más a ${items[0].nombre}?` : `¿No contactar más a estas ${items.length} empresas?`, texto: 'No se les va a poder escribir y salen de todas las secuencias. Es lo correcto si pidieron que no las contactes.', aceptar: 'Sí, no contactar', peligro: true }))) return false
    } else if (items.length > 3 && !(await confirmar({ titulo: `¿Pasar ${items.length} empresas a "${ESTADOS[nuevo].label}"?`, texto: ESTADOS[nuevo].ayuda, aceptar: 'Cambiar' }))) return false
    const antes = items.map(p => ({ id: p.id, estado: p.estado, perdido_motivo: p.perdido_motivo ?? null }))
    const { error } = await supabase.from('prospectos').update({ estado: nuevo, ...extra }).in('id', items.map(p => p.id))
    if (error) { toast(mensajeError(error), 'error'); return false }
    const motivo = extra.perdido_motivo ? ` (motivo: ${MOTIVOS_PERDIDO[extra.perdido_motivo]}${extra.perdido_detalle ? `, ${extra.perdido_detalle}` : ''})` : ''
    await supabase.from('interacciones').insert(items.map(p => ({ prospecto_id: p.id, tipo: 'cambio_estado', detalle: `${ESTADOS[p.estado]?.label ?? p.estado} → ${ESTADOS[nuevo].label}${motivo}` })))
    if (!silencioso) toast(items.length === 1 ? `${items[0].nombre}: ${ESTADOS[nuevo].label}` : `${items.length} pasaron a "${ESTADOS[nuevo].label}"`, 'ok', {
      deshacer: async () => {
        for (const a of antes) await supabase.from('prospectos').update({ estado: a.estado, perdido_motivo: a.perdido_motivo }).eq('id', a.id)
        window.dispatchEvent(new Event('prospectos-cambiaron'))
      },
    })
    return true
  }, [pedirMotivo, confirmar, toast])
}
