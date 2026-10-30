import { useCallback, useEffect, useRef, useState } from 'react'
import { Gauge, ShieldCheck, ShieldAlert, ShieldOff, Loader2, Plus, Trash2, Upload, RefreshCw, CheckCircle2, XCircle, ExternalLink, Flame } from 'lucide-react'
import Papa from 'papaparse'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError, fecha } from '../lib/util.js'
import { useToast, useConfirmar, Cargando, Vacio, ErrorCarga } from './ui.jsx'
import { useApp } from '../App.jsx'

/* ---------------- Límite de envíos y calentamiento ---------------- */
export function LimiteEnvios() {
  const { correo, refrescar } = useApp()
  const toast = useToast()
  const [lim, setLim] = useState(undefined)
  const [valor, setValor] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const cargar = useCallback(async () => {
    setError('')
    const { data, error } = await supabase.rpc('mi_limite_email')
    if (error) { setError(mensajeError(error)); setLim(null); return }
    setLim(data); setValor(String(data?.elegido ?? ''))
  }, [])
  useEffect(() => { if (correo) cargar(); else setLim(null) }, [correo?.owner_id, cargar])
  if (!correo) return null
  if (lim === undefined) return <section className="tarjeta"><Cargando /></section>
  if (error) return <section className="tarjeta"><ErrorCarga error={error} onReintentar={cargar} /></section>
  if (!lim) return null

  async function guardar() {
    setGuardando(true)
    const { data, error } = await supabase.rpc('guardar_limite_email', { p_limite: Number(valor) || null })
    setGuardando(false)
    if (error) { toast(mensajeError(error), 'error'); return }
    setLim(data); setValor(String(data.elegido)); toast('Límite guardado'); refrescar()
  }
  const pct = Math.min(100, (lim.enviados_hoy / Math.max(1, lim.limite_hoy)) * 100)
  return (
    <section className="tarjeta limite-envios">
      <div className="tarjeta-titulo"><h3><Gauge size={16} /> Límite de envíos por día</h3><span className="muted chico">{lim.proveedor}</span></div>
      <div className="limite-hoy">
        <b>Hoy: {lim.enviados_hoy} de {lim.limite_hoy} envíos</b>
        <div className="cupo-barra"><span style={{ width: pct + '%' }} /></div>
      </div>
      {lim.calentando ? (
        <div className="calentamiento">
          <Flame size={16} />
          <div>
            <b>Tu casilla está en calentamiento: semana {lim.etapa} de 3 ({lim.limite_calentamiento} por día).</b>
            <p className="muted chico">Las casillas nuevas tienen que arrancar de a poco para que los proveedores confíen en ellas: 20 por día la primera semana, 40 la segunda, 80 la tercera y después tu límite normal.{lim.proxima_etapa ? ` La próxima etapa arranca el ${fecha(lim.proxima_etapa)}.` : ''}</p>
            <div className="etapas">{[20, 40, 80, lim.elegido].map((n, i) => <span key={i} className={i + 1 === lim.etapa ? 'on' : i + 1 < lim.etapa ? 'hecha' : ''}>{i < 3 ? `Semana ${i + 1}` : 'Después'}<b>{n}</b></span>)}</div>
          </div>
        </div>
      ) : <p className="muted chico">Tu casilla ya terminó el calentamiento: podés usar tu límite completo.</p>}
      <div className="fila-limite">
        <label>Tu límite diario
          <input type="number" min={1} max={lim.maximo} value={valor} onChange={e => setValor(e.target.value)} />
        </label>
        <span className="muted chico">Máximo para {lim.proveedor}: {lim.maximo} por día. Podés bajarlo, no subirlo.</span>
        <button type="button" className="btn" onClick={guardar} disabled={guardando || Number(valor) === lim.elegido || !Number(valor)}>{guardando && <Loader2 size={14} className="spin" />} Guardar</button>
      </div>
    </section>
  )
}

/* ---------------- Salud del dominio ---------------- */
const AYUDA = {
  privateemail: { nombre: 'Private Email (Namecheap)', url: 'https://www.namecheap.com/support/knowledgebase/subcategory/2179/private-email-dns-settings/' },
  google: { nombre: 'Google Workspace', url: 'https://support.google.com/a/answer/10583557' },
  zoho: { nombre: 'Zoho Mail', url: 'https://www.zoho.com/mail/help/adminconsole/domain-verification.html' },
  hostinger: { nombre: 'Hostinger', url: 'https://support.hostinger.com/es/articles/4456413' },
  otro: { nombre: 'tu proveedor de correo', url: '' },
}
export function SaludDominio() {
  const { correo } = useApp()
  const [s, setS] = useState(undefined)
  const [error, setError] = useState('')
  const cargar = useCallback(async () => {
    setS(undefined); setError('')
    try { const r = await llamarFuncion('correo', { modo: 'salud' }); setS(r.salud) } catch (e) { setError(mensajeError(e)); setS(null) }
  }, [])
  useEffect(() => { if (correo) cargar() }, [correo?.owner_id, cargar])
  if (!correo) return <section className="tarjeta"><Vacio icono={ShieldCheck} titulo="Conectá tu casilla primero">Cuando conectes tu email, revisamos acá si tu dominio está bien configurado para que tus mails no caigan en spam.</Vacio></section>
  if (s === undefined) return <section className="tarjeta"><Cargando texto="Revisando tu dominio…" /></section>
  if (error) return <section className="tarjeta"><ErrorCarga error={error} onReintentar={cargar} /></section>
  if (s.gestionado) return <section className="tarjeta"><div className="salud-item ok"><CheckCircle2 size={18} /><div><b>Lo maneja tu proveedor</b><p className="muted chico">Tu casilla es de {s.dominio}: la configuración del dominio la hace el proveedor y ya está bien. No tenés que hacer nada.</p></div></div></section>
  const ayuda = AYUDA[s.proveedor] ?? AYUDA.otro
  const items = [
    { k: 'spf', ok: s.spf.ok, titulo: 'SPF', bien: 'Tu dominio dice qué servidores pueden mandar mails en su nombre.', mal: 'Falta el registro SPF: sin él, muchos proveedores desconfían de tus mails. Hay que agregar un registro TXT en el DNS de tu dominio (te lo da tu proveedor de correo).' },
    { k: 'dkim', ok: s.dkim.ok, titulo: 'DKIM (firma digital)', bien: 'Tus mails salen firmados: los proveedores pueden comprobar que son tuyos.', mal: 'No encontramos la firma DKIM. Activala en el panel de tu proveedor de correo y copiá el registro que te da en el DNS de tu dominio.' },
    { k: 'dmarc', ok: s.dmarc.ok, titulo: 'DMARC', bien: `Tu dominio tiene política DMARC${s.dmarc.politica ? ` (${s.dmarc.politica})` : ''}.`, mal: 'Falta DMARC. Es un registro TXT en "_dmarc" de tu dominio; para empezar alcanza con: v=DMARC1; p=none' },
  ]
  const todo = items.every(i => i.ok)
  return (
    <section className="tarjeta salud-dominio">
      <div className="tarjeta-titulo"><h3>{todo ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />} {s.dominio}</h3><button type="button" className="btn chico fantasma" onClick={cargar}><RefreshCw size={13} /> Volver a revisar</button></div>
      {items.map(i => (
        <div key={i.k} className={'salud-item ' + (i.ok ? 'ok' : 'mal')}>
          {i.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
          <div><b>{i.titulo}</b><p className="muted chico">{i.ok ? i.bien : i.mal}</p></div>
        </div>
      ))}
      {!todo && <p className="chico" style={{ marginBottom: 0 }}>¿Cómo se arregla? {ayuda.url ? <a href={ayuda.url} target="_blank" rel="noreferrer">Guía de {ayuda.nombre} <ExternalLink size={11} /></a> : 'Buscá "SPF DKIM DMARC" en la ayuda de tu proveedor de correo, o pasale esta pantalla a quien maneja tu dominio.'}</p>}
    </section>
  )
}

/* ---------------- No contactar (lista de supresión) ---------------- */
const ORIGEN = { manual: 'Agregado a mano', importado: 'Importado', link: 'Se dio de baja desde el mail', respuesta: 'Respondió pidiendo la baja' }
export function NoContactar() {
  const toast = useToast()
  const confirmar = useConfirmar()
  const [lista, setLista] = useState(undefined)
  const [error, setError] = useState('')
  const [nuevo, setNuevo] = useState('')
  const [q, setQ] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const archivo = useRef(null)
  const cargar = useCallback(async () => {
    setError('')
    const { data, error } = await supabase.from('supresion').select('*').order('created_at', { ascending: false }).limit(2000)
    if (error) { setError(mensajeError(error)); setLista(null) } else setLista(data)
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const fila = v => {
    const t = v.trim().toLowerCase()
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t)) return { email: t }
    const d = t.replace(/^(https?:\/\/)?(www\.)?@?/, '').split('/')[0]
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? { dominio: d } : null
  }
  async function agregar(valores, origen) {
    const filas = valores.map(fila).filter(Boolean).map(f => ({ ...f, origen, motivo: origen === 'importado' ? 'Importado' : 'Agregado a mano' }))
    if (!filas.length) { toast('Escribí un email (nombre@empresa.com) o un dominio (empresa.com)', 'error'); return 0 }
    setTrabajando(true)
    let n = 0
    for (let i = 0; i < filas.length; i += 200) {
      const lote = filas.slice(i, i + 200)
      const { error } = await supabase.from('supresion').insert(lote)
      if (!error) { n += lote.length; continue }
      for (const f of lote) { const { error: e } = await supabase.from('supresion').insert(f); if (!e) n++ } // salteando repetidos
    }
    setTrabajando(false); cargar()
    return n
  }
  async function alta(e) {
    e.preventDefault()
    const n = await agregar([nuevo], 'manual')
    if (n) { setNuevo(''); toast('Agregado a "No contactar". No se le va a poder escribir.') }
  }
  function importar(f) {
    if (!f) return
    Papa.parse(f, {
      complete: async r => {
        const valores = r.data.flat().map(String).filter(v => /@|\./.test(v))
        const n = await agregar(valores, 'importado')
        toast(n ? `Importamos ${n} a "No contactar"` : 'No encontramos emails ni dominios en el archivo', n ? 'ok' : 'error')
      },
      error: () => toast('No pude leer el archivo. Probá con un CSV o una lista de emails, uno por línea.', 'error'),
    })
  }
  async function quitar(s) {
    if (!(await confirmar({ titulo: `¿Sacar ${s.email || '@' + s.dominio} de "No contactar"?`, texto: 'Se va a poder volver a escribirle. Hacelo sólo si te lo pidió.', aceptar: 'Sacar' }))) return
    const { error } = await supabase.from('supresion').delete().eq('id', s.id)
    if (error) toast(mensajeError(error), 'error'); else { toast('Listo'); cargar() }
  }

  const visibles = (lista ?? []).filter(s => !q || (s.email || s.dominio || '').includes(q.toLowerCase()))
  return (
    <section className="tarjeta no-contactar">
      <p className="muted chico ayuda" style={{ marginTop: 0 }}>A nadie de esta lista se le puede enviar nada, ni de a uno ni en el envío masivo. Si alguien de una empresa (por ejemplo @empresa.com) pidió la baja, se bloquea todo el dominio. Los que piden la baja desde el mail o respondiendo "BAJA" se suman solos.</p>
      <form className="fila-agregar" onSubmit={alta}>
        <input value={nuevo} onChange={e => setNuevo(e.target.value)} placeholder="nombre@empresa.com o empresa.com" aria-label="Email o dominio para no contactar" />
        <button className="btn" disabled={!nuevo.trim() || trabajando}>{trabajando ? <Loader2 size={15} className="spin" /> : <Plus size={15} />} Agregar</button>
        <button type="button" className="btn" onClick={() => archivo.current?.click()} disabled={trabajando}><Upload size={15} /> Importar</button>
        <input ref={archivo} type="file" accept=".csv,.txt" hidden onChange={e => { importar(e.target.files?.[0]); e.target.value = '' }} />
      </form>
      {lista === undefined ? <Cargando /> : error ? <ErrorCarga error={error} onReintentar={cargar} /> : !lista.length ? (
        <Vacio icono={ShieldOff} titulo="Nadie pidió la baja todavía">Cuando alguien se dé de baja aparece acá. También podés agregar a mano a quien no quieras contactar (un cliente actual, la competencia).</Vacio>
      ) : (
        <>
          {lista.length > 8 && <input className="buscar-lista" value={q} onChange={e => setQ(e.target.value)} placeholder={`Buscar entre ${lista.length}…`} />}
          <ul className="lista-supresion">
            {visibles.slice(0, 300).map(s => (
              <li key={s.id}>
                <div><b>{s.email || `Todo @${s.dominio}`}</b><span className="muted chico">{ORIGEN[s.origen] ?? s.origen} · {fecha(s.created_at)}</span></div>
                {['manual', 'importado'].includes(s.origen)
                  ? <button type="button" className="btn chico fantasma" onClick={() => quitar(s)} aria-label="Sacar de la lista"><Trash2 size={14} /></button>
                  : <span className="chip" title="Pidió la baja: no se puede sacar">Baja</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
