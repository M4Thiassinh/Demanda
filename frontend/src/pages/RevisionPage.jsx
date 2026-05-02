import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { buscarProductos, agregarDetalle, eliminarDetalle, finalizarRevision, obtenerRevision } from '../api'
import BarcodeScanner from '../components/operator/BarcodeScanner'

export default function RevisionPage() {
  const navigate = useNavigate()
  const { depId, depNombre, usuNombre, revisionId, revFolio, items, addItem, removeItem, clearRevision, reset } = useAppStore()

  const [query, setQuery]           = useState('')
  const [resultados, setRes]        = useState([])
  const [productoSel, setProducto]  = useState(null)
  const [stock, setStock]           = useState('')
  const [guardando, setGuardando]   = useState(false)
  const [finalizando, setFin]       = useState(false)
  const [modalResult, setModal]     = useState(null)
  const [escaner, setEscaner]       = useState(false)
  const [error, setError]           = useState('')
  const timerRef = useRef(null)
  const stockRef = useRef(null)

  // Cargar ítems previos si se recuperó una revisión activa
  useEffect(() => {
    if (revisionId && items.length === 0) {
      obtenerRevision(revisionId).then(rows => {
        rows.forEach(r => addItem(r))
      }).catch(() => {})
    }
  }, [revisionId])

  // Búsqueda con debounce (PLU, código barra o nombre)
  // Al escanear: busca automáticamente y selecciona si hay resultado único
  const onScan = async (codigo) => {
    setEscaner(false)
    setQuery(codigo)
    try {
      const res = await buscarProductos(depId, codigo)
      if (Array.isArray(res)) {
        if (res.length === 1) {
          seleccionar(res[0])
        } else if (res.length > 1) {
          setRes(res)
        } else {
          setError(`Código "${codigo}" no encontrado en este departamento`)
        }
      } else {
        setError('Error en el formato de respuesta del servidor (Posible bloqueo de Ngrok).')
      }
    } catch {}
  }

  const buscar = (q) => {
    setQuery(q)
    clearTimeout(timerRef.current)
    if (q.length < 1) { setRes([]); return }
    timerRef.current = setTimeout(async () => {
      try { 
        const res = await buscarProductos(depId, q)
        if (Array.isArray(res)) {
          setRes(res)
        }
      } catch {}
    }, 250)
  }

  const seleccionar = (p) => {
    setProducto(p); setRes([]); setQuery(p.pro_nombre_producto)
    setError('')
    setTimeout(() => stockRef.current?.focus(), 100)
  }

  const agregar = async () => {
    if (!productoSel) return setError('Selecciona un producto')
    if (stock === '' || isNaN(parseInt(stock))) return setError('Ingresa el stock')
    setGuardando(true); setError('')
    try {
      await agregarDetalle(revisionId, productoSel.pro_codigo_plu, parseInt(stock))
      addItem({ ...productoSel, det_stock_sala: parseInt(stock) })
      setProducto(null); setStock(''); setQuery('')
    } catch (e) { setError(e?.response?.data?.error || 'Error') }
    finally { setGuardando(false) }
  }

  const quitar = async (plu) => {
    try { await eliminarDetalle(revisionId, plu); removeItem(plu) } catch {}
  }

  const finalizar = async () => {
    if (!items.length) return setError('Agrega al menos un producto')
    setFin(true)
    try { setModal(await finalizarRevision(revisionId)) }
    catch (e) { setError(e?.response?.data?.error || 'Error al finalizar') }
    finally { setFin(false) }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-700/50 px-4 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-xs text-gray-500 font-mono">{revFolio}</p>
          <h1 className="text-white font-bold">{depNombre}
            {usuNombre && <span className="ml-2 text-gray-400 font-normal text-sm">— {usuNombre}</span>}
          </h1>
        </div>
        <button id="btn-fin-header" onClick={finalizar} disabled={finalizando || !items.length}
          className="btn-primary py-2 px-4 text-sm disabled:opacity-40">
          {finalizando ? '⏳' : `✅ Finalizar (${items.length})`}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {/* Buscador dual: nombre/PLU/código de barras */}
        <div className="card p-4 space-y-3">
          <div className="relative">
            <label className="label">PLU, código de barras o nombre</label>
            <div className="flex gap-2">
              <input id="input-buscar" type="text" value={query} onChange={e => buscar(e.target.value)}
                onFocus={() => resultados.length && setRes(resultados)}
                placeholder="Escanea o escribe…" className="input-field py-4 text-base flex-1"
                autoComplete="off" />
              <button
                id="btn-camara"
                onClick={() => setEscaner(true)}
                title="Escanear con cámara"
                className="flex-shrink-0 w-14 bg-gray-700 hover:bg-brand-600 border border-gray-600 hover:border-brand-500 rounded-xl flex items-center justify-center text-2xl transition-all active:scale-95"
              >📷</button>
            </div>
            {query && (
              <button onClick={() => { setQuery(''); setProducto(null); setRes([]) }}
                className="absolute right-3 top-9 text-gray-500 hover:text-white text-lg">✕</button>
            )}
            {resultados.length > 0 && (
              <ul className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl overflow-hidden max-h-56 overflow-y-auto">
                {resultados.map(p => (
                  <li key={p.pro_codigo_plu} onClick={() => seleccionar(p)}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-700 cursor-pointer border-b border-gray-700/40 last:border-0">
                    <div>
                      <p className="text-white text-sm font-medium">{p.pro_nombre_producto}</p>
                      <p className="text-gray-400 text-xs font-mono">PLU {p.pro_codigo_plu}
                        {p.pro_codigo_barra && <span className="ml-2 text-gray-500">| {p.pro_codigo_barra}</span>}
                      </p>
                    </div>
                    <span className="text-brand-400 text-xs font-semibold">Selec.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {productoSel && (
            <div className="bg-brand-900/30 border border-brand-700/40 rounded-xl px-4 py-3 animate-fade-in">
              <p className="text-brand-300 font-semibold text-sm">{productoSel.pro_nombre_producto}</p>
              <p className="text-brand-500 text-xs font-mono">PLU {productoSel.pro_codigo_plu}</p>
            </div>
          )}

          <div>
            <label htmlFor="input-stock" className="label">Stock encontrado en sala</label>
            <input ref={stockRef} id="input-stock" type="number" inputMode="numeric" min={0}
              value={stock} onChange={e => setStock(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregar()}
              placeholder="0" className="input-field text-4xl font-bold text-center py-5" />
          </div>

          {error && <p className="text-rose-400 text-sm text-center animate-fade-in">{error}</p>}

          <button id="btn-anadir" onClick={agregar} disabled={guardando || !productoSel || stock === ''}
            className="btn-primary w-full disabled:opacity-40">
            {guardando ? 'Guardando…' : '+ Añadir a lista'}
          </button>
        </div>

        {/* Lista de ítems */}
        {items.length > 0 && (
          <div className="card overflow-hidden animate-slide-up">
            <div className="px-4 py-3 border-b border-gray-700/50">
              <p className="text-white font-semibold text-sm">{items.length} producto(s) en revisión</p>
            </div>
            <div className="divide-y divide-gray-700/40">
              {items.map(item => (
                <div key={item.pro_codigo_plu} className="flex items-center px-4 py-3 gap-3 hover:bg-gray-700/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.pro_nombre_producto}</p>
                    <p className="text-gray-500 text-xs font-mono">PLU {item.pro_codigo_plu}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white font-bold text-xl">{item.det_stock_sala}</p>
                    <p className="text-gray-500 text-xs">en sala</p>
                  </div>
                  <button onClick={() => quitar(item.pro_codigo_plu)}
                    className="ml-1 w-8 h-8 rounded-full bg-rose-900/40 hover:bg-rose-600 text-rose-400 hover:text-white transition-all text-sm flex items-center justify-center">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!items.length && (
          <div className="text-center py-16 text-gray-600">
            <p className="text-5xl mb-3">📦</p>
            <p className="font-medium">Sin productos aún</p>
            <p className="text-sm mt-1">Busca por nombre, PLU o escanea un código</p>
          </div>
        )}
      </div>

      {/* Modal escáner */}
      {escaner && <BarcodeScanner onScan={onScan} onClose={() => setEscaner(false)} />}

      {/* Footer sticky */}
      <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto p-4 bg-gray-950/90 backdrop-blur border-t border-gray-800">
        <button id="btn-fin-footer" onClick={finalizar} disabled={finalizando || !items.length}
          className="btn-primary w-full py-5 text-xl disabled:opacity-40">
          {finalizando ? '⏳ Enviando…' : items.length === 0 ? 'Añade productos primero' : `✅ Finalizar Revisión (${items.length})`}
        </button>
      </div>

      {/* Modal resultado */}
      {modalResult && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-lg p-6 space-y-5 animate-slide-up">
            <div className="text-center">
              <p className="text-5xl mb-2">{modalResult.quiebres > 0 ? '📧' : '✅'}</p>
              <h2 className="text-white font-black text-2xl">Revisión Completada</h2>
              <p className="text-gray-400 text-sm mt-1 font-mono">{modalResult.folio}</p>
              <p className="text-gray-400 text-sm mt-2">
                {modalResult.quiebres > 0
                  ? `Correo + Excel enviado con ${modalResult.quiebres} ítem(s) a reponer.`
                  : '¡Sin quiebres! Todo en orden.'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-2xl p-4 text-center">
                <p className="text-3xl font-black text-white">{modalResult.totalItems}</p>
                <p className="text-gray-400 text-xs mt-1">Revisados</p>
              </div>
              <div className={`rounded-2xl p-4 text-center ${modalResult.quiebres > 0 ? 'bg-rose-900/40' : 'bg-emerald-900/40'}`}>
                <p className={`text-3xl font-black ${modalResult.quiebres > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{modalResult.quiebres}</p>
                <p className="text-gray-400 text-xs mt-1">A reponer</p>
              </div>
            </div>
            <button id="btn-nueva" onClick={() => { clearRevision(); reset(); navigate('/') }} className="btn-primary w-full">
              Volver al inicio
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
