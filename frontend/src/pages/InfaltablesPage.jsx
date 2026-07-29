import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Swal from 'sweetalert2'
import useAppStore from '../store/useAppStore'
import Logo from '../components/Logo'
import {
  getUsuarios, getTurnoActual, getDepartamentosInfaltables,
  getChecklistInfaltables, guardarChequeoInfaltables, enviarReporteTurnoInfaltables,
  descargarResumenInfaltables, getInfaltablesConfig, updateInfaltablesConfig,
  getCorreosTurnoInfaltables, updateCorreosTurnoInfaltables,
} from '../api'

export default function InfaltablesPage() {
  const navigate = useNavigate()
  const logout = useAppStore((s) => s.logout)

  const [usuarios, setUsuarios]           = useState([])
  const [departamentos, setDepartamentos] = useState([])
  const [usuSel, setUsuSel] = useState('')
  const [depSel, setDepSel] = useState('')
  const [turno, setTurno]   = useState(null)   // 'am' | 'pm' — autoseleccionado por hora Chile
  const [tab, setTab]       = useState('chequeo') // chequeo | config
  const [enviando, setEnviando] = useState(false)
  const [descargando, setDescargando] = useState(false)

  // Usuarios + turno inicial según la hora de Chile
  useEffect(() => {
    getUsuarios().then(setUsuarios).catch(() => {})
    getTurnoActual().then((d) => setTurno(d.turno)).catch(() => setTurno('am'))
  }, [])

  // Al cambiar el turno: recargar departamentos de ese turno y resetear la selección
  useEffect(() => {
    if (!turno) return
    setDepSel('')
    getDepartamentosInfaltables(turno)
      .then((d) => setDepartamentos(d.departamentos || []))
      .catch(() => setDepartamentos([]))
  }, [turno])

  const listo = usuSel && depSel
  const depNombre = departamentos.find((d) => String(d.dep_id) === String(depSel))?.dep_nombre

  const enviarReporte = async () => {
    if (!turno) return
    setEnviando(true)
    try {
      const r = await enviarReporteTurnoInfaltables(turno, usuSel || undefined)
      if (r.enviado) {
        Swal.fire({
          icon: 'success', title: 'Reporte enviado',
          text: `Turno ${turno.toUpperCase()} · ${r.departamentos_chequeados} depto(s) · ${r.destinatarios?.length || 0} destinatario(s)`,
          timer: 2800, showConfirmButton: false,
        })
      } else {
        Swal.fire('No se envió', r.motivo === 'sin destinatario'
          ? 'No hay correos configurados para los departamentos de este turno.'
          : 'No se pudo enviar el correo.', 'warning')
      }
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.error || 'No se pudo enviar el reporte', 'error')
    } finally { setEnviando(false) }
  }

  const descargarResumen = async () => {
    if (!turno) return
    setDescargando(true)
    try {
      const res = await descargarResumenInfaltables(turno)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url; a.download = `resumen_infaltables_${turno}.xlsx`; a.click()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.error || 'No se pudo descargar el resumen', 'error')
    } finally { setDescargando(false) }
  }

  return (
    <div className="min-h-screen bg-gray-950 max-w-2xl mx-auto">
      <header className="bg-teja-900 border-b border-teja-700/50 px-5 py-4 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => { logout(); navigate('/') }} className="text-gray-400 hover:text-white text-sm">← Salir</button>
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Infaltables</p>
          <h1 className="text-white font-bold">🎯 {depNombre || 'Chequeo de productos'}</h1>
        </div>
        <Logo imgClass="h-6" padClass="px-2.5 py-1" className="ml-auto" />
      </header>

      <div className="p-4 space-y-4">
        {/* Turno (autoseleccionado por hora, filtra los departamentos) */}
        <div className="card p-4">
          <label className="label">Turno</label>
          <div className="flex gap-2">
            {['am', 'pm'].map((t) => (
              <button key={t} onClick={() => setTurno(t)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                  turno === t
                    ? 'bg-brand-600 border-brand-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}>
                {t.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="text-gray-500 text-xs mt-2">Se selecciona automáticamente según la hora de Chile. Solo se muestran los departamentos del turno.</p>
        </div>

        {/* Selección de identidad + depto (filtrado por turno) */}
        <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Tu nombre</label>
            <select value={usuSel} onChange={(e) => setUsuSel(e.target.value)} className="input-field">
              <option value="">— Seleccionar —</option>
              {usuarios.map((u) => <option key={u.usu_id} value={u.usu_id}>{u.usu_nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Departamento ({turno ? turno.toUpperCase() : '—'})</label>
            <select value={depSel} onChange={(e) => setDepSel(e.target.value)} className="input-field">
              <option value="">— Seleccionar —</option>
              {departamentos.map((d) => <option key={d.dep_id} value={d.dep_id}>{d.dep_nombre}</option>)}
            </select>
            {turno && departamentos.length === 0 && (
              <p className="text-gray-500 text-xs mt-1">No hay departamentos con infaltables en el turno {turno.toUpperCase()}.</p>
            )}
          </div>
        </div>

        {listo && (
          <>
            {/* Tabs */}
            <div className="flex gap-2 flex-wrap">
              {[['chequeo', '✅ Chequeo'], ['config', '⚙️ Config']].map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                    tab === k ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                  }`}>
                  {label}
                </button>
              ))}
            </div>

            {tab === 'chequeo'   && <Chequeo depSel={depSel} usuSel={usuSel} turno={turno} />}
            {tab === 'config'    && <Config depSel={depSel} depNombre={depNombre} />}
          </>
        )}

        {/* Reporte consolidado: UN solo correo por turno con el gráfico de todos los deptos */}
        {turno && departamentos.length > 0 && (
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm">📧 Reporte del turno {turno.toUpperCase()}</p>
              <p className="text-gray-500 text-xs">Un solo correo con el gráfico de todos los departamentos {turno.toUpperCase()}, el Excel de faltantes por depto y la hoja resumen mensual.</p>
            </div>
            <button onClick={enviarReporte} disabled={enviando} className="btn-primary shrink-0">
              {enviando ? 'Enviando…' : 'Enviar reporte'}
            </button>
          </div>
        )}

        {/* Descarga directa de la hoja resumen mensual (mediciones diarias del turno) */}
        {turno && departamentos.length > 0 && (
          <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-semibold text-sm">📊 Resumen mensual {turno.toUpperCase()}</p>
              <p className="text-gray-500 text-xs">Descarga el Excel con la matriz de mediciones diarias del mes (día por día, Real / Óptimo / Cumpl%) para el turno {turno.toUpperCase()}.</p>
            </div>
            <button onClick={descargarResumen} disabled={descargando} className="btn-secondary shrink-0">
              {descargando ? 'Generando…' : '⬇ Descargar resumen'}
            </button>
          </div>
        )}

        {/* Config de correos por turno: global, no requiere seleccionar departamento */}
        <CorreosTurno />
      </div>
    </div>
  )
}

/* ── Pestaña: Chequeo de infaltables ─────────────────────────── */
function Chequeo({ depSel, usuSel, turno }) {
  const [productos, setProductos] = useState([])
  const [ausentes, setAusentes] = useState(new Set()) // PLUs marcados como AUSENTES (por defecto todos presentes)
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)

  const cargar = () => {
    setLoading(true)
    getChecklistInfaltables(depSel, turno)
      .then((data) => {
        // Ordenar de mayor a menor por venta diaria (los sin dato al final)
        const ordenados = [...(data.productos || [])].sort((a, b) => {
          const va = a.vta_diaria != null ? Number(a.vta_diaria) : -Infinity
          const vb = b.vta_diaria != null ? Number(b.vta_diaria) : -Infinity
          return vb - va
        })
        setProductos(ordenados)
        setAusentes(new Set())
      })
      .catch(() => Swal.fire('Error', 'No se pudo cargar el checklist', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { cargar() }, [depSel, turno])

  const toggleAusente = (plu) => setAusentes((prev) => {
    const next = new Set(prev)
    next.has(plu) ? next.delete(plu) : next.add(plu)
    return next
  })

  const faltantes = ausentes.size
  const total = productos.length
  const indice = total > 0 ? Math.round((faltantes / total) * 1000) / 10 : 0

  const finalizar = async () => {
    if (!total) return
    const res = await Swal.fire({
      title: '¿Guardar infaltables?',
      html: `Turno <b>${turno?.toUpperCase()}</b> · ${total} infaltables · <b>${faltantes} faltante(s)</b> · Índice ${indice}%`,
      icon: 'question', background: '#111827', color: '#fff',
      showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#059669', cancelButtonColor: '#4b5563',
    })
    if (!res.isConfirmed) return
    setSaving(true)
    try {
      const items = productos.map((p) => ({
        pro_codigo_plu: p.pro_codigo_plu,
        presente: !ausentes.has(p.pro_codigo_plu),
        stock_referencia: p.stock_referencia,
      }))
      const r = await guardarChequeoInfaltables({ dep_id: depSel, usu_id: usuSel, turno, items })
      Swal.fire({
        icon: 'success', title: 'Chequeo guardado',
        text: `Índice faltante: ${r.indice_faltante}% · Usa "Enviar reporte" al terminar el turno`,
        timer: 2500, showConfirmButton: false,
      })
      cargar()
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.error || 'No se pudo guardar', 'error')
    } finally { setSaving(false) }
  }

  if (loading) return <p className="text-center text-gray-500 py-8">Cargando…</p>

  return (
    <div className="space-y-3">
      {/* KPIs del turno */}
      <div className="card p-3 flex flex-wrap items-center gap-3">
        <span className="text-gray-400 text-sm">Turno <b className="text-white">{turno?.toUpperCase()}</b></span>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-gray-400">{total} infaltables</span>
          <span className="text-rose-400 font-bold">{faltantes} faltan</span>
          <span className="text-amber-300 font-bold">Índice {indice}%</span>
        </div>
      </div>

      {total === 0 ? (
        <div className="card p-6 text-center text-gray-400 text-sm">
          No hay productos <b>infaltables</b> para este turno. Márcalos como "Infaltable" y asígnales jornada
          en el Panel Admin → pestaña "Clasificación".
        </div>
      ) : (
        <div className="card divide-y divide-gray-800 overflow-hidden">
          {productos.map((p) => {
            const ausente = ausentes.has(p.pro_codigo_plu)
            const stock = p.stock_referencia
            return (
              <div key={p.pro_codigo_plu} className={`p-3 flex items-center gap-3 ${ausente ? 'bg-rose-900/20' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{p.pro_nombre_producto}</p>
                  <p className="text-gray-300 text-xs font-mono mb-1.5">
                    Cód. {p.pro_codigo_barra || p.pro_codigo_plu} · {p.pro_jornada.toUpperCase()}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-baseline gap-1 px-2 py-1 rounded-lg bg-emerald-900/30 border border-emerald-800/50">
                      <span className="text-emerald-500/70 text-[10px] uppercase tracking-wide">Vta diaria</span>
                      <span className="text-emerald-300 text-base font-bold">{p.vta_diaria != null ? p.vta_diaria : 's/d'}</span>
                    </span>
                    <span className="inline-flex items-baseline gap-1 px-2 py-1 rounded-lg bg-sky-900/30 border border-sky-800/50">
                      <span className="text-sky-500/70 text-[10px] uppercase tracking-wide">Stock</span>
                      <span className={`text-base font-bold ${stock != null && Number(stock) <= 0 ? 'text-rose-400' : 'text-sky-300'}`}>
                        {stock != null ? Number(stock) : 's/d'}
                      </span>
                    </span>
                  </div>
                </div>
                <button onClick={() => toggleAusente(p.pro_codigo_plu)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border shrink-0 ${
                    ausente
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-emerald-600/20 border-emerald-700 text-emerald-300'
                  }`}>
                  {ausente ? '✗ Falta' : '✓ Está'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {total > 0 && (
        <button onClick={finalizar} disabled={saving} className="btn-primary w-full">
          {saving ? 'Guardando…' : `Guardar infaltables (${faltantes} faltante${faltantes === 1 ? '' : 's'})`}
        </button>
      )}
    </div>
  )
}

/* ── Pestaña: Config (meta % por depto + correos por turno) ──── */
function Config({ depSel, depNombre }) {
  const [meta, setMeta]       = useState('15')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    setLoading(true)
    getInfaltablesConfig(depSel)
      .then((c) => setMeta(String(c.meta_faltante ?? 15)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [depSel])

  const guardar = async () => {
    setSaving(true)
    try {
      await updateInfaltablesConfig(depSel, { meta_faltante: Number(meta) })
      Swal.fire({ icon: 'success', title: 'Meta guardada', timer: 1300, showConfirmButton: false })
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.error || 'No se pudo guardar', 'error')
    } finally { setSaving(false) }
  }

  if (loading) return <p className="text-center text-gray-500 py-8">Cargando…</p>

  return (
    <div className="card p-4 space-y-4 max-w-md">
      <h2 className="text-white font-bold">⚙️ Meta — {depNombre}</h2>
      <div>
        <label className="label">Meta de índice faltante (%)</label>
        <input type="number" min="0" max="100" step="0.5" value={meta} onChange={(e) => setMeta(e.target.value)} className="input-field" />
        <p className="text-gray-500 text-xs mt-1">Umbral de faltantes de este departamento (se usa en el gráfico del reporte).</p>
      </div>
      <button onClick={guardar} disabled={saving} className="btn-primary w-full">{saving ? 'Guardando…' : 'Guardar meta'}</button>
    </div>
  )
}

/* ── Correos destino del reporte, por turno (AM / PM) ──────────
   Sección global (no depende del departamento). Plegable: carga al abrir. */
function CorreosTurno() {
  const [abierto, setAbierto] = useState(false)
  const [correos, setCorreos] = useState({ am: '', pm: '' })
  const [loading, setLoading] = useState(false)
  const [cargado, setCargado] = useState(false)
  const [saving, setSaving]   = useState('')

  useEffect(() => {
    if (!abierto || cargado) return
    setLoading(true)
    Promise.all([getCorreosTurnoInfaltables('am'), getCorreosTurnoInfaltables('pm')])
      .then(([am, pm]) => { setCorreos({ am: am.correos_destino || '', pm: pm.correos_destino || '' }); setCargado(true) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [abierto, cargado])

  const guardar = async (turno) => {
    setSaving(turno)
    try {
      await updateCorreosTurnoInfaltables(turno, correos[turno])
      Swal.fire({ icon: 'success', title: `Correos ${turno.toUpperCase()} guardados`, timer: 1300, showConfirmButton: false })
    } catch (e) {
      Swal.fire('Error', e?.response?.data?.error || 'No se pudo guardar', 'error')
    } finally { setSaving('') }
  }

  return (
    <div className="card p-4">
      <button onClick={() => setAbierto((v) => !v)} className="w-full flex items-center justify-between gap-3 text-left">
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm">📧 Correos del reporte (por turno)</p>
          <p className="text-gray-500 text-xs">Destinatarios del reporte de cada turno (AM / PM). Aplica a todos los departamentos.</p>
        </div>
        <span className="text-gray-400 shrink-0 text-lg">{abierto ? '▲' : '▼'}</span>
      </button>

      {abierto && (
        <div className="mt-4 space-y-4">
          {loading ? (
            <p className="text-center text-gray-500 py-4">Cargando correos…</p>
          ) : (
            ['am', 'pm'].map((t) => (
              <div key={t}>
                <label className="label">Correos turno {t.toUpperCase()} (separados por coma)</label>
                <div className="flex gap-2">
                  <input type="text" value={correos[t]}
                    onChange={(e) => setCorreos((prev) => ({ ...prev, [t]: e.target.value }))}
                    className="input-field flex-1" placeholder="uno@correo.cl, dos@correo.cl" />
                  <button onClick={() => guardar(t)} disabled={saving === t} className="btn-secondary shrink-0">
                    {saving === t ? '…' : 'Guardar'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
