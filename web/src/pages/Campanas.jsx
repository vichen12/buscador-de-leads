import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send, Plus, Sparkles, Loader2, Mail, MessageCircle, ShieldCheck, Check, Pause, Trash2, ArrowLeft, Users } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { fecha, mensajeError } from '../lib/util.js'
import { Esqueleto, ErrorCarga, Vacio, useToast, useConfirmar } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const TIPOS = {
  recompra: ['Recompra', 'Que vuelvan los que ya compraron'], reactivacion: ['Reactivación', 'Despertar a los que hace mucho no compran'],
  referidos: ['Referidos', 'Que te recomienden a amigos'], resena: ['Reseñas', 'Pedir que cuenten su experiencia'],
  cumpleanos: ['Cumpleaños', 'Saludo con un regalo'], novedad: ['Novedad', 'Contar algo nuevo'], promo: ['Promoción', 'Avisar una promo concreta'],
}
const SEGMENTOS = { todos: 'Todos los que aceptan', recompra: 'Compraron más de una vez', una_compra: 'Compraron una sola vez', dormidos: 'Dormidos (+90 días sin comprar)', cumpleanos: 'Cumplen años en los próximos 7 días', nuevos: 'Nuevos (últimos 30 días)' }
const SEG_POR_TIPO = { recompra: 'una_compra', reactivacion: 'dormidos', cumpleanos: 'cumpleanos', referidos: 'recompra', resena: 'todos', novedad: 'todos', promo: 'todos' }
const espera = ms => new Promise(r => setTimeout(r, ms))

function enSegmento(c, seg) {
  const hoy = new Date(), dias = d => (hoy - new Date(d)) / 864e5
  if (seg === 'recompra') return c.compras > 1
  if (seg === 'una_compra') return c.compras === 1
  if (seg === 'dormidos') return c.ultima_compra && dias(c.ultima_compra) > 90
  if (seg === 'nuevos') return dias(c.created_at) <= 30
  if (seg === 'cumpleanos') {
    if (!c.cumpleanos) return false
    const [, m, d] = c.cumpleanos.split('-').map(Number)
    for (let i = 0; i <= 7; i++) { const x = new Date(hoy); x.setDate(x.getDate() + i); if (x.getMonth() + 1 === m && x.getDate() === d) return true }
    return false
  }
  return true
}
const puede = (c, canal) => !c.baja_at && (canal === 'email' ? c.acepta_email && c.email : c.acepta_whatsapp && c.telefono)

export default function Campanas() {
  const [lista, setLista] = useState(null)
  const [error, setError] = useState(null)
  const [abierta, setAbierta] = useState(null)
  const cargar = async () => {
    setError(null)
    const { data, error } = await supabase.from('campanas').select('*, campana_envios(count)').order('created_at', { ascending: false })
    if (error) setError(error); else setLista(data)
  }
  useEffect(() => { cargar() }, [])
  if (abierta) return <EditorCampana inicial={abierta} onVolver={() => { setAbierta(null); cargar() }} />
  return (
    <>
      <header className="cabecera">
        <div><h1>Campañas</h1><p className="saludo">Mensajes a tus clientes para que vuelvan, te recomienden o te dejen una reseña. Sólo a quienes aceptaron recibirlos.</p></div>
        <div className="acciones"><button type="button" className="btn primario" onClick={() => setAbierta({ nombre: '', tipo: 'recompra', canal: 'email', segmento: 'una_compra', asunto: '', cuerpo: '' })}><Plus size={15} /> Nueva campaña</button></div>
      </header>
      {error ? <ErrorCarga error={error} onReintentar={cargar} /> : !lista ? <Esqueleto filas={4} /> : !lista.length ? (
        <Vacio icono={Send} titulo="Todavía no hiciste campañas" accion={<button className="btn primario" onClick={() => setAbierta({ nombre: '', tipo: 'recompra', canal: 'email', segmento: 'una_compra', asunto: '', cuerpo: '' })}><Plus size={15} /> Armar la primera</button>}>
          Elegí a quién (por ejemplo, los que compraron una sola vez), Claude escribe el mensaje y lo mandás. Sólo le llega a quien te dio permiso.
        </Vacio>
      ) : (
        <div className="grilla-campanas">
          {lista.map(c => (
            <button key={c.id} type="button" className="tarjeta campana" onClick={() => setAbierta(c)}>
              <div className="campana-cab">{c.canal === 'email' ? <Mail size={15} /> : <MessageCircle size={15} />}<b>{c.nombre}</b><span className={'chip ' + (c.estado === 'terminada' ? 'ok' : '')}>{c.estado === 'borrador' ? 'Borrador' : c.estado === 'enviando' ? 'Enviando' : 'Enviada'}</span></div>
              <small className="muted">{TIPOS[c.tipo]?.[0]} · {SEGMENTOS[c.segmento]}</small>
              <small className="muted">{c.campana_envios?.[0]?.count ?? 0} enviados · {fecha(c.created_at)}</small>
            </button>
          ))}
        </div>
      )}
    </>
  )
}

function EditorCampana({ inicial, onVolver }) {
  const { correo } = useApp()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [c, setC] = useState(inicial)
  const [clientes, setClientes] = useState(null)
  const [enviados, setEnviados] = useState(new Set())
  const [detalle, setDetalle] = useState('')
  const [escribiendo, setEscribiendo] = useState(false)
  const [enviando, setEnviando] = useState(null) // { hechos, total, errores }
  const frenar = useRef(false)
  const set = (k, v) => setC(x => ({ ...x, [k]: v }))

  useEffect(() => {
    supabase.from('clientes').select('*').limit(5000).then(({ data }) => setClientes(data ?? []))
    if (inicial.id) supabase.from('campana_envios').select('cliente_id').eq('campana_id', inicial.id).then(({ data }) => setEnviados(new Set((data ?? []).map(x => x.cliente_id))))
  }, [])

  const enSeg = useMemo(() => (clientes ?? []).filter(x => enSegmento(x, c.segmento)), [clientes, c.segmento])
  const destino = useMemo(() => enSeg.filter(x => puede(x, c.canal)), [enSeg, c.canal])
  const pendientes = destino.filter(x => !enviados.has(x.id))
  const sinPermiso = enSeg.length - destino.length

  async function guardar(extra = {}) {
    const fila = { nombre: c.nombre.trim() || `${TIPOS[c.tipo][0]} · ${new Date().toLocaleDateString('es-AR')}`, tipo: c.tipo, canal: c.canal, segmento: c.segmento, asunto: c.asunto, cuerpo: c.cuerpo, ...extra }
    const { data, error } = c.id ? await supabase.from('campanas').update(fila).eq('id', c.id).select().single() : await supabase.from('campanas').insert(fila).select().single()
    if (error) { toast(mensajeError(error), 'error'); return null }
    setC(x => ({ ...x, ...data })); return data
  }
  async function escribir() {
    setEscribiendo(true)
    try { const r = await llamarFuncion('generar-mensajes', { modo: 'b2c', tipo: 'campana', subtipo: c.tipo, canal: c.canal, detalle }); setC(x => ({ ...x, asunto: r.asunto || x.asunto, cuerpo: r.cuerpo })) }
    catch (e) { toast(e.message, 'error') }
    setEscribiendo(false)
  }

  async function enviarEmails() {
    if (!correo) return toast('Primero conectá tu email en Email.', 'error')
    if (!c.cuerpo.trim() || !c.asunto.trim()) return toast('Falta el asunto o el mensaje.', 'error')
    if (!(await confirmar({ titulo: `¿Mandar a ${pendientes.length} clientes?`, texto: 'Salen de a uno desde tu casilla, con unos segundos entre cada uno, y cuentan en tu límite diario. Cada mail lleva un link para darse de baja. Dejá esta pantalla abierta hasta que termine.', aceptar: 'Mandar' }))) return
    const camp = await guardar({ estado: 'enviando' }); if (!camp) return
    frenar.current = false
    let hechos = 0, errores = 0
    setEnviando({ hechos, total: pendientes.length, errores })
    for (const cl of pendientes) {
      if (frenar.current) break
      try {
        await llamarFuncion('correo', { modo: 'cliente', campana_id: camp.id, cliente_id: cl.id, asunto: c.asunto, cuerpo: c.cuerpo })
        hechos++; setEnviados(s => new Set(s).add(cl.id))
      } catch (e) {
        errores++
        if (/LIMITE_EMAIL|límite/i.test(e.message)) { toast('Llegaste al límite de emails de hoy: seguí mañana desde esta misma campaña.', 'info'); break }
        if (/SIN_CORREO|conectaste/i.test(e.message)) { toast(e.message, 'error'); break }
      }
      setEnviando({ hechos, total: pendientes.length, errores })
      await espera(4000 + Math.random() * 4000)
    }
    await guardar({ estado: frenar.current || hechos + errores < pendientes.length ? 'enviando' : 'terminada' })
    setEnviando(null)
    toast(`Listo: salieron ${hechos} emails${errores ? ` · ${errores} con problemas` : ''}.`, 'ok')
  }
  async function marcarWhatsApp(cl) {
    const camp = c.id ? c : await guardar({ estado: 'enviando' }); if (!camp) return
    const { error } = await supabase.from('campana_envios').insert({ campana_id: camp.id, cliente_id: cl.id, canal: 'whatsapp' })
    if (error && !/duplicate/.test(error.message)) return toast(mensajeError(error), 'error')
    setEnviados(s => new Set(s).add(cl.id))
  }
  async function borrar() {
    if (!(await confirmar({ titulo: '¿Borrar esta campaña?', aceptar: 'Borrar', peligro: true }))) return
    await supabase.from('campanas').delete().eq('id', c.id); onVolver()
  }
  const nombreDe = cl => String(cl.nombre ?? '').split(/\s+/)[0]
  const textoPara = cl => c.cuerpo.replace(/\{\{\s*nombre\s*\}\}/gi, nombreDe(cl))

  return (
    <>
      <button type="button" className="btn fantasma chico" onClick={onVolver} style={{ marginBottom: 8 }}><ArrowLeft size={14} /> Campañas</button>
      <header className="cabecera">
        <div><h1>{c.id ? c.nombre : 'Nueva campaña'}</h1><p className="saludo">{TIPOS[c.tipo][1]}.</p></div>
        <div className="acciones">{c.id && <button type="button" className="btn fantasma" onClick={borrar}><Trash2 size={15} /> Borrar</button>}<button type="button" className="btn" onClick={() => guardar().then(r => r && toast('Guardada', 'ok'))}>Guardar borrador</button></div>
      </header>

      <div className="dos-col">
        <section className="tarjeta">
          <h3 className="titulo-tarjeta">1. Qué y a quién</h3>
          <label>Nombre<input value={c.nombre} onChange={e => set('nombre', e.target.value)} placeholder={`${TIPOS[c.tipo][0]} de ${new Date().toLocaleDateString('es-AR', { month: 'long' })}`} /></label>
          <label>Objetivo<select value={c.tipo} onChange={e => { set('tipo', e.target.value); set('segmento', SEG_POR_TIPO[e.target.value]) }}>{Object.entries(TIPOS).map(([k, [l, d]]) => <option key={k} value={k}>{l}: {d}</option>)}</select></label>
          <label>A quién<select value={c.segmento} onChange={e => set('segmento', e.target.value)}>{Object.entries(SEGMENTOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <div className="chips-filtro" style={{ marginBottom: 12 }}>
            <button type="button" className={c.canal === 'email' ? 'activo' : ''} onClick={() => set('canal', 'email')}><Mail size={13} /> Email</button>
            <button type="button" className={c.canal === 'whatsapp' ? 'activo' : ''} onClick={() => set('canal', 'whatsapp')}><MessageCircle size={13} /> WhatsApp</button>
          </div>
          {clientes === null ? <Loader2 size={16} className="spin" /> : (
            <div className="resumen-destino">
              <div><Users size={16} /> <b>{destino.length}</b> clientes reciben esta campaña</div>
              {sinPermiso > 0 && <div className="muted chico"><ShieldCheck size={13} /> {sinPermiso} del grupo quedan afuera porque no aceptaron {c.canal === 'email' ? 'emails' : 'WhatsApp'} o se dieron de baja.</div>}
              {enviados.size > 0 && <div className="muted chico"><Check size={13} /> A {enviados.size} ya les salió.</div>}
            </div>
          )}
        </section>

        <section className="tarjeta">
          <h3 className="titulo-tarjeta">2. El mensaje</h3>
          <label>¿Algo concreto para contar u ofrecer? (opcional)<input value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Ej.: 15% en la segunda compra hasta el domingo" /></label>
          <button type="button" className="btn ia" onClick={escribir} disabled={escribiendo} style={{ marginBottom: 12 }}>{escribiendo ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />} {c.cuerpo ? 'Otra versión con Claude' : 'Que lo escriba Claude'}</button>
          {c.canal === 'email' && <label>Asunto<input value={c.asunto} onChange={e => set('asunto', e.target.value)} /></label>}
          <label>Mensaje <small>Usá {'{{nombre}}'} y se reemplaza por el nombre de cada cliente.</small><textarea rows={8} value={c.cuerpo} onChange={e => set('cuerpo', e.target.value)} /></label>
          {c.canal === 'email' && <p className="muted chico">Cada email lleva al pie un link para darse de baja. Si alguien lo usa, queda dado de baja en Mis clientes.</p>}
        </section>
      </div>

      <section className="tarjeta">
        <h3 className="titulo-tarjeta">3. Enviar</h3>
        {!destino.length ? <p className="muted">Nadie en este grupo aceptó recibir {c.canal === 'email' ? 'emails' : 'WhatsApp'}. Probá con otro grupo o pedí el permiso en <Link to="/clientes">Mis clientes</Link>.</p>
          : c.canal === 'email' ? (
            enviando ? (
              <div className="progreso-envio">
                <div className="cupo-barra"><span style={{ width: `${((enviando.hechos + enviando.errores) / Math.max(1, enviando.total)) * 100}%` }} /></div>
                <span>Enviando {enviando.hechos} de {enviando.total}{enviando.errores ? ` · ${enviando.errores} con problemas` : ''}…</span>
                <button type="button" className="btn chico" onClick={() => { frenar.current = true }}><Pause size={14} /> Frenar</button>
              </div>
            ) : <button type="button" className="btn primario" onClick={enviarEmails} disabled={!pendientes.length || !c.cuerpo.trim()}><Send size={15} /> {pendientes.length ? `Mandar a ${pendientes.length} clientes` : 'Ya les salió a todos'}</button>
          ) : (
            <>
              <p className="muted chico">WhatsApp se manda de a uno y lo mandás vos: tocá "Abrir" en cada cliente, se abre el chat con el mensaje listo, y queda marcado.</p>
              <div className="lista-wa">
                {destino.map(cl => {
                  const tel = String(cl.telefono_e164 || cl.telefono || '').replace(/\D/g, '')
                  const ya = enviados.has(cl.id)
                  return (
                    <div key={cl.id} className={'fila-wa' + (ya ? ' hecho' : '')}>
                      <span><b>{cl.nombre}</b> <small className="muted">{cl.telefono}</small></span>
                      {ya ? <span className="consent si"><Check size={11} /> Enviado</span>
                        : <a className="btn chico primario" href={`https://wa.me/${tel}?text=${encodeURIComponent(textoPara(cl))}`} target="_blank" rel="noreferrer" onClick={() => marcarWhatsApp(cl)}><MessageCircle size={13} /> Abrir</a>}
                    </div>
                  )
                })}
              </div>
            </>
          )}
      </section>
    </>
  )
}
