import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import Logo from '../components/Logo'
import { getDepartamentos, getProductosLista } from '../api'

// Vista simple (por ahora): elegir departamento productivo y ver sus productos especiales.
export default function AreasProductivasPage() {
  const navigate = useNavigate()
  const logout = useAppStore((s) => s.logout)

  const [departamentos, setDepartamentos] = useState([])
  const [depSel, setDepSel]   = useState('')
  const [productos, setProductos] = useState([])
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(false)

  // Solo departamentos marcados como área productiva
  useEffect(() => { getDepartamentos(true).then(setDepartamentos).catch(() => {}) }, [])

  useEffect(() => {
    if (!depSel) { setProductos([]); return }
    setLoading(true)
    getProductosLista(depSel, 'especial')
      .then(setProductos)
      .catch(() => setProductos([]))
      .finally(() => setLoading(false))
  }, [depSel])

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return productos
    return productos.filter((p) =>
      p.pro_nombre_producto?.toLowerCase().includes(q) || String(p.pro_codigo_plu).includes(q))
  }, [productos, search])

  return (
    <div className="min-h-screen bg-gray-950 max-w-2xl mx-auto">
      <header className="bg-teja-900 border-b border-teja-700/50 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => { logout(); navigate('/') }} className="text-gray-400 hover:text-white text-sm">← Salir</button>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Áreas Productivas</p>
          <h1 className="text-white font-bold">🏭 Solicitud Producción</h1>
        </div>
        <Logo imgClass="h-6" padClass="px-2.5 py-1" className="ml-auto" />
      </header>

      <div className="p-4 space-y-4">
        <div className="card p-4">
          <label className="label">Departamento</label>
          <select value={depSel} onChange={(e) => setDepSel(e.target.value)} className="input-field">
            <option value="">— Elige un departamento —</option>
            {departamentos.map((d) => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
          </select>
        </div>

        {depSel && (
          <>
            <div className="card p-3">
              <input type="text" placeholder="🔍 Buscar por nombre o PLU…" value={search}
                onChange={(e) => setSearch(e.target.value)} className="input-field" />
            </div>

            <div className="card divide-y divide-gray-800 overflow-hidden">
              {loading ? (
                <p className="text-center text-gray-500 py-8">Cargando…</p>
              ) : visibles.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No hay productos <b>especiales</b> en este departamento.
                </p>
              ) : (
                <>
                  <div className="px-4 py-3 border-b border-gray-700/50">
                    <p className="text-white font-semibold text-sm">{visibles.length} producto(s) especial(es)</p>
                  </div>
                  {visibles.map((p) => (
                    <div key={p.pro_codigo_plu} className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{p.pro_nombre_producto}</p>
                        <p className="text-gray-500 text-xs font-mono">
                          PLU {p.pro_codigo_plu} · Vta diaria: <span className="text-emerald-300">{p.vta_diaria}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
