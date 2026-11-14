import { supabase } from './supabase.js'

/**
 * B2C: una empresa encontrada en Buscar pasa a tus Aliados (negocios que te pueden recomendar
 * clientes). Queda marcada como revisada para que la búsqueda no la vuelva a traer.
 */
export async function sumarComoAliado(h) {
  const { error } = await supabase.from('aliados').insert({
    nombre: String(h.nombre ?? '').slice(0, 160), rubro: h.rubro || null, zona: h.zona || null,
    email: h.email || null, telefono: h.telefono || null, web: h.web || h.web_actual || null, instagram: h.instagram || null,
    notas: [h.descripcion, h.encaje].filter(Boolean).join('\n\n').slice(0, 2000),
  })
  if (error) throw error
  if (h.id) {
    const { error: e2 } = await supabase.from('hallazgos').update({ estado: 'aprobado', revisado_at: new Date().toISOString() }).eq('id', h.id).eq('estado', 'por_revisar')
    if (e2) throw e2
  }
}
