import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import useAppStore from '../store/useAppStore'
import { getDepartamentos, getUsuarios, iniciarRevision, buscarRevisionActiva } from '../api'

export default function RolePage() {
  const navigate = useNavigate()
  const { setRole, setDepartamento, setUsuario, setRevision, role } = useAppStore()

  const [departamentos, setDepartamentos] = useState([])
  const [usuarios, setUsuarios]           = useState([])
  const [depSel, setDepSel]               = useState('')
  const [usuSel, setUsuSel]               = useState('')
  const [cargando, setCargando]           = useState(false)
  const [error, setError]                 = useState('')

  useEffect(() => {
    getDepartamentos().then(setDepartamentos).catch(() => {})
    getUsuarios().then(setUsuarios).catch(() => {})
  }, [])

  const continuar = async () => {
    if (!depSel) return setError('Selecciona un departamento')
    if (!usuSel) return setError('Selecciona tu nombre')
    setCargando(true); setError('')
    try {
      const dep = departamentos.find(d => d.dep_id === depSel)
      const usu = usuarios.find(u => String(u.usu_id) === String(usuSel))
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

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[500px] bg-brand-600/10 rounded-full blur-3xl" />
      </div>

      {/* Branding */}
      <div className="relative mb-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-brand-600 rounded-3xl shadow-2xl shadow-brand-900/60 mb-4 rotate-3">
          <span className="text-4xl">🏪</span>
        </div>
        <h1 className="text-3xl font-black text-white">Teja Market</h1>
        <p className="text-gray-400 mt-1 text-xs font-semibold tracking-widest uppercase">Sistema de Reposición</p>
      </div>

      {/* Selector de Rol */}
      {!role && (
        <div className="relative w-full max-w-sm space-y-4 animate-slide-up">
          <p className="text-center text-gray-400 font-medium mb-4">¿Con qué perfil ingresas?</p>
          <button id="btn-operador" onClick={() => setRole('operador')}
            className="w-full card p-5 text-left hover:border-brand-500/60 hover:bg-gray-700/60 active:scale-[0.98] transition-all group flex items-center gap-4">
            <div className="w-14 h-14 bg-brand-600/20 rounded-2xl flex items-center justify-center text-3xl">📋</div>
            <div><p className="text-white font-bold text-lg">Operador de Sala</p>
              <p className="text-gray-400 text-sm">Revisar stock y reponer productos</p></div>
            <span className="ml-auto text-gray-500 group-hover:text-brand-400">→</span>
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

      {/* Formulario Operador */}
      {role === 'operador' && (
        <div className="relative w-full max-w-sm animate-slide-up">
          <button onClick={() => setRole(null)} className="text-gray-400 hover:text-white text-sm mb-5 transition-colors flex items-center gap-1">
            ← Volver
          </button>
          <div className="card p-6 space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-11 h-11 bg-brand-600/20 rounded-xl flex items-center justify-center text-2xl">📋</div>
              <div><p className="text-white font-bold">Operador de Sala</p>
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
                {departamentos.map(d => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
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
