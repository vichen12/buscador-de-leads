// Service worker de Prospecta: lo justo para que se pueda instalar como app y abra aunque la red falle.
// - Navegación: primero la red (siempre la versión nueva); si no hay red, la última página guardada.
// - Archivos con hash (/assets/…): se guardan y se sirven de ahí (no cambian nunca).
// - Todo lo demás (Supabase, APIs): directo a la red, sin guardar nada.
const CACHE = 'prospecta-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
  await self.clients.claim()
})()))

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const r = await fetch(req)
        if (r.ok) (await caches.open(CACHE)).put('/', r.clone())
        return r
      } catch {
        return (await caches.match('/')) ?? new Response('Sin conexión. Volvé a intentar cuando tengas internet.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      }
    })())
    return
  }
  if (url.pathname.startsWith('/assets/') || /^\/icono/.test(url.pathname)) {
    e.respondWith((async () => {
      const c = await caches.open(CACHE)
      const hit = await c.match(req)
      if (hit) return hit
      const r = await fetch(req)
      if (r.ok) c.put(req, r.clone())
      return r
    })())
  }
})
