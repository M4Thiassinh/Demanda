import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import Swal from 'sweetalert2'
import { getDepartamentos, crearDepartamento, updateDepartamento, getConfig, updateConfig, subirCSV, actualizarDemandaVentas, getClasificacion, clasificacionBulk } from '../api'
import MasterAdminPanel from '../components/admin/MasterAdminPanel'
import MoverProductosTab from '../components/admin/MoverProductosTab'
import Logo from '../components/Logo'

// ── Tab Configuración ────────────────────────────────────────
function ConfigTab() {
  const [departamentos, setDeps] = useState([])
  const [depSel, setDepSel]      = useState('')
  const [cfg, setCfg]            = useState({ dias_produccion_semana: '', dias_seguridad_defecto: '', dep_email_jefe: '', dep_emails_cc: '', dep_productiva: false })
  const [msg, setMsg]            = useState(null)
  const [loading, setLoading]    = useState(false)
  const [showCrear, setShowCrear] = useState(false)
  const [newDep, setNewDep]      = useState({ id: '', nombre: '', email: '', cc: '', productiva: false })

  const loadDeps = () => getDepartamentos().then(setDeps)
  useEffect(() => { loadDeps() }, [])
  useEffect(() => {
    if (!depSel) return
    const d = departamentos.find(x => x.dep_id === depSel)
    getConfig(depSel).then(c => setCfg({
      dias_produccion_semana: c.dias_produccion_semana,
      dias_seguridad_defecto: c.dias_seguridad_defecto,
      dep_email_jefe: d?.dep_email_jefe || '',
      dep_emails_cc: d?.dep_emails_cc || '',
      dep_productiva: !!d?.dep_productiva
    }))
  }, [depSel, departamentos])

  const guardar = async () => {
    setLoading(true); setMsg(null)
    try {
      await updateConfig(depSel, { dias_produccion_semana: parseInt(cfg.dias_produccion_semana), dias_seguridad_defecto: parseInt(cfg.dias_seguridad_defecto) })
      await updateDepartamento(depSel, { dep_nombre: departamentos.find(x => x.dep_id === depSel)?.dep_nombre, dep_email_jefe: cfg.dep_email_jefe, dep_emails_cc: cfg.dep_emails_cc, dep_productiva: cfg.dep_productiva })
      await loadDeps()
      setMsg({ ok: true, texto: 'Guardado correctamente' })
    } catch (e) { setMsg({ ok: false, texto: e?.response?.data?.error || 'Error' }) }
    finally { setLoading(false) }
  }

  const crearDep = async () => {
    setLoading(true); setMsg(null)
    try {
      await crearDepartamento({ dep_id: newDep.id, dep_nombre: newDep.nombre, dep_email_jefe: newDep.email, dep_emails_cc: newDep.cc, dep_productiva: newDep.productiva })
      await loadDeps()
      setNewDep({ id: '', nombre: '', email: '', cc: '', productiva: false })
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
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={newDep.productiva} onChange={e => setNewDep(n => ({...n, productiva: e.target.checked}))}
              className="rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500" />
            Área productiva <span className="text-gray-500 text-xs">(el operador digita la cantidad a producir)</span>
          </label>
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
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer bg-gray-900 px-3 py-2.5 rounded-xl border border-gray-700/40">
            <input type="checkbox" checked={cfg.dep_productiva} onChange={e => setCfg(c => ({ ...c, dep_productiva: e.target.checked }))}
              className="rounded border-gray-600 bg-gray-800 text-brand-500 focus:ring-brand-500" />
            Área productiva <span className="text-gray-500 text-xs">(el operador digita la cantidad a producir en vez de autocalcularse)</span>
          </label>
          <div className="bg-gray-900 rounded-xl p-4 text-sm text-gray-300 space-y-3 border border-gray-700/40">
            <p className="text-gray-400 text-xs uppercase tracking-wider font-semibold">¿Cómo se calcula cuánto producir?</p>
            <ol className="space-y-2 list-decimal list-outside ml-4">
              <li><span className="text-white font-semibold">Venta diaria:</span> el promedio de lo que se vende por día (ventas del período ÷ días del período).</li>
              <li><span className="text-white font-semibold">Lote de producción:</span> la venta de toda la semana repartida entre los días que se produce
                (<span className="text-yellow-400 font-semibold">{cfg.dias_produccion_semana || '—'}</span> día(s)/semana). Mientras menos días se produce, más grande es cada lote.</li>
              <li><span className="text-white font-semibold">Stock de seguridad:</span> un colchón extra de
                <span className="text-yellow-400 font-semibold"> {cfg.dias_seguridad_defecto || '—'}</span> día(s) de venta para no quedar sin producto.</li>
              <li><span className="text-white font-semibold">Demanda total:</span> el lote de producción + el stock de seguridad.</li>
              <li><span className="text-white font-semibold">Cantidad a producir:</span> la demanda total menos lo que ya hay en sala.
                Si ya hay suficiente, no se produce nada.</li>
            </ol>
            <p className="text-gray-500 text-xs pt-1 border-t border-gray-700/40">
              💡 Cada producto puede tener sus propios días de producción y de seguridad; si no, se usan estos valores del departamento.
            </p>
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
  const [mode, setMode]          = useState('normal') // 'normal' | 'update'
  const [archivo, setArchivo]    = useState(null)
  const [loading, setLoading]    = useState(false)
  const [resultado, setRes]      = useState(null)
  const [error, setError]        = useState('')
  const [drag, setDrag]          = useState(false)

  // Actualización automática de demanda desde ventas
  const [diasVentas, setDiasVentas]   = useState(30)
  const [depVentas, setDepVentas]     = useState('')
  const [agregarNuevos, setAgregarNuevos] = useState(false)
  const [loadingVentas, setLoadingV]  = useState(false)
  const [resVentas, setResVentas]     = useState(null)

  useEffect(() => { getDepartamentos().then(setDeps) }, [])

  const actualizarDesdeVentas = async () => {
    const scope = depVentas
      ? (departamentos.find(d => String(d.dep_id) === String(depVentas))?.dep_nombre || 'ese departamento')
      : 'TODOS los departamentos'
    const conf = await Swal.fire({
      title: '¿Actualizar demanda desde ventas?',
      html: `Se recalculará la venta de <b>${scope}</b> con las ventas reales de los últimos <b>${diasVentas}</b> días.<br/><span style="color:#f59e0b">Los productos sin ventas en el período quedarán en 0.</span>${agregarNuevos ? '<br/><b style="color:#a6c63c">También se agregarán los productos nuevos vendidos</b> (Teja Food incluido, según su caja).' : ''}`,
      icon: 'warning', background: '#1b2520', color: '#fff',
      showCancelButton: true, confirmButtonText: 'Sí, actualizar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#8aa62f', cancelButtonColor: '#4b5563',
    })
    if (!conf.isConfirmed) return
    setLoadingV(true); setResVentas(null)
    try {
      const data = await actualizarDemandaVentas(Number(diasVentas), depVentas || undefined, agregarNuevos)
      setResVentas(data)
      Swal.fire({ icon: 'success', title: 'Demanda actualizada',
        text: `${data.con_venta} con venta · ${data.en_cero} en 0${data.agregados ? ` · ${data.agregados} nuevos` : ''} · ${data.dias} días`,
        timer: 3200, showConfirmButton: false, background: '#1b2520', color: '#fff' })
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.error || 'No se pudo actualizar', 'error')
    } finally { setLoadingV(false) }
  }

  const setFile = (f) => (f?.name.endsWith('.csv') || f?.name.endsWith('.xlsx')) ? (setArchivo(f), setError('')) : setError('Solo archivos .csv o .xlsx')

  const cargar = async () => {
    if (!archivo || !depSel) return setError('Selecciona departamento y archivo')
    setLoading(true); setRes(null); setError('')
    try {
      const fd = new FormData()
      fd.append('file', archivo); fd.append('dep_id', depSel); fd.append('dias_historial', dias); fd.append('mode', mode)
      setRes(await subirCSV(fd)); setArchivo(null)
    } catch (e) { setError(e?.response?.data?.error || 'Error') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Actualización automática desde ventas — reemplaza el CSV manual */}
      <div className="card p-4 space-y-3 border border-brand-500/40">
        <div>
          <p className="text-white font-bold text-sm">⚡ Actualizar demanda desde ventas</p>
          <p className="text-gray-400 text-xs">Recalcula la venta de los productos con las ventas reales de los últimos N días <b>completos</b> (sin contar hoy), directo de la base. Reemplaza el CSV manual — sirve para todos los departamentos de una vez.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Días de venta</label>
            <input type="number" min={1} max={365} value={diasVentas} onChange={e => setDiasVentas(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="label">Departamento</label>
            <select value={depVentas} onChange={e => setDepVentas(e.target.value)} className="input-field">
              <option value="">— Todos —</option>
              {departamentos.map(d => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
            </select>
          </div>
        </div>
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={agregarNuevos} onChange={e => setAgregarNuevos(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded bg-gray-800 border-gray-600 accent-brand-500" />
          <span className="text-gray-300 text-xs">
            <b>También agregar productos nuevos vendidos</b> (que no están en el catálogo).
            <span className="text-gray-500"> Teja Food se asigna según la caja de venta (Local/Sala).</span>
          </span>
        </label>
        {resVentas && (
          <div className={`grid ${resVentas.agregados ? 'grid-cols-4' : 'grid-cols-3'} gap-2 text-center`}>
            {[['Productos', resVentas.productos, 'text-white'], ['Con venta', resVentas.con_venta, 'text-brand-400'], ['En 0', resVentas.en_cero, 'text-gray-400'],
              ...(resVentas.agregados ? [['Nuevos', resVentas.agregados, 'text-emerald-400']] : [])].map(([l, v, c]) => (
              <div key={l} className="bg-gray-900 rounded-xl p-2"><p className={`text-xl font-black ${c}`}>{v}</p><p className="text-gray-500 text-[11px]">{l}</p></div>
            ))}
          </div>
        )}
        <button onClick={actualizarDesdeVentas} disabled={loadingVentas} className="btn-primary w-full disabled:opacity-40">
          {loadingVentas ? '⏳ Actualizando…' : '⚡ Actualizar demanda ahora'}
        </button>
      </div>

      <div className="flex items-center gap-3 text-gray-500 text-xs">
        <div className="flex-1 h-px bg-gray-700/60" /> o carga manual por archivo <div className="flex-1 h-px bg-gray-700/60" />
      </div>

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
      <div>
        <label className="label">Modo de Carga</label>
        <select value={mode} onChange={e => setMode(e.target.value)} className="input-field">
          <option value="normal">Carga Completa (Crear nuevos y actualizar existentes)</option>
          <option value="update">Solo Actualizar Existentes (Evita agregar descontinuados)</option>
        </select>
      </div>
      <div onClick={() => document.getElementById('csv-file').click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); setFile(e.dataTransfer.files[0]) }}
        className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
          ${drag ? 'border-brand-500 bg-brand-900/20' : archivo ? 'border-emerald-600 bg-emerald-900/20' : 'border-gray-600 hover:border-gray-500'}`}>
        <input id="csv-file" type="file" accept=".csv,.xlsx" className="hidden" onChange={e => setFile(e.target.files[0])} />
        {archivo ? (<><p className="text-4xl">📄</p><p className="text-emerald-400 font-semibold mt-1">{archivo.name}</p></>)
          : (<><p className="text-4xl">📁</p><p className="text-gray-300 font-medium mt-1">Arrastra tu CSV o Excel</p><p className="text-gray-500 text-xs">Soporta .csv y .xlsx (con o sin overrides)</p></>)}
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

// ── Tab Usuarios ────────────────────────────────────────────────
function UsuariosTab() {
  const [usuarios, setUsuarios] = useState([])
  const [nombre, setNombre] = useState('')
  const [editId, setEditId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cargar = async () => {
    try {
      const { getUsuarios } = await import('../api')
      const res = await getUsuarios()
      setUsuarios(res)
    } catch { setError('Error al cargar usuarios') }
  }

  useEffect(() => { cargar() }, [])

  const guardar = async (e) => {
    e.preventDefault()
    if (!nombre.trim()) return
    setLoading(true); setError('')
    try {
      const { crearUsuario, actualizarUsuario } = await import('../api')
      if (editId) {
        await actualizarUsuario(editId, { usu_nombre: nombre })
      } else {
        await crearUsuario({ usu_nombre: nombre })
      }
      setNombre('')
      setEditId(null)
      await cargar()
    } catch (e) { setError('Error al guardar') }
    finally { setLoading(false) }
  }

  const eliminar = async (id, nombreUsu) => {
    import('sweetalert2').then(async (Swal) => {
      const { isConfirmed } = await Swal.default.fire({
        title: '¿Eliminar operador?',
        text: `Se borrará a "${nombreUsu}". Esto no afectará su historial previo, pero ya no podrá iniciar nuevas revisiones.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#4b5563',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
      })
      if (isConfirmed) {
        setLoading(true)
        try {
          const { eliminarUsuario } = await import('../api')
          await eliminarUsuario(id)
          await cargar()
        } catch { setError('Error al eliminar') }
        finally { setLoading(false) }
      }
    })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <form onSubmit={guardar} className="card p-5 space-y-4">
        <h2 className="text-white font-bold">{editId ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
        <div>
          <label className="label">Nombre del Operador</label>
          <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
            className="input-field" placeholder="Ej: Juan Pérez" autoFocus />
        </div>
        {error && <p className="text-rose-400 text-sm text-center">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={loading || !nombre.trim()} className="btn-primary flex-1">
            {loading ? 'Guardando...' : (editId ? 'Actualizar' : 'Crear Usuario')}
          </button>
          {editId && (
            <button type="button" onClick={() => { setEditId(null); setNombre('') }} className="btn-secondary px-4">
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700/50">
          <p className="text-white font-semibold text-sm">Operadores Registrados ({usuarios.length})</p>
        </div>
        <div className="divide-y divide-gray-700/40">
          {usuarios.map(u => (
            <div key={u.usu_id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-700/20">
              <span className="text-white font-medium text-sm">{u.usu_nombre}</span>
              <div className="flex gap-2">
                <button onClick={() => { setEditId(u.usu_id); setNombre(u.usu_nombre) }}
                  className="text-brand-400 hover:text-brand-300 text-xs px-2 py-1 bg-brand-900/30 rounded-lg">
                  Editar
                </button>
                <button onClick={() => eliminar(u.usu_id, u.usu_nombre)}
                  className="text-rose-400 hover:text-rose-300 text-xs px-2 py-1 bg-rose-900/30 rounded-lg">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
          {usuarios.length === 0 && <p className="text-center py-6 text-gray-500 text-sm">No hay usuarios</p>}
        </div>
      </div>
    </div>
  )
}

// ── Tab Exportar ──────────────────────────────────────────────
function ExportTab() {
  // Fecha local en formato YYYY-MM-DD (para inputs type=date)
  const fmtFecha = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const hoyStr = fmtFecha(new Date())

  const [departamentos, setDeps] = useState([])
  const [depSel, setDepSel]      = useState('')
  const [fechaIni, setFI]        = useState(hoyStr)   // por defecto: hoy
  const [fechaFin, setFF]        = useState(hoyStr)
  const [loading, setLoading]    = useState(false)
  const [error, setError]        = useState('')

  useEffect(() => { getDepartamentos().then(setDeps) }, [])

  // Botones rápidos de rango de fecha
  const setRango = (preset) => {
    const hoy = new Date()
    const ini = new Date(hoy)
    if (preset === 'hoy')       { /* ini = hoy */ }
    else if (preset === 'ayer') { ini.setDate(hoy.getDate() - 1); hoy.setDate(hoy.getDate() - 1) }
    else if (preset === '7d')   { ini.setDate(hoy.getDate() - 6) }
    else if (preset === 'mes')  { ini.setDate(1) }
    setFI(fmtFecha(ini)); setFF(fmtFecha(hoy))
  }

  const exportar = async () => {
    setLoading(true); setError('')
    try {
      const { exportarExcel } = await import('../api')
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
      <div>
        <label className="label">Rango rápido</label>
        <div className="flex flex-wrap gap-2">
          {[['hoy', 'Hoy'], ['ayer', 'Ayer'], ['7d', 'Últimos 7 días'], ['mes', 'Este mes']].map(([k, txt]) => (
            <button key={k} type="button" onClick={() => setRango(k)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-800 border border-gray-700 text-gray-300 hover:text-white hover:border-brand-500 transition-colors">
              {txt}
            </button>
          ))}
        </div>
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

// ── Tab Clasificación ─────────────────────────────────────────
// Reemplaza los antiguos perfiles "Producción" (normal/especial) e
// "Infaltables → Clasificar jornada". Todo se gestiona aquí, por depto.
const CATS_CLAS  = [
  { key: 'normal',   label: 'Normal',   on: 'bg-emerald-600 border-emerald-500 text-white' },
  { key: 'especial', label: 'Especial', on: 'bg-sky-600 border-sky-500 text-white' },
]
const JORNADAS_CLAS = [
  { key: 'am', label: 'AM' },
  { key: 'pm', label: 'PM' },
]

function ClasificacionTab() {
  const [departamentos, setDeps] = useState([])
  const [depSel, setDepSel]   = useState('')
  const [productos, setProductos] = useState([])
  const [edits, setEdits]     = useState({})   // { plu: { pro_categoria?, pro_infaltable?, pro_jornada? } }
  const [search, setSearch]   = useState('')
  const [filtro, setFiltro]   = useState('todos') // todos | sin_clasificar | normal | especial | infaltables
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  useEffect(() => { getDepartamentos().then(setDeps).catch(() => {}) }, [])

  useEffect(() => {
    if (!depSel) { setProductos([]); setEdits({}); return }
    setLoading(true)
    getClasificacion(depSel)
      .then((data) => { setProductos(data); setEdits({}) })
      .catch(() => setMsg({ ok: false, texto: 'No se pudieron cargar los productos' }))
      .finally(() => setLoading(false))
  }, [depSel])

  // valor efectivo (original + edición local)
  const valActual = (p, campo) => (edits[p.pro_codigo_plu]?.[campo] !== undefined ? edits[p.pro_codigo_plu][campo] : p[campo])

  const setCampo = (p, campo, valor) => setEdits((prev) => {
    const plu = p.pro_codigo_plu
    const next = { ...prev, [plu]: { ...prev[plu] } }
    if (p[campo] === valor) delete next[plu][campo]   // volver al original = no es cambio
    else next[plu][campo] = valor
    if (Object.keys(next[plu]).length === 0) delete next[plu]
    return next
  })

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase()
    return productos.filter((p) => {
      const cat = valActual(p, 'pro_categoria')
      const inf = valActual(p, 'pro_infaltable')
      if (filtro === 'infaltables' && !inf) return false
      if (['sin_clasificar', 'normal', 'especial'].includes(filtro) && cat !== filtro) return false
      if (!q) return true
      return p.pro_nombre_producto?.toLowerCase().includes(q) || String(p.pro_codigo_plu).includes(q)
    })
  }, [productos, edits, search, filtro])

  const nCambios = Object.keys(edits).length

  const guardar = async () => {
    if (!nCambios) return
    const cambios = Object.entries(edits).map(([pro_codigo_plu, campos]) => ({ pro_codigo_plu, ...campos }))
    setSaving(true); setMsg(null)
    try {
      await clasificacionBulk(depSel, cambios)
      // aplicar localmente sin recargar
      setProductos((prev) => prev.map((p) => edits[p.pro_codigo_plu] ? { ...p, ...edits[p.pro_codigo_plu] } : p))
      setEdits({})
      setMsg({ ok: true, texto: `${cambios.length} producto(s) actualizado(s)` })
    } catch (e) {
      setMsg({ ok: false, texto: e?.response?.data?.error || 'No se pudo guardar' })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end justify-between">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Departamento</label>
          <select value={depSel} onChange={(e) => setDepSel(e.target.value)} className="input-field">
            <option value="">— Elige un departamento —</option>
            {departamentos.map((d) => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
          </select>
        </div>
        <button onClick={guardar} disabled={!nCambios || saving}
          className={`btn-primary py-2.5 px-4 text-sm ${nCambios ? 'animate-pulse' : 'opacity-50'}`}>
          {saving ? 'Guardando…' : `💾 Guardar${nCambios ? ` (${nCambios})` : ''}`}
        </button>
      </div>

      {msg && <p className={`text-sm text-center font-medium rounded-lg p-2 ${msg.ok ? 'bg-emerald-900/40 text-emerald-400' : 'bg-rose-900/40 text-rose-400'}`}>{msg.ok ? '✅' : '❌'} {msg.texto}</p>}

      {depSel && (
        <>
          <div className="card p-3 flex flex-wrap gap-2 items-center">
            <input type="text" placeholder="🔍 Buscar por nombre o PLU…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="input-field flex-1 min-w-[180px]" />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="input-field w-auto">
              <option value="todos">Todos</option>
              <option value="sin_clasificar">Sin clasificar</option>
              <option value="normal">Normales</option>
              <option value="especial">Especiales</option>
              <option value="infaltables">Infaltables</option>
            </select>
          </div>

          <div className="card divide-y divide-gray-800 overflow-hidden">
            {loading ? (
              <p className="text-center text-gray-500 py-8">Cargando…</p>
            ) : visibles.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Sin productos</p>
            ) : visibles.map((p) => {
              const cat = valActual(p, 'pro_categoria')
              const inf = valActual(p, 'pro_infaltable')
              const jor = valActual(p, 'pro_jornada')
              const editado = edits[p.pro_codigo_plu] !== undefined
              return (
                <div key={p.pro_codigo_plu} className={`p-3 space-y-2 ${editado ? 'bg-brand-900/10' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{p.pro_nombre_producto}</p>
                      <p className="text-gray-500 text-xs font-mono">
                        PLU {p.pro_codigo_plu} · Vta diaria: <span className="text-emerald-300">{p.vta_diaria}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {/* Categoría */}
                    <div className="flex gap-1">
                      {CATS_CLAS.map((c) => (
                        <button key={c.key} onClick={() => setCampo(p, 'pro_categoria', cat === c.key ? 'sin_clasificar' : c.key)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${cat === c.key ? c.on : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                    {/* Infaltable */}
                    <button onClick={() => setCampo(p, 'pro_infaltable', !inf)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${inf ? 'bg-rose-600 border-rose-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                      🎯 Infaltable
                    </button>
                    {/* Jornada (solo relevante si es infaltable) */}
                    <div className={`flex gap-1 ml-auto ${inf ? '' : 'opacity-40'}`}>
                      {JORNADAS_CLAS.map((j) => (
                        <button key={j.key} onClick={() => setCampo(p, 'pro_jornada', jor === j.key ? null : j.key)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${jor === j.key ? 'bg-brand-600 border-brand-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                          {j.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab Días de producción ────────────────────────────────────
// Asigna, por depto, los días en que se elabora cada producto (pro_dias_elaboracion).
// Si un producto tiene días marcados, en "Solicitud Producción Administración" solo
// aparece cuando hoy es uno de esos días. Sin días = aparece siempre.
const DIAS_SEMANA = [
  { d: '1', l: 'Lun' }, { d: '2', l: 'Mar' }, { d: '3', l: 'Mié' },
  { d: '4', l: 'Jue' }, { d: '5', l: 'Vie' }, { d: '6', l: 'Sáb' }, { d: '7', l: 'Dom' },
]

function DiasProduccionTab() {
  const [departamentos, setDeps] = useState([])
  const [depSel, setDepSel]   = useState('')
  const [productos, setProductos] = useState([])
  const [edits, setEdits]     = useState({})   // { plu: "1,3,5" }
  const [search, setSearch]   = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)

  useEffect(() => { getDepartamentos().then(setDeps).catch(() => {}) }, [])

  useEffect(() => {
    if (!depSel) { setProductos([]); setEdits({}); return }
    setLoading(true)
    getClasificacion(depSel)
      .then((data) => { setProductos(data); setEdits({}) })
      .catch(() => setMsg({ ok: false, texto: 'No se pudieron cargar los productos' }))
      .finally(() => setLoading(false))
  }, [depSel])

  const diasActual = (p) => (edits[p.pro_codigo_plu] !== undefined ? edits[p.pro_codigo_plu] : (p.pro_dias_elaboracion || ''))

  const toggleDia = (p, dia) => setEdits((prev) => {
    const actual = prev[p.pro_codigo_plu] !== undefined ? prev[p.pro_codigo_plu] : (p.pro_dias_elaboracion || '')
    const set = new Set(actual ? actual.split(',') : [])
    set.has(dia) ? set.delete(dia) : set.add(dia)
    const nuevo = [...set].sort().join(',')
    const orig = p.pro_dias_elaboracion || ''
    const next = { ...prev }
    if (nuevo === orig) delete next[p.pro_codigo_plu]   // volver al original = no es cambio
    else next[p.pro_codigo_plu] = nuevo
    return next
  })

  const visibles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return productos
    return productos.filter((p) => p.pro_nombre_producto?.toLowerCase().includes(q) || String(p.pro_codigo_plu).includes(q))
  }, [productos, search])

  const nCambios = Object.keys(edits).length

  const guardar = async () => {
    if (!nCambios) return
    const cambios = Object.entries(edits).map(([pro_codigo_plu, pro_dias_elaboracion]) => ({ pro_codigo_plu, pro_dias_elaboracion }))
    setSaving(true); setMsg(null)
    try {
      await clasificacionBulk(depSel, cambios)
      setProductos((prev) => prev.map((p) => edits[p.pro_codigo_plu] !== undefined ? { ...p, pro_dias_elaboracion: edits[p.pro_codigo_plu] } : p))
      setEdits({})
      setMsg({ ok: true, texto: `${cambios.length} producto(s) actualizado(s)` })
    } catch (e) {
      setMsg({ ok: false, texto: e?.response?.data?.error || 'No se pudo guardar' })
    } finally { setSaving(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end justify-between">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Departamento</label>
          <select value={depSel} onChange={(e) => setDepSel(e.target.value)} className="input-field">
            <option value="">— Elige un departamento —</option>
            {departamentos.map((d) => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
          </select>
        </div>
        <button onClick={guardar} disabled={!nCambios || saving}
          className={`btn-primary py-2.5 px-4 text-sm ${nCambios ? 'animate-pulse' : 'opacity-50'}`}>
          {saving ? 'Guardando…' : `💾 Guardar${nCambios ? ` (${nCambios})` : ''}`}
        </button>
      </div>

      {msg && <p className={`text-sm text-center font-medium rounded-lg p-2 ${msg.ok ? 'bg-emerald-900/40 text-emerald-400' : 'bg-rose-900/40 text-rose-400'}`}>{msg.ok ? '✅' : '❌'} {msg.texto}</p>}

      {depSel && (
        <>
          <div className="card p-3">
            <input type="text" placeholder="🔍 Buscar por nombre o PLU…" value={search}
              onChange={(e) => setSearch(e.target.value)} className="input-field" />
            <p className="text-gray-500 text-xs mt-2">Marca los días en que se elabora. Sin días marcados = el producto se pide siempre.</p>
          </div>

          <div className="card divide-y divide-gray-800 overflow-hidden">
            {loading ? (
              <p className="text-center text-gray-500 py-8">Cargando…</p>
            ) : visibles.length === 0 ? (
              <p className="text-center text-gray-500 py-8">Sin productos</p>
            ) : visibles.map((p) => {
              const dias = diasActual(p)
              const set = new Set(dias ? dias.split(',') : [])
              const editado = edits[p.pro_codigo_plu] !== undefined
              return (
                <div key={p.pro_codigo_plu} className={`p-3 space-y-2 ${editado ? 'bg-brand-900/10' : ''}`}>
                  <p className="text-white text-sm font-medium truncate">{p.pro_nombre_producto}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-500 text-xs font-mono mr-1">PLU {p.pro_codigo_plu}</span>
                    <div className="flex gap-1 ml-auto">
                      {DIAS_SEMANA.map((dia) => {
                        const on = set.has(dia.d)
                        return (
                          <button key={dia.d} onClick={() => toggleDia(p, dia.d)}
                            className={`w-10 py-1.5 rounded-lg text-xs font-bold border transition-all ${on ? 'bg-brand-600 border-brand-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                            {dia.l}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ── Página Principal Admin ────────────────────────────────────
export default function AdminPage() {
  const navigate = useNavigate()
  const logout   = useAppStore(s => s.logout)
  const [tab, setTab] = useState('config')
  
  // Lógica de Autenticación
  const [auth, setAuth] = useState(localStorage.getItem('adminToken') !== null)
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
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
      // Mostrar el mensaje real del servidor (p. ej. "Demasiados intentos")
      // en lugar de asumir siempre que la contraseña es incorrecta.
      setAuthErr(e?.response?.data?.error || 'Contraseña incorrecta')
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
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
                placeholder="Contraseña..." autoFocus
                className="input-field text-center py-3 text-lg tracking-widest text-white pr-12" />
              <button type="button" onClick={() => setShowPass(v => !v)}
                aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-white text-xl leading-none">
                {showPass ? '🙈' : '👁️'}
              </button>
            </div>
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
    { key: 'config',        label: '⚙️ Config' },
    { key: 'usuarios',      label: '👥 Usuarios' },
    { key: 'csv',           label: '📤 CSV' },
    { key: 'clasificacion', label: '🏷️ Clasificación' },
    { key: 'dias',          label: '📅 Días producción' },
    { key: 'master',        label: '📊 Maestro' },
    { key: 'mover',         label: '🔀 Mover' },
    { key: 'export',        label: '📥 Exportar' },
  ]

  // El Maestro y Mover tienen tablas anchas; les damos más espacio que al resto.
  const anchoTab = (tab === 'master' || tab === 'mover') ? 'max-w-6xl' : 'max-w-2xl'

  return (
    <div className={`min-h-screen bg-gray-950 mx-auto ${anchoTab}`}>
      <header className="bg-teja-900 border-b border-teja-700/50 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => { logout(); navigate('/') }} className="text-gray-400 hover:text-white text-sm">← Salir</button>
        <div><p className="text-xs text-gray-500 uppercase tracking-wider">Administrador</p>
          <h1 className="text-white font-bold">Panel de Gestión</h1></div>
        <Logo imgClass="h-6" padClass="px-2.5 py-1" className="ml-auto" />
        <button onClick={handleLogout} className="bg-rose-900/40 hover:bg-rose-800/60 border border-rose-800/50 rounded-full px-4 py-1.5 text-rose-300 text-xs font-semibold transition-colors">
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
        {tab === 'config'        && <ConfigTab />}
        {tab === 'usuarios'      && <UsuariosTab />}
        {tab === 'csv'           && <CsvTab />}
        {tab === 'clasificacion' && <ClasificacionTab />}
        {tab === 'dias'          && <DiasProduccionTab />}
        {tab === 'master'        && <MasterAdminPanel />}
        {tab === 'mover'         && <MoverProductosTab />}
        {tab === 'export'        && <ExportTab />}
      </div>
    </div>
  )
}
