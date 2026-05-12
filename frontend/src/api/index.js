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

export const loginAdmin = (password) => api.post('/admin/login', { password }).then(r => r.data)
export const loginMaster = (password) => api.post('/admin/login-master', { password }).then(r => r.data)

export const getDepartamentos = () => api.get('/departamentos').then(r => r.data)
export const crearDepartamento = (data) => api.post('/departamentos', data).then(r => r.data)
export const updateDepartamento = (depId, data) => api.put(`/departamentos/${depId}`, data).then(r => r.data)
export const getUsuarios = () => api.get('/usuarios').then(r => r.data)
export const buscarProductos = (depId, q) => api.get('/productos', { params: { dep_id: depId, q } }).then(r => r.data)

// Admin
export const getConfig = (depId) => api.get(`/admin/config/${depId}`).then(r => r.data)
export const updateConfig = (depId, data) => api.put(`/admin/config/${depId}`, data).then(r => r.data)
export const subirCSV = (fd) => api.post('/admin/csv-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
export const getProducto = (plu, depId) => api.get(`/admin/productos/${plu}`, { params: { dep_id: depId } }).then(r => r.data)
export const updateProducto = (plu, depId, data) => api.put(`/admin/productos/${plu}`, { ...data, dep_id: depId }).then(r => r.data)
export const exportarExcel = (params) => api.get('/admin/export', { params, responseType: 'blob' })

// Admin Master Panel
export const getMasterProductos = (depId) => api.get('/admin/master-productos', { params: { dep_id: depId } }).then(r => r.data)
export const bulkUpdateProductos = (depId, productos) => api.post('/admin/master-productos/bulk', { dep_id: depId, productos }).then(r => r.data)
export const bulkDeleteProductos = (depId, plus) => api.post('/admin/master-productos/delete', { dep_id: depId, plus }).then(r => r.data)
export const exportMasterExcel = (depId) => api.get('/admin/master-productos/export', { params: { dep_id: depId }, responseType: 'blob' })

// Revisión
export const buscarRevisionActiva = (depId, usuId) => api.get('/revision/activa', { params: { dep_id: depId, usu_id: usuId } }).then(r => r.data)
export const iniciarRevision = (depId, usuId) => api.post('/revision', { dep_id: depId, usu_id: usuId }).then(r => r.data)
export const calcularItem = (revId, plu, stock) => api.post(`/revision/${revId}/calcular-item`, { pro_codigo_plu: plu, det_stock_sala: stock }).then(r => r.data)
export const agregarDetalle = (revId, plu, stock, cantidad_pedir) => api.post(`/revision/${revId}/detalle`, { pro_codigo_plu: plu, det_stock_sala: stock, cantidad_pedir }).then(r => r.data)
export const agregarDetalleBulk = (revId, items) => api.post(`/revision/${revId}/detalle/bulk`, { items }).then(r => r.data)
export const obtenerNoEscaneados = (revId) => api.get(`/revision/${revId}/no-escaneados`).then(r => r.data)
export const obtenerRevision = (revId) => api.get(`/revision/${revId}`).then(r => r.data)
export const eliminarDetalle = (revId, plu) => api.delete(`/revision/${revId}/detalle/${plu}`).then(r => r.data)
export const finalizarRevision = (revId) => api.post(`/revision/${revId}/finalizar`).then(r => r.data)

export default api
