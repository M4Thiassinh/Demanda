import { useState, useEffect } from 'react'
import { obtenerNoEscaneados } from '../../api'
import useAppStore from '../../store/useAppStore'

export default function NoEscaneadosModal({ revId, onClose, onIndividualClick, onBulkAdd }) {
  const [rawProductos, setRawProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const items = useAppStore(s => s.items);

  useEffect(() => {
    obtenerNoEscaneados(revId)
      .then(res => {
        setRawProductos(res);
        setCargando(false);
      })
      .catch(() => setCargando(false));
  }, [revId]);

  const productos = rawProductos.filter(p => !items.some(i => i.pro_codigo_plu === p.pro_codigo_plu));

  const toggleSelect = (plu) => {
    const newSet = new Set(seleccionados);
    if (newSet.has(plu)) newSet.delete(plu);
    else newSet.add(plu);
    setSeleccionados(newSet);
  };

  const handleBulkAdd = () => {
    if (seleccionados.size === 0) return;
    const itemsToAdd = productos
      .filter(p => seleccionados.has(p.pro_codigo_plu))
      .map(p => ({
        pro_codigo_plu: p.pro_codigo_plu,
        cantidad_pedir: p.pro_cantidad_minima > 0 ? p.pro_cantidad_minima : p.cantidadAProducir
      }));
    onBulkAdd(itemsToAdd);
  };

  const toggleAll = () => {
    if (seleccionados.size === productos.length) {
      setSeleccionados(new Set());
    } else {
      setSeleccionados(new Set(productos.map(p => p.pro_codigo_plu)));
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-md h-[80vh] flex flex-col overflow-hidden animate-slide-up shadow-2xl">
        <div className="bg-gray-800 p-4 border-b border-gray-700 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-white font-bold text-lg">Productos No Escaneados</h3>
            <p className="text-gray-400 text-xs mt-1">{productos.length} pendientes en este departamento</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center">✕</button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {cargando ? (
            <p className="text-center text-gray-500 mt-10">Cargando...</p>
          ) : productos.length === 0 ? (
            <p className="text-center text-emerald-500 mt-10 font-medium">¡No hay productos pendientes!</p>
          ) : (
            <div className="space-y-2">
              <div className="px-2 py-2 flex justify-between items-center">
                <button onClick={toggleAll} className="text-brand-400 text-sm font-medium">
                  {seleccionados.size === productos.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
                <span className="text-gray-500 text-xs">{seleccionados.size} seleccionados</span>
              </div>
              
              {productos.map(p => (
                <div key={p.pro_codigo_plu} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${seleccionados.has(p.pro_codigo_plu) ? 'bg-brand-900/20 border-brand-500/50' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`}>
                  <input 
                    type="checkbox" 
                    checked={seleccionados.has(p.pro_codigo_plu)}
                    onChange={() => toggleSelect(p.pro_codigo_plu)}
                    className="w-5 h-5 rounded bg-black border-gray-600 text-brand-500 focus:ring-brand-500 focus:ring-offset-gray-800"
                  />
                  <div className="flex-1" onClick={() => onIndividualClick(p)}>
                    <p className="text-white text-sm font-medium">{p.pro_nombre_producto}</p>
                    <p className="text-gray-400 text-xs font-mono mt-0.5">PLU {p.pro_codigo_plu} • Mín: {p.pro_cantidad_minima || 0}</p>
                  </div>
                  <button onClick={() => onIndividualClick(p)} className="text-brand-400 text-xs font-semibold px-2 py-1 bg-brand-900/30 rounded">
                    Pedir manual
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-gray-800 border-t border-gray-700 shrink-0">
          <button 
            onClick={handleBulkAdd}
            disabled={seleccionados.size === 0}
            className="w-full py-3 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:bg-gray-700 text-white rounded-xl font-bold transition-colors"
          >
            Agregar {seleccionados.size} al lote mínimo
          </button>
        </div>
      </div>
    </div>
  )
}
