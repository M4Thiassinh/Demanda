import React, { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import { getDepartamentos, getMasterProductos, moverProductos, loginMaster } from '../../api';

// Pestaña "Mover productos de departamento".
// Caso de uso: un producto quedó en un depto que ya no le corresponde y lo
// siguen pidiendo ahí. Aquí se elige el depto origen, se seleccionan los
// productos y se mueven al depto destino. El historial de revisiones no se toca.
export default function MoverProductosTab() {
  // Autenticación maestra (misma clave que el panel Maestro)
  const [isAuth, setIsAuth] = useState(localStorage.getItem('masterToken') !== null);
  const [pass, setPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [authErr, setAuthErr] = useState('');

  const [departamentos, setDepartamentos] = useState([]);
  const [depOrigen, setDepOrigen] = useState('');
  const [depDestino, setDepDestino] = useState('');

  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());

  useEffect(() => {
    getDepartamentos().then(setDepartamentos).catch(console.error);
  }, []);

  useEffect(() => {
    if (!depOrigen) { setProductos([]); setSelected(new Set()); return; }
    fetchProductos();
    // Si el destino era igual al nuevo origen, lo limpiamos
    setDepDestino(d => (d === depOrigen ? '' : d));
  }, [depOrigen]);

  const fetchProductos = async () => {
    setLoading(true);
    try {
      const data = await getMasterProductos(depOrigen);
      setProductos(Array.isArray(data) ? data : []);
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

  const filtrados = useMemo(() => {
    if (!search.trim()) return productos;
    const q = search.toLowerCase();
    return productos.filter(p =>
      (p.pro_nombre_producto || '').toLowerCase().includes(q) ||
      String(p.pro_codigo_plu || '').includes(q) ||
      String(p.pro_codigo_barra || '').includes(q)
    );
  }, [productos, search]);

  const toggle = (plu) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(plu) ? n.delete(plu) : n.add(plu);
      return n;
    });
  };

  const toggleTodos = () => {
    setSelected(prev => {
      const visibles = filtrados.map(p => p.pro_codigo_plu);
      const todosSeleccionados = visibles.length > 0 && visibles.every(p => prev.has(p));
      const n = new Set(prev);
      if (todosSeleccionados) visibles.forEach(p => n.delete(p));
      else visibles.forEach(p => n.add(p));
      return n;
    });
  };

  const nombreDep = (id) => departamentos.find(d => d.dep_id === id)?.dep_nombre || id;

  const mover = async () => {
    if (!depDestino) { Swal.fire('Falta el destino', 'Elige el departamento de destino.', 'warning'); return; }
    if (selected.size === 0) { Swal.fire('Sin selección', 'Selecciona al menos un producto.', 'warning'); return; }

    const plus = [...selected];
    const conf = await Swal.fire({
      title: `¿Mover ${plus.length} producto(s)?`,
      html: `De <b>${nombreDep(depOrigen)}</b> a <b>${nombreDep(depDestino)}</b>.<br/><span style="color:#9ca3af;font-size:0.85em">El historial de pedidos anteriores se conserva.</span>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, mover',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#b8c030',
    });
    if (!conf.isConfirmed) return;

    setSaving(true);
    try {
      const res = await moverProductos(depOrigen, depDestino, plus);
      const omit = res.omitidos || [];
      let html = `Se movieron <b>${res.movidos}</b> producto(s) a <b>${nombreDep(depDestino)}</b>.`;
      if (omit.length) {
        html += `<br/><br/><span style="color:#f59e0b">${omit.length} se omitieron</span> porque ya existían en el destino:<br/><span style="font-size:0.8em;color:#9ca3af">${omit.join(', ')}</span>`;
      }
      await Swal.fire({ title: 'Listo', html, icon: omit.length ? 'warning' : 'success' });
      fetchProductos();
    } catch (e) {
      if (e?.response?.status === 401) {
        localStorage.removeItem('masterToken');
        setIsAuth(false);
        Swal.fire('Sesión Expirada', 'Contraseña maestra incorrecta', 'error');
      } else {
        Swal.fire('Error', e?.response?.data?.error || 'No se pudieron mover los productos', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleLoginMaster = async (e) => {
    e.preventDefault();
    setLoading(true); setAuthErr('');
    try {
      const res = await loginMaster(pass);
      if (res.ok) { localStorage.setItem('masterToken', res.token); setIsAuth(true); }
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
        <h2 className="text-white font-bold text-xl mb-2">Sección Privada</h2>
        <p className="text-gray-400 text-sm text-center mb-6">Ingresa la clave maestra para mover productos de departamento.</p>
        <form onSubmit={handleLoginMaster} className="w-full space-y-4">
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
              placeholder="Clave Maestra..." className="input-field text-center py-3 tracking-widest text-white pr-12" autoFocus />
            <button type="button" onClick={() => setShowPass(v => !v)}
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white text-xl leading-none">
              {showPass ? '🙈' : '👁️'}
            </button>
          </div>
          {authErr && <p className="text-rose-400 text-sm text-center font-medium animate-fade-in">{authErr}</p>}
          <button type="submit" disabled={loading || !pass} className="btn-primary w-full bg-rose-700 hover:bg-rose-600 border-none py-3">
            {loading ? 'Verificando...' : 'Desbloquear'}
          </button>
        </form>
      </div>
    );
  }

  const visibles = filtrados.map(p => p.pro_codigo_plu);
  const todosVisiblesSeleccionados = visibles.length > 0 && visibles.every(p => selected.has(p));

  return (
    <div className="space-y-4">
      {/* Selectores origen / destino */}
      <div className="card p-4 space-y-4 border border-brand-500/30">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Departamento origen (de dónde sacar)</label>
            <select value={depOrigen} onChange={e => setDepOrigen(e.target.value)} className="input-field">
              <option value="">— Elige el origen —</option>
              {departamentos.map(d => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Departamento destino (a dónde mover)</label>
            <select value={depDestino} onChange={e => setDepDestino(e.target.value)} className="input-field" disabled={!depOrigen}>
              <option value="">— Elige el destino —</option>
              {departamentos.filter(d => d.dep_id !== depOrigen).map(d => (
                <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {!depOrigen ? (
        <p className="text-gray-500 text-sm text-center py-8">Elige un departamento de origen para ver sus productos.</p>
      ) : loading ? (
        <p className="text-gray-400 text-sm text-center py-8">Cargando productos…</p>
      ) : (
        <>
          {/* Buscador + acción */}
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, PLU o código de barra…"
              className="input-field flex-1" />
            <div className="text-sm text-gray-400 whitespace-nowrap">
              {selected.size} seleccionado(s)
            </div>
            <button onClick={mover} disabled={saving || selected.size === 0 || !depDestino}
              className="btn-primary disabled:opacity-40 whitespace-nowrap">
              {saving ? 'Moviendo…' : `🔀 Mover${depDestino ? ' a ' + nombreDep(depDestino) : ''}`}
            </button>
          </div>

          {productos.length === 0 ? (
            <p className="text-gray-500 text-sm text-center py-8">Este departamento no tiene productos.</p>
          ) : (
            <div className="card overflow-hidden border border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-900/70 text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left w-10">
                      <input type="checkbox" checked={todosVisiblesSeleccionados} onChange={toggleTodos}
                        aria-label="Seleccionar todos" className="accent-brand-500 w-4 h-4" />
                    </th>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-left w-24">PLU</th>
                    <th className="px-3 py-2 text-left w-32 hidden sm:table-cell">Cód. Barra</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map(p => {
                    const sel = selected.has(p.pro_codigo_plu);
                    return (
                      <tr key={p.pro_codigo_plu}
                        onClick={() => toggle(p.pro_codigo_plu)}
                        className={`border-t border-gray-800 cursor-pointer transition-colors ${sel ? 'bg-brand-500/10' : 'hover:bg-gray-800/40'}`}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={sel} onChange={() => toggle(p.pro_codigo_plu)}
                            onClick={e => e.stopPropagation()} className="accent-brand-500 w-4 h-4" />
                        </td>
                        <td className="px-3 py-2 text-gray-200">
                          {p.pro_nombre_producto}
                          {p.pro_activo === 0 && <span className="ml-2 text-xs text-gray-500">(desactivado)</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-400">{p.pro_codigo_plu}</td>
                        <td className="px-3 py-2 text-gray-400 hidden sm:table-cell">{p.pro_codigo_barra || '—'}</td>
                      </tr>
                    );
                  })}
                  {filtrados.length === 0 && (
                    <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">Sin resultados para “{search}”.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
