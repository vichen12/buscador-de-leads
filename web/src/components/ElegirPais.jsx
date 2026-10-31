import { useState } from 'react'
import { Globe2, Loader2, MapPin, Building2, Heart, Layers, Check } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { PAISES, REGIONES_PAIS, ZONA_HORARIA_PAIS } from '../lib/catalogo.js'
import { mensajeError } from '../lib/util.js'
import { useToast } from './ui.jsx'
import Logo from './Logo.jsx'

/** Campos de país y provincia/región (los usa el primer ingreso y Mi cuenta) */
export function CamposPais({ pais, region, onChange }) {
  const regiones = REGIONES_PAIS[pais] ?? []
  return (
    <div className="dos-col" style={{ gap: 12 }}>
      <label>País<select value={pais} onChange={e => onChange({ pais: e.target.value, region: '' })} required>
        <option value="">Elegí tu país</option>{PAISES.map(p => <option key={p.code} value={p.code}>{p.nombre}</option>)}
      </select></label>
      <label>{pais === 'AR' ? 'Provincia' : pais === 'MX' || pais === 'US' ? 'Estado' : 'Provincia o región'} <span className="muted">(opcional)</span>
        {regiones.length ? (
          <select value={region} onChange={e => onChange({ pais, region: e.target.value })} disabled={!pais}>
            <option value="">Todo el país</option>{regiones.map(r => <option key={r}>{r}</option>)}
          </select>
        ) : <input value={region} onChange={e => onChange({ pais, region: e.target.value })} disabled={!pais} maxLength={80} placeholder="Ej.: Lima" />}
      </label>
    </div>
  )
}

export async function guardarPais(perfilId, pais, region) {
  const datos = { pais, region: region || null }
  if (ZONA_HORARIA_PAIS[pais]) datos.zona_horaria = pais === 'AR' && region === 'Mendoza' ? 'America/Argentina/Mendoza' : ZONA_HORARIA_PAIS[pais]
  return supabase.from('perfiles').update(datos).eq('id', perfilId)
}

/** A quién vende la cuenta: empresas (B2B), consumidores (B2C) o los dos */
export const TIPOS_VENTA = [
  ['b2b', ['b2b'], Building2, 'Empresas', 'B2B · Buscás empresas, les escribís y seguís un pipeline.'],
  ['b2c', ['b2c'], Heart, 'Consumidores', 'B2C · Trabajás con tus clientes, campañas, aliados y creadores.'],
  ['ambos', ['b2b', 'b2c'], Layers, 'Los dos', 'Dos espacios separados; los cambiás arriba del menú.'],
]
export const tipoDe = modos => (modos?.length > 1 ? 'ambos' : modos?.[0] === 'b2c' ? 'b2c' : 'b2b')
export function SelectorTipoVenta({ valor, onChange, disabled }) {
  return (
    <div className="tipos-venta" role="radiogroup" aria-label="Tipo de venta">
      {TIPOS_VENTA.map(([k, , I, titulo, sub]) => (
        <button key={k} type="button" role="radio" aria-checked={valor === k} disabled={disabled} className={'tipo-venta ' + k + (valor === k ? ' on' : '')} onClick={() => onChange(k)}>
          <span className="tipo-venta-icono"><I size={18} /></span><b>{titulo}</b><small>{sub}</small>{valor === k && <Check size={15} className="tipo-venta-check" />}
        </button>
      ))}
    </div>
  )
}
export async function guardarTipoVenta(tipo) {
  const modos = TIPOS_VENTA.find(t => t[0] === tipo)?.[1] ?? ['b2b']
  return supabase.rpc('configurar_modos', { p_modos: modos, p_modo: modos[0] })
}
const puedeElegirTipo = p => !p?.empresa_id || p?.rol === 'admin' || p?.es_admin

/** Primer ingreso: antes de usar la app se elige desde qué país (y provincia) trabaja la cuenta */
export default function ElegirPais({ perfil, onListo }) {
  const toast = useToast()
  const [v, setV] = useState({ pais: '', region: '' })
  const [tipo, setTipo] = useState(tipoDe(perfil?.modos))
  const [guardando, setGuardando] = useState(false)
  const eligeTipo = puedeElegirTipo(perfil)
  async function guardar(e) {
    e.preventDefault()
    if (!v.pais) return
    setGuardando(true)
    const { error } = await guardarPais(perfil.id, v.pais, v.region)
    const r2 = !error && eligeTipo ? await guardarTipoVenta(tipo) : { error: null }
    setGuardando(false)
    if (error || r2.error) return toast(mensajeError(error || r2.error), 'error')
    onListo()
  }
  return (
    <div className="centro-pantalla">
      <form className="tarjeta elegir-pais" onSubmit={guardar}>
        <Logo size={24} />
        <h2>Configurá tu cuenta</h2>
        <p className="muted">Dos datos y arrancás. Los podés cambiar cuando quieras en Mi cuenta.</p>
        <div className="paso-config"><b><Globe2 size={16} /> ¿Desde dónde trabajás?</b><small className="muted">Te sugerimos zonas cerca tuyo, ajustamos el horario de los envíos y el tono de los mensajes.</small></div>
        <CamposPais pais={v.pais} region={v.region} onChange={setV} />
        {eligeTipo && <>
          <div className="paso-config"><b><Layers size={16} /> ¿A quién le vendés?</b><small className="muted">Cambia el menú y las herramientas que ves.</small></div>
          <SelectorTipoVenta valor={tipo} onChange={setTipo} />
        </>}
        <button className="btn primario ancho btn-grande" disabled={!v.pais || guardando}>{guardando ? <Loader2 size={16} className="spin" /> : <MapPin size={16} />} Empezar</button>
      </form>
    </div>
  )
}
