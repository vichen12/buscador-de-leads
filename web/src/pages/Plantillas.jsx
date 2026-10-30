import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, Copy, Mail, MessageCircle, Phone, Search } from 'lucide-react'
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
const ICONO = { email: Mail, whatsapp: MessageCircle, llamada: Phone }

export default function Plantillas() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const cats = [...new Set(PLANTILLAS.map(p => p[0]))]
  const lista = PLANTILLAS.filter(p => (!cat || p[0] === cat) && (!q || p.join(' ').toLowerCase().includes(q.toLowerCase())))
  const copiar = (asunto, cuerpo) => { navigator.clipboard.writeText((asunto ? `Asunto: ${asunto}\n\n` : '') + cuerpo); toast('Copiada. Pegala en un paso de secuencia (tipo "plantilla") o en un mensaje.', 'ok') }
  return (
    <>
      <header className="cabecera"><div><h1><BookOpen size={24} style={{ verticalAlign: -4, color: 'var(--acc)' }} /> Plantillas</h1>
        <p className="saludo">Textos probados para cada momento de la venta. Las palabras entre {'{{ }}'} se completan solas con los datos de cada empresa cuando las usás en una <Link to="/secuencias">secuencia</Link>.</p></div></header>
      <div className="barra-filtros" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}><Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--mut)' }} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar…" style={{ paddingLeft: 34 }} /></div>
        <div className="chips-filtro"><button type="button" className={!cat ? 'activo' : ''} onClick={() => setCat('')}>Todas</button>{cats.map(c => <button key={c} type="button" className={cat === c ? 'activo' : ''} onClick={() => setCat(c)}>{c}</button>)}</div>
      </div>
      <div className="grilla-plantillas">{lista.map(([c, canal, titulo, asunto, cuerpo]) => {
        const I = ICONO[canal]
        return (
          <article key={titulo} className="tarjeta plantilla">
            <div className="plantilla-cab"><I size={15} /><b>{titulo}</b><span className="chip">{c}</span></div>
            {asunto && <div className="chico"><span className="muted">Asunto:</span> {asunto}</div>}
            <pre>{cuerpo}</pre>
            <button type="button" className="btn chico" onClick={() => copiar(asunto, cuerpo)}><Copy size={13} /> Copiar</button>
          </article>
        )
      })}</div>
    </>
  )
}
