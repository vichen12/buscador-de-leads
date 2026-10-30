import { useEffect, useState } from 'react'
import { Mail, PenLine, Paperclip, Loader2, Save } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { useArchivos } from '../lib/archivos.js'
import { Cargando, useToast } from '../components/ui.jsx'
import { EditorFirma, ArchivosAdjuntos } from '../components/ArchivosCorreo.jsx'
import { CorreoCard } from './Conexiones.jsx'
import { useApp } from '../App.jsx'

/** Todo lo del email en un solo lugar: la casilla conectada, la firma y los archivos para adjuntar */
export default function Email() {
  const { perfil, session, comercial, correo, refrescar } = useApp()
  const toast = useToast()
  const arch = useArchivos(session?.user?.id)
  const [firma, setFirma] = useState(null)
  const [guardando, setGuardando] = useState(false)
  useEffect(() => { if (perfil && firma === null) setFirma(perfil.firma ?? '') }, [perfil])
  if (!perfil || firma === null) return <Cargando />

  const empresa = perfil.estudio || comercial?.respuestas?.empresa || ''
  const firmaVista = firma.trim() || [perfil.nombre, empresa, perfil.email_contacto].filter(Boolean).join('\n')
  const cambio = firma !== (perfil.firma ?? '')

  async function guardarFirma() {
    setGuardando(true)
    const { error } = await supabase.from('perfiles').update({ firma }).eq('id', perfil.id)
    setGuardando(false)
    if (error) toast(mensajeError(error), 'error'); else { toast('Firma guardada'); refrescar() }
  }

  return (
    <div className="pagina-email">
      <header className="cabecera">
        <div><h1>Email</h1><p>Todo lo de tus emails en un lugar: tu casilla, tu firma y los archivos que adjuntás.</p></div>
      </header>

      <div className="email-paso"><span>1</span><h2><Mail size={17} /> Tu casilla</h2></div>
      <CorreoCard />

      <div className="email-paso"><span>2</span><h2><PenLine size={17} /> Tu firma</h2></div>
      <section className="tarjeta">
        <div className="firma-grid">
          <div className="campo" style={{ marginBottom: 0 }}>Texto de la firma, y si querés una imagen al final (logo o banner)
            <EditorFirma arch={arch} valor={firma} onChange={e => setFirma(e.target.value)} placeholder={'Vincenzo Dalla\nBombas Cuyo\n261 555-1234'} />
            <div className="acciones" style={{ marginTop: 10 }}>
              {cambio && <button type="button" className="btn fantasma" onClick={() => setFirma(perfil.firma ?? '')}>Descartar</button>}
              <button type="button" className="btn primario" onClick={guardarFirma} disabled={!cambio || guardando}>{guardando ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Guardar firma</button>
            </div>
          </div>
          <div>
            <div className="etiqueta">Así lo recibe tu cliente</div>
            <div className="mail-vista">
              <div className="mail-vista-cab">
                <span className="mail-vista-avatar">{(perfil.nombre || 'T').trim().charAt(0).toUpperCase()}</span>
                <div>
                  <b>{perfil.nombre || 'Tu nombre'}{empresa ? <span> · {empresa}</span> : null}</b>
                  <small>{correo?.email || perfil.email_contacto || session?.user?.email} → cliente@empresa.com</small>
                </div>
              </div>
              <div className="mail-vista-asunto">Una propuesta para su empresa</div>
              <div className="mail-vista-cuerpo">
                <p>Hola, ¿cómo están?</p>
                <p className="mail-vista-gris">…y quedo atento a lo que necesiten.</p>
                <p>Saludos,</p>
                <div className="mail-vista-firma">{firmaVista || 'Tu nombre'}</div>
                {arch.firmaUrl && <img src={arch.firmaUrl} alt="Imagen de tu firma" />}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="email-paso"><span>3</span><h2><Paperclip size={17} /> Archivos para adjuntar</h2></div>
      <section className="tarjeta">
        <p className="muted chico ayuda" style={{ marginTop: 0 }}>Subí tus PDF, brochures o presentaciones (hasta 20 MB) y contá de qué se tratan. Claude los adjunta en el email cuando suman, y antes de enviar podés sacarlos o sumar otro.</p>
        {arch.lista ? <ArchivosAdjuntos arch={arch} /> : <Cargando />}
      </section>
    </div>
  )
}
