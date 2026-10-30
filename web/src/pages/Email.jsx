import { useEffect, useState } from 'react'
import { Mail, PenLine, Paperclip, Loader2, Save, Wand2, ShieldOff, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { mensajeError } from '../lib/util.js'
import { useArchivos } from '../lib/archivos.js'
import { Cargando, useToast } from '../components/ui.jsx'
import { EditorFirma, ArchivosAdjuntos } from '../components/ArchivosCorreo.jsx'
import { CorreoCard } from './Conexiones.jsx'
import { LimiteEnvios, SaludDominio, NoContactar } from '../components/ProteccionEmail.jsx'
import { useApp } from '../App.jsx'

/** Todo lo del email en un solo lugar: la casilla conectada, la firma y los archivos para adjuntar */
export default function Email() {
  const { perfil, session, comercial, correo, refrescar } = useApp()
  const toast = useToast()
  const arch = useArchivos(session?.user?.id)
  const [firma, setFirma] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [cfg, setCfg] = useState(null)
  const [guardandoCfg, setGuardandoCfg] = useState(false)
  useEffect(() => { if (perfil && firma === null) setFirma(perfil.firma ?? '') }, [perfil])
  useEffect(() => { if (perfil && cfg === null) setCfg({ tono: '', largo: 'medio', estructura: '', ...(perfil.config_email ?? {}) }) }, [perfil])
  if (!perfil || firma === null || cfg === null) return <Cargando />
  const cfgCambio = JSON.stringify(cfg) !== JSON.stringify({ tono: '', largo: 'medio', estructura: '', ...(perfil.config_email ?? {}) })
  async function guardarCfg() {
    setGuardandoCfg(true)
    const { error } = await supabase.from('perfiles').update({ config_email: cfg }).eq('id', perfil.id)
    setGuardandoCfg(false)
    if (error) toast(mensajeError(error), 'error'); else { toast('Listo: Claude va a escribir tus emails así'); refrescar() }
  }

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
        <div><h1>Email</h1><p>Todo lo de tus emails en un lugar: tu casilla y su límite, tu firma, cómo escribe Claude, los archivos, la lista de "No contactar" y la salud de tu dominio.</p></div>
      </header>

      <div className="email-paso"><span>1</span><h2><Mail size={17} /> Tu casilla</h2></div>
      <CorreoCard />
      <LimiteEnvios />

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

      <div className="email-paso"><span>3</span><h2><Wand2 size={17} /> Cómo escribe Claude tus emails</h2></div>
      <section className="tarjeta config-email">
        <p className="muted chico ayuda" style={{ marginTop: 0 }}>Se usa cada vez que Claude escribe un email, uno por uno o cuando enviás a varias empresas juntas. Cada email igual sale personalizado para esa empresa.</p>
        <div className="campo">Tono
          <div className="chips-sel">
            {TONOS.map(t => <button key={t} type="button" className={'chip-sel' + (cfg.tono === t ? ' on' : '')} onClick={() => setCfg({ ...cfg, tono: cfg.tono === t ? '' : t })}>{t}</button>)}
          </div>
          <input value={TONOS.includes(cfg.tono) ? '' : cfg.tono} onChange={e => setCfg({ ...cfg, tono: e.target.value })} placeholder="O escribilo con tus palabras. Ej.: cercano pero serio, de vos, sin exagerar" style={{ marginTop: 8 }} />
        </div>
        <div className="campo">Largo
          <div className="segmentado">
            {[['corto', 'Corto', '≈ 70 palabras'], ['medio', 'Medio', '≈ 110 palabras'], ['largo', 'Largo', '≈ 190 palabras']].map(([v, l, a]) => (
              <button key={v} type="button" className={cfg.largo === v ? 'on' : ''} onClick={() => setCfg({ ...cfg, largo: v })}><b>{l}</b><small>{a}</small></button>
            ))}
          </div>
        </div>
        <div className="campo">Estructura del email <span className="muted">(opcional)</span>
          <textarea rows={6} value={cfg.estructura} onChange={e => setCfg({ ...cfg, estructura: e.target.value })} placeholder={EJEMPLO_ESTRUCTURA} />
          {!cfg.estructura && <button type="button" className="link chico" onClick={() => setCfg({ ...cfg, estructura: EJEMPLO_ESTRUCTURA })}>Usar este ejemplo y editarlo</button>}
        </div>
        <div className="acciones">
          {cfgCambio && <button type="button" className="btn fantasma" onClick={() => setCfg({ tono: '', largo: 'medio', estructura: '', ...(perfil.config_email ?? {}) })}>Descartar</button>}
          <button type="button" className="btn primario" onClick={guardarCfg} disabled={!cfgCambio || guardandoCfg}>{guardandoCfg ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Guardar</button>
        </div>
      </section>

      <div className="email-paso"><span>4</span><h2><Paperclip size={17} /> Archivos para adjuntar</h2></div>
      <section className="tarjeta">
        <p className="muted chico ayuda" style={{ marginTop: 0 }}>Subí tus PDF, brochures o presentaciones (hasta 20 MB) y contá de qué se tratan. Marcá <b>Va siempre</b> en los que tienen que ir en todos los emails (por ejemplo, el brochure). Con <b>Claude decide</b>, Claude lo adjunta cuando suma.</p>
        {arch.lista ? <ArchivosAdjuntos arch={arch} /> : <Cargando />}
      </section>

      <div className="email-paso" id="no-contactar"><span>5</span><h2><ShieldOff size={17} /> No contactar</h2></div>
      <NoContactar />

      <div className="email-paso" id="salud"><span>6</span><h2><ShieldCheck size={17} /> Salud de tu dominio</h2></div>
      <SaludDominio />
    </div>
  )
}

const TONOS = ['Cercano', 'Profesional', 'Formal', 'Directo y corto', 'Técnico']
const EJEMPLO_ESTRUCTURA = `1. Saludo con el nombre de la empresa
2. Quiénes somos, en una línea
3. Algo concreto de ellos y por qué les puede servir lo nuestro
4. Mencionar el brochure adjunto
5. Cerrar proponiendo una llamada corta de 15 minutos`
