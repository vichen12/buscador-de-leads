import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Inbox, Reply, Loader2, Send, Sparkles, MailOpen, ChevronDown, ExternalLink } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { fechaHora, mensajeError } from '../lib/util.js'
import { Avatar, Cargando, ErrorCarga, Vacio, EstadoBadge, useToast, useConfirmar } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

export const CLASES = {
  interesado: ['Interesado', '#15803d', '#e9f7ee'], pide_info: ['Pide info o precio', '#1d4ed8', '#ebf1ff'], reunion: ['Quiere reunión', '#7c3aed', '#f1ebff'],
  no_interesado: ['No interesado', '#c0262d', '#fdeceb'], derivar: ['Deriva a otra persona', '#b45309', '#fdf4e4'], fuera_oficina: ['Fuera de la oficina', '#52525b', '#f0ece5'],
  baja: ['Pidió la baja', '#7f1d1d', '#f6e9e9'], otro: ['Otra respuesta', '#52525b', '#f0ece5'],
}
export function ClaseChip({ c }) {
  const [label, color, fondo] = CLASES[c] ?? CLASES.otro
  return <span className="chip" style={{ color, background: fondo, borderColor: 'transparent' }}>{label}</span>
}

/** Bandeja con todo lo que respondieron las empresas, clasificado por Claude */
export default function Respuestas() {
  const { correo, refrescar } = useApp()
  const [params, setParams] = useSearchParams()
  const filtro = params.get('clase') || ''
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [abierta, setAbierta] = useState(params.get('id') || null)

  const cargar = useCallback(async () => {
    setError('')
    let q = supabase.from('respuestas').select('*, prospectos(id, nombre, rubro, estado, email)').order('recibida_at', { ascending: false }).limit(300)
    if (filtro === 'sin_leer') q = q.eq('leida', false); else if (filtro) q = q.eq('clasificacion', filtro)
    const { data, error } = await q
    if (error) { setError(mensajeError(error)); setLista([]) } else setLista(data ?? [])
  }, [filtro])
  useEffect(() => { cargar() }, [cargar])

  async function abrir(r) {
    const nueva = abierta === r.id ? null : r.id
    setAbierta(nueva)
    if (nueva && !r.leida) {
      await supabase.from('respuestas').update({ leida: true }).eq('id', r.id)
      setLista(l => l.map(x => x.id === r.id ? { ...x, leida: true } : x)); refrescar()
    }
  }

  const sinLeer = (lista ?? []).filter(r => !r.leida).length
  return (
    <>
      <header className="cabecera">
        <div><h1>Respuestas</h1><p>Todo lo que te respondieron por mail, de lo más nuevo a lo más viejo. Claude lo clasifica y cambia el estado de la empresa solo.</p></div>
      </header>
      <div className="chips-sel filtros-respuestas">
        <button className={'chip-sel' + (!filtro ? ' on' : '')} onClick={() => setParams({})}>Todas</button>
        <button className={'chip-sel' + (filtro === 'sin_leer' ? ' on' : '')} onClick={() => setParams({ clase: 'sin_leer' })}>Sin leer{sinLeer && !filtro ? ` (${sinLeer})` : ''}</button>
        {Object.entries(CLASES).filter(([k]) => k !== 'otro').map(([k, [l]]) => <button key={k} className={'chip-sel' + (filtro === k ? ' on' : '')} onClick={() => setParams({ clase: k })}>{l}</button>)}
      </div>
      {lista === null ? <Cargando /> : error ? <ErrorCarga error={error} onReintentar={cargar} /> : !lista.length ? (
        <section className="tarjeta"><Vacio icono={Inbox} titulo={filtro ? 'No hay respuestas con este filtro' : 'Todavía no te respondieron'}>
          {correo ? 'Revisamos tu casilla cada 10 minutos. Cuando una empresa te responda, aparece acá con lo que dijo y su clasificación.' : <>Para ver las respuestas acá, <Link to="/email">conectá tu email</Link>.</>}
        </Vacio></section>
      ) : (
        <section className="tarjeta lista-respuestas">
          {lista.map(r => <ItemRespuesta key={r.id} r={r} abierta={abierta === r.id} onAbrir={() => abrir(r)} onCambio={cargar} />)}
        </section>
      )}
    </>
  )
}

export function ItemRespuesta({ r, abierta, onAbrir, onCambio }) {
  const toast = useToast()
  const confirmar = useConfirmar()
  const { refrescar } = useApp()
  const [borrador, setBorrador] = useState(null)
  const [trabajando, setTrabajando] = useState('')
  const p = r.prospectos ?? {}
  const puedeResponder = !['baja', 'rebote', 'fuera_oficina'].includes(r.clasificacion) && !['no_contactar'].includes(p.estado)

  async function preparar() {
    setTrabajando('preparando')
    try { const x = await llamarFuncion('generar-mensajes', { modo: 'responder', respuesta_id: r.id }); setBorrador(x.mensaje) }
    catch (e) { toast(mensajeError(e), 'error') }
    setTrabajando('')
  }
  async function enviar() {
    if (!(await confirmar({ titulo: `¿Enviar la respuesta a ${p.email}?`, texto: 'Sale desde tu casilla, en el mismo hilo de la conversación.', aceptar: 'Enviar' }))) return
    setTrabajando('enviando')
    try {
      const { error } = await supabase.from('mensajes').update({ asunto: borrador.asunto, cuerpo: borrador.cuerpo, editado: true }).eq('id', borrador.id)
      if (error) throw error
      await llamarFuncion('correo', { modo: 'enviar', mensaje_id: borrador.id, adjuntos: [] })
      toast('Respuesta enviada'); setBorrador(null); onCambio(); refrescar()
    } catch (e) { toast(mensajeError(e), 'error') }
    setTrabajando('')
  }

  return (
    <article className={'respuesta' + (r.leida ? '' : ' sin-leer') + (abierta ? ' abierta' : '')}>
      <button type="button" className="respuesta-cab" onClick={onAbrir} aria-expanded={abierta}>
        {!r.leida && <span className="punto-nuevo" aria-label="Sin leer" />}
        <Avatar nombre={p.nombre || r.de} />
        <div className="respuesta-resumen">
          <div><b>{p.nombre || r.de}</b> <ClaseChip c={r.clasificacion} /></div>
          <span className="muted chico">{r.asunto || '(sin asunto)'} — {(r.datos?.resumen || r.texto || '').slice(0, 120)}</span>
        </div>
        <span className="muted chico nowrap">{fechaHora(r.recibida_at)}</span>
        <ChevronDown size={15} className="chev" style={{ transform: abierta ? 'rotate(180deg)' : '' }} />
      </button>
      {abierta && (
        <div className="respuesta-detalle">
          <div className="respuesta-meta">
            <span className="muted chico">De: {r.de}</span>
            {p.estado && <EstadoBadge estado={p.estado} />}
            {p.id && <Link to={`/prospectos/${p.id}`} className="link chico">Ver ficha <ExternalLink size={11} /></Link>}
          </div>
          {r.motivo && <p className="chico respuesta-motivo"><Sparkles size={12} /> {r.motivo}</p>}
          <div className="respuesta-texto">{r.texto || <span className="muted">(sin texto)</span>}</div>
          {r.datos?.contacto?.email && <p className="chico">Derivó a: <b>{[r.datos.contacto.nombre, r.datos.contacto.cargo].filter(Boolean).join(', ')}</b> ({r.datos.contacto.email}). Lo guardamos en los contactos de la empresa.</p>}
          {borrador ? (
            <div className="respuesta-borrador">
              <label>Asunto<input value={borrador.asunto} onChange={e => setBorrador({ ...borrador, asunto: e.target.value })} /></label>
              <label>Tu respuesta<textarea rows={8} value={borrador.cuerpo} onChange={e => setBorrador({ ...borrador, cuerpo: e.target.value })} /></label>
              {/\[COMPLETAR/.test(borrador.cuerpo) && <p className="chico texto-error">Hay datos para completar (marcados con [COMPLETAR]): Claude no los inventa.</p>}
              <div className="acciones">
                <button className="btn fantasma" onClick={() => setBorrador(null)}>Descartar</button>
                <button className="btn primario" onClick={enviar} disabled={trabajando === 'enviando' || /\[COMPLETAR/.test(borrador.cuerpo)}>{trabajando === 'enviando' ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Enviar respuesta</button>
              </div>
            </div>
          ) : puedeResponder && (
            <div className="acciones">
              <button className="btn ia" onClick={preparar} disabled={!!trabajando}>{trabajando === 'preparando' ? <Loader2 size={15} className="spin" /> : <Reply size={15} />} Responder</button>
              <a className="btn" href={`mailto:${r.de}?subject=${encodeURIComponent('Re: ' + (r.asunto || '').replace(/^(re:\s*)+/i, ''))}`}><MailOpen size={15} /> Responder desde mi mail</a>
            </div>
          )}
        </div>
      )}
    </article>
  )
}
