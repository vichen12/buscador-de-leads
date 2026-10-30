import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

export const MAX_MB = 20
const limpio = n => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_').slice(-80)
export const tamanoLegible = b => b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

/** Firma con imagen y archivos para adjuntar en los emails del usuario */
export function useArchivos(uid) {
  const [lista, setLista] = useState(null)
  const [firmaUrl, setFirmaUrl] = useState('')
  async function cargar() {
    const { data } = await supabase.from('archivos').select('*').neq('tipo', 'empresa').order('created_at')
    setLista(data ?? [])
    const f = (data ?? []).find(a => a.tipo === 'firma')
    if (f) { const { data: u } = await supabase.storage.from('archivos').createSignedUrl(f.path, 3600); setFirmaUrl(u?.signedUrl ?? '') } else setFirmaUrl('')
  }
  useEffect(() => { if (uid) cargar() }, [uid])

  async function subir(archivo, tipo, descripcion = '') {
    if (archivo.size > MAX_MB * 1048576) throw new Error(`El archivo pesa ${tamanoLegible(archivo.size)}: el máximo es ${MAX_MB} MB.`)
    if (tipo === 'firma' && !/^image\/(png|jpe?g|gif|webp)$/.test(archivo.type)) throw new Error('La firma tiene que ser una imagen (PNG o JPG).')
    const path = `${uid}/${tipo}/${crypto.randomUUID().slice(0, 8)}-${limpio(archivo.name)}`
    const { error } = await supabase.storage.from('archivos').upload(path, archivo, { contentType: archivo.type || 'application/octet-stream' })
    if (error) throw error
    if (tipo === 'firma') {
      const vieja = lista?.find(a => a.tipo === 'firma')
      if (vieja) await borrar(vieja, false)
    }
    const { data: fila, error: e2 } = await supabase.from('archivos').insert({ tipo, nombre: archivo.name, path, mime: archivo.type || 'application/octet-stream', tamano: archivo.size, descripcion }).select().single()
    if (e2) { await supabase.storage.from('archivos').remove([path]); throw e2 }
    await cargar()
    return fila
  }
  async function borrar(a, recargar = true) {
    await supabase.storage.from('archivos').remove([a.path])
    const { error } = await supabase.from('archivos').delete().eq('id', a.id)
    if (error) throw error
    if (recargar) await cargar()
  }
  async function describir(a, descripcion) {
    const { error } = await supabase.from('archivos').update({ descripcion }).eq('id', a.id)
    if (error) throw error
    setLista(l => l.map(x => x.id === a.id ? { ...x, descripcion } : x))
  }
  async function siempre(a, valor) {
    const { error } = await supabase.from('archivos').update({ siempre: valor }).eq('id', a.id)
    if (error) throw error
    setLista(l => l.map(x => x.id === a.id ? { ...x, siempre: valor } : x))
  }
  return { siempre, lista, firma: lista?.find(a => a.tipo === 'firma') ?? null, adjuntos: (lista ?? []).filter(a => a.tipo === 'adjunto'), firmaUrl, subir, borrar, describir, cargar }
}
