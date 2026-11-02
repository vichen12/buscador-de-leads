import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Copy, Mail, MessageCircle, Phone, Search, Workflow, ChevronDown, Check } from 'lucide-react'
import { useToast } from '../components/ui.jsx'

// Biblioteca de plantillas. Variables: {{nombre}} {{empresa}} {{rubro}} {{zona}} {{mi_nombre}} {{mi_empresa}} {{link_agenda}}
// Sirven como punto de partida: en las secuencias, un paso "plantilla" las completa solo con los datos de cada empresa.
const PLANTILLAS = [
  ['Primer contacto', 'email', 'Email en frío corto', 'Una idea para {{empresa}}', 'Hola {{nombre}},\n\nVi que {{empresa}} trabaja en {{rubro}} en {{zona}} y quería contarte algo puntual: ayudamos a empresas como la tuya a [beneficio concreto en una frase].\n\n¿Te sirve que te cuente en 15 minutos cómo lo hacemos? Si no es el momento, decime y no te escribo más.\n\nSaludos,\n{{mi_nombre}}\n{{mi_empresa}}'],
  ['Primer contacto', 'whatsapp', 'WhatsApp de presentación', '', 'Hola {{nombre}}, ¿cómo estás? Soy {{mi_nombre}} de {{mi_empresa}}. Trabajamos con empresas de {{rubro}} en {{zona}} ayudándolas con [beneficio]. ¿Te puedo contar en dos minutos? Si no te interesa, no hay problema.'],
  ['Primer contacto', 'llamada', 'Apertura de llamada', '', 'Hola {{nombre}}, te habla {{mi_nombre}} de {{mi_empresa}}. Te robo un minuto: trabajamos con empresas de {{rubro}} y muchas nos cuentan que [problema típico]. ¿A ustedes les pasa algo parecido?'],
  ['Seguimiento', 'email', 'Seguimiento a los 3 días', 'Re: Una idea para {{empresa}}', 'Hola {{nombre}},\n\nTe escribo de nuevo por si el mail anterior quedó tapado. ¿Tiene sentido que lo charlemos, o mejor lo dejamos para más adelante?\n\nSaludos,\n{{mi_nombre}}'],
  ['Seguimiento', 'email', 'Último intento (cierre amable)', 'Re: Una idea para {{empresa}}', 'Hola {{nombre}},\n\nNo quiero llenarte la casilla, así que este es mi último mail. Si en algún momento [problema] pasa a ser prioridad, acá estoy.\n\n¡Éxitos!\n{{mi_nombre}}'],
  ['Seguimiento', 'whatsapp', 'Recordatorio por WhatsApp', '', 'Hola {{nombre}}, te había escrito por mail la semana pasada sobre [tema]. ¿Llegaste a verlo? Si preferís, lo hablamos por acá.'],
  ['Reunión', 'email', 'Proponer reunión con link', 'Coordinemos 15 minutos', 'Hola {{nombre}},\n\n¡Gracias por responder! Te dejo mi agenda para que elijas el horario que te quede mejor: {{link_agenda}}\n\nSi ninguno te sirve, decime dos o tres opciones y me adapto.\n\nSaludos,\n{{mi_nombre}}'],
  ['Reunión', 'email', 'Después de la reunión', 'Lo que hablamos hoy', 'Hola {{nombre}},\n\nGracias por el tiempo de hoy. Te resumo lo que hablamos:\n- [punto 1]\n- [punto 2]\n\nPróximo paso: [qué y cuándo]. Cualquier cosa, escribime.\n\nSaludos,\n{{mi_nombre}}'],
  ['Propuesta', 'email', 'Envío de propuesta', 'Propuesta para {{empresa}}', 'Hola {{nombre}},\n\nTe adjunto la propuesta que armamos para {{empresa}}, en base a lo que charlamos. Incluye [qué incluye] y vale por 15 días.\n\n¿Te parece que la repasemos juntos 10 minutos esta semana?\n\nSaludos,\n{{mi_nombre}}'],
  ['Propuesta', 'email', 'Seguimiento de propuesta', 'Re: Propuesta para {{empresa}}', 'Hola {{nombre}},\n\n¿Pudiste ver la propuesta? Si hay algo para ajustar (alcance, plazos, forma de pago), lo vemos sin problema.\n\nSaludos,\n{{mi_nombre}}'],
  ['Post-venta', 'email', 'Bienvenida al cliente', '¡Bienvenidos, {{empresa}}!', 'Hola {{nombre}},\n\n¡Gracias por elegirnos! Te cuento los próximos pasos:\n1. [paso 1]\n2. [paso 2]\n\nCualquier duda, me escribís directo.\n\n{{mi_nombre}}'],
  ['Post-venta', 'email', 'Control a los 30 días', '¿Cómo vienen con [producto]?', 'Hola {{nombre}},\n\nYa pasó un mes desde que arrancamos. ¿Cómo lo vienen usando? Si hay algo que podamos mejorar, contame.\n\n{{mi_nombre}}'],
  ['Post-venta', 'email', 'Pedir una recomendación', '¿Conocés a alguien a quien le sirva?', 'Hola {{nombre}},\n\nMe alegra que [resultado] les esté funcionando. ¿Conocés otra empresa de {{rubro}} a la que le pueda servir lo mismo? Una presentación tuya vale mucho.\n\n¡Gracias!\n{{mi_nombre}}'],
  ['Reactivar', 'email', 'Volver a escribir a un perdido', 'Retomando lo de {{empresa}}', 'Hola {{nombre}},\n\nHace unos meses hablamos sobre [tema] y no era el momento. ¿Cambió algo de su lado? Desde entonces sumamos [novedad], que puede servirles.\n\nSaludos,\n{{mi_nombre}}'],
  ['Consumidores (B2C)', 'whatsapp', 'Recompra', '', 'Hola {{nombre}}! ¿Cómo estás? Te escribo de {{mi_empresa}}: [novedad o producto] ya está disponible y pensé que te podía gustar. ¿Te paso fotos?'],
  ['Consumidores (B2C)', 'email', 'Pedir reseña', '¿Nos contás cómo te fue?', 'Hola {{nombre}},\n\n¡Gracias por tu compra! Si te gustó, ¿nos dejarías una reseña? Nos ayuda muchísimo: [link]\n\n{{mi_empresa}}'],
  ['Consumidores (B2C)', 'whatsapp', 'Cumpleaños', '', '¡Feliz cumple, {{nombre}}! 🎉 De parte de todo {{mi_empresa}}, este mes tenés [regalo o beneficio]. ¡Que lo disfrutes!'],
]
const CANAL = { email: ['Email', Mail], whatsapp: ['WhatsApp', MessageCircle], llamada: ['Llamada', Phone] }
const VARIABLES = { nombre: 'nombre', empresa: 'empresa', rubro: 'rubro', zona: 'zona', mi_nombre: 'tu nombre', mi_empresa: 'tu empresa', link_agenda: 'link de agenda' }

/** Texto con las variables {{...}} como etiquetas y los [huecos] para completar resaltados */
function Texto({ t }) {
  return t.split(/(\{\{\w+\}\}|\[[^\]]+\])/g).map((parte, i) => {
    const v = parte.match(/^\{\{(\w+)\}\}$/)
    if (v) return <span key={i} className="pl-var">{VARIABLES[v[1]] ?? v[1]}</span>
    if (/^\[[^\]]+\]$/.test(parte)) return <span key={i} className="pl-hueco" title="Completalo vos">{parte.slice(1, -1)}</span>
    return parte
  })
}

export default function Plantillas() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [canal, setCanal] = useState('')
  const [abierta, setAbierta] = useState(null)
  const [copiada, setCopiada] = useState(null)
  const cats = [...new Set(PLANTILLAS.map(p => p[0]))]
  const lista = PLANTILLAS.filter(p => (!cat || p[0] === cat) && (!canal || p[1] === canal) && (!q || p.join(' ').toLowerCase().includes(q.toLowerCase())))
  const copiar = (titulo, asunto, cuerpo) => {
    navigator.clipboard.writeText((asunto ? `Asunto: ${asunto}\n\n` : '') + cuerpo)
    setCopiada(titulo); setTimeout(() => setCopiada(c => (c === titulo ? null : c)), 2000)
    toast('Copiada. Pegala en un paso de secuencia (tipo "plantilla") o en un mensaje.', 'ok')
  }
  return (
    <div className="home plantillas-pag">
      <header className="home-cab">
        <div>
          <p className="home-fecha">{PLANTILLAS.length} plantillas para cada momento de la venta</p>
          <h1>Plantillas</h1>
          <p className="home-sub">Las <span className="pl-var">etiquetas</span> se completan solas con los datos de cada empresa cuando las usás en una <Link to="/secuencias">secuencia</Link>. Lo <span className="pl-hueco">resaltado</span> lo completás vos.</p>
        </div>
      </header>
      <div className="rep-filtros pl-filtros">
        <div className="pl-buscar"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar plantilla…" /></div>
        <div className="rep-pastillas">{[['', 'Todas'], ...cats.map(c => [c, c])].map(([v, l]) => <button key={l} type="button" className={cat === v ? 'on' : ''} onClick={() => setCat(v)}>{l}</button>)}</div>
        <div className="rep-pastillas">{[['', 'Todo canal'], ['email', 'Email'], ['whatsapp', 'WhatsApp'], ['llamada', 'Llamada']].map(([v, l]) => <button key={l} type="button" className={canal === v ? 'on' : ''} onClick={() => setCanal(v)}>{l}</button>)}</div>
      </div>
      {!lista.length && <div className="home-vacio"><Search size={18} /><span>No hay plantillas con ese filtro.</span></div>}
      <div className="pl-grilla">{lista.map(([c, can, titulo, asunto, cuerpo]) => {
        const [nombreCanal, I] = CANAL[can]
        const larga = cuerpo.length > 230, abierto = abierta === titulo
        return (
          <article key={titulo} className={'pl-card ' + can}>
            <header>
              <span className="pl-canal"><I size={14} /> {nombreCanal}</span>
              <span className="pl-cat">{c}</span>
            </header>
            <h3>{titulo}</h3>
            {asunto && <div className="pl-asunto"><small>Asunto</small><span><Texto t={asunto} /></span></div>}
            <div className={'pl-cuerpo' + (larga && !abierto ? ' cortado' : '')}><Texto t={cuerpo} /></div>
            {larga && <button type="button" className="link chico pl-ver" onClick={() => setAbierta(abierto ? null : titulo)}><ChevronDown size={13} style={{ transform: abierto ? 'rotate(180deg)' : '' }} /> {abierto ? 'Ver menos' : 'Ver todo'}</button>}
            <footer>
              <button type="button" className={'btn chico' + (copiada === titulo ? ' ok' : ' primario')} onClick={() => copiar(titulo, asunto, cuerpo)}>{copiada === titulo ? <><Check size={13} /> Copiada</> : <><Copy size={13} /> Copiar</>}</button>
              <Link to="/secuencias" className="btn chico fantasma"><Workflow size={13} /> Usar en una secuencia</Link>
            </footer>
          </article>
        )
      })}</div>
    </div>
  )
}
