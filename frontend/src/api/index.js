import axios from 'axios'

// Asegurarnos de que la URL base siempre termine en /api
const getBaseUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (!envUrl) return '/api';
  // Si la variable de entorno ya tiene /api, la usamos tal cual
  if (envUrl.endsWith('/api')) return envUrl;
  // Si no, le quitamos el slash final (si lo tiene) y le agregamos /api
  return `${envUrl.replace(/\/$/, '')}/api`;
};

const api = axios.create({ 
  baseURL: getBaseUrl(),
  headers: {
    'ngrok-skip-browser-warning': 'true'
  }
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers['x-admin-password'] = token;
  }
  const masterToken = localStorage.getItem('masterToken');
  if (masterToken) {
    config.headers['x-master-password'] = masterToken;
  }
  return config;
});

// Si esperábamos JSON pero llega HTML (página de aviso de ngrok, backend caído o
// un VITE_API_URL apuntando a un sitio equivocado que responde 200 con HTML),
// lo convertimos en error. Así los .catch() de la app actúan y evitamos que
// luego reviente un .filter()/.map() sobre un string y se caiga toda la app.
api.interceptors.response.use((response) => {
  if (typeof response.data === 'string' && /^\s*<(?:!doctype|html)/i.test(response.data)) {
    return Promise.reject(new Error('Respuesta no válida del servidor (¿backend no disponible?)'));
  }
  return response;
});

export const loginAdmin = (password) => api.post('/admin/login', { password }).then(r => r.data)
export const loginMaster = (password) => api.post('/admin/login-master', { password }).then(r => r.data)

// opts: true | { productiva, infaltable }  → filtra por área productiva y/o infaltable
export const getDepartamentos = (opts) => {
  const params = {}
  if (opts === true || opts?.productiva) params.productiva = 1
  if (opts?.infaltable) params.infaltable = 1
  return api.get('/departamentos', { params }).then(r => r.data)
}
export const crearDepartamento = (data) => api.post('/departamentos', data).then(r => r.data)
export const updateDepartamento = (depId, data) => api.put(`/departamentos/${depId}`, data).then(r => r.data)
export const getUsuarios = () => api.get('/usuarios').then(r => r.data)
export const crearUsuario = (data) => api.post('/admin/usuarios', data).then(r => r.data)
export const actualizarUsuario = (id, data) => api.put(`/admin/usuarios/${id}`, data).then(r => r.data)
export const eliminarUsuario = (id) => api.delete(`/admin/usuarios/${id}`).then(r => r.data)
export const buscarProductos = (depId, q, categoria) => api.get('/productos', { params: { dep_id: depId, q, categoria } }).then(r => r.data)
export const getProductosLista = (depId, categoria) => api.get('/productos-lista', { params: { dep_id: depId, categoria } }).then(r => r.data)

// Admin
export const getConfig = (depId) => api.get(`/admin/config/${depId}`).then(r => r.data)
export const updateConfig = (depId, data) => api.put(`/admin/config/${depId}`, data).then(r => r.data)
export const subirCSV = (fd) => api.post('/admin/csv-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
export const actualizarDemandaVentas = (dias, depId, agregarNuevos) => api.post('/admin/actualizar-demanda-ventas', { dias, dep_id: depId || undefined, agregar_nuevos: !!agregarNuevos }).then(r => r.data)
export const getProducto = (plu, depId) => api.get(`/admin/productos/${plu}`, { params: { dep_id: depId } }).then(r => r.data)
export const updateProducto = (plu, depId, data) => api.put(`/admin/productos/${plu}`, { ...data, dep_id: depId }).then(r => r.data)
export const exportarExcel = (params) => api.get('/admin/export', { params, responseType: 'blob' })

// Admin Master Panel
export const getMasterProductos = (depId) => api.get('/admin/master-productos', { params: { dep_id: depId } }).then(r => r.data)
export const bulkUpdateProductos = (depId, productos) => api.post('/admin/master-productos/bulk', { dep_id: depId, productos }).then(r => r.data)
export const bulkDeleteProductos = (depId, plus) => api.post('/admin/master-productos/delete', { dep_id: depId, plus }).then(r => r.data)
export const activarProductos = (depId, plus, activo) => api.post('/admin/master-productos/activar', { dep_id: depId, plus, activo }).then(r => r.data)
export const moverProductos = (depOrigen, depDestino, plus) => api.post('/admin/master-productos/mover', { dep_origen: depOrigen, dep_destino: depDestino, plus }).then(r => r.data)
export const exportMasterExcel = (depId) => api.get('/admin/master-productos/export', { params: { dep_id: depId }, responseType: 'blob' })

// Revisión
export const buscarRevisionActiva = (depId, usuId) => api.get('/revision/activa', { params: { dep_id: depId, usu_id: usuId } }).then(r => r.data)
export const iniciarRevision = (depId, usuId) => api.post('/revision', { dep_id: depId, usu_id: usuId }).then(r => r.data)
export const calcularItem = (revId, plu, stock) => api.post(`/revision/${revId}/calcular-item`, { pro_codigo_plu: plu, det_stock_sala: stock }).then(r => r.data)
export const agregarDetalle = (revId, plu, stock, cantidad_pedir) => api.post(`/revision/${revId}/detalle`, { pro_codigo_plu: plu, det_stock_sala: stock, cantidad_pedir }).then(r => r.data)
export const agregarDetalleBulk = (revId, items) => api.post(`/revision/${revId}/detalle/bulk`, { items }).then(r => r.data)
export const obtenerNoEscaneados = (revId, categoria) => api.get(`/revision/${revId}/no-escaneados`, { params: { categoria } }).then(r => r.data)
export const obtenerTodosRevision = (revId, categoria) => api.get(`/revision/${revId}/no-escaneados`, { params: { all: true, categoria } }).then(r => r.data)
export const obtenerRevision = (revId) => api.get(`/revision/${revId}`).then(r => r.data)
export const eliminarDetalle = (revId, plu) => api.delete(`/revision/${revId}/detalle/${plu}`).then(r => r.data)
export const finalizarRevision = (revId, items, emails_to) => api.post(`/revision/${revId}/finalizar`, { items, emails_to }).then(r => r.data)

// Clasificación de productos (Panel Admin): categoría + infaltable + jornada
export const getClasificacion = (depId) => api.get('/admin/clasificacion', { params: { dep_id: depId } }).then(r => r.data)
export const clasificacionBulk = (depId, cambios) => api.post('/admin/clasificacion/bulk', { dep_id: depId, cambios }).then(r => r.data)

// Infaltables
export const getTurnoActual = () => api.get('/infaltables/turno-actual').then(r => r.data)
export const getDepartamentosInfaltables = (turno) => api.get('/infaltables/departamentos', { params: { turno } }).then(r => r.data)
export const getChecklistInfaltables = (depId, turno) => api.get('/infaltables/checklist', { params: { dep_id: depId, turno } }).then(r => r.data)
export const guardarChequeoInfaltables = (data) => api.post('/infaltables/chequeo', data).then(r => r.data)
export const enviarReporteTurnoInfaltables = (turno, usu_id) => api.post('/infaltables/reporte-turno', { turno, usu_id }).then(r => r.data)
export const descargarResumenInfaltables = (turno) => api.get('/infaltables/reporte-mensual', { params: { turno }, responseType: 'blob' })
export const getInfaltablesDashboard = () => api.get('/infaltables/dashboard').then(r => r.data)
export const getInfaltablesConfig = (depId) => api.get('/infaltables/config', { params: { dep_id: depId } }).then(r => r.data)
export const updateInfaltablesConfig = (depId, data) => api.put(`/infaltables/config/${depId}`, data).then(r => r.data)
export const getCorreosTurnoInfaltables = (turno) => api.get('/infaltables/correos-turno', { params: { turno } }).then(r => r.data)
export const updateCorreosTurnoInfaltables = (turno, correos_destino) => api.put(`/infaltables/correos-turno/${turno}`, { correos_destino }).then(r => r.data)

export default api
