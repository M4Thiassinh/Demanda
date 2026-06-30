const express  = require('express');
const multer   = require('multer');
const crypto   = require('crypto');
const router   = express.Router();
const ctrl     = require('../controllers/admin.controller');

// Comparación de tiempo constante (evita timing attacks al comparar contraseñas).
function tokenValido(recibido, esperado) {
  if (typeof recibido !== 'string' || typeof esperado !== 'string' || !esperado) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Rate limiter en memoria para los endpoints de login (mitiga fuerza bruta).
const intentos = new Map(); // ip -> { count, ts }
const LIMITE = 10;
const VENTANA_MS = 15 * 60 * 1000;
function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'desconocida';
  const ahora = Date.now();
  const reg = intentos.get(ip);
  if (!reg || ahora - reg.ts > VENTANA_MS) {
    intentos.set(ip, { count: 1, ts: ahora });
    return next();
  }
  reg.count += 1;
  if (reg.count > LIMITE) {
    return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  }
  next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'text/csv'
      || file.mimetype === 'application/vnd.ms-excel'
      || file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      || file.originalname.toLowerCase().endsWith('.csv')
      || file.originalname.toLowerCase().endsWith('.xlsx');
    ok ? cb(null, true) : cb(Object.assign(new Error('Solo .csv o .xlsx'), { status: 400 }));
  },
});

const authAdmin = (req, res, next) => {
  if (req.path.startsWith('/master-productos')) return next();
  // Fail-closed: si no hay contraseña configurada, NO se abre el acceso.
  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Servidor mal configurado (falta ADMIN_PASSWORD)' });
  }
  if (tokenValido(req.headers['x-admin-password'], process.env.ADMIN_PASSWORD)) {
    return next();
  }
  return res.status(401).json({ error: 'No autorizado' });
};

const authMaster = (req, res, next) => {
  if (!process.env.MASTER_PASSWORD) {
    return res.status(500).json({ error: 'Servidor mal configurado (falta MASTER_PASSWORD)' });
  }
  if (tokenValido(req.headers['x-master-password'], process.env.MASTER_PASSWORD)) {
    return next();
  }
  return res.status(401).json({ error: 'No autorizado maestro' });
};

router.post('/admin/login', rateLimitLogin, (req, res) => {
  const { password } = req.body;
  if (process.env.ADMIN_PASSWORD && tokenValido(password, process.env.ADMIN_PASSWORD)) {
    res.json({ ok: true, token: password });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

router.post('/admin/login-master', rateLimitLogin, (req, res) => {
  if (!process.env.MASTER_PASSWORD) {
    return res.status(500).json({ error: 'Servidor mal configurado (falta MASTER_PASSWORD)' });
  }
  const { password } = req.body;
  if (tokenValido(password, process.env.MASTER_PASSWORD)) {
    res.json({ ok: true, token: password });
  } else {
    res.status(401).json({ error: 'Contraseña maestra incorrecta' });
  }
});

// Rutas Públicas (Operadores las usan)
router.get('/departamentos',              ctrl.listarDepartamentos);
router.get('/usuarios',                   ctrl.listarUsuarios);
router.get('/productos',                  ctrl.buscarProductos);
router.get('/productos-lista',            ctrl.listarProductosPorCategoria);

// Rutas Privadas (Admin Panel)
router.use('/departamentos',              authAdmin);
router.use('/admin',                      authAdmin);

router.post('/departamentos',             ctrl.crearDepartamento);
router.put('/departamentos/:depId',       ctrl.actualizarDepartamento);
router.post('/admin/usuarios',            ctrl.crearUsuario);
router.put('/admin/usuarios/:id',         ctrl.actualizarUsuario);
router.delete('/admin/usuarios/:id',      ctrl.eliminarUsuario);
router.get('/admin/config/:depId',        ctrl.obtenerConfig);
router.put('/admin/config/:depId',        ctrl.actualizarConfig);
router.post('/admin/csv-upload',          upload.single('file'), ctrl.subirCSV);
router.get('/admin/productos/:plu',       ctrl.obtenerProducto);
router.put('/admin/productos/:plu',       ctrl.actualizarProducto);
router.get('/admin/clasificacion',        ctrl.listarClasificacion);
router.post('/admin/clasificacion/bulk',  ctrl.clasificarBulk);
router.get('/admin/export',               ctrl.exportarExcel);

// Master Panel de Productos
router.get('/admin/master-productos',     authMaster, ctrl.obtenerMasterProductos);
router.post('/admin/master-productos/bulk', authMaster, ctrl.actualizarMasterProductosBulk);
router.post('/admin/master-productos/delete', authMaster, ctrl.eliminarMasterProductosBulk);
router.get('/admin/master-productos/export', authMaster, ctrl.exportarMasterExcel);

module.exports = router;
