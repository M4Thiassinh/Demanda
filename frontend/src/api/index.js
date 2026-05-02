import axios from 'axios'

// Capturamos la URL de Ngrok que configuraste en Vercel. 
// Si por alguna razón no existe (ej. estás probando en local), usamos un string vacío.
const NGROK_URL = import.meta.env.VITE_API_URL || '';

// Le decimos a Axios que junte tu enlace de Ngrok con la ruta '/api'
const api = axios.create({
  baseURL: `${NGROK_URL}/api`
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
