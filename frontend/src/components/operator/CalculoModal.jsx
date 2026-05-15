import { useState, useEffect } from 'react'
import Swal from 'sweetalert2'

export default function CalculoModal({ prod, onClose, onConfirm }) {
  // prod tiene: pro_nombre_producto, pro_codigo_plu, demandaTotalRequerida, cantidadAProducir, pedidoMinimo, isBulk
  const [cantidad, setCantidad] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const cant = parseInt(cantidad, 10) || 0;
    
    Swal.fire({
      title: '¿Confirmar pedido?',
      text: `¿Seguro de pedir ${cant} unidades de ${prod.pro_nombre_producto}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#ea580c',
      cancelButtonColor: '#4b5563',
      confirmButtonText: 'Sí, pedir',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        onConfirm(cant);
      }
    });
  };

  const formatNum = (num) => {
    if (num === null || num === undefined || isNaN(num)) return 0;
    return Number(Number(num).toFixed(1));
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-3xl w-full max-w-sm overflow-hidden animate-slide-up shadow-2xl">
        <div className="bg-brand-600 p-4">
          <h3 className="text-white font-bold text-lg leading-tight">{prod.pro_nombre_producto}</h3>
          <p className="text-white/80 text-sm font-mono mt-1">PLU {prod.pro_codigo_plu}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
              <p className="text-gray-400 text-xs">Demanda Calculada</p>
              <p className="text-white font-semibold text-lg">{formatNum(prod.demandaTotalRequerida)}</p>
            </div>
            <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
              <p className="text-gray-400 text-xs">Stock Ingresado</p>
              <p className="text-white font-semibold text-lg">{formatNum(prod.stockIngresado)}</p>
            </div>
            <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
              <p className="text-gray-400 text-xs">Requerimiento</p>
              <p className={`font-semibold text-lg ${((prod.demandaTotalRequerida || 0) - (prod.stockIngresado || 0)) > 0 ? 'text-white' : 'text-rose-400'}`}>
                {formatNum((prod.demandaTotalRequerida || 0) - (prod.stockIngresado || 0))}
              </p>
            </div>
            <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
              <p className="text-gray-400 text-xs">Pedido Mínimo</p>
              <p className="text-blue-400 font-semibold text-lg">{formatNum(prod.pedidoMinimo)}</p>
            </div>
          </div>

          <div className="pt-2">
            <label className="text-brand-300 font-semibold mb-2 block">Cantidad a Pedir (Órden Real)</label>
            <input 
              type="number" 
              inputMode="numeric"
              min={0}
              value={cantidad} 
              onChange={e => setCantidad(e.target.value)}
              className="w-full bg-black border-2 border-brand-500 rounded-xl text-center text-4xl font-black text-white py-4 focus:outline-none focus:ring-4 focus:ring-brand-500/30 transition-all"
              autoFocus
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl font-medium transition-colors">
              Cancelar
            </button>
            <button type="submit" className="flex-1 py-3 bg-brand-600 hover:bg-brand-500 text-white rounded-xl font-bold shadow-lg shadow-brand-600/30 transition-colors">
              Aceptar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
