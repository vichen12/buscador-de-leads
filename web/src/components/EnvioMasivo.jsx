import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X, Send, Loader2, Sparkles, CheckCircle2, AlertTriangle, ChevronDown, Paperclip, Mail } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { useArchivos } from '../lib/archivos.js'
import { useApp } from '../App.jsx'

/**
 * Emails personalizados para varias empresas a la vez: Claude escribe uno para cada una (con tu negocio,
 * tu firma y los archivos que convengan), los revisás de un vistazo y los mandás todos juntos desde tu casilla.
 */
export default function EnvioMasivo({ prospectos, onCerrar, onListo }) {
  const { session, correo, perfil, tablero, refrescar } = useApp()
  const arch = useArchivos(session?.user?.id)
  const [fase, setFase] = useState('preparando') // preparando | revisar | enviando | listo
  const [items, setItems] = useState([])
  const [abierto, setAbierto] = useState(null)
  const [error, setError] = useState('')
  const [progreso, setProgreso] = useState('')
  const [espera, setEspera] = useState(0)
  const [sinCopia, setSinCopia] = useState(0)
  const [total, setTotal] = useState(0)
  const [sinBorrador, setSinBorrador] = useState([])

  const [excluidos, setExcluidos] = useState([]) // [{ p, motivo }]
  const [conEmail, setConEmail] = useState([])
  const [pausaRebotes, setPausaRebotes] = useState(null) // { rebotes, enviados } si se pausó por rebotes
  const lim = tablero?.email
  const cupo = lim ? Math.max(0, lim.limite_hoy - lim.enviados_hoy) : Math.max(0, (perfil?.limite_diario ?? 15) - (tablero?.enviados_hoy ?? 0))

  /** Antes de escribir: verificar los emails y sacar a los que no se puede escribir (no contactar, inválidos) */
  async function filtrar() {
    const candidatos = prospectos.filter(p => p.email)
    const sinVerificar = candidatos.filter(p => !p.email_verificado_at).map(p => p.id)
    for (let i = 0; i < sinVerificar.length; i += 60) {
      setProgreso(`Verificando los emails (${Math.min(i + 60, sinVerificar.length)} de ${sinVerificar.length})…`)
      await llamarFuncion('verificar-email', { ids: sinVerificar.slice(i, i + 60) }).catch(() => {})
    }
    const ids = candidatos.map(p => p.id)
    const [{ data: frescos }, { data: sup }] = await Promise.all([
      supabase.from('prospectos').select('id, email, estado, email_estado, email_motivo').in('id', ids),
      supabase.from('supresion').select('email, dominio').limit(5000),
    ])
    const porId = Object.fromEntries((frescos ?? []).map(f => [f.id, f]))
    const emails = new Set((sup ?? []).filter(x => x.email).map(x => x.email)), dominios = new Set((sup ?? []).filter(x => x.dominio).map(x => x.dominio))
    const fuera = [], dentro = []
    for (const p0 of prospectos) {
      const p = { ...p0, ...(porId[p0.id] ?? {}) }
      const e = String(p.email ?? '').trim().toLowerCase()
      const motivo = !e ? 'sin email'
        : ['no_interesado', 'no_contactar'].includes(p.estado) ? 'pidió no ser contactada'
        : emails.has(e) || dominios.has(e.split('@')[1]) ? 'está en "No contactar"'
        : p.email_estado === 'invalido' ? `email inválido (${(p.email_motivo || '').toLowerCase() || 'no recibe correo'})` : ''
      if (motivo) fuera.push({ p, motivo }); else dentro.push(p)
    }
    setExcluidos(fuera); setConEmail(dentro)
    return dentro
  }

  async function preparar() {
    setError('')
    try {
      const lista = await filtrar()
      const ids = lista.map(p => p.id)
      const { data: previos } = await supabase.from('mensajes').select('prospecto_id, enviado_at, editado').in('prospecto_id', ids).eq('tipo', 'email')
      const yaEnviados = new Set((previos ?? []).filter(m => m.enviado_at).map(m => m.prospecto_id))
      const aEscribir = ids.filter(id => !yaEnviados.has(id))
      // Cada email se escribe de nuevo con tu configuración actual (tono, estructura, firma, archivos); los que editaste a mano se respetan
      for (let i = 0; i < aEscribir.length; i += 4) {
        setProgreso(`Claude está escribiendo ${Math.min(i + 4, aEscribir.length)} de ${aEscribir.length} emails personalizados…`)
        await llamarFuncion('generar-mensajes', { prospecto_ids: aEscribir.slice(i, i + 4), solo_email: true })
      }
      const { data: ms } = await supabase.from('mensajes').select('*').in('prospecto_id', ids).eq('tipo', 'email')
      const porId = Object.fromEntries((ms ?? []).filter(m => m.cuerpo?.trim()).map(m => [m.prospecto_id, m]))
      setSinBorrador(lista.filter(p => !porId[p.id]))
      setItems(lista.filter(p => porId[p.id]).map((p, i) => {
        const m = porId[p.id]
        return { p, m, asunto: m.asunto, cuerpo: m.cuerpo, adjuntos: m.adjuntos ?? [], incluir: i < cupo && !m.enviado_at, estado: m.enviado_at ? 'ya' : 'listo', error: '' }
      }))
      setFase('revisar')
    } catch (e) { setError(mensajeError(e)) }
    setProgreso('')
  }
  useEffect(() => { preparar() }, [])

  const cambiar = (id, cambio) => setItems(l => l.map(x => x.p.id === id ? { ...x, ...cambio } : x))
  const elegidos = items.filter(x => x.incluir && x.estado === 'listo')
  const pasaCupo = elegidos.length > cupo

  async function enviar(ignorarRebotes = false) {
    const lote = items.filter(x => x.incluir && x.estado === 'listo')
    setFase('enviando'); setPausaRebotes(null); setTotal(t => ignorarRebotes ? t : lote.length)
    let enviados = items.filter(x => x.estado === 'ok').length, faltaCopia = sinCopia
    const enviadosIds = items.filter(x => x.estado === 'ok').map(x => x.p.id)
    const inicio = new Date().toISOString()
    for (const [n, it] of lote.entries()) {
      // Pausa aleatoria entre mails (45 a 120 s): una ráfaga de emails en frío seguidos es lo que más manda a spam
      if (n > 0 || enviados > 0) {
        const seg = 45 + Math.floor(Math.random() * 76)
        for (let t = seg; t > 0; t--) { setEspera(t); await new Promise(r => setTimeout(r, 1000)) }
        setEspera(0)
      }
      // Cada 5 envíos se revisa la casilla: si rebotan más del 5 %, se pausa solo
      if (!ignorarRebotes && enviadosIds.length >= 5 && enviadosIds.length % 5 === 0) {
        await llamarFuncion('correo', { modo: 'revisar' }).catch(() => {})
        const { data: reb } = await supabase.from('prospectos').select('id').in('id', enviadosIds).eq('email_estado', 'invalido').gte('email_verificado_at', inicio)
        const rebotes = reb?.length ?? 0
        if (rebotes / enviadosIds.length > 0.05) { setPausaRebotes({ rebotes, enviados: enviadosIds.length }); setFase('pausado'); refrescar(); return }
      }
      if (enviados >= cupo) { cambiar(it.p.id, { estado: 'error', error: 'Llegaste al límite de hoy' }); continue }
      cambiar(it.p.id, { estado: 'enviando' })
      try {
        if (it.asunto !== it.m.asunto || it.cuerpo !== it.m.cuerpo) {
          const { error } = await supabase.from('mensajes').update({ asunto: it.asunto, cuerpo: it.cuerpo, editado: true }).eq('id', it.m.id)
          if (error) throw error
        }
        const r = await llamarFuncion('correo', { modo: 'enviar', mensaje_id: it.m.id, adjuntos: it.adjuntos.filter(id => arch.adjuntos.some(a => a.id === id)) })
        if (r?.en_enviados === false) setSinCopia(++faltaCopia)
        enviados++; enviadosIds.push(it.p.id)
        cambiar(it.p.id, { estado: 'ok' })
      } catch (e) {
        const msg = mensajeError(e)
        cambiar(it.p.id, { estado: 'error', error: msg })
        if (/límite/i.test(msg)) break
      }
    }
    setFase('listo'); refrescar(); onListo?.()
  }

  const nombreArch = id => arch.adjuntos.find(a => a.id === id)?.nombre
  const ok = items.filter(x => x.estado === 'ok').length
  const fallaron = items.filter(x => x.estado === 'error').length

  return (
    <div className="modal-fondo" onMouseDown={e => e.target === e.currentTarget && fase !== 'enviando' && onCerrar()}>
      <div className="envio-masivo" role="dialog" aria-modal="true">
        <header>
          <div>
            <h2><Mail size={19} /> Enviar emails personalizados</h2>
            <p className="muted">{fase === 'preparando' ? 'Claude escribe un email distinto para cada empresa, con tu negocio, tu firma y los archivos que sumen.'
              : fase === 'listo' ? `Listo: ${ok} enviados${fallaron ? `, ${fallaron} con problemas` : ''}. ${sinCopia ? `Salieron bien, pero ${sinCopia} no se pudieron copiar a tu carpeta Enviados (quedan registrados acá).` : 'Están en tu carpeta Enviados'} y quedan registrados con el seguimiento agendado.`
                : `Salen desde ${correo?.email}. Revisalos y tocá enviar: cada uno es distinto.`}</p>
          </div>
          <button className="btn fantasma chico" onClick={onCerrar} disabled={fase === 'enviando'} aria-label="Cerrar"><X size={17} /></button>
        </header>

        <div className="envio-cuerpo">
          {fase === 'preparando' && (
            <div className="envio-preparando">{error ? <><AlertTriangle size={20} /><span>{error}</span><button className="btn" onClick={preparar}>Probar de nuevo</button></>
              : <><div className="pensando"><i /><i /><i /></div><span>{progreso || 'Preparando los emails…'}</span></>}</div>
          )}
          {fase !== 'preparando' && <>
            {excluidos.length > 0 && <div className="nota-info"><AlertTriangle size={15} /><span>{excluidos.length} {excluidos.length === 1 ? 'queda' : 'quedan'} afuera: {excluidos.map(x => `${x.p.nombre} (${x.motivo})`).join(', ')}.</span></div>}
            {pausaRebotes && <div className="nota-info aviso"><AlertTriangle size={15} /><span>Pausamos el envío: rebotaron {pausaRebotes.rebotes} de {pausaRebotes.enviados} mails (más del 5 %). Muchos rebotes dañan la reputación de tu casilla. Revisá esos emails antes de seguir.</span></div>}
            {lim && fase === 'revisar' && <div className="nota-info"><Mail size={15} /><span>Hoy: {lim.enviados_hoy} de {lim.limite_hoy} envíos{lim.calentando ? ` · tu casilla está en calentamiento (semana ${lim.etapa} de 3)` : ''}. Entre mail y mail hay una pausa de 45 segundos a 2 minutos para que no caigan en spam.</span></div>}
            {sinBorrador.length > 0 && fase === 'revisar' && <div className="nota-info aviso"><AlertTriangle size={15} /><span>Claude no pudo escribir el email de {sinBorrador.map(p => p.nombre).join(', ')}. <button type="button" className="link" onClick={() => { setFase('preparando'); preparar() }}>Probar de nuevo</button></span></div>}
            {pasaCupo && fase === 'revisar' && <div className="nota-info aviso"><AlertTriangle size={15} /><span>Hoy podés mandar {cupo} más (el límite de tu casilla). Destildá algunos o seguí mañana. <Link to="/email">Ver el límite</Link></span></div>}
            <div className="envio-lista">
              {items.map(it => {
                const ab = abierto === it.p.id
                return (
                  <article key={it.p.id} className={'envio-item ' + it.estado + (it.incluir ? '' : ' fuera')}>
                    <div className="envio-item-cab">
                      {fase === 'revisar' && it.estado === 'listo'
                        ? <input type="checkbox" checked={it.incluir} onChange={e => cambiar(it.p.id, { incluir: e.target.checked })} aria-label={'Incluir ' + it.p.nombre} />
                        : <span className="envio-estado">{it.estado === 'ok' ? <CheckCircle2 size={17} /> : it.estado === 'enviando' ? <Loader2 size={17} className="spin" /> : it.estado === 'error' ? <AlertTriangle size={17} /> : it.estado === 'ya' ? <CheckCircle2 size={17} /> : <Mail size={16} />}</span>}
                      <button type="button" className="envio-item-resumen" onClick={() => setAbierto(ab ? null : it.p.id)}>
                        <b>{it.p.nombre}</b>
                        <span className="muted">{it.p.email}</span>
                        <span className="envio-asunto">{it.asunto || '(sin asunto)'}</span>
                        {it.adjuntos.length > 0 && <span className="chip"><Paperclip size={11} /> {it.adjuntos.length}</span>}
                        {it.estado === 'ya' && <span className="chip">Ya enviado</span>}
                        {it.error && <span className="no-txt chico">{it.error}</span>}
                        <ChevronDown size={15} className="chev" style={{ transform: ab ? 'rotate(180deg)' : '' }} />
                      </button>
                    </div>
                    {ab && (
                      <div className="envio-item-editar">
                        <label>Asunto<input value={it.asunto} onChange={e => cambiar(it.p.id, { asunto: e.target.value })} disabled={fase !== 'revisar'} /></label>
                        <label>Mensaje<textarea rows={9} value={it.cuerpo} onChange={e => cambiar(it.p.id, { cuerpo: e.target.value })} disabled={fase !== 'revisar'} /></label>
                        {arch.adjuntos.length > 0 && (
                          <div className="adjuntar-lista">
                            {arch.adjuntos.map(a => {
                              const on = it.adjuntos.includes(a.id)
                              return <button key={a.id} type="button" className={'chip-subir' + (on ? ' on' : '')} disabled={fase !== 'revisar'}
                                onClick={() => cambiar(it.p.id, { adjuntos: on ? it.adjuntos.filter(x => x !== a.id) : [...it.adjuntos, a.id] })}>
                                {on ? <CheckCircle2 size={13} /> : <Paperclip size={13} />} {a.nombre}</button>
                            })}
                          </div>
                        )}
                        {arch.firmaUrl && <div className="envio-firma"><small className="muted">Al final va tu firma con imagen:</small><img src={arch.firmaUrl} alt="Imagen de tu firma" /></div>}
                      </div>
                    )}
                    {!ab && it.adjuntos.length > 0 && <div className="envio-adj muted chico"><Paperclip size={11} /> {it.adjuntos.map(nombreArch).filter(Boolean).join(', ')}</div>}
                  </article>
                )
              })}
            </div>
          </>}
        </div>

        <footer>
          {fase === 'revisar' && <>
            <span className="muted chico">{elegidos.length} de {items.length} seleccionados · hoy te quedan {cupo} envíos</span>
            <span className="espacio" />
            <button className="btn" onClick={onCerrar}>Cancelar</button>
            <button className="btn primario" onClick={() => enviar()} disabled={!elegidos.length || pasaCupo}><Send size={15} /> Enviar {elegidos.length} {elegidos.length === 1 ? 'email' : 'emails'}</button>
          </>}
          {fase === 'enviando' && <span className="muted"><Loader2 size={14} className="spin" style={{ verticalAlign: -2 }} /> {espera ? `Enviado ${items.filter(x => x.estado === 'ok').length} de ${total}. El próximo sale en ${espera >= 60 ? `${Math.floor(espera / 60)} min ${espera % 60} s` : `${espera} s`} (así no cae en spam)` : `Enviando ${Math.min(total, items.filter(x => x.estado === 'ok' || x.estado === 'error').length + 1)} de ${total}…`} No cierres esta ventana.</span>}
          {fase === 'listo' && <><span className="espacio" /><button className="btn primario" onClick={onCerrar}>Listo</button></>}
          {fase === 'pausado' && <><span className="muted chico">Quedan {items.filter(x => x.incluir && x.estado === 'listo').length} sin enviar</span><span className="espacio" /><button className="btn" onClick={() => { setFase('listo'); onListo?.() }}>Terminar acá</button><button className="btn primario" onClick={() => enviar(true)}>Seguir igual</button></>}
          {fase === 'preparando' && <><span className="muted chico"><Sparkles size={13} style={{ verticalAlign: -2 }} /> Usa tu negocio, tu firma y tus archivos de la sección Email</span><span className="espacio" /><button className="btn" onClick={onCerrar}>Cancelar</button></>}
        </footer>
      </div>
    </div>
  )
}
