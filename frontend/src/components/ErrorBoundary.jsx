import { Component } from 'react'

/**
 * Captura cualquier error de render en el árbol y muestra una pantalla de
 * recuperación en vez de dejar la app en negro. Sin esto, un solo componente
 * que lance (ej: una respuesta del API que no es la esperada) tumba toda la SPA.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-rose-600/20 rounded-2xl flex items-center justify-center text-3xl mb-4">⚠️</div>
        <h1 className="text-white font-bold text-xl mb-2">Algo salió mal</h1>
        <p className="text-gray-400 text-sm max-w-sm mb-1">
          La app no pudo cargar correctamente. Suele deberse a que el servidor no está disponible
          o a datos en caché.
        </p>
        <p className="text-gray-600 text-xs font-mono max-w-sm mb-6 break-words">
          {String(this.state.error?.message || this.state.error)}
        </p>
        <div className="flex gap-3">
          <button onClick={() => window.location.reload()} className="btn-primary">Recargar</button>
          <button
            onClick={() => { try { localStorage.clear() } catch (_) {} window.location.href = '/' }}
            className="btn-secondary">
            Reiniciar sesión
          </button>
        </div>
      </div>
    )
  }
}
