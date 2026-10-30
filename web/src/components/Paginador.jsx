import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Paginación para listas largas. Uso:
 *   const pag = usePaginado(filtrados, 50, [filtro, q])
 *   pag.items.map(...)  ·  <Paginador {...pag} />
 * Vuelve a la página 1 cuando cambian los filtros (deps).
 */
export function usePaginado(lista, porPagina = 50, deps = []) {
  const [pagina, setPagina] = useState(1)
  const total = lista?.length ?? 0
  const paginas = Math.max(1, Math.ceil(total / porPagina))
  useEffect(() => { setPagina(1) }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pagina > paginas) setPagina(paginas) }, [paginas])
  const items = useMemo(() => (lista ?? []).slice((pagina - 1) * porPagina, pagina * porPagina), [lista, pagina, porPagina])
  return { items, pagina, paginas, total, porPagina, setPagina }
}

export function Paginador({ pagina, paginas, total, porPagina, setPagina, alSubir = true }) {
  if (paginas <= 1) return null
  const ir = p => { setPagina(p); if (alSubir) window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const desde = (pagina - 1) * porPagina + 1, hasta = Math.min(total, pagina * porPagina)
  const numeros = []
  for (let p = 1; p <= paginas; p++) if (p === 1 || p === paginas || Math.abs(p - pagina) <= 1) numeros.push(p); else if (numeros[numeros.length - 1] !== '…') numeros.push('…')
  return (
    <nav className="paginador" aria-label="Páginas">
      <span className="muted chico">{desde.toLocaleString('es-AR')}–{hasta.toLocaleString('es-AR')} de {total.toLocaleString('es-AR')}</span>
      <div className="paginador-botones">
        <button type="button" onClick={() => ir(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior"><ChevronLeft size={15} /></button>
        {numeros.map((n, i) => n === '…' ? <span key={'s' + i} className="muted">…</span> : <button key={n} type="button" className={n === pagina ? 'activo' : ''} onClick={() => ir(n)} aria-current={n === pagina ? 'page' : undefined}>{n}</button>)}
        <button type="button" onClick={() => ir(pagina + 1)} disabled={pagina === paginas} aria-label="Página siguiente"><ChevronRight size={15} /></button>
      </div>
    </nav>
  )
}

/** Trae todas las filas de una consulta de a 1000 (el máximo que devuelve Supabase por pedido) */
export async function traerTodo(armarConsulta, maximo = 20000) {
  let filas = [], desde = 0
  for (;;) {
    const { data, error } = await armarConsulta().range(desde, desde + 999)
    if (error) return { data: filas.length ? filas : null, error }
    filas = filas.concat(data ?? [])
    if (!data || data.length < 1000 || filas.length >= maximo) break
    desde += 1000
  }
  return { data: filas, error: null }
}
