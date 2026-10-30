// Resumen semanal por mail: los lunes a la mañana (hora de cada persona) se manda a sí misma, desde su casilla,
// un mail con lo que pasó la semana y lo que tiene pendiente. Se puede apagar con config_email.resumen_semanal = false.
// Módulo remoto: no importa npm ni supabase.ts (recibe el cliente ya armado).
import { enviarMail } from './correo.ts'

type Dic = Record<string, any>

function horaLocal(tz: string) {
  const l = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
  return { dia: l.getDay(), hora: l.getHours() }
}

export async function resumenSemanal(db: any, fin: number, urlApp: string) {
  const { data: cs } = await db.from('conexiones_correo').select('*')
  let mandados = 0
  for (const cfg of cs ?? []) {
    if (Date.now() > fin) break
    const { data: perfil } = await db.from('perfiles').select('nombre, zona_horaria, config_email, activo, modo').eq('id', cfg.owner_id).maybeSingle()
    if (!perfil?.activo || (perfil.config_email as Dic)?.resumen_semanal === false) continue
    const { dia, hora } = horaLocal(perfil.zona_horaria || 'America/Argentina/Buenos_Aires')
    if (dia !== 1 || hora < 8 || hora > 10) continue
    const hace6 = new Date(Date.now() - 6 * 864e5).toISOString()
    const { count: ya } = await db.from('auditoria').select('id', { count: 'exact', head: true }).eq('owner_id', cfg.owner_id).eq('accion', 'resumen_semanal').gte('created_at', hace6)
    if (ya) continue
    const { data: clave } = await db.rpc('correo_leer_secreto', { p_owner: cfg.owner_id })
    if (!clave) continue

    const semana = new Date(Date.now() - 7 * 864e5).toISOString()
    const yo = cfg.owner_id
    const c = async (q: any) => (await q).count ?? 0
    const [enviados, respuestas, interesados, reuniones, clientes, tareas, sinLeer, porRevisar] = await Promise.all([
      c(db.from('interacciones').select('id', { count: 'exact', head: true }).eq('owner_id', yo).eq('tipo', 'enviado').gte('created_at', semana)),
      c(db.from('respuestas').select('id', { count: 'exact', head: true }).eq('owner_id', yo).gte('recibida_at', semana).not('clasificacion', 'in', '(fuera_oficina,rebote)')),
      c(db.from('respuestas').select('id', { count: 'exact', head: true }).eq('owner_id', yo).gte('recibida_at', semana).in('clasificacion', ['interesado', 'reunion', 'pide_info'])),
      c(db.from('interacciones').select('id', { count: 'exact', head: true }).eq('owner_id', yo).eq('tipo', 'cambio_estado').ilike('detalle', '%reuni%').gte('created_at', semana)),
      c(db.from('interacciones').select('id', { count: 'exact', head: true }).eq('owner_id', yo).eq('tipo', 'cambio_estado').ilike('detalle', '%cliente%').gte('created_at', semana)),
      c(db.from('tareas').select('id', { count: 'exact', head: true }).eq('owner_id', yo).is('hecha_at', null).lte('vence', new Date().toISOString().slice(0, 10))),
      c(db.from('respuestas').select('id', { count: 'exact', head: true }).eq('owner_id', yo).eq('leida', false)),
      c(db.from('hallazgos').select('id', { count: 'exact', head: true }).eq('owner_id', yo).eq('estado', 'por_revisar')),
    ])
    if (!enviados && !respuestas && !tareas && !sinLeer && !porRevisar) {
      await db.from('auditoria').insert({ owner_id: yo, accion: 'resumen_semanal', detalle: 'sin actividad: no se mandó' })
      continue
    }
    const nombre = String(perfil.nombre || '').split(' ')[0]
    const tasa = enviados ? Math.round((respuestas / enviados) * 100) : 0
    const cuerpo = `Hola${nombre ? ' ' + nombre : ''},

Así te fue la semana pasada en Prospecta:

• Mensajes enviados: ${enviados}
• Te respondieron: ${respuestas}${enviados ? ` (${tasa}%)` : ''}${interesados ? `, ${interesados} con interés` : ''}
• Reuniones: ${reuniones}
• Clientes nuevos: ${clientes}

Para esta semana:
${[sinLeer && `• ${sinLeer} respuestas sin leer`, tareas && `• ${tareas} tareas para hoy o vencidas`, porRevisar && `• ${porRevisar} empresas encontradas esperan tu revisión`].filter(Boolean).join('\n') || '• Estás al día. Buen momento para buscar empresas nuevas.'}

Entrá a "Tu día" para verlo en orden: ${urlApp}/hoy

Prospecta
(Este resumen te lo mandás vos mismo desde tu casilla. Lo podés apagar en Email.)`
    try {
      const copia = await enviarMail(cfg, clave, cfg.email, `Tu semana en Prospecta: ${enviados} envíos, ${respuestas} respuestas`, cuerpo)
      void copia
      await db.from('auditoria').insert({ owner_id: yo, accion: 'resumen_semanal', detalle: `${enviados} envíos, ${respuestas} respuestas` })
      mandados++
    } catch (e) { console.error('resumen semanal', e) }
  }
  return mandados
}
