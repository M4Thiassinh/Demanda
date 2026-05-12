import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { getDepartamentos, crearDepartamento, updateDepartamento, getConfig, updateConfig, subirCSV, buscarProductos, getProducto, updateProducto, exportarExcel } from '../api'
import MasterAdminPanel from '../components/admin/MasterAdminPanel'

// ── Tab Configuración ────────────────────────────────────────
function ConfigTab() {
  const [departamentos, setDeps] = useState([])
  const [depSel, setDepSel]      = useState('')
  const [cfg, setCfg]            = useState({ dias_produccion_semana: '', dias_seguridad_defecto: '', dep_email_jefe: '', dep_emails_cc: '' })
  const [msg, setMsg]            = useState(null)
  const [loading, setLoading]    = useState(false)
  const [showCrear, setShowCrear] = useState(false)
  const [newDep, setNewDep]      = useState({ id: '', nombre: '', email: '', cc: '' })

  const loadDeps = () => getDepartamentos().then(setDeps)
  useEffect(() => { loadDeps() }, [])
  useEffect(() => {
    if (!depSel) return
    const d = departamentos.find(x => x.dep_id === depSel)
    getConfig(depSel).then(c => setCfg({ 
      dias_produccion_semana: c.dias_produccion_semana, 
      dias_seguridad_defecto: c.dias_seguridad_defecto,
      dep_email_jefe: d?.dep_email_jefe || '',
      dep_emails_cc: d?.dep_emails_cc || ''
    }))
  }, [depSel, departamentos])

  const guardar = async () => {
    setLoading(true); setMsg(null)
    try {
      await updateConfig(depSel, { dias_produccion_semana: parseInt(cfg.dias_produccion_semana), dias_seguridad_defecto: parseInt(cfg.dias_seguridad_defecto) })
      await updateDepartamento(depSel, { dep_nombre: departamentos.find(x => x.dep_id === depSel)?.dep_nombre, dep_email_jefe: cfg.dep_email_jefe, dep_emails_cc: cfg.dep_emails_cc })
      await loadDeps()
      setMsg({ ok: true, texto: 'Guardado correctamente' })
    } catch (e) { setMsg({ ok: false, texto: e?.response?.data?.error || 'Error' }) }
    finally { setLoading(false) }
  }

  const crearDep = async () => {
    setLoading(true); setMsg(null)
    try {
      await crearDepartamento({ dep_id: newDep.id, dep_nombre: newDep.nombre, dep_email_jefe: newDep.email, dep_emails_cc: newDep.cc })
      await loadDeps()
      setNewDep({ id: '', nombre: '', email: '', cc: '' })
      setShowCrear(false)
      setDepSel(newDep.id)
      setMsg({ ok: true, texto: 'Departamento creado' })
    } catch (e) { setMsg({ ok: false, texto: e?.response?.data?.error || 'Error' }) }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <label className="label mb-0">Seleccionar Departamento</label>
        <button onClick={() => setShowCrear(!showCrear)} className="text-brand-400 text-sm font-semibold hover:text-brand-300">
          {showCrear ? '✕ Cerrar' : '+ Nuevo Departamento'}
        </button>
      </div>

      {showCrear && (
        <div className="card p-4 space-y-3 border border-brand-500/30 bg-brand-900/10 animate-slide-down">
          <p className="text-brand-400 font-bold text-sm">Crear Nuevo Departamento</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">ID (ej: 25)</label><input type="text" value={newDep.id} onChange={e => setNewDep(n => ({...n, id: e.target.value}))} className="input-field" /></div>
            <div><label className="label">Nombre</label><input type="text" value={newDep.nombre} onChange={e => setNewDep(n => ({...n, nombre: e.target.value}))} className="input-field" /></div>
          </div>
          <div><label className="label">Correo Jefe (opcional)</label><input type="email" value={newDep.email} onChange={e => setNewDep(n => ({...n, email: e.target.value}))} className="input-field" placeholder="Para recibir reportes de quiebres" /></div>
          <div><label className="label">Correos CC (opcional)</label><input type="text" value={newDep.cc} onChange={e => setNewDep(n => ({...n, cc: e.target.value}))} className="input-field" placeholder="Separados por coma" /></div>
          <button onClick={crearDep} disabled={loading || !newDep.id || !newDep.nombre} className="btn-primary w-full disabled:opacity-50 text-sm py-2">
            Confirmar Creación
          </button>
        </div>
      )}

      <div>
        <select id="cfg-dep" value={depSel} onChange={e => setDepSel(e.target.value)} className="input-field">
          <option value="">— Seleccionar —</option>
          {departamentos.map(d => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre} (ID:{d.dep_id})</option>)}
        </select>
      </div>
      
      {depSel && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <div>
            <label className="label">Correo del Jefe de Departamento</label>
            <input type="email" value={cfg.dep_email_jefe} onChange={e => setCfg(c => ({ ...c, dep_email_jefe: e.target.value }))} className="input-field" placeholder="ejemplo@empresa.com" />
          </div>
          <div>
            <label className="label">Correos CC <span className="text-gray-500 font-normal text-xs">(separados por coma)</span></label>
            <input type="text" value={cfg.dep_emails_cc} onChange={e => setCfg(c => ({ ...c, dep_emails_cc: e.target.value }))} className="input-field" placeholder="uno@empresa.com, dos@empresa.com" />
          </div>
          <div>
            <label className="label">Días de Producción / Semana <span className="text-gray-500 font-normal text-xs">(default 6 = Lunes a Sábado)</span></label>
            <input id="cfg-dias-prod" type="number" min={1} max={7} value={cfg.dias_produccion_semana}
              onChange={e => setCfg(c => ({ ...c, dias_produccion_semana: e.target.value }))} className="input-field" />
          </div>
          <div>
            <label className="label">Días Seguridad Defecto <span className="text-gray-500 font-normal text-xs">(auto: {">"}20 uds/día → 1, si no → 2)</span></label>
            <input id="cfg-dias-seg" type="number" min={0} value={cfg.dias_seguridad_defecto}
              onChange={e => setCfg(c => ({ ...c, dias_seguridad_defecto: e.target.value }))} className="input-field" />
          </div>
          <div className="bg-gray-900 rounded-xl p-3 text-xs font-mono text-gray-400 space-y-1 border border-gray-700/40">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Lógica de Negocio — Lotes de Producción</p>
            <p>venta_diaria = ventas / dias_historial</p>
            <p>días_prod = override ?? <span className="text-yellow-400">{cfg.dias_produccion_semana}</span> (días/semana)</p>
            <p>lote_base = (venta_diaria × 7) / días_prod</p>
            <p>stock_seg = venta_diaria × (override ?? venta_diaria {">"}20 ? 1 : 2)</p>
            <p>demanda = lote_base + stock_seg</p>
            <p className="text-white">requerimiento = demanda − stock_sala → Math.ceil()</p>
          </div>
          {msg && <p className={`text-sm text-center font-medium rounded-lg p-2 ${msg.ok ? 'bg-emerald-900/40 text-emerald-400' : 'bg-rose-900/40 text-rose-400'}`}>{msg.ok ? '✅' : '❌'} {msg.texto}</p>}
          <button id="btn-guardar-cfg" onClick={guardar} disabled={loading} className="btn-primary w-full disabled:opacity-50">
            {loading ? 'Guardando…' : 'Guardar Cambios'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Tab Carga CSV ─────────────────────────────────────────────
function CsvTab() {
  const [departamentos, setDeps] = useState([])
  const [depSel, setDepSel]      = useState('')
  const [dias, setDias]          = useState(30)
  const [archivo, setArchivo]    = useState(null)
  const [loading, setLoading]    = useState(false)
  const [resultado, setRes]      = useState(null)
  const [error, setError]        = useState('')
  const [drag, setDrag]          = useState(false)

  useEffect(() => { getDepartamentos().then(setDeps) }, [])

  const setFile = (f) => f?.name.endsWith('.csv') ? (setArchivo(f), setError('')) : setError('Solo .csv')

  const cargar = async () => {
    if (!archivo || !depSel) return setError('Selecciona departamento y archivo')
    setLoading(true); setRes(null); setError('')
    try {
      const fd = new FormData()
      fd.append('file', archivo); fd.append('dep_id', depSel); fd.append('dias_historial', dias)
      setRes(await subirCSV(fd)); setArchivo(null)
    } catch (e) { setError(e?.response?.data?.error || 'Error') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="label">Departamento</label>
        <select id="csv-dep" value={depSel} onChange={e => setDepSel(e.target.value)} className="input-field">
          <option value="">— Seleccionar —</option>
          {departamentos.map(d => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Días del período</label>
        <input id="csv-dias" type="number" min={1} value={dias} onChange={e => setDias(e.target.value)} className="input-field" />
      </div>
      <div onClick={() => document.getElementById('csv-file').click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0]) }}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
          ${drag ? 'border-brand-500 bg-brand-900/20' : archivo ? 'border-emerald-600 bg-emerald-900/20' : 'border-gray-600 hover:border-gray-500'}`}>
        <input id="csv-file" type="file" accept=".csv" className="hidden" onChange={e => setFile(e.target.files[0])} />
        {archivo ? (<><p className="text-4xl">📄</p><p className="text-emerald-400 font-semibold mt-1">{archivo.name}</p></>)
          : (<><p className="text-4xl">📁</p><p className="text-gray-300 font-medium mt-1">Arrastra tu CSV</p><p className="text-gray-500 text-sm">Formato: PLU;Nombre;Ventas_Total</p></>)}
      </div>
      {error && <p className="text-rose-400 text-sm text-center">{error}</p>}
      {resultado && (
        <div className="card p-4 text-center space-y-2 animate-slide-up">
          <p className="text-emerald-400 font-bold text-sm">✅ Importación completada</p>
          <div className="grid grid-cols-3 gap-2">
            {[['Nuevos', resultado.insertados, 'text-white'], ['Actualizados', resultado.actualizados, 'text-yellow-400'], ['Errores', resultado.errores?.length || 0, 'text-rose-400']].map(([label, val, cls]) => (
              <div key={label} className="bg-gray-900 rounded-xl p-3"><p className={`text-2xl font-black ${cls}`}>{val}</p><p className="text-gray-400 text-xs">{label}</p></div>
            ))}
          </div>
        </div>
      )}
      <button id="btn-importar" onClick={cargar} disabled={loading || !archivo || !depSel} className="btn-primary w-full disabled:opacity-40">
        {loading ? '⏳ Importando…' : '📤 Importar Maestro'}
      </button>
    </div>
  )
}

// ── Tab Productos ─────────────────────────────────────────────
function ProductosTab() {
  const [departamentos, setDeps] = useState([])
  const [depSel, setDepSel]      = useState('')
  const [q, setQ]                = useState('')
  const [resultados, setRes]     = useState([])
  const [seleccionado, setSel]   = useState(null)
  const [form, setForm]          = useState({ pro_codigo_barra: '', pro_dias_produccion_override: '', pro_dias_seguridad_override: '', pro_dias_elaboracion: '', pro_cantidad_minima: '' })
  const [msg, setMsg]            = useState(null)

  useEffect(() => { getDepartamentos().then(setDeps) }, [])

  const buscar = async () => {
    if (!depSel) return
    try { 
      const res = await buscarProductos(depSel, q)
      if (Array.isArray(res)) setRes(res)
    } catch {}
  }

  const seleccionar = async (p) => {
    const det = await getProducto(p.pro_codigo_plu, depSel)
    setSel(det)
    setForm({
      pro_codigo_barra:            det.pro_codigo_barra            || '',
      pro_dias_produccion_override: det.pro_dias_produccion_override ?? '',
      pro_dias_seguridad_override:  det.pro_dias_seguridad_override  ?? '',
      pro_dias_elaboracion:         det.pro_dias_elaboracion         || '',
      pro_cantidad_minima:          det.pro_cantidad_minima          ?? '',
    })
    setMsg(null)
  }

  const guardar = async () => {
    try {
      await updateProducto(seleccionado.pro_codigo_plu, depSel, { ...form })
      setMsg({ ok: true, texto: 'Producto actualizado' })
    } catch (e) { setMsg({ ok: false, texto: e?.response?.data?.error || 'Error' }) }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className="label">Departamento</label>
          <select value={depSel} onChange={e => setDepSel(e.target.value)} className="input-field text-sm py-2.5">
            <option value="">— Dep —</option>
            {departamentos.map(d => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className="label">Buscar</label>
          <input type="text" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && buscar()}
            placeholder="PLU o nombre…" className="input-field text-sm py-2.5" />
        </div>
        <div className="flex items-end">
          <button onClick={buscar} className="btn-secondary py-2.5 px-4 text-sm">🔍</button>
        </div>
      </div>

      {resultados.length > 0 && !seleccionado && (
        <div className="card overflow-hidden animate-slide-up">
          {resultados.map(p => (
            <div key={p.pro_codigo_plu} onClick={() => seleccionar(p)}
              className="flex items-center px-4 py-3 hover:bg-gray-700/50 cursor-pointer border-b border-gray-700/30 last:border-0">
              <div className="flex-1">
                <p className="text-white text-sm font-medium">{p.pro_nombre_producto}</p>
                <p className="text-gray-500 text-xs font-mono">PLU {p.pro_codigo_plu}</p>
              </div>
              <span className="text-brand-400 text-xs">Editar →</span>
            </div>
          ))}
        </div>
      )}

      {seleccionado && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm">{seleccionado.pro_nombre_producto}</p>
              <p className="text-gray-500 text-xs font-mono">PLU {seleccionado.pro_codigo_plu}</p>
            </div>
            <button onClick={() => { setSel(null); setRes([]) }} className="text-gray-500 hover:text-white text-sm">✕</button>
          </div>
          <div>
            <label className="label">Código de Barras</label>
            <input type="text" value={form.pro_codigo_barra} onChange={e => setForm(f => ({ ...f, pro_codigo_barra: e.target.value }))} className="input-field" placeholder="(opcional)" />
          </div>
          <div>
            <label className="label">Días Producción/Semana <span className="text-gray-500 font-normal text-xs">(vacío = usar config depto)</span></label>
            <input type="number" min={1} max={7} value={form.pro_dias_produccion_override}
              onChange={e => setForm(f => ({ ...f, pro_dias_produccion_override: e.target.value }))}
              className="input-field" placeholder="Ej: 2, 3… Vacío = default depto" />
          </div>
          <div>
            <label className="label">Días de Seguridad <span className="text-gray-500 font-normal text-xs">(vacío = lógica automática)</span></label>
            <input type="number" min={0} value={form.pro_dias_seguridad_override}
              onChange={e => setForm(f => ({ ...f, pro_dias_seguridad_override: e.target.value }))}
              className="input-field" placeholder="Vacío = auto" />
          </div>
          <div>
            <label className="label">Días Específicos de Elaboración</label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {[ {d:1,l:'Lun'}, {d:2,l:'Mar'}, {d:3,l:'Mié'}, {d:4,l:'Jue'}, {d:5,l:'Vie'}, {d:6,l:'Sáb'}, {d:7,l:'Dom'} ].map(dia => {
                const checked = form.pro_dias_elaboracion ? form.pro_dias_elaboracion.split(',').includes(String(dia.d)) : false;
                return (
                  <label key={dia.d} className="flex items-center gap-2 text-sm text-gray-300 bg-gray-900 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-800">
                    <input type="checkbox" checked={checked} 
                      onChange={(e) => {
                        let arr = form.pro_dias_elaboracion ? form.pro_dias_elaboracion.split(',') : [];
                        if (e.target.checked) arr.push(String(dia.d));
                        else arr = arr.filter(x => x !== String(dia.d));
                        setForm(f => ({ ...f, pro_dias_elaboracion: arr.sort().join(',') }));
                      }} 
                      className="rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500" />
                    {dia.l}
                  </label>
                )
              })}
            </div>
            <p className="text-gray-500 text-xs mt-1">Si marcas días, el producto solo se pedirá si HOY es uno de esos días. Si no hay marcas, se pedirá siempre.</p>
          </div>
          <div>
            <label className="label">Cantidad Mínima de Producción</label>
            <input type="number" min={0} value={form.pro_cantidad_minima}
              onChange={e => setForm(f => ({ ...f, pro_cantidad_minima: e.target.value }))}
              className="input-field" placeholder="0 = sin mínimo" />
          </div>
          {msg && <p className={`text-sm text-center font-medium p-2 rounded-lg ${msg.ok ? 'bg-emerald-900/40 text-emerald-400' : 'bg-rose-900/40 text-rose-400'}`}>{msg.ok ? '✅' : '❌'} {msg.texto}</p>}
          <button onClick={guardar} className="btn-primary w-full">Guardar Producto</button>
        </div>
      )}
    </div>
  )
}

// ── Tab Exportar ──────────────────────────────────────────────
function ExportTab() {
  const [departamentos, setDeps] = useState([])
  const [depSel, setDepSel]      = useState('')
  const [fechaIni, setFI]        = useState('')
  const [fechaFin, setFF]        = useState('')
  const [loading, setLoading]    = useState(false)
  const [error, setError]        = useState('')

  useEffect(() => { getDepartamentos().then(setDeps) }, [])

  const exportar = async () => {
    setLoading(true); setError('')
    try {
      const resp = await exportarExcel({ dep_id: depSel || undefined, fecha_ini: fechaIni || undefined, fecha_fin: fechaFin || undefined })
      const url  = URL.createObjectURL(resp.data)
      const a    = document.createElement('a'); a.href = url; a.download = `reposicion_${Date.now()}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { setError('Error al exportar') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      <p className="text-gray-400 text-sm">Exporta un Excel consolidado con todas las revisiones completadas en el período.</p>
      <div>
        <label className="label">Departamento (opcional)</label>
        <select value={depSel} onChange={e => setDepSel(e.target.value)} className="input-field">
          <option value="">— Todos —</option>
          {departamentos.map(d => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Desde</label><input type="date" value={fechaIni} onChange={e => setFI(e.target.value)} className="input-field" /></div>
        <div><label className="label">Hasta</label><input type="date" value={fechaFin} onChange={e => setFF(e.target.value)} className="input-field" /></div>
      </div>
      {error && <p className="text-rose-400 text-sm text-center">{error}</p>}
      <button id="btn-exportar" onClick={exportar} disabled={loading} className="btn-primary w-full disabled:opacity-50">
        {loading ? '⏳ Generando…' : '📥 Descargar Excel'}
      </button>
    </div>
  )
}

// ── Página Principal Admin ────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate()
  const reset    = useAppStore(s => s.reset)
  const [tab, setTab] = useState('config')
  
  // Lógica de Autenticación
  const [auth, setAuth] = useState(localStorage.getItem('adminToken') !== null)
  const [pass, setPass] = useState('')
  const [authErr, setAuthErr] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true); setAuthErr('')
    try {
      const { loginAdmin } = await import('../api')
      const res = await loginAdmin(pass)
      if (res.ok) {
        localStorage.setItem('adminToken', res.token)
        setAuth(true)
      }
    } catch (e) {
      setAuthErr('Contraseña incorrecta')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('adminToken')
    setAuth(false)
    setPass('')
  }

  if (!auth) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 p-8 rounded-2xl w-full max-w-sm animate-fade-in shadow-2xl">
          <div className="text-center mb-6">
            <span className="text-5xl mb-3 block">🔒</span>
            <h1 className="text-white font-bold text-2xl">Panel Administrador</h1>
            <p className="text-gray-500 text-sm mt-1">Acceso Restringido</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" value={pass} onChange={e => setPass(e.target.value)}
              placeholder="Contraseña..." autoFocus className="input-field text-center py-3 text-lg tracking-widest" />
            {authErr && <p className="text-rose-400 text-sm text-center font-medium animate-fade-in">{authErr}</p>}
            <button type="submit" disabled={loading || !pass} className="btn-primary w-full py-3 disabled:opacity-50">
              {loading ? 'Verificando...' : 'Entrar'}
            </button>
            <button type="button" onClick={() => navigate('/')} className="w-full text-gray-500 hover:text-white text-sm mt-2 transition-colors">
              ← Volver al inicio
            </button>
          </form>
        </div>
      </div>
    )
  }

  const tabs = [
    { key: 'config',    label: '⚙️ Config' },
    { key: 'csv',       label: '📤 CSV' },
    { key: 'productos', label: '📦 Productos' },
    { key: 'master',    label: '📊 Maestro' },
    { key: 'export',    label: '📥 Exportar' },
  ]

  return (
    <div className="min-h-screen bg-gray-950 max-w-2xl mx-auto">
      <header className="bg-gray-900 border-b border-gray-700/50 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => { reset(); navigate('/') }} className="text-gray-400 hover:text-white text-sm">← Salir</button>
        <div><p className="text-xs text-gray-500 uppercase tracking-wider">Teja Market</p>
          <h1 className="text-white font-bold">Panel Administrador</h1></div>
        <button onClick={handleLogout} className="ml-auto bg-rose-900/40 hover:bg-rose-800/60 border border-rose-800/50 rounded-full px-4 py-1.5 text-rose-300 text-xs font-semibold transition-colors">
          Cerrar Sesión
        </button>
      </header>

      <div className="flex border-b border-gray-800 overflow-x-auto px-2">
        {tabs.map(t => (
          <button key={t.key} id={`tab-${t.key}`} onClick={() => setTab(t.key)}
            className={`py-3.5 px-3 text-sm font-semibold border-b-2 whitespace-nowrap transition-all flex-shrink-0
              ${tab === t.key ? 'border-brand-500 text-brand-400' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5 animate-fade-in">
        {tab === 'config'    && <ConfigTab />}
        {tab === 'csv'       && <CsvTab />}
        {tab === 'productos' && <ProductosTab />}
        {tab === 'master'    && <MasterAdminPanel />}
        {tab === 'export'    && <ExportTab />}
      </div>
    </div>
  )
}
