import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import { getDepartamentos, getMasterProductos, bulkUpdateProductos, bulkDeleteProductos, activarProductos, exportMasterExcel, loginMaster } from '../../api';

// ── Fórmula de demanda (espejo de backend/src/services/DemandCalculatorService.js) ──
// demanda_total = venta_diaria × (7 / dias_produccion + dias_seguridad)
// Se replica acá para recalcular en vivo mientras se edita la tabla, sin ir al servidor.
const num = (v, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def }

// Venta diaria y demanda total se muestran con 1 decimal. Solo se redondea para
// MOSTRAR: por dentro se conserva la precisión, si no al escribir una demanda de 30
// la venta diaria se achataría a 2.6 y la demanda volvería como 29.6 al recargar.
const r1 = (v) => Math.round(num(v) * 10) / 10

// Días de producción efectivos: override del producto > default del departamento.
const diasProdDe = (row) => {
  const ov = row.pro_dias_produccion_override
  const n = (ov !== null && ov !== undefined && ov !== '') ? parseInt(ov, 10) : NaN
  if (Number.isFinite(n) && n > 0) return n
  return num(row.dias_produccion_semana, 6) || 6
}

// Días de seguridad efectivos: override > automático (sobre 20 u/día ⇒ 1 día, si no 2).
const diasSegDe = (row, ventaDiaria) => {
  const ov = row.pro_dias_seguridad_override
  const n = (ov !== null && ov !== undefined && ov !== '') ? parseInt(ov, 10) : NaN
  if (Number.isFinite(n) && n >= 0) return n
  return ventaDiaria > 20 ? 1 : 2
}

const demandaDe = (row, ventaDiaria) => {
  const vd = num(ventaDiaria, 0)
  if (vd <= 0) return 0
  return vd * (7 / diasProdDe(row) + diasSegDe(row, vd))
}

// ¿La demanda de este producto está fijada a mano?
const tieneOverride = (row) =>
  row.pro_demanda_override !== null && row.pro_demanda_override !== undefined && row.pro_demanda_override !== ''

// Demanda que se muestra: la fijada a mano si existe, si no la de la fórmula.
// La fórmula se evalúa en vivo para que al cambiar los días se vea al instante.
const demandaMostrada = (row) =>
  tieneOverride(row) ? num(row.pro_demanda_override, 0) : demandaDe(row, row.ventaDiaria)

export default function MasterAdminPanel() {
  // Autenticación Master
  const [isAuth, setIsAuth] = useState(localStorage.getItem('masterToken') !== null);
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [authErr, setAuthErr] = useState('');

  const [departamentos, setDepartamentos] = useState([]);
  const [depSel, setDepSel] = useState('');
  
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  // Para la selección múltiple
  const [selected, setSelected] = useState(new Set());
  
  // Para las ediciones locales: guardamos un objeto { [plu]: { cambios } }
  const [edits, setEdits] = useState({});

  // Para modal de "Nuevo Producto"
  const [showAddModal, setShowAddModal] = useState(false);
  const [newProd, setNewProd] = useState({
    pro_codigo_plu: '',
    pro_codigo_barra: '',
    pro_nombre_producto: '',
    vta_total_periodo: '',
    dias_historial: 30,
    pro_dias_produccion_override: '',
    pro_dias_seguridad_override: '',
    pro_cantidad_minima: 0
  });

  // Venta leída de la analítica para el producto que se está creando.
  const [ventaAlta, setVentaAlta] = useState(null);
  const [cargandoVenta, setCargandoVenta] = useState(false);

  // Al salir del campo PLU se consultan sus ventas de los últimos 30 días. De paso se
  // completan nombre y código de barra desde el maestro de la analítica si están
  // vacíos, para no tipearlos a mano.
  const leerVentaDelPlu = async (plu) => {
    const limpio = String(plu || '').trim();
    if (!limpio || !depSel) { setVentaAlta(null); return; }
    setCargandoVenta(true);
    try {
      const { getVentaPlu } = await import('../../api');
      const v = await getVentaPlu(limpio, depSel, 30);
      setVentaAlta(v);
      setNewProd(prev => ({
        ...prev,
        pro_nombre_producto: prev.pro_nombre_producto || v.nombre || '',
        pro_codigo_barra:    prev.pro_codigo_barra    || v.barra  || '',
      }));
    } catch {
      setVentaAlta(null);
      Swal.fire('Sin datos', 'No se pudieron leer las ventas de ese PLU', 'warning');
    } finally { setCargandoVenta(false); }
  };

  // Cargar departamentos al montar
  useEffect(() => {
    getDepartamentos().then(setDepartamentos).catch(console.error);
  }, []);

  // Cargar productos al seleccionar departamento
  useEffect(() => {
    if (!depSel) {
      setProductos([]);
      setEdits({});
      setSelected(new Set());
      return;
    }
    fetchProductos();
  }, [depSel]);

  const fetchProductos = async () => {
    setLoading(true);
    try {
      const data = await getMasterProductos(depSel);
      setProductos(data);
      setEdits({});
      setSelected(new Set());
    } catch (e) {
      if (e?.response?.status === 401) {
        localStorage.removeItem('masterToken');
        setIsAuth(false);
        Swal.fire('Sesión Expirada', 'Contraseña maestra incorrecta', 'error');
      } else {
        Swal.fire('Error', 'No se pudieron cargar los productos', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = useMemo(() => {
    if (!search) return productos;
    const lower = search.toLowerCase();
    return productos.filter(p => 
      p.pro_nombre_producto?.toLowerCase().includes(lower) || 
      p.pro_codigo_plu?.includes(lower) ||
      p.pro_codigo_barra?.includes(lower)
    );
  }, [productos, search]);

  // Manejo de selecciones
  const toggleSelectAll = () => {
    if (selected.size === filteredProducts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredProducts.map(p => p.pro_codigo_plu)));
    }
  };

  const toggleSelectRow = (plu) => {
    const next = new Set(selected);
    if (next.has(plu)) next.delete(plu);
    else next.add(plu);
    setSelected(next);
  };

  // Manejo de edición
  const handleEdit = (plu, field, value) => {
    setEdits(prev => ({
      ...prev,
      [plu]: {
        ...prev[plu],
        [field]: value
      }
    }));
  };

  // Campo que el usuario está tecleando ahora ("<plu>:<campo>"). Mientras escribe se
  // muestra tal cual lo teclea (si no, el input pelearía con el redondeo); al salir
  // del campo vuelve a mostrarse con 1 decimal.
  const [focusCampo, setFocusCampo] = useState(null);
  const mostrar1Dec = (valor, campoId) => {
    if (valor === undefined || valor === null || valor === '') return '';
    return focusCampo === campoId ? valor : r1(valor);
  };

  // Igual que handleEdit pero para varios campos a la vez, que es lo que necesitan
  // venta diaria y demanda total: al tocar uno hay que recalcular los otros.
  const handleEditMulti = (plu, cambios) => {
    setEdits(prev => ({ ...prev, [plu]: { ...prev[plu], ...cambios } }));
  };

  // Fijar a mano la demanda total. Ya no se despeja la venta diaria hacia atrás: la
  // venta la mantiene el sistema (se recalcula sola cada día con los últimos 30 días)
  // y lo que el jefe impone va a su propia columna, que la tarea diaria no toca.
  // Dejar el campo vacío borra el override y el producto vuelve al valor automático.
  const editarDemandaTotal = (plu, valor) => {
    const d = parseFloat(valor);
    handleEditMulti(plu, { pro_demanda_override: isNaN(d) ? null : d });
  };

  // Volver al cálculo automático (equivale a vaciar el campo).
  const volverAutomatico = (plu) => handleEditMulti(plu, { pro_demanda_override: null });

  // Cambiar los días solo mueve la demanda CALCULADA; si hay una fijada a mano,
  // esa sigue mandando y el número mostrado no cambia.
  const editarDias = (plu, campo, valor) => handleEditMulti(plu, { [campo]: valor });

  const hasEdits = Object.keys(edits).length > 0;

  const handleSaveAll = async () => {
    if (!hasEdits) return;
    
    // Preparar el array de productos modificados
    const payload = Object.entries(edits).map(([plu, changes]) => {
      // Buscar el original para hacer el merge, o si es "nuevo_XXX", mandar flag isNew
      const original = productos.find(p => p.pro_codigo_plu === plu) || {};
      const isNew = plu.startsWith('nuevo_');
      
      return {
        ...original,
        ...changes,
        // Si es nuevo, usamos el PLU real guardado en los cambios
        pro_codigo_plu: isNew ? changes.pro_codigo_plu : plu,
        isNew
      };
    });

    const res = await Swal.fire({
      title: '¿Confirmar cambios?',
      text: `Se actualizarán/crearán ${payload.length} productos en la base de datos.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'Cancelar'
    });

    if (res.isConfirmed) {
      try {
        setLoading(true);
        await bulkUpdateProductos(depSel, payload);
        Swal.fire('Guardado', 'Los productos se actualizaron correctamente.', 'success');
        fetchProductos();
      } catch (e) {
        Swal.fire('Error', e?.response?.data?.error || 'No se pudo guardar', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    
    // Filtrar los que son puramente locales (recién creados y no guardados)
    const toDeleteApi = Array.from(selected).filter(plu => !plu.startsWith('nuevo_'));
    const localOnly = Array.from(selected).filter(plu => plu.startsWith('nuevo_'));

    const res = await Swal.fire({
      title: '¿Eliminar productos?',
      text: `Estás a punto de borrar ${selected.size} productos. Esto no se puede deshacer.`,
      icon: 'danger',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });

    if (res.isConfirmed) {
      try {
        setLoading(true);
        if (toDeleteApi.length > 0) {
          await bulkDeleteProductos(depSel, toDeleteApi);
        }
        
        // Limpiar locales
        if (localOnly.length > 0) {
          setEdits(prev => {
            const next = { ...prev };
            localOnly.forEach(id => delete next[id]);
            return next;
          });
        }
        
        Swal.fire('Eliminados', 'Los productos han sido borrados.', 'success');
        fetchProductos();
      } catch (e) {
        Swal.fire('Error', e?.response?.data?.error || 'Error al eliminar', 'error');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleSetActivo = async (activo) => {
    const plus = Array.from(selected).filter(plu => !plu.startsWith('nuevo_'));
    if (plus.length === 0) return Swal.fire('Sin selección', 'Selecciona productos ya guardados.', 'info');
    const accion = activo ? 'activar' : 'desactivar';
    const res = await Swal.fire({
      title: `¿${activo ? 'Activar' : 'Desactivar'} productos?`,
      html: activo
        ? `Se activarán <b>${plus.length}</b> producto(s): volverán a aparecer al escanear en sala.`
        : `Se desactivarán <b>${plus.length}</b> producto(s): <b>no aparecerán</b> al escanear en sala (no se eliminan, se pueden reactivar).`,
      icon: 'warning', showCancelButton: true,
      confirmButtonText: `Sí, ${accion}`, cancelButtonText: 'Cancelar',
      confirmButtonColor: activo ? '#059669' : '#d97706',
    });
    if (!res.isConfirmed) return;
    try {
      setLoading(true);
      await activarProductos(depSel, plus, activo ? 1 : 0);
      Swal.fire('Listo', `Productos ${activo ? 'activados' : 'desactivados'}.`, 'success');
      fetchProductos();
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.error || 'No se pudo cambiar el estado', 'error');
    } finally { setLoading(false); }
  };

  const handleExport = async () => {
    if (!depSel) return;
    try {
      setLoading(true);
      const res = await exportMasterExcel(depSel);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Maestro_Productos_${depSel}_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
    } catch (error) {
      Swal.fire('Error', 'Fallo al exportar excel', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Agregar nuevo producto (Modal)
  const handleAddNew = (e) => {
    e.preventDefault();
    if (!newProd.pro_codigo_plu || !newProd.pro_nombre_producto) {
      return Swal.fire('Error', 'PLU y Nombre son obligatorios', 'error');
    }
    
    const fakeId = `nuevo_${Date.now()}`;
    // La venta sale de lo leído en la analítica, no de lo que escriba el usuario.
    // Esto es solo para mostrarlo en la tabla: al guardar, el servidor la vuelve a
    // leer por su cuenta, así que es él quien tiene la última palabra.
    const newEntry = {
      ...newProd,
      pro_codigo_plu: String(newProd.pro_codigo_plu),
      vta_total_periodo: ventaAlta?.unidades ?? 0,
      dias_historial: ventaAlta?.dias ?? 30,
      ventaDiaria: ventaAlta?.ventaDiaria ?? 0,
      dias_produccion_semana: productos[0]?.dias_produccion_semana ?? 6,
      pro_demanda_override: null,
      pro_cantidad_minima: newProd.pro_cantidad_minima || 0
    };
    
    // Lo insertamos en edits
    setEdits(prev => ({
      ...prev,
      [fakeId]: newEntry
    }));
    
    // Lo metemos visualmente a la lista de productos
    setProductos(prev => [newEntry, ...prev]);
    setShowAddModal(false);
    setVentaAlta(null);
    setNewProd({
      pro_codigo_plu: '', pro_codigo_barra: '', pro_nombre_producto: '',
      vta_total_periodo: '', dias_historial: 30, pro_dias_produccion_override: '',
      pro_dias_seguridad_override: '', pro_cantidad_minima: 0
    });
  };

  const handleLoginMaster = async (e) => {
    e.preventDefault();
    setLoading(true); setAuthErr('');
    try {
      const res = await loginMaster(pass);
      if (res.ok) {
        localStorage.setItem('masterToken', res.token);
        setIsAuth(true);
      }
    } catch (e) {
      setAuthErr(e?.response?.data?.error || 'Contraseña maestra incorrecta');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuth) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-gray-900/50 rounded-2xl border border-rose-500/20 max-w-sm mx-auto mt-10">
        <div className="text-5xl mb-4">🔐</div>
        <h2 className="text-white font-bold text-xl mb-2">Panel Maestro Privado</h2>
        <p className="text-gray-400 text-sm text-center mb-6">Ingresa la clave maestra para acceder a esta sección.</p>
        
        <form onSubmit={handleLoginMaster} className="w-full space-y-4">
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={pass}
              onChange={e => setPass(e.target.value)}
              placeholder="Clave Maestra..."
              className="input-field text-center py-3 tracking-widest text-white pr-12"
              autoFocus
            />
            <button type="button" onClick={() => setShowPass(v => !v)}
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white text-xl leading-none">
              {showPass ? '🙈' : '👁️'}
            </button>
          </div>
          {authErr && <p className="text-rose-400 text-sm text-center font-medium animate-fade-in">{authErr}</p>}
          <button type="submit" disabled={loading || !pass} className="btn-primary w-full bg-rose-700 hover:bg-rose-600 border-none py-3">
            {loading ? 'Verificando...' : 'Desbloquear Panel'}
          </button>
        </form>
      </div>
    );
  }

  // Renderizado de tabla
  return (
    <div className="space-y-4">
      {/* Selector de Departamento */}
      <div className="card p-4 flex flex-col sm:flex-row sm:items-end gap-4 border border-brand-500/30">
        <div className="flex-1">
          <label className="label">Seleccionar Departamento Maestro</label>
          <select value={depSel} onChange={e => setDepSel(e.target.value)} className="input-field">
            <option value="">— Elija un departamento —</option>
            {departamentos.map(d => (
              <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre} (ID: {d.dep_id})</option>
            ))}
          </select>
        </div>
      </div>

      {depSel && (
        <div className="card p-4 space-y-4 animate-slide-up border border-gray-800">
          
          {/* Barra de herramientas */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/50 p-3 rounded-xl border border-gray-800">
            <div className="flex-1 min-w-[200px]">
              <input 
                type="text" 
                placeholder="🔍 Buscar por nombre, PLU o barra..." 
                className="input-field"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setShowAddModal(true)} className="btn-primary py-2 px-4 text-sm whitespace-nowrap bg-emerald-600 hover:bg-emerald-500">
                + Nuevo Producto
              </button>
              
              {selected.size > 0 && (
                <button onClick={() => handleSetActivo(false)} className="btn-primary py-2 px-4 text-sm whitespace-nowrap bg-amber-600 hover:bg-amber-500">
                  🚫 Desactivar ({selected.size})
                </button>
              )}

              {selected.size > 0 && (
                <button onClick={() => handleSetActivo(true)} className="btn-primary py-2 px-4 text-sm whitespace-nowrap bg-emerald-600 hover:bg-emerald-500">
                  ✅ Activar ({selected.size})
                </button>
              )}

              {selected.size > 0 && (
                <button onClick={handleDeleteSelected} className="btn-primary py-2 px-4 text-sm whitespace-nowrap bg-rose-600 hover:bg-rose-500">
                  🗑 Eliminar ({selected.size})
                </button>
              )}
              
              <button onClick={handleExport} className="btn-primary py-2 px-4 text-sm whitespace-nowrap bg-sky-600 hover:bg-sky-500">
                📥 Exportar Excel
              </button>
              
              <button 
                onClick={handleSaveAll} 
                disabled={!hasEdits || loading} 
                className={`btn-primary py-2 px-4 text-sm whitespace-nowrap shadow-xl ${hasEdits ? 'bg-brand-500 hover:bg-brand-400 animate-pulse' : 'bg-gray-700 opacity-50'}`}
              >
                💾 Confirmar Cambios {hasEdits && `(${Object.keys(edits).length})`}
              </button>
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-950">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="text-xs uppercase bg-gray-900 text-gray-400">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded bg-gray-800 border-gray-700"
                      checked={filteredProducts.length > 0 && selected.size === filteredProducts.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="p-3 w-20">PLU</th>
                  <th className="p-3 min-w-[200px]">Nombre del Producto</th>
                  <th className="p-3 w-28 text-center" title="Automatica: se recalcula cada dia con las ventas reales de los ultimos 30 dias">Vta. Diaria 🔒</th>
                  <th className="p-3 w-28 text-center" title="Factor de ajuste semanal (Días Prod)">Fact. Prod</th>
                  <th className="p-3 w-28 text-center" title="Stock de Seguridad Crítico (Días)">Días Seguridad</th>
                  <th className="p-3 w-28 text-center" title="Cuanto se pide con stock 0. Editable: lo que fijes aqui no lo pisa la actualizacion diaria">Dda Total ✎</th>
                  <th className="p-3 w-28 text-center" title="Requerimiento mínimo (Lote)">Req. Mínimo</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-8 text-gray-500">
                      {loading ? 'Cargando...' : 'No se encontraron productos'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map(p => {
                    // ID real o fake (si es nuevo local)
                    const rowId = p.isNew ? p.pro_codigo_plu : p.pro_codigo_plu; 
                    // Revisar si existe una clave en edits que coincida
                    const localId = Object.keys(edits).find(k => edits[k].pro_codigo_plu === rowId) || rowId;
                    
                    const isEdited = !!edits[localId];
                    const current = isEdited ? { ...p, ...edits[localId] } : p;
                    const isSelected = selected.has(localId);

                    return (
                      <tr key={localId} className={`border-b border-gray-800 hover:bg-gray-800/50 transition-colors ${isEdited ? 'bg-brand-900/10' : ''} ${current.pro_activo === 0 ? 'opacity-50' : ''}`}>
                        <td className="p-3 text-center">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded bg-gray-800 border-gray-700"
                            checked={isSelected}
                            onChange={() => toggleSelectRow(localId)}
                          />
                        </td>
                        <td className="p-3 font-mono text-gray-400">
                          {current.pro_codigo_plu}
                          {current.pro_activo === 0 && (
                            <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-900/40 border border-amber-700/50 text-amber-300 text-[10px] font-sans font-semibold">desactivado</span>
                          )}
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={current.pro_nombre_producto} 
                            onChange={e => handleEdit(localId, 'pro_nombre_producto', e.target.value)}
                            className="w-full bg-transparent border border-transparent focus:border-brand-500 rounded px-2 py-1 outline-none transition-colors"
                          />
                        </td>
                        {/* Venta diaria: solo lectura. La mantiene el sistema con las
                            ventas reales de los últimos 30 días (tarea diaria 06:00). */}
                        <td className="p-3 w-28 text-center text-emerald-300/80 font-mono"
                            title="Automática: se recalcula cada día con las ventas de los últimos 30 días">
                          {r1(current.ventaDiaria).toFixed(1)}
                        </td>
                        <td className="p-2">
                          <input 
                            type="number" 
                            value={current.pro_dias_produccion_override ?? ''}
                            onChange={e => editarDias(localId, 'pro_dias_produccion_override', e.target.value)}
                            className="w-full text-center bg-transparent border border-transparent focus:border-brand-500 rounded px-2 py-1 outline-none text-sky-300"
                            placeholder="Auto"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="number" 
                            value={current.pro_dias_seguridad_override ?? ''}
                            onChange={e => editarDias(localId, 'pro_dias_seguridad_override', e.target.value)}
                            className="w-full text-center bg-transparent border border-transparent focus:border-brand-500 rounded px-2 py-1 outline-none text-rose-300"
                            placeholder="Auto"
                          />
                        </td>
                        {/* Demanda total: editable. Si se fija a mano queda marcada en
                            ámbar y la actualización diaria ya no la pisa. */}
                        <td className="p-2 w-28 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <input
                              type="number"
                              step="0.1"
                              value={mostrar1Dec(demandaMostrada(current), `${localId}:dda`)}
                              onChange={e => { setFocusCampo(`${localId}:dda`); editarDemandaTotal(localId, e.target.value); }}
                              onBlur={() => setFocusCampo(null)}
                              className={`w-16 text-center bg-transparent border rounded px-1 py-1 outline-none font-bold font-mono transition-colors ${
                                tieneOverride(current)
                                  ? 'border-amber-500/60 bg-amber-500/10 text-amber-300'
                                  : 'border-transparent focus:border-brand-500 text-brand-400'
                              }`}
                              placeholder="0.0"
                              title={tieneOverride(current)
                                ? `Fijada a mano. El automático sería ${r1(demandaDe(current, current.ventaDiaria)).toFixed(1)}. Vacía el campo para volver al automático.`
                                : 'Automática. Escribe un valor para fijarla y que no la pise la actualización diaria.'}
                            />
                            {tieneOverride(current) && (
                              <button type="button" onClick={() => volverAutomatico(localId)}
                                title="Volver al valor automático"
                                className="text-[10px] text-amber-400/70 hover:text-amber-200 leading-none px-1">
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <input 
                            type="number" 
                            value={current.pro_cantidad_minima ?? ''} 
                            onChange={e => handleEdit(localId, 'pro_cantidad_minima', e.target.value)}
                            className="w-full text-center bg-transparent border border-transparent focus:border-brand-500 rounded px-2 py-1 outline-none text-brand-300 font-bold"
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {/* Modal Nuevo Producto */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 p-6 rounded-2xl w-full max-w-md shadow-2xl animate-slide-up">
            <h3 className="text-xl font-bold text-white mb-4">Agregar Nuevo Producto</h3>
            <form onSubmit={handleAddNew} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">PLU</label>
                  <input required type="text" className="input-field" value={newProd.pro_codigo_plu}
                    onChange={e => { setNewProd({...newProd, pro_codigo_plu: e.target.value}); setVentaAlta(null); }}
                    onBlur={e => leerVentaDelPlu(e.target.value)} />
                </div>
                <div>
                  <label className="label">Cód. Barra (Opc)</label>
                  <input type="text" className="input-field" value={newProd.pro_codigo_barra} onChange={e => setNewProd({...newProd, pro_codigo_barra: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Nombre del Producto</label>
                <input required type="text" className="input-field" value={newProd.pro_nombre_producto} onChange={e => setNewProd({...newProd, pro_nombre_producto: e.target.value})} />
              </div>
              {/* La venta ya no se escribe a mano: se lee de las ventas reales de los
                  últimos 30 días al salir del campo PLU, igual que hace la
                  actualización diaria. Al guardar, el servidor la vuelve a leer. */}
              <div className="rounded-xl border border-gray-700 bg-gray-800/40 p-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="label text-xs mb-0">
                    Venta diaria · {ventaAlta ? `últimos ${ventaAlta.dias} días` : 'últimos 30 días'}
                  </label>
                  {cargandoVenta && <span className="text-[11px] text-gray-500">leyendo ventas…</span>}
                </div>
                <p className="text-2xl font-bold font-mono text-emerald-300">
                  {ventaAlta ? r1(ventaAlta.ventaDiaria).toFixed(1) : '—'}
                  <span className="text-xs font-sans font-normal text-gray-500 ml-2">
                    {ventaAlta ? `(${ventaAlta.unidades} unid. en ${ventaAlta.dias} días)` : 'escribe el PLU'}
                  </span>
                </p>
                {/* Producto nuevo: se divide por los días que lleva vendiéndose, no
                    por 30, porque si no su venta diaria saldría muy por debajo. */}
                {ventaAlta && ventaAlta.esNuevo && (
                  <p className="text-[11px] text-sky-300 mt-1">
                    🆕 Producto nuevo: vende desde el {ventaAlta.primeraVenta}, así que
                    se divide por {ventaAlta.dias} días y no por {ventaAlta.diasPedidos}.
                  </p>
                )}
                {ventaAlta && ventaAlta.unidades === 0 && (
                  <p className="text-[11px] text-amber-400 mt-1">
                    Este PLU no registra ventas en los últimos 30 días. El producto se
                    creará igual, con venta 0.
                  </p>
                )}
                <p className="text-[11px] text-gray-500 mt-1">
                  🔒 La calcula el sistema y se actualiza sola cada día.
                </p>
              </div>
              <div>
                <label className="label">Req. Mínimo de Producción</label>
                <input type="number" className="input-field text-brand-300" value={newProd.pro_cantidad_minima} onChange={e => setNewProd({...newProd, pro_cantidad_minima: e.target.value})} placeholder="0" />
              </div>
              {/* Debajo de cada campo se muestra el número que se usaría si se deja
                  vacío, para que "Auto" deje de ser una incógnita. Los días de
                  seguridad dependen de la venta, así que aparecen al leer el PLU. */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Días Stock (Opc)</label>
                  <input type="number" className="input-field text-rose-300" value={newProd.pro_dias_seguridad_override} onChange={e => setNewProd({...newProd, pro_dias_seguridad_override: e.target.value})} placeholder="Auto" />
                  <p className="text-[11px] text-gray-500 mt-1">
                    {ventaAlta
                      ? <>Auto = <span className="text-rose-300 font-mono font-semibold">{ventaAlta.dias_seg_auto}</span>{' '}
                          <span className="text-gray-600">({ventaAlta.ventaDiaria > 20 ? 'más' : 'hasta'} 20 u/día)</span></>
                      : 'Auto: se calcula según la venta'}
                  </p>
                </div>
                <div>
                  <label className="label">Días Prod. (Opc)</label>
                  <input type="number" className="input-field text-sky-300" value={newProd.pro_dias_produccion_override} onChange={e => setNewProd({...newProd, pro_dias_produccion_override: e.target.value})} placeholder="Auto" />
                  <p className="text-[11px] text-gray-500 mt-1">
                    {ventaAlta
                      ? <>Auto = <span className="text-sky-300 font-mono font-semibold">{ventaAlta.dias_prod_auto}</span>{' '}
                          <span className="text-gray-600">(config. del depto)</span></>
                      : 'Auto: días de producción del depto'}
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 btn-primary bg-gray-700 hover:bg-gray-600">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 btn-primary">
                  Agregar a la tabla
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
