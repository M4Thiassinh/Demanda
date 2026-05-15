import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { buscarProductos, agregarDetalle, eliminarDetalle, finalizarRevision, obtenerRevision, calcularItem, agregarDetalleBulk } from '../api'
import BarcodeScanner from '../components/operator/BarcodeScanner'
import CalculoModal from '../components/operator/CalculoModal'
import NoEscaneadosModal from '../components/operator/NoEscaneadosModal'
import RevisionMasiva from '../components/operator/RevisionMasiva'
import Swal from 'sweetalert2'

const AREAS_PRODUCTIVAS = [22, 1347, 2347];

export default function RevisionPage() {
  const navigate = useNavigate()
  const { depId, depNombre, usuNombre, revisionId, revFolio, items, addItem, removeItem, clearRevision, reset } = useAppStore()
  const esProductivo = AREAS_PRODUCTIVAS.includes(Number(depId))

  const [query, setQuery]           = useState('')
  const [resultados, setRes]        = useState([])
  const [productoSel, setProducto]  = useState(null)
  const [stock, setStock]           = useState('')
  const [guardando, setGuardando]   = useState(false)
  const [finalizando, setFin]       = useState(false)
  const [viewMode, setViewMode]     = useState('search') // 'search' | 'masiva'
  const [modalResult, setModal]     = useState(null)
  const [escaner, setEscaner]       = useState(false)
  const [error, setError]           = useState('')
  const [calcModal, setCalcModal]   = useState(null)
  const [showNoEscaneados, setShowNoEscaneados] = useState(false)
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
      const calcInfo = await calcularItem(revisionId, productoSel.pro_codigo_plu, parseInt(stock))

      if (esProductivo) {
        // Flujo Productivo: abrir modal para que el operador confirme la cantidad
        setCalcModal({ ...productoSel, ...calcInfo, stockIngresado: parseInt(stock) })
      } else {
        // Flujo No Productivo: agregar directo con el requerimiento calculado
        const requerimiento = Math.max(0, Math.ceil((calcInfo.demandaTotalRequerida || 0) - parseInt(stock)))
        await agregarDetalle(revisionId, productoSel.pro_codigo_plu, parseInt(stock), requerimiento)
        addItem({ ...productoSel, det_stock_sala: parseInt(stock), det_cantidad_pedir: requerimiento })
        setProducto(null); setStock(''); setQuery('')
        // Flash informativo
        Swal.fire({
          title: requerimiento > 0 ? `✅ Añadido` : '✅ Sin reposición',
          text: requerimiento > 0
            ? `Requerimiento: ${requerimiento} uds.`
            : `${productoSel.pro_nombre_producto} tiene stock suficiente`,
          timer: 1800,
          showConfirmButton: false,
          icon: requerimiento > 0 ? 'success' : 'info',
          background: '#111827',
          color: '#fff',
        })
      }
    } catch (e) { setError(e?.response?.data?.error || 'Error al calcular') }
    finally { setGuardando(false) }
  }

  const handleConfirmarPedido = async (cantidadPedir, isBulk = false, prodBulk = null) => {
    try {
      if (isBulk) {
        // Individual desde modal de no escaneados
        await agregarDetalle(revisionId, prodBulk.pro_codigo_plu, 0, cantidadPedir)
        addItem({ ...prodBulk, det_stock_sala: 0, det_cantidad_pedir: cantidadPedir })
      } else {
        // Normal desde escaner
        await agregarDetalle(revisionId, calcModal.pro_codigo_plu, calcModal.stockIngresado, cantidadPedir)
        addItem({ ...calcModal, det_stock_sala: calcModal.stockIngresado, det_cantidad_pedir: cantidadPedir })
      }
      setCalcModal(null); setProducto(null); setStock(''); setQuery('');
      if (isBulk) Swal.fire({title: 'Añadido', timer: 1000, showConfirmButton: false, icon: 'success'});
    } catch (e) { setError(e?.response?.data?.error || 'Error al guardar') }
  }

  const handleBulkAdd = async (itemsToAdd) => {
    try {
      await agregarDetalleBulk(revisionId, itemsToAdd)
      itemsToAdd.forEach(i => addItem({ pro_codigo_plu: i.pro_codigo_plu, det_stock_sala: 0, det_cantidad_pedir: i.cantidad_pedir, pro_nombre_producto: 'Producto (No escaneado)' }))
      setShowNoEscaneados(false)
      Swal.fire({title: 'Lote añadido', timer: 1500, showConfirmButton: false, icon: 'success'});
    } catch (e) { setError(e?.response?.data?.error || 'Error al guardar lote') }
  }

  const quitar = async (plu) => {
    try { await eliminarDetalle(revisionId, plu); removeItem(plu) } catch {}
  }

  const finalizar = async () => {
    if (!items.length) return setError('Agrega al menos un producto')

    // Fetch the current department info to get default emails
    let defaultEmails = '';
    try {
      const { getDepartamentos } = await import('../api');
      const deps = await getDepartamentos();
      const myDep = deps.find(d => d.dep_id === depId);
      if (myDep) {
        defaultEmails = [myDep.dep_email_jefe, myDep.dep_emails_cc].filter(Boolean).join(', ');
      }
    } catch (e) { console.error('Error fetching dep emails', e); }

    const { isConfirmed, value: customEmails } = await Swal.fire({
      title: '<h2 class="text-white text-xl font-bold">¿Seguro que deseas enviar esta orden?</h2>',
      html: `
        <div class="text-sm text-gray-400 mb-4 text-left bg-gray-800 p-3 rounded-lg border border-gray-700">
          <p class="font-bold text-gray-300 mb-1">Correos predeterminados del departamento:</p>
          <p class="text-brand-400 break-words">${defaultEmails || 'Ninguno'}</p>
        </div>
        <p class="text-sm text-gray-400 mb-2 text-left">Si quieres agregar otros correos, escríbelos aquí:</p>
        <input id="swal-input-emails" class="swal2-input !bg-gray-800 !text-white !border-gray-600 !w-full !max-w-[90%] mx-auto block !text-sm placeholder:text-gray-500" placeholder="ejemplo@correo.com, otro@correo.com">
      `,
      icon: 'warning',
      background: '#111827', // gray-900
      color: '#ffffff',
      showCancelButton: true,
      confirmButtonText: 'Enviar y Finalizar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669', // emerald-600
      cancelButtonColor: '#4b5563', // gray-600
      preConfirm: () => {
        return document.getElementById('swal-input-emails').value;
      }
    });

    if (isConfirmed) {
      setFin(true)
      try { 
        // Concatenate default and custom emails
        const finalEmails = [defaultEmails, customEmails].filter(Boolean).join(', ');
        setModal(await finalizarRevision(revisionId, items, finalEmails)) 
      }
      catch (e) { setError(e?.response?.data?.error || 'Error al finalizar') }
      finally { setFin(false) }
    }
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
        
        {/* Toggle View Mode */}
        <div className="flex bg-gray-900 rounded-xl p-1 border border-gray-700">
          <button 
            onClick={() => setViewMode('search')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${viewMode === 'search' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            🔍 Buscar / Escanear
          </button>
          <button 
            onClick={() => setViewMode('masiva')}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${viewMode === 'masiva' ? 'bg-brand-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
          >
            📄 Desplegar Todos
          </button>
        </div>

        {viewMode === 'search' ? (
          <>
            {/* Buscador dual: nombre/PLU/código de barras */}
            <div className="card p-4 space-y-3">
              <div className="relative">
                <label className="label">PLU, código de barras o nombre</label>
                <div className="flex gap-2 relative">
                  <input id="input-buscar" type="text" value={query} onChange={e => buscar(e.target.value)}
                    onFocus={() => resultados.length && setRes(resultados)}
                    placeholder="Escanea o escribe…" className="input-field py-4 text-base flex-1 pr-10"
                    autoComplete="off" />
                  {query && (
                    <button onClick={() => { setQuery(''); setProducto(null); setRes([]) }}
                      className="absolute right-20 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xl p-2 z-10">✕</button>
                  )}
                  <button
                    id="btn-camara"
                    onClick={() => setEscaner(true)}
                    title="Escanear con cámara"
                    className="flex-shrink-0 w-14 bg-gray-700 hover:bg-brand-600 border border-gray-600 hover:border-brand-500 rounded-xl flex items-center justify-center text-2xl transition-all active:scale-95"
                  >📷</button>
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
                  {items.some(i => i.pro_codigo_plu === productoSel.pro_codigo_plu) && (
                    <p className="text-orange-400 text-xs mt-1 font-medium">⚠️ Ya escaneado anteriormente</p>
                  )}
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

            {/* Botón Ver No Escaneados */}
            <div className="flex justify-center mt-2 mb-2">
              <button onClick={() => setShowNoEscaneados(true)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-brand-400 font-semibold rounded-xl text-sm transition-colors border border-gray-700">
                📄 Ver lista de no escaneados
              </button>
            </div>
          </>
        ) : (
          <RevisionMasiva revisionId={revisionId} esProductivo={esProductivo} />
        )}

        {/* Lista de ítems */}
        {items.length > 0 && (
          <div className="card overflow-hidden animate-slide-up">
            <div className="px-4 py-3 border-b border-gray-700/50 flex justify-between items-center">
              <p className="text-white font-semibold text-sm">{items.length} producto(s) en revisión</p>
            </div>
            <div className="divide-y divide-gray-700/40">
              {[...items].reverse().map(item => (
                <div key={item.pro_codigo_plu} className="flex items-center px-4 py-3 gap-3 hover:bg-gray-700/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{item.pro_nombre_producto}</p>
                    <p className="text-gray-500 text-xs font-mono">PLU {item.pro_codigo_plu}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white font-bold text-xl">{item.det_cantidad_pedir !== undefined ? item.det_cantidad_pedir : '-'}</p>
                    <p className="text-brand-500 text-xs font-semibold">a pedir</p>
                  </div>
                  <div className="text-right flex-shrink-0 w-12 border-l border-gray-700 pl-2">
                    <p className="text-gray-300 font-bold text-sm">{item.det_stock_sala}</p>
                    <p className="text-gray-500 text-[10px]">sala</p>
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

      {/* Modales */}
      {calcModal && (
        <CalculoModal 
          prod={calcModal} 
          onClose={() => setCalcModal(null)}
          onConfirm={(cant) => handleConfirmarPedido(cant, calcModal.isBulk, calcModal)}
        />
      )}

      {showNoEscaneados && (
        <NoEscaneadosModal 
          revId={revisionId}
          onClose={() => setShowNoEscaneados(false)}
          onBulkAdd={handleBulkAdd}
          onIndividualClick={(prod) => setCalcModal({...prod, stockIngresado: 0, isBulk: true})}
        />
      )}

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
