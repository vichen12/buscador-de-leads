import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapPin, Navigation, ChevronUp, ChevronDown, Check, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { hoyLocal, fecha } from '../lib/util.js'
import { Esqueleto, Vacio, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const RESULTADOS = { '': 'Sin resultado', atendieron: 'Me atendieron', no_estaba: 'No estaba quien buscaba', volver: 'Volver otro día', interesado: 'Interesado', no_interesado: 'No le interesa' }

/** Visitas del día con la ruta armada en Google Maps (gratis, sin claves) */
export default function Visitas() {
  const { session } = useApp()
  const toast = useToast()
  const [dia, setDia] = useState(hoyLocal())
  const [lista, setLista] = useState(null)
  const [proximas, setProximas] = useState([])
  const cargar = () => {
    supabase.from('visitas').select('*, prospectos(id, nombre, direccion, zona, telefono)').eq('owner_id', session.user.id).eq('fecha', dia).order('orden').order('created_at').then(({ data }) => setLista(data ?? []))
    supabase.from('visitas').select('fecha').eq('owner_id', session.user.id).gt('fecha', hoyLocal()).eq('hecha', false).order('fecha').limit(50).then(({ data }) => {
      const c = {}; for (const v of data ?? []) c[v.fecha] = (c[v.fecha] ?? 0) + 1; setProximas(Object.entries(c))
    })
  }
  useEffect(() => { setLista(null); cargar() }, [dia])

  async function mover(i, d) {
    const n = [...lista]; const j = i + d; if (j < 0 || j >= n.length) return
    ;[n[i], n[j]] = [n[j], n[i]]; setLista(n)
    await Promise.all(n.map((v, k) => supabase.from('visitas').update({ orden: k }).eq('id', v.id)))
  }
  async function resultado(v, r) {
    await supabase.from('visitas').update({ resultado: r, hecha: !!r }).eq('id', v.id)
    if (r) await supabase.from('interacciones').insert({ prospecto_id: v.prospecto_id, tipo: 'nota', detalle: `Visita del ${fecha(v.fecha)}: ${RESULTADOS[r]}` })
    cargar(); if (r) toast('Anotado en el historial de la empresa', 'ok')
  }
  const direccion = v => [v.prospectos?.direccion, v.prospectos?.zona].filter(Boolean).join(', ') || v.prospectos?.nombre
  const pendientes = (lista ?? []).filter(v => !v.hecha)
  const ruta = pendientes.length ? `https://www.google.com/maps/dir/${['Mi ubicación', ...pendientes.map(direccion)].map(encodeURIComponent).join('/')}` : ''

  return (
    <>
      <header className="cabecera">
        <div><h1>Visitas</h1><p className="saludo">Las empresas que vas a visitar en persona, en orden, con la ruta lista en Google Maps.</p></div>
        <div className="acciones">
          <input type="date" value={dia} onChange={e => setDia(e.target.value)} aria-label="Día" style={{ width: 160 }} />
          {ruta && <a className="btn primario" href={ruta} target="_blank" rel="noreferrer"><Navigation size={15} /> Abrir ruta ({pendientes.length})</a>}
        </div>
      </header>
      {proximas.length > 0 && <div className="chips-filtro" style={{ marginBottom: 12 }}><span className="muted chico">Próximas:</span>{proximas.map(([f, n]) => <button key={f} type="button" onClick={() => setDia(f)} className={f === dia ? 'activo' : ''}>{fecha(f)} · {n}</button>)}</div>}
      {!lista ? <Esqueleto filas={4} /> : !lista.length ? (
        <Vacio icono={MapPin} titulo={`No hay visitas para el ${fecha(dia)}`}>Agendá visitas desde la ficha de cada empresa (sección Visitas) y acá te armamos el recorrido.</Vacio>
      ) : (
        <ol className="lista-visitas">{lista.map((v, i) => (
          <li key={v.id} className={'tarjeta visita' + (v.hecha ? ' hecha' : '')}>
            <span className="paso-num">{v.hecha ? <Check size={13} /> : i + 1}</span>
            <div className="visita-datos"><Link to={`/prospectos/${v.prospecto_id}`} className="fuerte">{v.prospectos?.nombre}</Link><small className="muted">{direccion(v)}</small>{v.notas && <small>{v.notas}</small>}</div>
            <div className="visita-acciones">
              <a className="btn fantasma chico" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion(v))}`} target="_blank" rel="noreferrer" aria-label="Ver en el mapa"><MapPin size={14} /></a>
              {v.prospectos?.telefono && <a className="btn fantasma chico" href={`tel:${v.prospectos.telefono}`}>Llamar</a>}
              <button type="button" className="btn fantasma chico" onClick={() => mover(i, -1)} aria-label="Subir"><ChevronUp size={14} /></button>
              <button type="button" className="btn fantasma chico" onClick={() => mover(i, 1)} aria-label="Bajar"><ChevronDown size={14} /></button>
              <select value={v.resultado} onChange={e => resultado(v, e.target.value)} aria-label="Resultado">{Object.entries(RESULTADOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </div>
          </li>
        ))}</ol>
      )}
    </>
  )
}
