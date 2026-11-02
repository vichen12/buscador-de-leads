import { useEffect, useState } from 'react'
import { Target, Trophy, Flame, Loader2, Medal, Send, MessageCircle, CalendarCheck, Minus, Plus, Check } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { Avatar, Esqueleto, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'
import { inicioSemana } from './TuDia.jsx'

const TIPOS = [['envios', 'Envíos'], ['respuestas', 'Respuestas'], ['reuniones', 'Reuniones'], ['clientes', 'Clientes nuevos']]
const ICONOS = { envios: Send, respuestas: MessageCircle, reuniones: CalendarCheck, clientes: Trophy }
const PASO = { envios: 5, respuestas: 1, reuniones: 1, clientes: 1 }
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
  // Qué parte del período ya pasó (para el ritmo: "a este paso llegás a…")
  const ahora = new Date(), ini = new Date(desde)
  const finPeriodo = periodo === 'semana' ? new Date(ini.getTime() + 7 * 864e5) : new Date(ini.getFullYear(), ini.getMonth() + 1, 1)
  const avance = Math.min(1, Math.max(0.05, (ahora - ini) / (finPeriodo - ini)))
  const diasQuedan = Math.max(0, Math.ceil((finPeriodo - ahora) / 864e5))
  const cambiado = metas && Object.values(metas).some(v => v !== '')
  return (
    <div className="home metas-pag">
      <header className="home-cab">
        <div>
          <p className="home-fecha">{periodo === 'semana' ? `Esta semana · quedan ${diasQuedan} ${diasQuedan === 1 ? 'día' : 'días'}` : `Este mes · quedan ${diasQuedan} días`}</p>
          <h1>Metas</h1>
          <p className="home-sub">Ponete objetivos y mirá si vas a llegar. Si trabajás en equipo, abajo está el ranking.</p>
        </div>
        <div className="home-racha"><Flame size={16} /> <b>{racha}</b> {racha === 1 ? 'día seguido enviando' : 'días seguidos enviando'}</div>
      </header>
      <div className="rep-filtros">
        <div className="rep-pastillas">
          <button type="button" className={periodo === 'semana' ? 'on' : ''} onClick={() => setPeriodo('semana')}>Esta semana</button>
          <button type="button" className={periodo === 'mes' ? 'on' : ''} onClick={() => setPeriodo('mes')}>Este mes</button>
        </div>
      </div>
      {!metas ? <Esqueleto filas={4} /> : <>
        <div className="metas-tarjetas">
          {TIPOS.map(([k, label]) => {
            const Icono = ICONOS[k]
            const v = logros[k] ?? 0, obj = Number(metas[k]) || 0, pct = obj ? Math.min(100, (v / obj) * 100) : 0
            const ritmo = Math.round(v / avance)
            const estado = !obj ? 'sin' : v >= obj ? 'ok' : ritmo >= obj ? 'bien' : 'atras'
            return (
              <article key={k} className={'meta-card ' + estado}>
                <header><span className="meta-icono"><Icono size={16} /></span><h3>{label}</h3></header>
                <div className="meta-centro">
                  <Anillo pct={pct} ok={estado === 'ok'} />
                  <div className="meta-valor"><b>{v}</b>{obj > 0 && <small>de {obj}</small>}</div>
                </div>
                <p className="meta-estado">{
                  estado === 'sin' ? 'Sin objetivo todavía'
                    : estado === 'ok' ? <><Check size={14} /> ¡Cumplida!</>
                    : estado === 'bien' ? `Vas bien: a este ritmo llegás a ${ritmo}`
                    : `Te faltan ${obj - v}. A este ritmo llegás a ${ritmo}`}</p>
                <div className="meta-objetivo">
                  <small>Objetivo {periodo === 'semana' ? 'semanal' : 'mensual'}</small>
                  <div className="meta-stepper">
                    <button type="button" aria-label="Menos" onClick={() => setMetas(m => ({ ...m, [k]: Math.max(0, (Number(m[k]) || 0) - PASO[k]) || '' }))}><Minus size={14} /></button>
                    <input type="number" min="0" value={metas[k]} placeholder={String(SUGERIDO[periodo][k])} onChange={e => setMetas(m => ({ ...m, [k]: e.target.value }))} aria-label={`Objetivo de ${label}`} />
                    <button type="button" aria-label="Más" onClick={() => setMetas(m => ({ ...m, [k]: (Number(m[k]) || 0) + PASO[k] }))}><Plus size={14} /></button>
                  </div>
                  {!obj && <button type="button" className="link chico" onClick={() => setMetas(m => ({ ...m, [k]: SUGERIDO[periodo][k] }))}>Usar {SUGERIDO[periodo][k]} (sugerido)</button>}
                </div>
              </article>
            )
          })}
        </div>
        <div className="metas-guardar">
          <span className="muted chico">{cambiado ? 'Acordate de guardar los cambios.' : 'Elegí objetivos y guardalos.'}</span>
          <button type="button" className="btn primario" onClick={guardar} disabled={guardando}>{guardando ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Guardar metas</button>
        </div>

        {orden.length > 1 && (
          <section className="home-seccion">
            <h2 className="home-titulo"><Trophy size={13} style={{ verticalAlign: -2 }} /> Ranking del equipo</h2>
            <div className="ranking-lista">
              {orden.map((r, i) => (
                <div key={r.owner_id} className={'ranking-fila' + (r.owner_id === session.user.id ? ' yo' : '') + (i < 3 ? ' podio' : '')}>
                  <span className="ranking-pos">{i < 3 ? <Medal size={18} style={{ color: ['#d4a017', '#9ca3af', '#b45309'][i] }} /> : i + 1}</span>
                  <Avatar nombre={r.nombre} />
                  <b className="ranking-nombre">{r.nombre}{r.owner_id === session.user.id && <small> (vos)</small>}</b>
                  <span className="ranking-datos"><span>{r.envios} envíos</span><span>{r.respuestas} resp.</span><span>{r.reuniones} reun.</span><span>{r.clientes} clientes</span></span>
                  <span className="ranking-puntos">{puntos(r)}<small> pts</small></span>
                </div>
              ))}
            </div>
            <p className="muted chico" style={{ marginTop: 8 }}>Puntos: 1 por envío · 5 por respuesta · 15 por reunión · 40 por cliente.</p>
          </section>
        )}
      </>}
    </div>
  )
}

function Anillo({ pct, ok }) {
  const r = 34, c = 2 * Math.PI * r
  return (
    <svg className="anillo" width="84" height="84" viewBox="0 0 84 84" aria-hidden="true">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#f1ede7" strokeWidth="8" />
      <circle cx="42" cy="42" r={r} fill="none" stroke={ok ? '#15803d' : '#fd4a22'} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 42 42)" style={{ transition: 'stroke-dasharray .7s ease' }} />
    </svg>
  )
}
