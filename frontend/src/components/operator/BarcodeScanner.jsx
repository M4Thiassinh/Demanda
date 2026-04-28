import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

/**
 * Modal de escáner de código de barras usando la cámara trasera.
 * Compatible con Android Chrome y Safari iOS (con permiso de cámara).
 *
 * @param {function} onScan  - Callback con el texto escaneado
 * @param {function} onClose - Cierra el modal
 */
export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef = useRef(null)
  const [error, setError] = useState('')
  const [iniciado, setIniciado] = useState(false)

  useEffect(() => {
    const scanner = new Html5Qrcode('qr-reader')
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },          // cámara trasera
        { fps: 12, qrbox: { width: 280, height: 120 } }, // rectángulo horizontal para barras
        (texto) => {
          // Éxito: detiene la cámara y devuelve el resultado
          scanner.stop().catch(() => {})
          onScan(texto.trim())
        },
        () => {} // errores de frame (silenciosos)
      )
      .then(() => setIniciado(true))
      .catch((err) => {
        setError('No se pudo acceder a la cámara. Revisa los permisos.')
        console.error(err)
      })

    return () => {
      // Cleanup al desmontar
      scanner.stop().catch(() => {})
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gray-900 border-b border-gray-700">
        <div>
          <p className="text-white font-bold text-lg">📷 Escanear código</p>
          <p className="text-gray-400 text-xs mt-0.5">Apunta la cámara al código de barras</p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white text-xl transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Visor de cámara */}
      <div className="flex-1 flex flex-col items-center justify-center bg-black relative">
        <div id="qr-reader" className="w-full max-w-lg" />

        {/* Guía visual */}
        {iniciado && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-brand-500 rounded-xl w-72 h-28 relative">
              {/* Esquinas animadas */}
              <div className="absolute top-0 left-0 w-5 h-5 border-t-4 border-l-4 border-brand-400 rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-5 h-5 border-t-4 border-r-4 border-brand-400 rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-5 h-5 border-b-4 border-l-4 border-brand-400 rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-4 border-r-4 border-brand-400 rounded-br-lg" />
              {/* Línea de escaneo animada */}
              <div className="absolute inset-x-2 top-1/2 h-0.5 bg-brand-500/70 animate-pulse-soft" />
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            <p className="text-5xl mb-4">🚫</p>
            <p className="text-white font-semibold">{error}</p>
            <p className="text-gray-400 text-sm mt-2">Ve a Configuración → Safari/Chrome → Cámara → Permitir</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-900 px-5 py-4 text-center border-t border-gray-700">
        <p className="text-gray-400 text-sm">También puedes escribir el PLU o nombre en el buscador</p>
        <button onClick={onClose} className="mt-3 btn-secondary w-full">
          Cancelar
        </button>
      </div>
    </div>
  )
}
