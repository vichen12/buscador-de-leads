import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Building2, UserRound, CornerDownLeft, LayoutDashboard, BarChart3, Users, CalendarClock, MessageSquareReply, Send, Workflow, Mail, Store, Inbox, Upload, Bot, Loader2, Heart } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { EstadoBadge } from './ui.jsx'

const PAGINAS = [
  ['/', 'Tablero', LayoutDashboard], ['/reportes', 'Reportes', BarChart3], ['/prospectos', 'Pipeline', Users], ['/seguimientos', 'Seguimientos', CalendarClock],
  ['/respuestas', 'Respuestas', MessageSquareReply], ['/envios', 'Envío masivo', Send], ['/secuencias', 'Secuencias', Workflow],
  ['/buscar', 'Buscar clientes', Search], ['/revisar', 'Por revisar', Inbox], ['/importar', 'Importar', Upload],
  ['/negocio', 'Mi negocio', Store], ['/email', 'Email', Mail], ['/asistente', 'Asistente IA', Bot],
]
const PAGINAS_B2C = [
  ['/', 'Tablero', LayoutDashboard], ['/clientes', 'Mis clientes', Heart], ['/asistente', 'Asistente IA', Bot],
  ['/negocio', 'Mi negocio', Store], ['/email', 'Email', Mail],
]
const limpiar = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

/** Búsqueda global (Ctrl/Cmd + K): empresas y contactos por nombre, web o teléfono, y las secciones de la app */
export default function Paleta({ onCerrar, modo = 'b2b' }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [res, setRes] = useState({ empresas: [], contactos: [] })
  const [buscando, setBuscando] = useState(false)
  const [activo, setActivo] = useState(0)
  const input = useRef(null)
  useEffect(() => { input.current?.focus() }, [])

  useEffect(() => {
    const t = q.trim()
    if (t.length < 2) { setRes({ empresas: [], contactos: [], clientes: [] }); return }
    setBuscando(true)
    const id = setTimeout(async () => {
      const digitos = t.replace(/\D/g, '')
      const seguro = t.replace(/[%,()]/g, ' ')
      const filtro = [`nombre.ilike.%${seguro}%`, `dominio_norm.ilike.%${seguro}%`, `email.ilike.%${seguro}%`, ...(digitos.length >= 4 ? [`telefono_norm.ilike.%${digitos.slice(-8)}%`] : [])].join(',')
      if (modo === 'b2c') {
        const fc = [`nombre.ilike.%${seguro}%`, `email.ilike.%${seguro}%`, ...(digitos.length >= 4 ? [`telefono_e164.ilike.%${digitos.slice(-8)}%`] : [])].join(',')
        const { data: cl } = await supabase.from('clientes').select('id, nombre, email, ciudad').or(fc).limit(10)
        setRes({ empresas: [], contactos: [], clientes: cl ?? [] }); setBuscando(false); setActivo(0); return
      }
      const [{ data: e }, { data: c }] = await Promise.all([
        supabase.from('prospectos').select('id, nombre, rubro, zona, estado, dominio_norm').or(filtro).limit(8),
        supabase.from('contactos').select('id, nombre, cargo, email, prospecto_id, prospectos(nombre)').or(`nombre.ilike.%${seguro}%,email.ilike.%${seguro}%`).limit(5),
      ])
      setRes({ empresas: e ?? [], contactos: c ?? [] }); setBuscando(false); setActivo(0)
    }, 180)
    return () => clearTimeout(id)
  }, [q, modo])

  const paginas = useMemo(() => (modo === 'b2c' ? PAGINAS_B2C : PAGINAS).filter(([, l]) => !q || limpiar(l).includes(limpiar(q))).slice(0, q ? 4 : 6), [q])
  const items = [
    ...(res.clientes ?? []).map(c => ({ k: 'k' + c.id, ir: `/clientes?id=${c.id}`, nodo: <><Heart size={16} /><span className="pal-texto"><b>{c.nombre}</b><small>{[c.email, c.ciudad].filter(Boolean).join(' · ')}</small></span></> })),
    ...res.empresas.map(p => ({ k: 'e' + p.id, ir: `/prospectos/${p.id}`, nodo: <><Building2 size={16} /><span className="pal-texto"><b>{p.nombre}</b><small>{[p.rubro, p.zona, p.dominio_norm].filter(Boolean).join(' · ')}</small></span><EstadoBadge estado={p.estado} /></> })),
    ...res.contactos.map(c => ({ k: 'c' + c.id, ir: `/prospectos/${c.prospecto_id}`, nodo: <><UserRound size={16} /><span className="pal-texto"><b>{c.nombre || c.email}</b><small>{[c.cargo, c.prospectos?.nombre].filter(Boolean).join(' · ')}</small></span></> })),
    ...paginas.map(([to, l, I]) => ({ k: 'p' + to, ir: to, nodo: <><I size={16} /><span className="pal-texto"><b>{l}</b><small>Ir a la sección</small></span></> })),
  ]
  const ir = it => { nav(it.ir); onCerrar() }
  const teclas = e => {
    if (e.key === 'Escape') onCerrar()
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => Math.min(items.length - 1, a + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(0, a - 1)) }
    else if (e.key === 'Enter' && items[activo]) { e.preventDefault(); ir(items[activo]) }
  }
  const nCli = res.clientes?.length ?? 0
  const empiezaContactos = nCli + res.empresas.length, empiezaPaginas = nCli + res.empresas.length + res.contactos.length
  return (
    <div className="modal-fondo paleta-fondo" onMouseDown={e => e.target === e.currentTarget && onCerrar()}>
      <div className="paleta" role="dialog" aria-modal="true" aria-label="Buscar">
        <div className="paleta-input">
          {buscando ? <Loader2 size={18} className="spin" /> : <Search size={18} />}
          <input ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={teclas} placeholder="Buscá una empresa, un contacto, una web o un teléfono…" aria-label="Buscar" />
          <kbd>Esc</kbd>
        </div>
        <div className="paleta-lista" role="listbox">
          {q.trim().length >= 2 && !buscando && !nCli && !res.empresas.length && !res.contactos.length && <div className="paleta-vacio">{modo === 'b2c' ? `No encontramos clientes con "${q.trim()}".` : `No encontramos empresas ni contactos con "${q.trim()}".`}</div>}
          {items.map((it, i) => (
            <div key={it.k}>
              {i === 0 && nCli > 0 && <div className="paleta-titulo">Clientes</div>}
              {i === nCli && res.empresas.length > 0 && <div className="paleta-titulo">Empresas</div>}
              {i === empiezaContactos && res.contactos.length > 0 && <div className="paleta-titulo">Contactos</div>}
              {i === empiezaPaginas && paginas.length > 0 && <div className="paleta-titulo">Secciones</div>}
              <button type="button" role="option" aria-selected={i === activo} className={'paleta-item' + (i === activo ? ' activo' : '')} onMouseEnter={() => setActivo(i)} onClick={() => ir(it)}>
                {it.nodo}{i === activo && <CornerDownLeft size={14} className="pal-enter" />}
              </button>
            </div>
          ))}
        </div>
        <div className="paleta-pie"><span><kbd>↑</kbd><kbd>↓</kbd> moverse</span><span><kbd>Enter</kbd> abrir</span><span><kbd>Ctrl</kbd>+<kbd>K</kbd> en cualquier pantalla</span></div>
      </div>
    </div>
  )
}
