import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'

// Todos los formatos de código de barras 1D y QR
const FORMATOS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
]

export default function BarcodeScanner({ onScan, onClose }) {
  const scannerRef  = useRef(null)
  const [error, setError]         = useState('')
  const [escaneado, setEscaneado] = useState('') // muestra el último código detectado

  useEffect(() => {
    // formatsToSupport activa los decodificadores 1D
    const scanner = new Html5Qrcode('qr-reader', {
      formatsToSupport: FORMATOS,
      verbose: false,
    })
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps:   15,
          // Rectángulo horizontal → ideal para códigos de barras 1D
          qrbox: (w, h) => ({ width: Math.min(w - 40, 380), height: 130 }),
          aspectRatio: 1.7,
        },
        (texto) => {
          if (scannerRef.current.isStopping) return;
          scannerRef.current.isStopping = true;
          setEscaneado(texto.trim())
          scanner.stop().then(() => {
            onScan(texto.trim())
          }).catch(() => {
            onScan(texto.trim())
          })
        },
        () => {} // errores de frame silenciosos
      )
      .catch((err) => {
        if (err.toString().includes('Permission')) {
          setError('Sin permiso de cámara. Ve a Configuración del navegador → Cámara → Permitir.')
        } else {
          setError('No se pudo iniciar la cámara: ' + err)
        }
      })

    return () => { 
      if (scanner && !scanner.isStopping) {
        scanner.isStopping = true;
        scanner.stop().catch(() => {}) 
      }
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-gray-900 border-b border-gray-700">
        <div>
          <p className="text-white font-bold text-lg">📷 Escanear código</p>
          <p className="text-gray-400 text-xs mt-0.5">Apunta al código de barras — mantén firme</p>
        </div>
        <button onClick={onClose}
          className="w-10 h-10 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-white text-xl">
          ✕
        </button>
      </div>

      {/* Visor */}
      <div className="flex-1 flex flex-col items-center justify-center bg-black relative overflow-hidden">
        <div id="qr-reader" className="w-full" />

        {/* Guía visual (línea horizontal de escaneo) */}
        {!error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative border-2 border-brand-500/60 rounded-xl"
              style={{ width: 'min(calc(100% - 40px), 380px)', height: '130px' }}>
              {/* Esquinas */}
              {[['top-0 left-0','border-t-4 border-l-4 rounded-tl-xl'],
                ['top-0 right-0','border-t-4 border-r-4 rounded-tr-xl'],
                ['bottom-0 left-0','border-b-4 border-l-4 rounded-bl-xl'],
                ['bottom-0 right-0','border-b-4 border-r-4 rounded-br-xl']
              ].map(([pos, cls]) => (
                <div key={pos} className={`absolute w-6 h-6 border-brand-400 ${pos} ${cls}`} />
              ))}
              {/* Línea de escaneo animada */}
              <div className="absolute inset-x-4 top-1/2 h-0.5 bg-brand-500 animate-pulse-soft opacity-80" />
            </div>
          </div>
        )}

        {/* Último código detectado (feedback visual) */}
        {escaneado && (
          <div className="absolute bottom-4 left-4 right-4 bg-emerald-900/80 border border-emerald-500 rounded-xl px-4 py-2 text-center">
            <p className="text-emerald-300 text-sm font-mono">✅ Detectado: {escaneado}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gray-950">
            <p className="text-5xl mb-4">🚫</p>
            <p className="text-white font-semibold">{error}</p>
          </div>
        )}
      </div>

      {/* Consejos */}
      <div className="bg-gray-900 border-t border-gray-700 px-5 py-4 space-y-2">
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-500">
          <p>💡 Buena luz</p>
          <p>📏 10–20 cm</p>
          <p>🤚 Sin mover</p>
        </div>
        <button onClick={onClose} className="btn-secondary w-full mt-1">Cancelar</button>
      </div>
    </div>
  )
}
