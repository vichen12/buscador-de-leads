import React from 'react'

// Si una pantalla se rompe, en vez de dejar todo en blanco muestra un aviso y deja recargar.
export default class FalloPantalla extends React.Component {
  state = { error: null }
  static getDerivedStateFromError(error) { return { error } }
  // Se avisa al registro de errores de main.jsx (React no lo manda solo cuando lo atrapa acá)
  componentDidCatch(error) { try { window.dispatchEvent(new ErrorEvent('error', { message: error?.message, error })) } catch { /* nada */ } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ maxWidth: 420, margin: '15vh auto', padding: '0 16px', textAlign: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <h2 style={{ marginBottom: 8 }}>Algo falló al abrir esta pantalla</h2>
        <p style={{ color: '#666', marginBottom: 20 }}>Probá recargar. Si sigue pasando, volvé al inicio.</p>
        <button className="btn" onClick={() => window.location.reload()}>Recargar</button>{' '}
        <button className="btn" onClick={() => { window.location.href = '/' }}>Ir al inicio</button>
      </div>
    )
  }
}
