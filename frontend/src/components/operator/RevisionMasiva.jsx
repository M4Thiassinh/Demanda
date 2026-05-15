import { useState, useEffect } from 'react'
import { obtenerTodosRevision, agregarDetalle } from '../../api'
import useAppStore from '../../store/useAppStore'

export default function RevisionMasiva({ revisionId }) {
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState({}) // track save status per PLU
  const items = useAppStore(s => s.items)
  const addItem = useAppStore(s => s.addItem)

  useEffect(() => {
    obtenerTodosRevision(revisionId)
      .then(res => {
        // Initialize state for each product based on existing items
        const initProds = res.map(p => {
          const existing = items.find(i => i.pro_codigo_plu === p.pro_codigo_plu)
          let stock = ''
          let pedir = ''
          if (existing) {
            stock = existing.det_stock_sala
            pedir = existing.det_cantidad_pedir
          }
          return { ...p, inputStock: stock, inputPedir: pedir }
        })
        setProductos(initProds)
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [revisionId])

  const formatNum = (num) => {
    if (num === null || num === undefined || isNaN(num)) return 0;
    return Number(Number(num).toFixed(1));
  };

  const handleChangeStock = (index, value) => {
    const newProds = [...productos];
    const prod = newProds[index];
    prod.inputStock = value;
    
    if (value !== '') {
      const stock = parseFloat(value) || 0;
      const req = (prod.demandaTotalRequerida || 0) - stock;
      const min = prod.pro_cantidad_minima || 0;
      let sugerido = req > 0 ? req : 0;
      if (sugerido > 0 && sugerido < min) sugerido = min;
      prod.inputPedir = formatNum(sugerido).toString();
    } else {
      prod.inputPedir = '';
    }
    
    setProductos(newProds);
  }

  const handleChangePedir = (index, value) => {
    const newProds = [...productos];
    newProds[index].inputPedir = value;
    setProductos(newProds);
  }

  const handleBlur = async (index) => {
    const prod = productos[index];
    if (prod.inputStock === '' || prod.inputPedir === '') return; // don't save if incomplete
    
    const stock = parseFloat(prod.inputStock) || 0;
    const pedir = parseFloat(prod.inputPedir) || 0;
    
    // Check if it's already saved with the same values
    const existing = items.find(i => i.pro_codigo_plu === prod.pro_codigo_plu);
    if (existing && existing.det_stock_sala === stock && existing.det_cantidad_pedir === pedir) {
      return; // No changes
    }

    setGuardando(prev => ({ ...prev, [prod.pro_codigo_plu]: true }));
    try {
      await agregarDetalle(revisionId, prod.pro_codigo_plu, stock, pedir);
      addItem({ 
        pro_codigo_plu: prod.pro_codigo_plu, 
        det_stock_sala: stock, 
        det_cantidad_pedir: pedir, 
        pro_nombre_producto: prod.pro_nombre_producto 
      });
      setGuardando(prev => ({ ...prev, [prod.pro_codigo_plu]: 'saved' }));
      setTimeout(() => setGuardando(prev => ({ ...prev, [prod.pro_codigo_plu]: null })), 2000);
    } catch (e) {
      console.error(e);
      setGuardando(prev => ({ ...prev, [prod.pro_codigo_plu]: 'error' }));
    }
  }

  if (cargando) return <p className="text-center text-gray-500 mt-10">Cargando productos...</p>;

  return (
    <div className="space-y-3 pb-6 animate-fade-in">
      <div className="flex items-center justify-between mb-4 px-1">
        <p className="text-sm text-gray-400">Total: {productos.length} productos</p>
        <p className="text-xs text-brand-400 font-medium">Se guarda automáticamente</p>
      </div>

      {productos.map((p, idx) => {
        const stockValue = parseFloat(p.inputStock);
        const stockIngresado = isNaN(stockValue) ? 0 : stockValue;
        const requerimiento = (p.demandaTotalRequerida || 0) - stockIngresado;
        const status = guardando[p.pro_codigo_plu];

        return (
          <div key={p.pro_codigo_plu} className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col gap-3 transition-colors hover:border-gray-700">
            <div className="flex justify-between items-start">
              <div className="flex-1 pr-2">
                <p className="text-white font-medium text-sm leading-tight">{p.pro_nombre_producto}</p>
                <p className="text-gray-500 text-xs font-mono mt-0.5">PLU: {p.pro_codigo_plu}</p>
              </div>
              <div className="flex gap-3 text-right shrink-0">
                <div>
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider">Mínimo</p>
                  <p className="text-blue-400 font-bold text-sm">{formatNum(p.pro_cantidad_minima)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-[10px] uppercase tracking-wider">Demanda</p>
                  <p className="text-brand-300 font-bold text-sm">{formatNum(p.demandaTotalRequerida)}</p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">Stock Sala</label>
                <input 
                  type="number"
                  inputMode="numeric"
                  value={p.inputStock}
                  onChange={e => handleChangeStock(idx, e.target.value)}
                  onBlur={() => handleBlur(idx)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-white text-center font-semibold focus:border-brand-500 outline-none transition-colors"
                />
              </div>

              <div className="flex-1 text-center bg-gray-800/50 rounded-lg p-1.5 border border-gray-800">
                <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Req.</p>
                <p className={`font-bold text-lg leading-none ${p.inputStock !== '' && requerimiento > 0 ? 'text-white' : 'text-rose-400/80'}`}>
                  {p.inputStock === '' ? '-' : formatNum(requerimiento)}
                </p>
              </div>

              <div className="flex-1 relative">
                <label className="text-[10px] text-brand-400 uppercase tracking-wide block mb-1">A Pedir</label>
                <input 
                  type="number"
                  inputMode="numeric"
                  value={p.inputPedir}
                  onChange={e => handleChangePedir(idx, e.target.value)}
                  onBlur={() => handleBlur(idx)}
                  className="w-full bg-black border border-brand-500/50 rounded-lg px-2 py-2 text-brand-300 text-center font-bold focus:border-brand-500 outline-none transition-colors"
                />
                {status === true && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500"></span></span>}
                {status === 'saved' && <span className="absolute -top-1 -right-1 text-emerald-500 text-xs bg-black rounded-full leading-none p-0.5">✓</span>}
                {status === 'error' && <span className="absolute -top-1 -right-1 text-rose-500 text-xs bg-black rounded-full leading-none p-0.5">✕</span>}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
