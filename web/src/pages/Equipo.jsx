import { useCallback, useEffect, useState } from 'react'
import { UsersRound, UserPlus, Loader2, KeyRound, Copy, ShieldCheck, Power } from 'lucide-react'
import { supabase, llamarFuncion } from '../lib/supabase.js'
import { mensajeError, fecha } from '../lib/util.js'
import { Avatar, Cargando, ErrorCarga, Vacio, Modal, useToast, useConfirmar } from '../components/ui.jsx'
import { useApp } from '../App.jsx'

/** Equipo de la empresa: el Admin suma vendedores (dentro del límite del plan), cambia roles y desactiva usuarios */
export default function Equipo() {
  const { perfil, acceso } = useApp()
  const toast = useToast()
  const confirmar = useConfirmar()
  const [lista, setLista] = useState(null)
  const [error, setError] = useState('')
  const [nuevo, setNuevo] = useState(null)
  const [clave, setClave] = useState(null) // { email, password } para mostrar una sola vez
  const [trabajando, setTrabajando] = useState('')
  const esAdmin = perfil?.rol === 'admin' || perfil?.es_admin

  const cargar = useCallback(async () => {
    setError('')
    const { data, error } = await supabase.rpc('mi_equipo')
    if (error) { setError(mensajeError(error)); setLista([]) } else setLista(data ?? [])
  }, [])
  useEffect(() => { cargar() }, [cargar])

  async function crear(e) {
    e.preventDefault()
    setTrabajando('crear')
    try {
      const r = await llamarFuncion('admin-usuarios', { modo: 'crear', email: nuevo.email, nombre: nuevo.nombre, rol: nuevo.rol })
      setNuevo(null); setClave(r); cargar()
    } catch (err) { toast(mensajeError(err), 'error') }
    setTrabajando('')
  }
  async function restablecer(u) {
    if (!(await confirmar({ titulo: `¿Nueva contraseña para ${u.nombre || u.email}?`, texto: 'La anterior deja de funcionar. Pasale la nueva por un canal seguro.', aceptar: 'Generar' }))) return
    setTrabajando(u.id)
    try { setClave(await llamarFuncion('admin-usuarios', { modo: 'restablecer', id: u.id })) } catch (err) { toast(mensajeError(err), 'error') }
    setTrabajando('')
  }
  async function actualizar(u, cambio) {
    if (cambio.p_activo === false && !(await confirmar({ titulo: `¿Desactivar a ${u.nombre || u.email}?`, texto: 'No va a poder entrar. Sus empresas y su historial quedan guardados.', aceptar: 'Desactivar', peligro: true }))) return
    const { error } = await supabase.rpc('equipo_actualizar', { p_id: u.id, ...cambio })
    if (error) toast(mensajeError(error), 'error'); else { toast('Listo'); cargar() }
  }

  if (lista === null) return <Cargando />
  const activos = lista.filter(u => u.activo).length
  return (
    <>
      <header className="cabecera">
        <div><h1>Equipo</h1><p>Las personas de {acceso?.empresa || 'tu empresa'}. El <b>Admin</b> configura casillas, firma, archivos y estrategia y suma usuarios; el <b>Vendedor</b> trabaja las empresas.</p></div>
        {esAdmin && <div className="acciones"><button className="btn primario" onClick={() => setNuevo({ nombre: '', email: '', rol: 'vendedor' })}><UserPlus size={16} /> Sumar a alguien</button></div>}
      </header>
      {error && <ErrorCarga error={error} onReintentar={cargar} />}
      {!lista.length ? <section className="tarjeta"><Vacio icono={UsersRound} titulo="Todavía estás solo">Sumá a tu equipo para repartir el trabajo: todos ven las mismas empresas y nadie le escribe dos veces a la misma.</Vacio></section> : (
        <section className="tarjeta sin-pad">
          <div className="scroll-x">
            <table className="tabla">
              <thead><tr><th>Persona</th><th>Rol</th><th>Empresas</th><th>Envíos del mes</th><th>Clientes</th><th>Desde</th><th /></tr></thead>
              <tbody>
                {lista.map(u => (
                  <tr key={u.id} className={u.activo ? '' : 'apagado'}>
                    <td><div className="celda-persona"><Avatar nombre={u.nombre || u.email} /><div><b>{u.nombre || '—'}</b><div className="muted chico">{u.email}</div></div></div></td>
                    <td>{esAdmin && u.id !== perfil.id
                      ? <select value={u.rol} onChange={e => actualizar(u, { p_rol: e.target.value })} aria-label={'Rol de ' + u.email}><option value="admin">Admin</option><option value="vendedor">Vendedor</option></select>
                      : <span className="chip">{u.rol === 'admin' ? <><ShieldCheck size={11} /> Admin</> : 'Vendedor'}</span>}</td>
                    <td>{u.empresas}</td><td>{u.enviados_mes}</td><td>{u.clientes}</td><td className="nowrap">{fecha(u.creado)}</td>
                    <td className="nowrap">{esAdmin && u.id !== perfil.id && <>
                      <button className="btn chico fantasma" onClick={() => restablecer(u)} disabled={trabajando === u.id} title="Nueva contraseña"><KeyRound size={14} /></button>
                      <button className="btn chico fantasma" onClick={() => actualizar(u, { p_activo: !u.activo })} title={u.activo ? 'Desactivar' : 'Activar'}><Power size={14} /> {u.activo ? 'Desactivar' : 'Activar'}</button>
                    </>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted chico" style={{ padding: '10px 18px' }}>{activos} {activos === 1 ? 'usuario activo' : 'usuarios activos'}. El límite depende de tu plan.</p>
        </section>
      )}

      {nuevo && (
        <Modal onCerrar={() => setNuevo(null)} ancho={480}>
          <form onSubmit={crear}>
            <h3 style={{ marginTop: 0 }}><UserPlus size={18} style={{ verticalAlign: -3 }} /> Sumar a alguien</h3>
            <label>Nombre<input value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} required autoFocus /></label>
            <label>Email<input type="email" value={nuevo.email} onChange={e => setNuevo({ ...nuevo, email: e.target.value })} required /></label>
            <label>Rol<select value={nuevo.rol} onChange={e => setNuevo({ ...nuevo, rol: e.target.value })}><option value="vendedor">Vendedor: trabaja las empresas</option><option value="admin">Admin: además configura y suma usuarios</option></select></label>
            <p className="muted chico">Le generamos una contraseña para que entre; se la pasás vos.</p>
            <div className="acciones fin"><button type="button" className="btn" onClick={() => setNuevo(null)}>Cancelar</button><button className="btn primario" disabled={trabajando === 'crear'}>{trabajando === 'crear' && <Loader2 size={15} className="spin" />} Crear usuario</button></div>
          </form>
        </Modal>
      )}
      {clave && (
        <Modal onCerrar={() => setClave(null)} ancho={460}>
          <h3 style={{ marginTop: 0 }}><KeyRound size={18} style={{ verticalAlign: -3 }} /> Contraseña de {clave.email}</h3>
          <p className="muted chico">Copiala ahora: por seguridad no se vuelve a mostrar.</p>
          <div className="clave-mostrar"><code>{clave.password}</code><button className="btn chico" onClick={() => navigator.clipboard.writeText(`${clave.email}\n${clave.password}`).then(() => toast('Copiado'))}><Copy size={14} /> Copiar</button></div>
          <div className="acciones fin"><button className="btn primario" onClick={() => setClave(null)}>Listo</button></div>
        </Modal>
      )}
    </>
  )
}
