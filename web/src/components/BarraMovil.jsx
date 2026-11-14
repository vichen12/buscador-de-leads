// Celular: barra de navegación flotante con «Buscar» elevado en el medio y la hoja «Más».
// Animaciones con framer-motion (respeta «reducir movimiento» del sistema).
import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'framer-motion'
import { MoreHorizontal, Search, X } from 'lucide-react'

const resorte = { type: 'spring', stiffness: 520, damping: 34, mass: 0.7 }

/** ¿El enlace está activo? (Por revisar con ?tab= sólo con esa pestaña) */
function estaActivo(to, loc) {
  const [ruta, qs] = to.split('?')
  if (ruta === '/revisar') return loc.pathname === '/revisar' && (new URLSearchParams(loc.search).get('tab') || '') === (new URLSearchParams(qs || '').get('tab') || '')
  return loc.pathname === ruta || loc.pathname.startsWith(ruta + '/')
}

function Insignia({ n, punto }) {
  if (!punto && !(n > 0)) return null
  return (
    <motion.span className={'bf-insignia' + (punto ? ' punto' : '')} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={resorte}
      aria-label={punto ? 'Hay pendientes' : `${n} pendientes`}>
      {punto ? null : n > 99 ? '99+' : n}
    </motion.span>
  )
}

function Item({ item, loc }) {
  const [to, label, Icono, badge] = item
  const activo = estaActivo(to, loc)
  return (
    <NavLink to={to} className={'bf-item' + (activo ? ' activo' : '')} aria-current={activo ? 'page' : undefined}>
      <motion.span className="bf-icono" whileTap={{ scale: 0.82 }} transition={resorte}>
        {activo && <motion.span layoutId="bf-pildora" className="bf-pildora" transition={resorte} />}
        <Icono size={21} strokeWidth={activo ? 2.3 : 1.9} aria-hidden="true" />
        <Insignia n={badge} />
      </motion.span>
      <span className="bf-texto">{label}</span>
    </NavLink>
  )
}

export default function BarraMovil({ items, enMas, hayMas, enlace }) {
  const loc = useLocation()
  const navegar = useNavigate()
  const quieto = useReducedMotion()
  const [mas, setMas] = useState(false)

  useEffect(() => { setMas(false) }, [loc.pathname])
  useEffect(() => {
    if (!mas) return
    const esc = e => e.key === 'Escape' && setMas(false)
    document.addEventListener('keydown', esc)
    document.body.classList.add('sin-scroll')
    return () => { document.removeEventListener('keydown', esc); document.body.classList.remove('sin-scroll') }
  }, [mas])

  // Buscar va al medio; dos a cada lado (el último es «Más»)
  const buscar = items.find(x => x[0] === '/buscar')
  const resto = items.filter(x => x[0] !== '/buscar').slice(0, 3)
  const izq = resto.slice(0, 2)
  const der = resto.slice(2)
  const enBuscar = loc.pathname === '/buscar'

  function irABuscar() {
    if (enBuscar) {
      window.scrollTo({ top: 0, behavior: quieto ? 'auto' : 'smooth' })
      setTimeout(() => document.querySelector('.bh-input, .barra-busqueda textarea, .barra-busqueda input, main textarea')?.focus(), quieto ? 0 : 350)
    } else navegar('/buscar')
  }

  return (
    <>
      <motion.nav className={'barra-flotante' + (mas ? ' con-hoja' : '')} aria-label="Secciones principales"
        initial={quieto ? false : { y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 36 }}>
        <LayoutGroup id="barra-flotante">
          <div className="bf-lado">{izq.map(it => <Item key={it[0]} item={it} loc={loc} />)}</div>
          <div className="bf-centro">
            <motion.button type="button" className={'bf-buscar' + (enBuscar ? ' activo' : '')} onClick={irABuscar}
              aria-label={buscar?.[1] || 'Buscar'} aria-current={enBuscar ? 'page' : undefined}
              whileTap={{ scale: 0.92 }} transition={resorte}>
              <Search size={21} strokeWidth={2.4} aria-hidden="true" />
            </motion.button>
            <span className={'bf-texto bf-texto-centro' + (enBuscar ? ' activo' : '')}>{buscar?.[1] || 'Buscar'}</span>
          </div>
          <div className="bf-lado">
            {der.map(it => <Item key={it[0]} item={it} loc={loc} />)}
            <button type="button" className={'bf-item' + (mas ? ' activo' : '')} onClick={() => setMas(v => !v)} aria-expanded={mas} aria-haspopup="dialog">
              <motion.span className="bf-icono" whileTap={{ scale: 0.82 }} transition={resorte}>
                {mas && <motion.span layoutId="bf-pildora" className="bf-pildora" transition={resorte} />}
                <motion.span animate={{ rotate: mas ? 90 : 0 }} transition={resorte} style={{ display: 'grid' }}>
                  {mas ? <X size={21} strokeWidth={2.3} /> : <MoreHorizontal size={21} strokeWidth={1.9} />}
                </motion.span>
                <Insignia punto={hayMas && !mas} />
              </motion.span>
              <span className="bf-texto">Más</span>
            </button>
          </div>
        </LayoutGroup>
      </motion.nav>

      <AnimatePresence>
        {mas && (
          <motion.div className="hoja-flotante" role="dialog" aria-modal="true" aria-label="Más secciones"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={e => e.target === e.currentTarget && setMas(false)}>
            <motion.div className="hoja-flotante-panel"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={quieto ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 38 }}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, i) => { if (i.offset.y > 90 || i.velocity.y > 500) setMas(false) }}>
              <span className="hoja-agarre" aria-hidden="true" />
              <div className="hoja-flotante-cab">
                <b>Más</b>
                <button type="button" className="bf-cerrar" onClick={() => setMas(false)} aria-label="Cerrar"><X size={18} /></button>
              </div>
              <motion.div className="hoja-flotante-grilla" initial="oculto" animate="visible"
                variants={{ visible: { transition: { staggerChildren: quieto ? 0 : 0.035, delayChildren: 0.06 } } }}>
                {enMas.map(it => (
                  <motion.div key={it[0]} variants={{ oculto: { opacity: 0, y: 14, scale: 0.96 }, visible: { opacity: 1, y: 0, scale: 1, transition: resorte } }}>
                    {enlace(it)}
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
