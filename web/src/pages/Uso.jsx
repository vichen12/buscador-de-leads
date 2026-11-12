import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles, Mail, MessageCircle, Flame, ArrowRight, Check, Zap } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { useApp } from '../App.jsx'
import { leerIA, COSTOS_IA, GRATIS_IA } from '../lib/uso.js'

const n = v => Number(v ?? 0).toLocaleString('es-AR')

/** Un límite, con el mismo formato que los números del Tablero */
function Limite({ icono: Icono, titulo, quedan, usadas, limite, sinTope, renueva, alerta, nota, accion }) {
  const pct = sinTope ? 0 : Math.min(100, (usadas / Math.max(1, limite)) * 100)
  return (
    <section className={'home-card uso-limite' + (alerta ? ' alerta' : '')}>
      <header>
        <div><h3 className="uso-titulo"><Icono size={16} /> {titulo}</h3><small>{sinTope ? 'Sin tope' : `Se renueva ${renueva}`}</small></div>
        {accion}
      </header>
      <div className="uso-cifra">
        <b>{sinTope ? n(usadas) : n(quedan)}</b>
        <span>{sinTope ? 'usadas' : quedan === 1 ? 'queda' : 'quedan'}</span>
      </div>
      {!sinTope && (
        <div>
          <div className={'cupo-barra' + (pct >= 80 ? ' alerta' : '')}><span style={{ width: pct + '%' }} /></div>
          <span className="rep-kpi-pie">{n(usadas)} de {n(limite)} usadas</span>
        </div>
      )}
      {nota && <p className="muted chico uso-nota">{nota}</p>}
    </section>
  )
}

/** Uso y límites: cuánto queda de cada límite, cuándo se renueva y qué gasta cada cosa */
export default function Uso() {
  const { tablero, perfil, acceso } = useApp()
  const [cupo, setCupo] = useState(null)
  useEffect(() => { supabase.rpc('mi_cupo_chat').then(({ data }) => setCupo(data ?? null)) }, [])
  const ia = leerIA(cupo)
  const lim = tablero?.email
  const wspLimite = perfil?.limite_diario ?? 15
  const wspUsados = lim ? 0 : tablero?.enviados_hoy ?? 0
  const esAdmin = perfil?.rol === 'admin' || perfil?.es_admin

  return (
    <div className="home">
      <header className="home-cab">
        <div>
          <p className="home-fecha">Tu cuenta</p>
          <h1>Uso y límites</h1>
          <p className="home-sub">Tres límites, cada uno cuida algo distinto. Acá ves cuánto te queda y cuándo se renueva.</p>
        </div>
      </header>

      <div className="home-grid uso-grid">
        {ia && (
          <Limite icono={Sparkles} titulo="IA del plan" quedan={ia.quedan} usadas={ia.usadas} limite={ia.limite} sinTope={ia.sinTope}
            renueva={ia.renueva} alerta={ia.pct >= 80}
            nota={ia.agotada
              ? `Se terminaron: hasta que se renueven no se puede buscar ni pedirle textos a Claude. Tu lista, los mails ya escritos y los seguimientos siguen andando.${ia.porMes ? (esAdmin ? ' Para tener más, pedí que te amplíen el plan.' : ' Para tener más, hablá con el admin de tu empresa.') : ''}`
              : ia.porMes ? `Consultas a Claude de toda ${acceso?.empresa || 'tu empresa'}: lo que usa uno se le descuenta a todo el equipo.` : 'Tus consultas a Claude de hoy.'} />
        )}

        {lim ? (
          <Limite icono={Mail} titulo="Emails de tu casilla" quedan={Math.max(0, (lim.limite_hoy ?? 0) - (lim.enviados_hoy ?? 0))}
            usadas={lim.enviados_hoy ?? 0} limite={lim.limite_hoy ?? 0} renueva="mañana"
            nota={lim.calentando
              ? <><Flame size={12} style={{ verticalAlign: -1 }} /> Casilla en calentamiento, semana {lim.etapa} de 3: sube sola hasta {lim.elegido} por día. Así tus mails no caen en spam.</>
              : 'Para que tus mails no caigan en spam. Lo que no entra hoy sale solo mañana.'}
            accion={<Link to="/email" className="chico">Cambiar <ArrowRight size={13} style={{ verticalAlign: -2 }} /></Link>} />
        ) : (
          <section className="home-card uso-limite">
            <header><div><h3 className="uso-titulo"><Mail size={16} /> Emails de tu casilla</h3><small>Por día</small></div></header>
            <p className="muted">Todavía no conectaste tu email.</p>
            <Link className="btn primario uso-boton" to="/email">Conectar mi email <ArrowRight size={15} /></Link>
          </section>
        )}

        <Limite icono={MessageCircle} titulo="WhatsApp e Instagram" quedan={Math.max(0, wspLimite - wspUsados)} usadas={wspUsados} limite={wspLimite}
          renueva="mañana" nota="Mensajes que mandás vos desde tu teléfono. El tope cuida tu número."
          accion={<Link to="/cuenta" className="chico">Cambiar <ArrowRight size={13} style={{ verticalAlign: -2 }} /></Link>} />
      </div>

      <div className="home-grid uso-grid-costos">
        <section className="home-card">
          <header><div><h3 className="uso-titulo"><Zap size={16} /> Qué gasta la IA del plan</h3><small>Cada pedido a Claude cuenta uno, escriba lo que escriba</small></div></header>
          <div className="accion-lista">
            {COSTOS_IA.map(([que, cuanto, nota]) => (
              <div key={que} className="accion-item uso-costo">
                <div><b className="fuerte">{que}</b>{nota && <div className="muted chico">{nota}</div>}</div>
                <span className="espacio" /><span className="chip ia">{cuanto}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="home-card">
          <header><div><h3 className="uso-titulo"><Check size={16} /> No gastan nada</h3><small>Usalas todo lo que quieras</small></div></header>
          <div className="accion-lista">
            {GRATIS_IA.map(g => <div key={g} className="accion-item uso-costo"><b className="fuerte">{g}</b><span className="espacio" /><span className="chip ok">gratis</span></div>)}
          </div>
        </section>
      </div>
    </div>
  )
}
