import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { getDepartamentos, getUsuarios, iniciarRevision, buscarRevisionActiva } from '../api'
import Logo from '../components/Logo'

export default function RolePage() {
  const navigate = useNavigate()
  const { setRole, setCategoria, setDepartamento, setUsuario, setRevision, clearRevision, logout, role } = useAppStore()

  const [departamentos, setDepartamentos] = useState([])
  const [usuarios, setUsuarios]           = useState([])
  const [depSel, setDepSel]               = useState('')
  const [usuSel, setUsuSel]               = useState('')
  const [cargando, setCargando]           = useState(false)
  const [error, setError]                 = useState('')

  useEffect(() => {
    getDepartamentos().then((d) => setDepartamentos(Array.isArray(d) ? d : [])).catch(() => {})
    getUsuarios().then((u) => setUsuarios(Array.isArray(u) ? u : [])).catch(() => {})
  }, [])

  const continuar = async () => {
    if (!depSel) return setError('Selecciona un departamento')
    if (!usuSel) return setError('Selecciona tu nombre')
    setCargando(true); setError('')
    try {
      const dep = departamentos.find(d => d.dep_id === depSel)
      const usu = usuarios.find(u => String(u.usu_id) === String(usuSel))

      // Siempre limpiar estado local antes de cargar una revisión (previene fuga de estado)
      clearRevision()
      setDepartamento(dep)
      setUsuario(usu)

      // Intentar recuperar revisión activa
      const activa = await buscarRevisionActiva(dep.dep_id, usu.usu_id)
      if (activa) {
        setRevision(activa.rev_id, activa.rev_folio)
        // Cargar ítems previos
        navigate('/revision')
        return
      }

      const { rev_id, rev_folio } = await iniciarRevision(dep.dep_id, usu.usu_id)
      setRevision(rev_id, rev_folio)
      navigate('/revision')
    } catch (e) {
      setError(e?.response?.data?.error || 'Error al iniciar')
    } finally { setCargando(false) }
  }

  // Administración (operador) → áreas productivas. Toma de Stock → áreas no productivas.
  // Ambos comparten el formulario (usuario + depto) y el flujo de revisión.
  const esTomaStock      = role === 'toma_stock'
  const esPerfilRevision = role === 'operador' || esTomaStock
  const tituloPerfil = esTomaStock ? 'Toma de Stock' : 'Solicitud Producción Administración'
  const iconoPerfil  = esTomaStock ? '📦' : '📋'
  const depsList = Array.isArray(departamentos) ? departamentos : []
  const depsVisibles = esTomaStock
    ? depsList.filter((d) => !d.dep_productiva)
    : depsList.filter((d) => d.dep_productiva)

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[500px] bg-brand-600/10 rounded-full blur-3xl" />
      </div>

      {/* Branding */}
      <div className="relative mb-8 text-center animate-fade-in flex flex-col items-center">
        <Logo imgClass="h-11" className="mb-4" />
        <p className="text-gray-400 mt-1 text-xs font-semibold tracking-widest uppercase">Sistema de Reposición</p>
      </div>

      {/* Selector de Rol */}
      {!role && (
        <div className="relative w-full max-w-sm space-y-4 animate-slide-up">
          <p className="text-center text-gray-400 font-medium mb-4">¿Con qué perfil ingresas?</p>
          <button id="btn-operador" onClick={() => { setRole('operador'); setCategoria('normal') }}
            className="w-full card p-5 text-left hover:border-brand-500/60 hover:bg-gray-700/60 active:scale-[0.98] transition-all group flex items-center gap-4">
            <div className="w-14 h-14 bg-brand-600/20 rounded-2xl flex items-center justify-center text-3xl">📋</div>
            <div><p className="text-white font-bold text-lg">Solicitud Producción Administración</p>
              <p className="text-gray-400 text-sm">Productos normales · áreas productivas</p></div>
            <span className="ml-auto text-gray-500 group-hover:text-brand-400">→</span>
          </button>
          <button id="btn-toma-stock" onClick={() => { setRole('toma_stock'); setCategoria(null) }}
            className="w-full card p-5 text-left hover:border-emerald-500/60 hover:bg-gray-700/60 active:scale-[0.98] transition-all group flex items-center gap-4">
            <div className="w-14 h-14 bg-emerald-600/20 rounded-2xl flex items-center justify-center text-3xl">📦</div>
            <div><p className="text-white font-bold text-lg">Toma de Stock</p>
              <p className="text-gray-400 text-sm">Reposición · áreas no productivas</p></div>
            <span className="ml-auto text-gray-500 group-hover:text-emerald-400">→</span>
          </button>
          <button id="btn-produccion" onClick={() => { setRole('produccion'); setCategoria('especial'); navigate('/areas-productivas') }}
            className="w-full card p-5 text-left hover:border-amber-500/60 hover:bg-gray-700/60 active:scale-[0.98] transition-all group flex items-center gap-4">
            <div className="w-14 h-14 bg-amber-600/20 rounded-2xl flex items-center justify-center text-3xl">🏭</div>
            <div><p className="text-white font-bold text-lg">Solicitud Producción Áreas Productivas</p>
              <p className="text-gray-400 text-sm">Solicitar productos especiales (áreas productivas)</p></div>
            <span className="ml-auto text-gray-500 group-hover:text-amber-400">→</span>
          </button>
          <button id="btn-infaltables" onClick={() => { setRole('infaltables'); navigate('/infaltables') }}
            className="w-full card p-5 text-left hover:border-rose-500/60 hover:bg-gray-700/60 active:scale-[0.98] transition-all group flex items-center gap-4">
            <div className="w-14 h-14 bg-rose-600/20 rounded-2xl flex items-center justify-center text-3xl">🎯</div>
            <div><p className="text-white font-bold text-lg">Infaltables</p>
              <p className="text-gray-400 text-sm">Chequear productos que no pueden faltar</p></div>
            <span className="ml-auto text-gray-500 group-hover:text-rose-400">→</span>
          </button>
          <button id="btn-admin" onClick={() => { setRole('admin'); navigate('/admin') }}
            className="w-full card p-5 text-left hover:border-gray-500/60 hover:bg-gray-700/60 active:scale-[0.98] transition-all group flex items-center gap-4">
            <div className="w-14 h-14 bg-gray-600/30 rounded-2xl flex items-center justify-center text-3xl">⚙️</div>
            <div><p className="text-white font-bold text-lg">Administrador</p>
              <p className="text-gray-400 text-sm">Configurar reglas y cargar maestros</p></div>
            <span className="ml-auto text-gray-500 group-hover:text-gray-300">→</span>
          </button>
        </div>
      )}

      {/* Formulario de revisión (Administración / Toma de Stock) */}
      {esPerfilRevision && (
        <div className="relative w-full max-w-sm animate-slide-up">
          <button onClick={() => { logout(); setDepSel(''); setUsuSel('') }} className="text-gray-400 hover:text-white text-sm mb-5 transition-colors flex items-center gap-1">
            ← Volver
          </button>
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 bg-brand-600/20 rounded-xl flex items-center justify-center text-2xl">{iconoPerfil}</div>
              <div><p className="text-white font-bold">{tituloPerfil}</p>
                <p className="text-gray-400 text-sm">Selecciona tu nombre y departamento</p></div>
            </div>

            <div>
              <label className="label">Tu nombre</label>
              <select id="sel-usuario" value={usuSel} onChange={e => { setUsuSel(e.target.value); setError('') }}
                className="input-field text-base py-3.5">
                <option value="">— Seleccionar —</option>
                {usuarios.map(u => <option key={u.usu_id} value={u.usu_id}>{u.usu_nombre}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Departamento</label>
              <select id="sel-departamento" value={depSel} onChange={e => { setDepSel(e.target.value); setError('') }}
                className="input-field text-base py-3.5">
                <option value="">— Seleccionar —</option>
                {depsVisibles.map(d => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
              </select>
            </div>

            {error && <p className="text-rose-400 text-sm font-medium text-center">{error}</p>}

            <button id="btn-continuar" onClick={continuar} disabled={cargando || !depSel || !usuSel}
              className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed">
              {cargando ? 'Iniciando…' : 'Comenzar Revisión →'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
