import { useEffect, useState } from 'react'
import { Merge, Loader2, ArrowLeftRight, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { Modal, Cargando, Vacio, useToast } from './ui.jsx'

/**
 * Unir duplicados: lista los posibles duplicados (misma web, mismo teléfono o nombre casi igual en la misma zona)
 * o dos empresas elegidas a mano. La que queda se completa con los datos de la otra y se lleva contactos e historial.
 */
export default function Duplicados({ par, onCerrar, onListo }) {
  const toast = useToast()
  const [pares, setPares] = useState(par ? [par] : null)
  const [trabajando, setTrabajando] = useState('')
  const [invertidos, setInvertidos] = useState({})
  useEffect(() => {
    if (par) return
    supabase.rpc('posibles_duplicados').then(({ data, error }) => { if (error) toast(mensajeError(error), 'error'); setPares(data ?? []) })
  }, [])
  async function unir(x, i) {
    const [queda, sale] = invertidos[i] ? [x.b, x.a] : [x.a, x.b]
    setTrabajando(String(i))
    const { error } = await supabase.rpc('unir_prospectos', { p_queda: queda, p_sale: sale })
    setTrabajando('')
    if (error) { toast(mensajeError(error), 'error'); return }
    toast('Listo: quedó una sola, con los datos y el historial de las dos')
    setPares(p => p.filter((_, j) => j !== i)); onListo?.()
  }
  return (
    <Modal onCerrar={onCerrar} ancho={640}>
      <h2 style={{ marginTop: 0 }}><Merge size={19} /> Unir duplicados</h2>
      <p className="muted chico">La empresa de la izquierda queda y se completa con los datos de la otra (teléfono, email, web, redes). Se lleva sus contactos, tareas, respuestas e historial.</p>
      {pares === null ? <Cargando texto="Buscando duplicados…" /> : !pares.length ? <Vacio icono={CheckCircle2} titulo="No encontramos duplicados">Comparamos web, teléfono y nombre en la misma zona.</Vacio> : (
        <ul className="lista-duplicados">
          {pares.map((x, i) => {
            const inv = invertidos[i]
            return (
              <li key={x.a + x.b}>
                <div className="par"><b>{inv ? x.nombre_b : x.nombre_a}</b><button type="button" className="btn chico fantasma" onClick={() => setInvertidos(v => ({ ...v, [i]: !v[i] }))} title="Cambiar cuál queda"><ArrowLeftRight size={13} /></button><span className="muted">{inv ? x.nombre_a : x.nombre_b}</span></div>
                <span className="chip">{x.motivo}</span>
                <button className="btn chico primario" onClick={() => unir(x, i)} disabled={!!trabajando}>{trabajando === String(i) ? <Loader2 size={13} className="spin" /> : <Merge size={13} />} Unir</button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}
