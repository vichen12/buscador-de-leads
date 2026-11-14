import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import MisMensajesWa from '../components/MisMensajesWa.jsx'

/** Tus mensajes de WhatsApp: los escribís acá y en cada empresa elegís cuál mandar. */
export default function MensajesWhatsapp() {
  return (
    <>
      <Link to="/mas" className="migas"><ArrowLeft size={15} /> Más</Link>
      <header className="cabecera"><div><h1>Mensajes de WhatsApp</h1><p>Escribí tus mensajes una vez y mandalos a cada empresa con un toque.</p></div></header>
      <MisMensajesWa />
    </>
  )
}
