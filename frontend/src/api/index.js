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

export const getDepartamentos = () => api.get('/departamentos').then(r => r.data)
export const getUsuarios = () => api.get('/usuarios').then(r => r.data)
export const buscarProductos = (depId, q) => api.get('/productos', { params: { dep_id: depId, q } }).then(r => r.data)

// Admin
export const getConfig = (depId) => api.get(`/admin/config/${depId}`).then(r => r.data)
export const updateConfig = (depId, data) => api.put(`/admin/config/${depId}`, data).then(r => r.data)
export const subirCSV = (fd) => api.post('/admin/csv-upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data)
export const getProducto = (plu) => api.get(`/admin/productos/${plu}`).then(r => r.data)
export const updateProducto = (plu, data) => api.put(`/admin/productos/${plu}`, data).then(r => r.data)
export const exportarExcel = (params) => api.get('/admin/export', { params, responseType: 'blob' })

// Revisión
export const buscarRevisionActiva = (depId, usuId) => api.get('/revision/activa', { params: { dep_id: depId, usu_id: usuId } }).then(r => r.data)
export const iniciarRevision = (depId, usuId) => api.post('/revision', { dep_id: depId, usu_id: usuId }).then(r => r.data)
export const agregarDetalle = (revId, plu, stock) => api.post(`/revision/${revId}/detalle`, { pro_codigo_plu: plu, det_stock_sala: stock }).then(r => r.data)
export const obtenerRevision = (revId) => api.get(`/revision/${revId}`).then(r => r.data)
export const eliminarDetalle = (revId, plu) => api.delete(`/revision/${revId}/detalle/${plu}`).then(r => r.data)
export const finalizarRevision = (revId) => api.post(`/revision/${revId}/finalizar`).then(r => r.data)

export default api
