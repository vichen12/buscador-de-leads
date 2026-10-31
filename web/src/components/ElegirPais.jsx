import { useState, useEffect, useRef } from 'react'
import { Globe2, Loader2, MapPin, Building2, Heart, Layers, Check, ChevronDown } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { PAISES, GRUPOS_PAISES, REGIONES_PAIS, ZONA_HORARIA_PAIS } from '../lib/catalogo.js'
import Desplegable from './Desplegable.jsx'
import { mensajeError } from '../lib/util.js'
import { useToast } from './ui.jsx'
import Logo from './Logo.jsx'

/** Bandera de un país (imagen: en Windows los emojis de banderas se ven como letras) */
export function Bandera({ code }) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return <Globe2 size={15} className="muted" />
  return <img className="bandera" src={`https://flagcdn.com/w40/${code.toLowerCase()}.png`} alt="" width={20} height={14} loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
}

/** Campos de país y provincia/región (los usan el alta del super admin, el primer ingreso y Mi cuenta) */
export function CamposPais({ pais, region, otros = [], onChange, compacto }) {
  const regiones = REGIONES_PAIS[pais] ?? []
  const etiquetaRegion = pais === 'AR' ? 'Provincia' : pais === 'MX' || pais === 'US' || pais === 'BR' ? 'Estado' : pais === 'ES' ? 'Comunidad' : 'Región'
  const paises = PAISES
  const cambiarOtros = lista => onChange({ pais, region, otros: [...new Set(lista)].filter(c => c !== pais) })
  return (
    <div className={'campos-pais' + (compacto ? ' compacto' : '')}>
      <div className="campo">País
        <Desplegable className="ancho" ariaLabel="País" value={pais} placeholder="Elegí el país" anchoMenu={260}
          onChange={v => onChange({ pais: v, region: '', otros: otros.filter(x => x !== v) })}
          opciones={paises.map(p => ({ value: p.code, label: p.nombre, icono: <Bandera code={p.code} />, ayuda: p.code === 'AR' ? 'Provincias y ciudades' : p.grupo === 'Latinoamérica' ? '' : p.grupo }))} />
      </div>
      <div className="campo">{etiquetaRegion} <span className="muted">(opcional)</span>
        {regiones.length ? (
          <Desplegable className="ancho" ariaLabel={etiquetaRegion} value={region} disabled={!pais} anchoMenu={240}
            onChange={v => onChange({ pais, region: v, otros })}
            opciones={[{ value: '', label: 'Todo el país', icono: <Bandera code={pais} /> }, ...regiones.map(r => ({ value: r, label: r }))]} />
        ) : <input value={region} onChange={e => onChange({ pais, region: e.target.value, otros })} disabled={!pais} maxLength={80} placeholder={pais ? 'Ej.: capital' : 'Primero elegí el país'} />}
      </div>
      {pais && (
        <div className="otros-paises">
          <div className="otros-cab">¿Vende también en otros países? <span className="muted">(opcional)</span></div>
          <ListaPaises pais={pais} otros={otros} onChange={cambiarOtros} />
        </div>
      )}
    </div>
  )
}

/** Lista desplegable con casillas: toda Latinoamérica de una o sólo algunos países */
function ListaPaises({ pais, otros, onChange }) {
  const [abierta, setAbierta] = useState(false)
  const caja = useRef(null)
  useEffect(() => {
    if (!abierta) return
    const fuera = e => { if (!caja.current?.contains(e.target)) setAbierta(false) }
    const esc = e => { if (e.key === 'Escape') setAbierta(false) }
    document.addEventListener('mousedown', fuera); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc) }
  }, [abierta])
  const lista = PAISES.filter(p => p.code !== pais)
  const latam = lista.filter(p => p.grupo === 'Latinoamérica').map(p => p.code)
  const todaLatam = latam.length > 0 && latam.every(c => otros.includes(c))
  const nombres = lista.filter(p => otros.includes(p.code))
  const resumen = !nombres.length ? 'Sólo en ' + (PAISES.find(p => p.code === pais)?.nombre ?? 'su país')
    : todaLatam && nombres.length === latam.length ? 'Toda Latinoamérica'
    : nombres.length <= 3 ? nombres.map(p => p.nombre).join(', ') : `${nombres.slice(0, 2).map(p => p.nombre).join(', ')} y ${nombres.length - 2} más`
  return (
    <div className="lista-paises" ref={caja}>
      <button type="button" className={'lista-paises-boton' + (abierta ? ' abierta' : '')} aria-expanded={abierta} onClick={() => setAbierta(a => !a)}>
        <span className="lista-paises-banderas">{nombres.slice(0, 4).map(p => <Bandera key={p.code} code={p.code} />)}{!nombres.length && <Globe2 size={15} className="muted" />}</span>
        <span className="lista-paises-resumen">{resumen}</span>
        <ChevronDown size={15} className="muted" />
      </button>
      {abierta && (
        <div className="lista-paises-menu" role="listbox" aria-multiselectable="true">
          <label className="lista-paises-item destacado">
            <input type="checkbox" checked={todaLatam} onChange={() => onChange(todaLatam ? otros.filter(c => !latam.includes(c)) : [...otros, ...latam])} />
            <Globe2 size={15} /> Toda Latinoamérica
          </label>
          {GRUPOS_PAISES.map(g => (
            <div key={g}>
              <div className="lista-paises-grupo">{g}</div>
              {lista.filter(p => p.grupo === g).map(p => {
                const on = otros.includes(p.code)
                return (
                  <label key={p.code} className={'lista-paises-item' + (on ? ' on' : '')}>
                    <input type="checkbox" checked={on} onChange={() => onChange(on ? otros.filter(x => x !== p.code) : [...otros, p.code])} />
                    <Bandera code={p.code} /> {p.nombre}
                  </label>
                )
              })}
            </div>
          ))}
          <div className="lista-paises-pie">
            {otros.length > 0 ? <button type="button" className="link chico" onClick={() => onChange([])}>Ninguno</button> : <span />}
            <button type="button" className="btn chico" onClick={() => setAbierta(false)}>Listo</button>
          </div>
        </div>
      )}
    </div>
  )
}

export async function guardarPais(perfilId, pais, region, otros = []) {
  const datos = { pais, region: region || null, paises: otros.filter(x => x !== pais) }
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
  const [v, setV] = useState({ pais: '', region: '', otros: [] })
  const [tipo, setTipo] = useState(tipoDe(perfil?.modos))
  const [guardando, setGuardando] = useState(false)
  const eligeTipo = puedeElegirTipo(perfil)
  async function guardar(e) {
    e.preventDefault()
    if (!v.pais) return
    setGuardando(true)
    const { error } = await guardarPais(perfil.id, v.pais, v.region, v.otros)
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
        <CamposPais pais={v.pais} region={v.region} otros={v.otros} onChange={setV} />
        {eligeTipo && <>
          <div className="paso-config"><b><Layers size={16} /> ¿A quién le vendés?</b><small className="muted">Cambia el menú y las herramientas que ves.</small></div>
          <SelectorTipoVenta valor={tipo} onChange={setTipo} />
        </>}
        <button className="btn primario ancho btn-grande" disabled={!v.pais || guardando}>{guardando ? <Loader2 size={16} className="spin" /> : <MapPin size={16} />} Empezar</button>
      </form>
    </div>
  )
}
