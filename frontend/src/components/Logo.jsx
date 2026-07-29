import { useState } from 'react'

/**
 * Logo oficial Teja Market sobre franja blanca (para que se vea bien en el
 * fondo oscuro de la app). Usa /logo.png; si no está el archivo, cae a un
 * respaldo de texto con los colores de la marca para no verse roto.
 */
export default function Logo({ imgClass = 'h-9', className = '', padClass = 'px-4 py-2' }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`inline-flex items-center rounded-xl bg-white ${padClass} shadow-lg shadow-black/20 ${className}`}>
      {failed ? (
        <span className="text-2xl font-extrabold tracking-tight leading-none">
          <span className="text-teja">teja</span><span className="text-brand-500">market</span>
        </span>
      ) : (
        <img src="/logo.png" alt="Teja Market" className={imgClass}
          onError={() => setFailed(true)} />
      )}
    </span>
  )
}
