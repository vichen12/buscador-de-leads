import { useEffect, useState } from 'react'
import { Target, Trophy, Flame, Loader2, Medal } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { Avatar, Esqueleto, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'
import { inicioSemana } from './TuDia.jsx'

const TIPOS = [['envios', 'Envíos'], ['respuestas', 'Respuestas'], ['reuniones', 'Reuniones'], ['clientes', 'Clientes nuevos']]
const SUGERIDO = { semana: { envios: 75, respuestas: 6, reuniones: 2, clientes: 1 }, mes: { envios: 300, respuestas: 24, reuniones: 8, clientes: 3 } }
const inicioMes = () => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.toISOString() }

export default function Metas() {
  const { session } = useApp()
  const toast = useToast()
  const [periodo, setPeriodo] = useState('semana')
  const [metas, setMetas] = useState(null)
  const [logros, setLogros] = useState({})
  const [ranking, setRanking] = useState(null)
  const [racha, setRacha] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const desde = periodo === 'semana' ? inicioSemana() : inicioMes()

  useEffect(() => {
    setMetas(null)
    Promise.all([
      supabase.from('metas').select('*').eq('owner_id', session.user.id).eq('periodo', periodo),
      supabase.rpc('logros', { p_owner: session.user.id, p_desde: desde }),
      supabase.rpc('ranking_equipo', { p_desde: desde }),
      supabase.rpc('mi_racha'),
    ]).then(([m, l, r, ra]) => {
      setMetas(Object.fromEntries(TIPOS.map(([k]) => [k, m.data?.find(x => x.tipo === k)?.objetivo ?? ''])))
      setLogros(l.data ?? {}); setRanking(r.data ?? []); setRacha(ra.data ?? 0)
    })
  }, [periodo])

  async function guardar() {
    setGuardando(true)
    const filas = TIPOS.filter(([k]) => Number(metas[k]) > 0).map(([k]) => ({ owner_id: session.user.id, tipo: k, periodo, objetivo: Number(metas[k]) }))
    const vacias = TIPOS.filter(([k]) => !(Number(metas[k]) > 0)).map(([k]) => k)
    const { error } = filas.length ? await supabase.from('metas').upsert(filas, { onConflict: 'owner_id,tipo,periodo' }) : { error: null }
    if (vacias.length) await supabase.from('metas').delete().eq('owner_id', session.user.id).eq('periodo', periodo).in('tipo', vacias)
    setGuardando(false)
    if (error) toast(mensajeError(error), 'error'); else toast('Metas guardadas', 'ok')
  }

  const puntos = r => r.envios + r.respuestas * 5 + r.reuniones * 15 + r.clientes * 40
  const orden = [...(ranking ?? [])].sort((a, b) => puntos(b) - puntos(a))
  return (
    <>
      <header className="cabecera">
        <div><h1>Metas</h1><p className="saludo">Ponete objetivos y seguí cómo vas. Si trabajás en equipo, ves el ranking.</p></div>
        <div className="racha"><Flame size={18} /> <b>{racha}</b> {racha === 1 ? 'día' : 'días'} seguidos enviando</div>
      </header>
      <div className="chips-filtro" style={{ marginBottom: 14 }}>
        <button type="button" className={periodo === 'semana' ? 'activo' : ''} onClick={() => setPeriodo('semana')}>Esta semana</button>
        <button type="button" className={periodo === 'mes' ? 'activo' : ''} onClick={() => setPeriodo('mes')}>Este mes</button>
      </div>
      {!metas ? <Esqueleto filas={4} /> : <>
        <section className="tarjeta">
          <h3 className="titulo-tarjeta"><Target size={16} /> Tus metas {periodo === 'semana' ? 'de la semana' : 'del mes'}</h3>
          <div className="metas-editor">
            {TIPOS.map(([k, label]) => {
              const v = logros[k] ?? 0, obj = Number(metas[k]) || 0, pct = obj ? Math.min(100, (v / obj) * 100) : 0
              return (
                <div key={k} className="meta">
                  <div className="cupo-top"><span>{label}</span><b>{v}{obj ? ` / ${obj}` : ''}</b></div>
                  <div className="cupo-barra"><span style={{ width: pct + '%', background: pct >= 100 ? 'var(--ok)' : undefined }} /></div>
                  <label className="chico">Objetivo<input type="number" min="0" value={metas[k]} placeholder={`Ej.: ${SUGERIDO[periodo][k]}`} onChange={e => setMetas(m => ({ ...m, [k]: e.target.value }))} /></label>
                  {pct >= 100 && <small style={{ color: 'var(--ok)', fontWeight: 600 }}>¡Cumplida! 🎉</small>}
                </div>
              )
            })}
          </div>
          <button type="button" className="btn primario" onClick={guardar} disabled={guardando}>{guardando && <Loader2 size={15} className="spin" />} Guardar metas</button>
        </section>
        {orden.length > 1 && (
          <section className="tarjeta sin-pad">
            <div className="tarjeta-titulo" style={{ padding: '18px 22px 0' }}><h3><Trophy size={16} /> Ranking del equipo</h3><small className="muted">1 punto por envío · 5 por respuesta · 15 por reunión · 40 por cliente</small></div>
            <div className="scroll-x"><table className="tabla">
              <thead><tr><th>#</th><th>Persona</th><th>Envíos</th><th>Respuestas</th><th>Reuniones</th><th>Clientes</th><th>Puntos</th></tr></thead>
              <tbody>{orden.map((r, i) => (
                <tr key={r.owner_id} className={r.owner_id === session.user.id ? 'seleccionada' : ''}>
                  <td>{i < 3 ? <Medal size={16} style={{ color: ['#d4a017', '#9ca3af', '#b45309'][i] }} /> : i + 1}</td>
                  <td><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Avatar nombre={r.nombre} /><b>{r.nombre}</b></div></td>
                  <td>{r.envios}</td><td>{r.respuestas}</td><td>{r.reuniones}</td><td>{r.clientes}</td><td className="fuerte">{puntos(r)}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
        )}
      </>}
    </>
  )
}
