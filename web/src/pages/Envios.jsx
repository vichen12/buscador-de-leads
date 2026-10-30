import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Search, Mail, Sparkles, Flame, ArrowRight, Wand2, Paperclip, PenLine } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fecha, mensajeError } from '../lib/util.js'
import { Avatar, EstadoBadge, Esqueleto, useToast } from '../components/ui.jsx'
import EnvioMasivo from '../components/EnvioMasivo.jsx'
import { useApp } from '../App.jsx'

const GRUPOS = [
  ['pendiente', 'Sin contactar'],
  ['contactado', 'Contactadas sin respuesta'],
  ['todas', 'Todas'],
]

/** Envío masivo: elegís a quién, Claude escribe un email distinto para cada empresa y salen todos juntos */
export default function Envios() {
  const { correo, perfil, tablero } = useApp()
  const toast = useToast()
  const [lista, setLista] = useState(null)
  const [grupo, setGrupo] = useState('pendiente')
  const [calif, setCalif] = useState(0)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(new Set())
  const [envio, setEnvio] = useState(null)

  async function cargar() {
    const { data, error } = await supabase.from('prospectos').select('id, nombre, rubro, zona, email, estado, calificacion, ultimo_contacto, puntaje').neq('estado', 'no_interesado').order('calificacion', { ascending: false, nullsFirst: false }).order('puntaje', { ascending: false, nullsFirst: false })
    if (error) toast(mensajeError(error), 'error')
    setLista(data ?? [])
  }
  useEffect(() => { cargar() }, [])

  const cupo = Math.max(0, (perfil?.limite_diario ?? 15) - (tablero?.enviados_hoy ?? 0))
  const filtradas = useMemo(() => {
    const t = q.toLowerCase().trim()
    return (lista ?? []).filter(p => (grupo === 'todas' || p.estado === grupo) && (!calif || (p.calificacion ?? 0) >= calif) &&
      (!t || [p.nombre, p.rubro, p.zona, p.email].join(' ').toLowerCase().includes(t)))
  }, [lista, grupo, calif, q])
  const conEmail = filtradas.filter(p => p.email)
  const sinEmail = filtradas.length - conEmail.length
  const todas = conEmail.length > 0 && conEmail.every(p => sel.has(p.id))
  const alternar = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  return (
    <div className="pagina-envios">
      <header className="cabecera">
        <div>
          <h1>Envío masivo</h1>
          <p>Elegí a qué empresas escribirles. Claude escribe un email distinto para cada una, con tu tono, tu estructura, tu firma y tus archivos. Los revisás y salen todos juntos desde tu casilla.</p>
        </div>
      </header>

      {!correo ? (
        <section className="tarjeta envios-sin-correo">
          <Mail size={26} />
          <div style={{ flex: 1 }}><h3>Primero conectá tu casilla</h3><p className="muted">Los emails salen desde tu propia cuenta (Private Email, Gmail, Zoho…).</p></div>
          <Link className="btn primario" to="/email">Conectar mi email <ArrowRight size={15} /></Link>
        </section>
      ) : (
        <div className="envios-config">
          <span><Mail size={14} /> Salen desde <b>{correo.email}</b></span>
          <Link to="/email"><Wand2 size={14} /> Tono y estructura</Link>
          <Link to="/email"><PenLine size={14} /> Firma</Link>
          <Link to="/email"><Paperclip size={14} /> Archivos</Link>
          <span className="espacio" />
          <span className="muted">Hoy te quedan <b>{cupo}</b> envíos</span>
        </div>
      )}

      <div className="barra-herramientas">
        <div className="tabs-revisar" role="tablist" style={{ margin: 0 }}>
          {GRUPOS.map(([k, l]) => <button key={k} className={grupo === k ? 'activo' : ''} onClick={() => { setGrupo(k); setSel(new Set()) }}>{l}</button>)}
        </div>
        <div className="calif-filtro" title="Cuánto te sirve">
          {[0, 1, 2, 3].map(n => <button key={n} className={calif === n ? 'on' : ''} onClick={() => setCalif(n)}>{n === 0 ? 'Todas' : <>{Array.from({ length: n }, (_, i) => <Flame key={i} size={13} />)}+</>}</button>)}
        </div>
        <div className="buscador"><Search size={16} /><input placeholder="Buscar empresa, tipo, zona…" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>

      {lista === null ? <Esqueleto filas={6} /> : (
        <div className="tarjeta sin-pad">
          <div className="envios-cab">
            <label className="sel-todos"><input type="checkbox" checked={todas} disabled={!conEmail.length} onChange={() => setSel(todas ? new Set() : new Set(conEmail.map(p => p.id)))} /> Seleccionar todas ({conEmail.length})</label>
            {sinEmail > 0 && <span className="muted chico">{sinEmail} sin email no se pueden incluir</span>}
          </div>
          {filtradas.length ? filtradas.map(p => (
            <label key={p.id} className={'envio-fila' + (sel.has(p.id) ? ' sel' : '') + (p.email ? '' : ' sin-email')}>
              <input type="checkbox" checked={sel.has(p.id)} disabled={!p.email} onChange={() => alternar(p.id)} />
              <Avatar nombre={p.nombre} />
              <div className="envio-fila-txt">
                <b>{p.nombre}</b>
                <small className="muted">{[p.rubro, p.zona].filter(Boolean).join(' · ')}</small>
              </div>
              <span className="envio-fila-email">{p.email || <span className="muted">Sin email</span>}</span>
              <span className="llamas">{[1, 2, 3].map(i => <Flame key={i} size={13} className={i <= (p.calificacion ?? 0) ? 'on' : ''} />)}</span>
              <EstadoBadge estado={p.estado} />
              <small className="muted envio-fila-fecha">{p.ultimo_contacto ? 'Último: ' + fecha(p.ultimo_contacto) : 'Nunca contactada'}</small>
            </label>
          )) : (
            <div className="muted centrado" style={{ padding: 40 }}>
              {lista.length ? 'No hay empresas con estos filtros.' : <>Todavía no tenés empresas en <Link to="/prospectos">Para contactar</Link>. <Link to="/buscar">Buscá clientes</Link> y sumalas desde Por revisar.</>}
            </div>
          )}
        </div>
      )}

      {sel.size > 0 && (
        <div className="barra-envio">
          <div>
            <b>{sel.size} {sel.size === 1 ? 'empresa' : 'empresas'}</b>
            <small className={sel.size > cupo ? 'no-txt' : 'muted'}>{sel.size > cupo ? `Hoy podés mandar ${cupo}: vas a poder elegir cuáles` : 'Cada una recibe un email escrito para ella'}</small>
          </div>
          <span className="espacio" />
          <button className="btn fantasma" onClick={() => setSel(new Set())}>Limpiar</button>
          <button className="btn ia grande" disabled={!correo} onClick={() => setEnvio((lista ?? []).filter(p => sel.has(p.id)))}><Sparkles size={17} /> Preparar {sel.size} emails personalizados</button>
        </div>
      )}

      {envio && <EnvioMasivo prospectos={envio} onCerrar={() => { setEnvio(null); cargar() }} onListo={() => { setSel(new Set()); cargar() }} />}
    </div>
  )
}
