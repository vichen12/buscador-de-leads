// Instalar Prospecta como app (PWA). Chrome/Edge avisan con «beforeinstallprompt»; se guarda el aviso
// para ofrecerlo desde un botón. En iPhone no existe: ahí se explica «Compartir → Agregar a inicio».
import { useEffect, useState } from 'react'

let aviso = null
const oyentes = new Set()
const avisar = () => oyentes.forEach(f => f())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); aviso = e; avisar() })
  window.addEventListener('appinstalled', () => { aviso = null; avisar() })
  if ('serviceWorker' in navigator && import.meta.env?.PROD) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}) })
  }
}

export const yaInstalada = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
export const esIphone = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)

/** { puede, instalar, instalada, iphone } para un botón «Instalar la app». */
export function useInstalar() {
  const [, tick] = useState(0)
  useEffect(() => { const f = () => tick(n => n + 1); oyentes.add(f); return () => oyentes.delete(f) }, [])
  return {
    puede: !!aviso,
    instalada: yaInstalada(),
    iphone: esIphone(),
    instalar: async () => { if (!aviso) return false; aviso.prompt(); const r = await aviso.userChoice.catch(() => null); aviso = null; avisar(); return r?.outcome === 'accepted' },
  }
}
