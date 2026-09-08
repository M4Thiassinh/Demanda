import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import {
  buscarTomaBodegaActiva, iniciarTomaBodega, buscarProductosBodega,
  obtenerTomaBodega, guardarDetalleBodega, eliminarDetalleBodega,
  finalizarTomaBodega, exportarTomaBodegaExcel,
} from '../api'
import BarcodeScanner from '../components/operator/BarcodeScanner'
import Swal from 'sweetalert2'

// Toma de inventario de BODEGA: contar el físico y compararlo con el stock del
// sistema. Independiente de la revisión de sala (no manda pedidos ni correos).
export default function BodegaPage() {
  const navigate = useNavigate()
  const { depId, depNombre, usuId, usuNombre, reset } = useAppStore()

  const [tbId, setTbId]         = useState(null)
  const [items, setItems]       = useState([])
  const [query, setQuery]       = useState('')
  const [resultados, setRes]    = useState([])
  const [productoSel, setProd]  = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [guardando, setGuard]   = useState(false)
  const [escaner, setEscaner]   = useState(false)
  const [error, setError]       = useState('')
  const [finalizando, setFin]   = useState(false)
  const [resumen, setResumen]   = useState(null)
  const timerRef = useRef(null)
  const cantRef  = useRef(null)

  // Al montar: recuperar toma activa o crear una nueva
  useEffect(() => {
    if (!depId) { navigate('/'); return }
    let cancel = false
    ;(async () => {
      try {
        const activa = await buscarTomaBodegaActiva(depId, usuId)
        let id = activa?.tb_id
        if (!id) {
          const nueva = await iniciarTomaBodega(depId, usuId)
          id = nueva.tb_id
        }
        if (cancel) return
        setTbId(id)
        const data = await obtenerTomaBodega(id)
        if (!cancel) setItems(data.items || [])
      } catch (e) {
        if (!cancel) setError('No se pudo iniciar la toma de bodega')
      }
    })()
    return () => { cancel = true }
  }, [depId])

  const onScan = async (codigo) => {
    setEscaner(false); setQuery(codigo)
    try {
      const res = await buscarProductosBodega(depId, codigo)
      if (Array.isArray(res)) {
        if (res.length === 1) seleccionar(res[0])
        else if (res.length > 1) setRes(res)
        else setError(`Código "${codigo}" no encontrado en este departamento`)
      }
    } catch {}
  }

  const buscar = (q) => {
    setQuery(q)
    clearTimeout(timerRef.current)
    if (q.length < 1) { setRes([]); return }
    timerRef.current = setTimeout(async () => {
      try {
        const res = await buscarProductosBodega(depId, q)
        if (Array.isArray(res)) setRes(res)
      } catch {}
    }, 250)
  }

  const seleccionar = (p) => {
    setProd(p); setRes([]); setQuery(p.pro_nombre_producto); setError('')
    setTimeout(() => cantRef.current?.focus(), 100)
  }

  const fmt = (v) => (v === null || v === undefined ? 's/d' : Number(v))

  const agregar = async () => {
    if (!productoSel) return setError('Selecciona un producto')
    if (cantidad === '' || isNaN(Number(cantidad))) return setError('Ingresa la cantidad física')
    setGuard(true); setError('')
    try {
      const r = await guardarDetalleBodega(tbId, productoSel.pro_codigo_plu, Number(cantidad))
      const nuevo = {
        pro_codigo_plu: productoSel.pro_codigo_plu,
        pro_nombre_producto: productoSel.pro_nombre_producto,
        pro_codigo_barra: productoSel.pro_codigo_barra,
        fisico: r.fisico, sistema: r.sistema, diferencia: r.diferencia,
      }
      setItems((prev) => {
        const i = prev.findIndex((x) => x.pro_codigo_plu === nuevo.pro_codigo_plu)
        if (i >= 0) { const c = [...prev]; c[i] = nuevo; return c }
        return [...prev, nuevo]
      })
      setProd(null); setCantidad(''); setQuery('')
    } catch (e) { setError(e?.response?.data?.error || 'Error al guardar') }
    finally { setGuard(false) }
  }

  const quitar = async (plu) => {
    try { await eliminarDetalleBodega(tbId, plu); setItems((prev) => prev.filter((x) => x.pro_codigo_plu !== plu)) } catch {}
  }

  const descargarExcel = async () => {
    try {
      const resp = await exportarTomaBodegaExcel(tbId)
      const url = URL.createObjectURL(new Blob([resp.data]))
      const a = document.createElement('a')
      a.href = url; a.download = `toma_bodega_${depId}.xlsx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { Swal.fire('Error', 'No se pudo descargar el Excel', 'error') }
  }

  const finalizar = async () => {
    if (!items.length) return setError('Cuenta al menos un producto')
    const conf = await Swal.fire({
      title: '¿Finalizar la toma de bodega?',
      html: `Contaste <b>${items.length}</b> producto(s). Podrás descargar el Excel con las diferencias.`,
      icon: 'question', background: '#111827', color: '#fff',
      showCancelButton: true, confirmButtonText: 'Sí, finalizar', cancelButtonText: 'Seguir contando',
      confirmButtonColor: '#059669', cancelButtonColor: '#4b5563',
    })
    if (!conf.isConfirmed) return
    setFin(true)
    try { setResumen(await finalizarTomaBodega(tbId)) }
    catch (e) { setError(e?.response?.data?.error || 'Error al finalizar') }
    finally { setFin(false) }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col max-w-lg mx-auto">
      <header className="bg-gray-900 border-b border-gray-700/50 px-4 py-3.5 flex items-center justify-between sticky top-0 z-10">
        <div>
          <p className="text-xs text-gray-500 font-mono">📦 Toma de Bodega</p>
          <h1 className="text-white font-bold">{depNombre}
            {usuNombre && <span className="ml-2 text-gray-400 font-normal text-sm">— {usuNombre}</span>}
          </h1>
        </div>
        <button onClick={finalizar} disabled={finalizando || !items.length}
          className="btn-primary py-2 px-4 text-sm disabled:opacity-40">
          {finalizando ? '⏳' : `✅ Finalizar (${items.length})`}
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {/* Buscador */}
        <div className="card p-4 space-y-3">
          <div className="relative">
            <label className="label">PLU, código de barras o nombre</label>
            <div className="flex gap-2 relative">
              <input type="text" value={query} onChange={e => buscar(e.target.value)}
                placeholder="Escanea o escribe…" className="input-field py-4 text-base flex-1 pr-10" autoComplete="off" />
              {query && (
                <button onClick={() => { setQuery(''); setProd(null); setRes([]) }}
                  className="absolute right-20 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xl p-2 z-10">✕</button>
              )}
              <button onClick={() => setEscaner(true)} title="Escanear con cámara"
                className="flex-shrink-0 w-14 bg-gray-700 hover:bg-brand-600 border border-gray-600 hover:border-brand-500 rounded-xl flex items-center justify-center text-2xl transition-all active:scale-95">📷</button>
            </div>
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
                    <span className="text-gray-400 text-xs">Sist: <b className="text-gray-200">{fmt(p.stock_sistema)}</b></span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {productoSel && (
            <div className="bg-brand-900/30 border border-brand-700/40 rounded-xl px-4 py-3 animate-fade-in">
              <p className="text-brand-300 font-semibold text-sm">{productoSel.pro_nombre_producto}</p>
              <p className="text-brand-500 text-xs font-mono">PLU {productoSel.pro_codigo_plu}</p>
              <p className="text-gray-400 text-xs mt-1">Stock según el sistema: <b className="text-gray-200">{fmt(productoSel.stock_sistema)}</b></p>
              {items.some(i => i.pro_codigo_plu === productoSel.pro_codigo_plu) && (
                <p className="text-orange-400 text-xs mt-1 font-medium">⚠️ Ya lo contaste, se actualizará</p>
              )}
            </div>
          )}

          <div>
            <label className="label">Cantidad física en bodega</label>
            <input ref={cantRef} type="number" inputMode="numeric" min={0}
              value={cantidad} onChange={e => setCantidad(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregar()}
              placeholder="0" className="input-field text-4xl font-bold text-center py-5" />
          </div>

          {error && <p className="text-rose-400 text-sm text-center animate-fade-in">{error}</p>}

          <button onClick={agregar} disabled={guardando || !productoSel || cantidad === ''}
            className="btn-primary w-full disabled:opacity-40">
            {guardando ? 'Guardando…' : '+ Guardar conteo'}
          </button>
        </div>

        {/* Lista contada */}
        {items.length > 0 && (
          <div className="card overflow-hidden animate-slide-up">
            <div className="px-4 py-3 border-b border-gray-700/50 flex justify-between items-center">
              <p className="text-white font-semibold text-sm">{items.length} producto(s) contados</p>
            </div>
            <div className="divide-y divide-gray-700/40">
              {[...items].reverse().map(item => {
                const dif = item.diferencia
                const difColor = dif === null ? 'text-gray-500' : dif === 0 ? 'text-emerald-400' : 'text-rose-400'
                return (
                  <div key={item.pro_codigo_plu} className="flex items-center px-4 py-3 gap-3 hover:bg-gray-700/20">
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{item.pro_nombre_producto}</p>
                      <p className="text-gray-500 text-xs font-mono">PLU {item.pro_codigo_plu}</p>
                    </div>
                    <div className="text-right flex-shrink-0 w-14">
                      <p className="text-white font-bold text-lg">{fmt(item.fisico)}</p>
                      <p className="text-gray-500 text-[10px]">físico</p>
                    </div>
                    <div className="text-right flex-shrink-0 w-14 border-l border-gray-700 pl-2">
                      <p className="text-gray-300 font-bold text-sm">{fmt(item.sistema)}</p>
                      <p className="text-gray-500 text-[10px]">sistema</p>
                    </div>
                    <div className="text-right flex-shrink-0 w-14 border-l border-gray-700 pl-2">
                      <p className={`font-bold text-sm ${difColor}`}>{dif === null ? 's/d' : (dif > 0 ? `+${dif}` : dif)}</p>
                      <p className="text-gray-500 text-[10px]">dif.</p>
                    </div>
                    <button onClick={() => quitar(item.pro_codigo_plu)}
                      className="ml-1 w-8 h-8 rounded-full bg-rose-900/40 hover:bg-rose-600 text-rose-400 hover:text-white transition-all text-sm flex items-center justify-center">✕</button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!items.length && (
          <div className="text-center py-16 text-gray-600">
            <p className="text-5xl mb-3">📦</p>
            <p className="font-medium">Sin conteos aún</p>
            <p className="text-sm mt-1">Busca un producto e ingresa cuánto hay en bodega</p>
          </div>
        )}
      </div>

      {escaner && <BarcodeScanner onScan={onScan} onClose={() => setEscaner(false)} />}

      {/* Footer */}
      <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto p-4 bg-gray-950/90 backdrop-blur border-t border-gray-800 flex gap-2">
        <button onClick={() => { reset(); navigate('/') }}
          className="btn-secondary px-4 py-4 text-sm">Salir</button>
        <button onClick={finalizar} disabled={finalizando || !items.length}
          className="btn-primary flex-1 py-4 text-lg disabled:opacity-40">
          {finalizando ? '⏳…' : items.length === 0 ? 'Cuenta productos primero' : `✅ Finalizar (${items.length})`}
        </button>
      </div>

      {/* Resumen final */}
      {resumen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-lg p-6 space-y-5 animate-slide-up">
            <div className="text-center">
              <p className="text-5xl mb-2">📦</p>
              <h2 className="text-white font-black text-2xl">Toma finalizada</h2>
              <p className="text-gray-400 text-sm mt-2">Descarga el Excel para comparar y corregir el sistema.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-2xl p-4 text-center">
                <p className="text-3xl font-black text-white">{resumen.total}</p>
                <p className="text-gray-400 text-xs mt-1">Contados</p>
              </div>
              <div className={`rounded-2xl p-4 text-center ${resumen.diferencias > 0 ? 'bg-rose-900/40' : 'bg-emerald-900/40'}`}>
                <p className={`text-3xl font-black ${resumen.diferencias > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{resumen.diferencias}</p>
                <p className="text-gray-400 text-xs mt-1">Con diferencia</p>
              </div>
            </div>
            <button onClick={descargarExcel} className="btn-primary w-full bg-sky-600 hover:bg-sky-500">📥 Descargar Excel</button>
            <button onClick={() => { reset(); navigate('/') }} className="btn-secondary w-full">Volver al inicio</button>
          </div>
        </div>
      )}
    </div>
  )
}
