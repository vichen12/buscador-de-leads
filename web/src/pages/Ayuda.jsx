import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { LifeBuoy, ChevronDown, Send, Loader2, Sparkles, Lightbulb, Bug, HelpCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { fecha, mensajeError } from '../lib/util.js'
import { useToast } from '../components/ui.jsx'

const PREGUNTAS = [
  ['Empezar', [
    ['¿Por dónde arranco?', 'Completá "Mi negocio" (qué vendés, a quién y dónde), conectá tu email en "Email" y después usá "Buscar clientes". Lo que encuentre Claude aparece en "Por revisar": sumá a tu lista las que te sirven.'],
    ['¿Qué es "Tu día"?', 'Es la lista de lo que conviene hacer hoy, en orden: primero contestar a interesados, después visitas, tareas, propuestas sin respuesta, seguimientos y emails nuevos.'],
    ['¿Qué diferencia hay entre Empresas (B2B) y Consumidores (B2C)?', 'B2B es para venderle a empresas: buscás, contactás y seguís un pipeline. B2C es para vender a personas: trabajás con tus propios clientes (que te dieron permiso), aliados y creadores. Son dos espacios separados; si tenés los dos, los cambiás arriba del menú.'],
  ]],
  ['Emails y envíos', [
    ['¿Los mails salen desde mi casilla?', 'Sí. Salen desde tu propia cuenta, quedan en tu carpeta Enviados y las respuestas te llegan a vos. Prospecta también las lee y las clasifica.'],
    ['¿Por qué tengo un límite por día?', 'Para cuidar tu casilla. Una casilla nueva arranca con 20 por día y sube de a poco durante 3 semanas. Si mandás de golpe, los proveedores te marcan como spam.'],
    ['¿Qué pasa si alguien pide la baja?', 'Cada mail lleva un link para darse de baja. Si lo usa (o te contesta pidiéndolo), queda en tu lista de "No contactar" y no se le puede volver a escribir.'],
    ['¿Se mandan WhatsApp solos?', 'No. Claude escribe el mensaje y vos lo mandás desde tu WhatsApp. Automatizarlo te puede costar el número.'],
  ]],
  ['Equipo y datos', [
    ['¿Cómo sumo a alguien de mi equipo?', 'Si sos admin de tu empresa, en "Equipo" tocás "Sumar a alguien". Le generamos una contraseña para que entre.'],
    ['¿Mi equipo ve mis empresas?', 'Las ve, pero sólo las edita quien las trabaja. Si querés tomar una de otro, en la ficha aparece el botón "Tomarla".'],
    ['¿Cómo descargo todos mis datos?', 'En "Mi cuenta" → "Seguridad y datos" → "Descargar mis datos". Te baja un .zip con todo.'],
  ]],
]

const NOVEDADES = [
  ['30/10/2026', 'Tu día, metas y ranking, catálogo y propuestas, visitas con ruta, comentarios con @menciones, formulario para tu web, guion de llamada y brief de reunión.'],
  ['30/10/2026', 'Modo Consumidores (B2C): Mis clientes con permiso, campañas, aliados y creadores.'],
  ['30/10/2026', 'Seguridad: verificación en dos pasos, recuperar contraseña por mail, descargar y borrar tu cuenta.'],
  ['30/10/2026', 'Reportes: qué rubros, zonas, búsquedas y mensajes traen más respuestas. Tablero con gráficos.'],
  ['30/10/2026', 'Pipeline con reunión, propuesta y perdido (con motivo), equipo con roles y búsqueda global (Ctrl+K).'],
  ['29/10/2026', 'Envío masivo desde el servidor con pausas, secuencias automáticas y lectura de respuestas.'],
]

export default function Ayuda() {
  const toast = useToast()
  const loc = useLocation()
  const [abierta, setAbierta] = useState('')
  const [tipo, setTipo] = useState('idea')
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mios, setMios] = useState([])
  const cargar = () => supabase.from('feedback').select('*').order('created_at', { ascending: false }).limit(10).then(({ data }) => setMios(data ?? []))
  useEffect(() => { cargar() }, [])
  async function enviar(e) {
    e.preventDefault()
    setEnviando(true)
    const { error } = await supabase.from('feedback').insert({ tipo, texto: texto.trim(), pagina: loc.state?.desde || '' })
    setEnviando(false)
    if (error) return toast(mensajeError(error), 'error')
    setTexto(''); cargar(); toast('¡Gracias! Lo leemos todo.', 'ok')
  }
  return (
    <>
      <header className="cabecera"><div><h1><LifeBuoy size={26} style={{ verticalAlign: -4, color: 'var(--acc)' }} /> Ayuda</h1><p className="saludo">Respuestas rápidas, lo nuevo de Prospecta y un lugar para contarnos ideas o problemas.</p></div></header>
      <div className="dos-col">
        <div>
          {PREGUNTAS.map(([grupo, items]) => (
            <section key={grupo} className="tarjeta">
              <h3 className="titulo-tarjeta">{grupo}</h3>
              {items.map(([p, r]) => (
                <div key={p} className="faq">
                  <button type="button" onClick={() => setAbierta(a => (a === p ? '' : p))} aria-expanded={abierta === p}><span>{p}</span><ChevronDown size={16} style={{ transform: abierta === p ? 'rotate(180deg)' : 'none' }} /></button>
                  {abierta === p && <p>{r}</p>}
                </div>
              ))}
            </section>
          ))}
          <p className="muted chico">¿No encontrás lo que buscás? Preguntale al <Link to="/asistente">Asistente IA</Link>: conoce toda la app.</p>
        </div>
        <div>
          <section className="tarjeta">
            <h3 className="titulo-tarjeta">Contanos</h3>
            <form onSubmit={enviar}>
              <div className="chips-filtro" style={{ marginBottom: 10 }}>
                <button type="button" className={tipo === 'idea' ? 'activo' : ''} onClick={() => setTipo('idea')}><Lightbulb size={13} /> Una idea</button>
                <button type="button" className={tipo === 'error' ? 'activo' : ''} onClick={() => setTipo('error')}><Bug size={13} /> Algo anda mal</button>
                <button type="button" className={tipo === 'consulta' ? 'activo' : ''} onClick={() => setTipo('consulta')}><HelpCircle size={13} /> Una consulta</button>
              </div>
              <textarea rows={4} value={texto} onChange={e => setTexto(e.target.value)} placeholder={tipo === 'error' ? 'Qué estabas haciendo y qué pasó…' : tipo === 'idea' ? 'Qué te gustaría que haga Prospecta…' : 'Tu pregunta…'} required minLength={3} maxLength={3000} />
              <button className="btn primario" style={{ marginTop: 10 }} disabled={enviando || texto.trim().length < 3}>{enviando ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Enviar</button>
            </form>
            {mios.length > 0 && <div style={{ marginTop: 14 }}><div className="chico fuerte">Lo que nos mandaste</div>{mios.map(f => <div key={f.id} className="fila-soporte"><small className="muted">{fecha(f.created_at)} · {f.estado === 'resuelto' ? '✓ Resuelto' : f.estado === 'visto' ? 'Lo vimos' : 'Recibido'}</small><p>{f.texto}</p></div>)}</div>}
          </section>
          <section className="tarjeta">
            <h3 className="titulo-tarjeta"><Sparkles size={16} /> Novedades</h3>
            <ul className="novedades">{NOVEDADES.map(([f, t], i) => <li key={i}><small className="muted">{f}</small><span>{t}</span></li>)}</ul>
          </section>
        </div>
      </div>
    </>
  )
}
