import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Mail, MessageCircle, Flame, Check } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { leerIA, COSTOS_IA, GRATIS_IA } from '../lib/uso.js'

function Medidor({ icono: Icono, titulo, periodo, usadas, limite, sinTope, renueva, children }) {
  const quedan = sinTope ? null : Math.max(0, limite - usadas)
  const pct = sinTope ? 0 : Math.min(100, (usadas / Math.max(1, limite)) * 100)
  return (
    <section className="tarjeta uso-medidor">
      <div className="uso-cab"><span className="uso-icono"><Icono size={18} /></span><div><h3>{titulo}</h3><small className="muted">{periodo}</small></div></div>
      <div className="uso-numero">
        {sinTope ? <b>{usadas.toLocaleString('es-AR')}</b> : <><b>{quedan.toLocaleString('es-AR')}</b><span> te quedan</span></>}
      </div>
      <div className={'cupo-barra' + (pct >= 80 ? ' alerta' : '')}><span style={{ width: pct + '%' }} /></div>
      <p className="muted chico uso-detalle">
        {sinTope ? 'Tu plan no tiene tope.' : <>Usaste <b>{usadas.toLocaleString('es-AR')}</b> de <b>{limite.toLocaleString('es-AR')}</b> · se renueva <b>{renueva}</b></>}
      </p>
      {children}
    </section>
  )
}

/** Uso y límites: los tres límites que hay, cuánto queda de cada uno, cuándo se renuevan y qué gasta cada cosa. */
export default function Uso() {
  const { tablero, perfil, acceso } = useApp()
  const [cupo, setCupo] = useState(null)
  useEffect(() => { supabase.rpc('mi_cupo_chat').then(({ data }) => setCupo(data ?? null)) }, [])
  const ia = leerIA(cupo)
  const lim = tablero?.email
  const wspHoy = lim ? 0 : tablero?.enviados_hoy ?? 0
  const esAdminEmpresa = perfil?.rol === 'admin' || perfil?.es_admin

  return (
    <>
      <header className="cabecera">
        <div>
          <h1>Uso y límites</h1>
          <p>Hay tres límites y cada uno cuida algo distinto. Acá ves cuánto te queda de cada uno, cuándo se renueva y qué gasta cada cosa.</p>
        </div>
      </header>

      <div className="uso-grilla">
        {ia && (
          <Medidor icono={Sparkles} titulo="IA del plan" periodo={ia.porMes ? `Consultas de IA de toda ${acceso?.empresa || 'tu empresa'}, por mes` : 'Tus consultas de IA, por día'}
            usadas={ia.usadas} limite={ia.limite} sinTope={ia.sinTope} renueva={ia.renueva}>
            <p className="chico uso-nota">
              {ia.agotada
                ? <>Se terminaron. Hasta que se renueven no se puede buscar ni pedirle textos a Claude; lo demás (tu lista, enviar mails ya escritos, seguimientos) sigue andando. {ia.porMes && (esAdminEmpresa ? 'Para tener más, pedí que te amplíen el plan.' : 'Para tener más, hablá con el admin de tu empresa.')}</>
                : ia.porMes ? 'Las comparte todo el equipo: lo que usa uno se le descuenta a todos.' : 'Son tuyas y vuelven a cero cada día.'}
            </p>
          </Medidor>
        )}

        {lim ? (
          <Medidor icono={Mail} titulo="Emails de tu casilla" periodo="Mails que salen desde tu cuenta de email, por día"
            usadas={lim.enviados_hoy ?? 0} limite={lim.limite_hoy ?? 0} renueva="mañana">
            <p className="chico uso-nota">
              {lim.calentando
                ? <><Flame size={12} style={{ verticalAlign: -1 }} /> Tu casilla está en calentamiento (semana {lim.etapa} de 3): arranca con pocos por día y sube sola. Es para que tus mails no caigan en spam. Después de eso vas a poder mandar hasta {lim.elegido} por día.</>
                : <>Es para que tus mails no caigan en spam. Lo que no entra hoy sale solo mañana. Lo cambiás en <Link to="/email">Email</Link>.</>}
            </p>
          </Medidor>
        ) : (
          <section className="tarjeta uso-medidor">
            <div className="uso-cab"><span className="uso-icono"><Mail size={18} /></span><div><h3>Emails de tu casilla</h3><small className="muted">Mails que salen desde tu cuenta de email, por día</small></div></div>
            <p className="muted chico uso-nota">Todavía no conectaste tu email. <Link to="/email">Conectalo</Link> para mandar mails desde Prospecta.</p>
          </section>
        )}

        <Medidor icono={MessageCircle} titulo="WhatsApp e Instagram" periodo="Mensajes que mandás vos a mano, por día"
          usadas={wspHoy} limite={perfil?.limite_diario ?? 15} renueva="mañana">
          <p className="chico uso-nota">Prospecta escribe el mensaje y vos lo mandás desde tu teléfono. El tope es para cuidar tu número: lo elegís en <Link to="/cuenta">Mi cuenta</Link> («Ritmo de contacto»).</p>
        </Medidor>
      </div>

      <section className="tarjeta">
        <h3 style={{ marginTop: 0 }}>Qué gasta la IA del plan</h3>
        <p className="muted chico" style={{ marginTop: 0 }}>Una «consulta de IA» es un pedido a Claude. No importa cuánto texto escriba: cada pedido cuenta uno.</p>
        <div className="scroll-x">
          <table className="tabla">
            <thead><tr><th>Qué hacés</th><th>Cuánto usa</th><th /></tr></thead>
            <tbody>
              {COSTOS_IA.map(([que, cuanto, nota]) => <tr key={que}><td>{que}</td><td className="nowrap"><b>{cuanto}</b></td><td className="muted chico">{nota}</td></tr>)}
            </tbody>
          </table>
        </div>
        <h4 style={{ marginBottom: 6 }}>No gastan nada</h4>
        <ul className="uso-gratis">{GRATIS_IA.map(g => <li key={g}><Check size={13} /> {g}</li>)}</ul>
      </section>
    </>
  )
}
