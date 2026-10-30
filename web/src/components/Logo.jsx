// Logo de Prospecta: tres triángulos naranjas (la flecha que avanza) + "prospecta".
export function MarcaIcono({ size = 28, color = 'var(--acc)' }) {
  return (
    <svg width={size * 0.86} height={size} viewBox="0 0 250 291" aria-hidden="true" fill={color}>
      <path d="M49 0 L49 78 L249 138 Z" />
      <path d="M0 98 L0 195 L227 146 Z" />
      <path d="M49 213 L49 291 L249 153 Z" />
    </svg>
  )
}

export default function Logo({ size = 26, claro = false }) {
  return (
    <span className={'logo' + (claro ? ' claro' : '')} style={{ fontSize: size }}>
      <MarcaIcono size={size * 1.05} />
      <span className="logo-texto">prospecta</span>
    </span>
  )
}
