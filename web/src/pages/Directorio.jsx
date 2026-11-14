import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Loader2, X, Globe, Mail, MessageCircle, AtSign, Building2, Users, Handshake, Plus, Check, Store, ArrowRight } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { Aviso, Esqueleto, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'
import { sumarComoAliado } from '../lib/aliados.js'

const VENDE_A = { empresas: 'Vende a empresas', personas: 'Vende a personas', ambos: 'Empresas y personas' }
const limpiar = t => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const wa = t => { const d = String(t ?? '').replace(/\D/g, ''); return d.length >= 8 ? `https://wa.me/${d}` : '' }

/**
 * Directorio: las empresas que usan Prospecta y publicaron su ficha. Se filtra al toque por texto,
 * a quién le venden y rubro; y con el filtro inteligente se escribe lo que buscás con tus palabras.
 */
export default function Directorio() {
  const toast = useToast()
  const { session, perfil, refrescar } = useApp()
  const b2c = perfil?.modo === 'b2c'
  const [fichas, setFichas] = useState(null)
  const [mia, setMia] = useState(undefined)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')
  const [vendeA, setVendeA] = useState('')
  const [rubro, setRubro] = useState('')
  const [inteligente, setInteligente] = useState(null) // { pedido, resultados: [{ id, por_que }] }
  const [pensando, setPensando] = useState(false)
  const [sumadas, setSumadas] = useState(new Set())

  useEffect(() => {
    supabase.from('directorio').select('*').eq('publicado', true).order('updated_at', { ascending: false }).limit(1000)
      .then(({ data, error }) => { if (error) setError(error); else setFichas(data ?? []) })
    supabase.from('directorio').select('id, publicado, nombre').eq('owner_id', session.user.id).maybeSingle().then(({ data }) => setMia(data ?? null))
  }, [])

  const rubros = useMemo(() => [...new Set((fichas ?? []).map(f => f.rubro).filter(Boolean))].sort(), [fichas])
  const porQue = useMemo(() => new Map((inteligente?.resultados ?? []).map(r => [r.id, r.por_que])), [inteligente])
  const visibles = useMemo(() => {
    let l = fichas ?? []
    if (inteligente) l = inteligente.resultados.map(r => l.find(f => f.id === r.id)).filter(Boolean)
    const t = limpiar(q)
    return l.filter(f =>
      (!vendeA || f.vende_a === vendeA || f.vende_a === 'ambos') && (!rubro || f.rubro === rubro) &&
      (!t || limpiar([f.nombre, f.rubro, f.zona, f.que_hace, f.busca].join(' ')).includes(t)))
  }, [fichas, q, vendeA, rubro, inteligente])

  async function buscarInteligente(e) {
    e?.preventDefault()
    const pedido = q.trim()
    if (pedido.length < 3) return toast('Escribí qué tipo de empresa buscás.', 'info')
    setPensando(true)
    try {
      const r = await llamarFuncion('directorio', { pedido })
      setInteligente({ pedido, resultados: r.resultados ?? [] }); setQ('')
      refrescar()
    } catch (err) { toast(mensajeError(err), 'error') }
    setPensando(false)
  }

  // B2B: pasa a tu lista de empresas. B2C: pasa a tus aliados.
  async function sumar(f) {
    try {
      if (b2c) await sumarComoAliado({ nombre: f.nombre, rubro: f.rubro, zona: f.zona, email: f.email, telefono: f.telefono, web: f.web, instagram: f.instagram, descripcion: f.que_hace })
      else {
        const { error } = await supabase.from('prospectos').insert({
          owner_id: session.user.id, nombre: f.nombre, rubro: f.rubro || null, zona: f.zona || null, email: f.email || null, telefono: f.telefono || null,
          web_actual: f.web || null, instagram: f.instagram || null, fuente: 'directorio', notas: [f.que_hace, f.busca && `Busca: ${f.busca}`].filter(Boolean).join('\n\n'),
        })
        if (error) throw error
      }
      setSumadas(s => new Set(s).add(f.id))
      toast(b2c ? `${f.nombre} quedó en tus aliados` : `${f.nombre} quedó en tu lista`, 'ok')
    } catch (err) { toast(/duplicate|unique|ya existe/i.test(err.message) ? 'Ya la tenías.' : mensajeError(err), 'error') }
  }

  return (
    <>
      <section className="bh">
        <div className="bh-cab">
          <div className="bh-titulos">
            <span className="bh-eyebrow">Dentro de Prospecta</span>
            <h1>Directorio de empresas.</h1>
            <p>Empresas que usan Prospecta y publicaron su ficha: clientes, proveedores o aliados posibles.</p>
          </div>
          <Link to="/directorio/mi-empresa" className="bh-creditos">
            <Store size={17} /> {mia?.publicado ? 'Tu empresa está publicada' : mia ? 'Tu ficha no está publicada' : 'Sumá tu empresa'}
          </Link>
        </div>

        <form className="bh-barra" onSubmit={buscarInteligente}>
          <Sparkles size={22} className="bh-chispa" aria-hidden="true" />
          <div className="bh-input"><input value={q} onChange={e => setQ(e.target.value)} placeholder="Ej.: logística que trabaje con supermercados, diseño web en Córdoba…" aria-label="Qué empresa buscás" maxLength={300} /></div>
          {q && <button type="button" className="bh-limpiar" onClick={() => setQ('')} aria-label="Borrar"><X size={15} /></button>}
          <button className="btn bh-boton" disabled={pensando} title="Filtro inteligente: Claude lee las fichas y elige las que encajan (usa 1 crédito)">
            {pensando ? <Loader2 size={19} className="spin" /> : <Sparkles size={19} />} {pensando ? 'Pensando…' : 'Filtro inteligente'}
          </button>
        </form>
        <div className="bh-opciones">
          <span className="muted chico">Escribí y filtra al toque. Con <b>Filtro inteligente</b> entiende lo que pedís con tus palabras (usa 1 crédito).</span>
          <span className="espacio" />
        </div>
        <div className="bh-activos">
          {Object.entries({ '': 'Todas', empresas: 'Venden a empresas', personas: 'Venden a personas' }).map(([k, l]) => (
            <button key={k} type="button" className={'filtro-chip' + (vendeA === k ? ' on' : '')} onClick={() => setVendeA(k)}>{vendeA === k && <Check size={12} />} {l}</button>
          ))}
          {rubros.slice(0, 12).map(r => (
            <button key={r} type="button" className={'filtro-chip' + (rubro === r ? ' on' : '')} onClick={() => setRubro(rubro === r ? '' : r)}>{rubro === r && <Check size={12} />} {r}</button>
          ))}
        </div>
      </section>

      {mia === null && (
        <div className="aviso-negocio">
          <Store size={22} />
          <div style={{ flex: 1 }}><b>Sumá tu empresa al directorio</b><p>Así te encuentran otras empresas que usan Prospecta: clientes, proveedores o aliados.</p></div>
          <Link className="btn primario" to="/directorio/mi-empresa">Publicar mi empresa <ArrowRight size={15} /></Link>
        </div>
      )}

      {inteligente && (
        <div className="ayuda-revisar">
          <Sparkles size={15} />
          <span>Filtro inteligente: «{inteligente.pedido}» · {inteligente.resultados.length ? `${inteligente.resultados.length} encajan` : 'ninguna ficha encaja todavía'}</span>
          <span className="espacio" />
          <button type="button" className="btn fantasma chico" onClick={() => setInteligente(null)}><X size={13} /> Ver todas</button>
        </div>
      )}

      {error ? <Aviso tipo="error">{mensajeError(error)}</Aviso> : !fichas ? <Esqueleto filas={4} /> : visibles.length === 0 ? (
        <div className="tarjeta vacio">
          <div className="icono-grande"><Building2 size={26} /></div>
          <h3>{fichas.length ? 'Ninguna empresa coincide' : 'Todavía no hay empresas publicadas'}</h3>
          <p>{fichas.length ? 'Probá con otras palabras o sacá algún filtro.' : 'Sé la primera: publicá tu empresa y aparecé acá para el resto.'}</p>
        </div>
      ) : (
        <div className="dir-grid">
          {visibles.map(f => {
            const propia = f.owner_id === session.user.id
            return (
              <article key={f.id} className="dir-ficha">
                <div className="dir-cab">
                  <span className="dir-logo" aria-hidden="true">{f.nombre.charAt(0).toUpperCase()}</span>
                  <div style={{ minWidth: 0 }}>
                    <h3>{f.nombre}{propia && <span className="etiqueta-libre">Tu empresa</span>}</h3>
                    <small>{[f.rubro, f.zona].filter(Boolean).join(' · ') || 'Sin rubro'}</small>
                  </div>
                </div>
                {porQue.get(f.id) && <p className="dir-porque"><Sparkles size={13} /> {porQue.get(f.id)}</p>}
                {f.que_hace && <p className="dir-texto">{f.que_hace}</p>}
                <div className="dir-chips">
                  <span className="chip">{f.vende_a === 'personas' ? <Users size={12} /> : <Building2 size={12} />} {VENDE_A[f.vende_a]}</span>
                  {f.busca && <span className="chip ia">Busca: {f.busca}</span>}
                </div>
                <div className="dir-pie">
                  {f.web && <a className="contacto-pill" href={f.web} target="_blank" rel="noreferrer"><Globe size={13} /> Web</a>}
                  {f.email && <a className="contacto-pill" href={`mailto:${f.email}`}><Mail size={13} /> Email</a>}
                  {wa(f.telefono) && <a className="contacto-pill" href={wa(f.telefono)} target="_blank" rel="noreferrer"><MessageCircle size={13} /> WhatsApp</a>}
                  {f.instagram && <a className="contacto-pill" href={/^https?:/.test(f.instagram) ? f.instagram : `https://www.instagram.com/${f.instagram.replace('@', '')}/`} target="_blank" rel="noreferrer"><AtSign size={13} /> Instagram</a>}
                  <span className="espacio" />
                  {!propia && (sumadas.has(f.id)
                    ? <span className="chip ok"><Check size={12} /> {b2c ? 'En tus aliados' : 'En tu lista'}</span>
                    : <button type="button" className="btn primario chico" onClick={() => sumar(f)}>{b2c ? <Handshake size={14} /> : <Plus size={14} />} {b2c ? 'Sumar como aliado' : 'Sumar a mi lista'}</button>)}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
