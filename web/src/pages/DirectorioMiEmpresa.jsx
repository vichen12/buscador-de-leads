import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, Loader2, Save, ArrowLeft, Eye, EyeOff, Building2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { Cargando, useToast } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

const VACIA = { nombre: '', que_hace: '', rubro: '', zona: '', vende_a: 'empresas', busca: '', web: '', email: '', telefono: '', instagram: '', publicado: true }

/** Tu ficha en el Directorio: qué hacés, a quién le vendés, qué buscás y cómo te contactan. */
export default function DirectorioMiEmpresa() {
  const toast = useToast()
  const { session, perfil, comercial } = useApp()
  const [f, setF] = useState(null)
  const [id, setId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const set = (k, v) => setF(x => ({ ...x, [k]: v }))

  useEffect(() => {
    supabase.from('directorio').select('*').eq('owner_id', session.user.id).maybeSingle().then(({ data }) => {
      if (data) { setId(data.id); setF({ ...VACIA, ...data }); return }
      // Primera vez: se arranca con lo que ya sabemos de tu cuenta y de «Mi negocio»
      const r = comercial?.respuestas ?? {}, e = comercial?.estrategia ?? {}
      setF({ ...VACIA, nombre: r.empresa || perfil?.estudio || '', que_hace: e.resumen || String(r.que_vende ?? '').slice(0, 700), web: r.web || '',
        email: perfil?.email_contacto || session.user.email || '', vende_a: perfil?.modo === 'b2c' ? 'personas' : 'empresas', zona: perfil?.region || '' })
    })
  }, [])

  async function guardar(e) {
    e.preventDefault()
    if (!f.nombre.trim()) return toast('Poné el nombre de tu empresa.', 'error')
    if (f.que_hace.trim().length < 10) return toast('Contá en una o dos frases qué hace tu empresa.', 'error')
    setGuardando(true)
    const fila = { nombre: f.nombre.trim(), que_hace: f.que_hace.trim(), rubro: f.rubro.trim(), zona: f.zona.trim(), vende_a: f.vende_a, busca: f.busca.trim(),
      web: f.web.trim(), email: f.email.trim(), telefono: f.telefono.trim(), instagram: f.instagram.trim(), publicado: !!f.publicado }
    const { data, error } = id
      ? await supabase.from('directorio').update(fila).eq('id', id).select('id').single()
      : await supabase.from('directorio').insert({ ...fila, owner_id: session.user.id }).select('id').single()
    setGuardando(false)
    if (error) return toast(mensajeError(error), 'error')
    setId(data.id)
    toast(fila.publicado ? 'Listo: tu empresa ya aparece en el directorio' : 'Guardada (sin publicar: nadie más la ve)', 'ok')
  }

  if (!f) return <Cargando />
  return (
    <>
      <Link to="/directorio" className="migas"><ArrowLeft size={15} /> Directorio</Link>
      <header className="cabecera">
        <div>
          <h1>Tu empresa en el directorio</h1>
          <p>Lo que pongas acá lo ven las otras empresas que usan Prospecta. Publicá sólo lo que quieras compartir.</p>
        </div>
      </header>
      <form className="tarjeta form-directorio" onSubmit={guardar}>
        <label>Nombre de tu empresa<input value={f.nombre} onChange={e => set('nombre', e.target.value)} maxLength={120} placeholder="Ej.: Bombas Cuyo" /></label>
        <label>Qué hace, en una o dos frases<textarea rows={3} value={f.que_hace} onChange={e => set('que_hace', e.target.value)} maxLength={700} placeholder="Ej.: Vendemos e instalamos bombas de agua y riego por goteo para fincas y bodegas." /></label>
        <div className="form-fila">
          <label>Rubro<input value={f.rubro} onChange={e => set('rubro', e.target.value)} maxLength={80} placeholder="Ej.: riego, logística, diseño web" /></label>
          <label>Dónde trabaja<input value={f.zona} onChange={e => set('zona', e.target.value)} maxLength={120} placeholder="Ej.: Mendoza, todo Argentina" /></label>
        </div>
        <div className="campo">A quién le vende
          <div className="bh-modo" role="radiogroup" aria-label="A quién le vende" style={{ display: 'flex', marginTop: 6 }}>
            {[['empresas', 'A empresas', Building2], ['personas', 'A personas', Users], ['ambos', 'A los dos', Store]].map(([k, l, I]) => (
              <button key={k} type="button" role="radio" aria-checked={f.vende_a === k} className={f.vende_a === k ? 'on' : ''} onClick={() => set('vende_a', k)}><I size={13} /> {l}</button>
            ))}
          </div>
        </div>
        <label>Qué busca <span className="muted">(opcional)</span><input value={f.busca} onChange={e => set('busca', e.target.value)} maxLength={300} placeholder="Ej.: distribuidores en el NOA, proveedores de packaging, alianzas con gimnasios" /></label>
        <div className="form-fila">
          <label>Web<input value={f.web} onChange={e => set('web', e.target.value)} maxLength={200} placeholder="tuempresa.com" inputMode="url" /></label>
          <label>Email de contacto<input value={f.email} onChange={e => set('email', e.target.value)} maxLength={160} type="email" /></label>
        </div>
        <div className="form-fila">
          <label>WhatsApp o teléfono<input value={f.telefono} onChange={e => set('telefono', e.target.value)} maxLength={40} placeholder="+54 9 261 555-1234" /></label>
          <label>Instagram<input value={f.instagram} onChange={e => set('instagram', e.target.value)} maxLength={120} placeholder="@tuempresa" /></label>
        </div>
        <label className="check-publicar">
          <input type="checkbox" checked={!!f.publicado} onChange={e => set('publicado', e.target.checked)} />
          {f.publicado ? <Eye size={15} /> : <EyeOff size={15} />} {f.publicado ? 'Publicada: las otras empresas la ven' : 'Sin publicar: sólo la ves vos'}
        </label>
        <div className="acciones" style={{ justifyContent: 'flex-end' }}>
          <button className="btn primario" disabled={guardando}>{guardando ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Guardar</button>
        </div>
      </form>
    </>
  )
}
