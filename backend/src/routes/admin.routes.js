const express  = require('express');
const multer   = require('multer');
const router   = express.Router();
const ctrl     = require('../controllers/admin.controller');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'text/csv'
      || file.mimetype === 'application/vnd.ms-excel'
      || file.originalname.toLowerCase().endsWith('.csv');
    ok ? cb(null, true) : cb(Object.assign(new Error('Solo .csv'), { status: 400 }));
  },
});

const authAdmin = (req, res, next) => {
  const token = req.headers['x-admin-password'];
  if (!process.env.ADMIN_PASSWORD) return next(); // Si no hay clave, pasar (seguridad básica)
  if (token === process.env.ADMIN_PASSWORD) {
    return next();
  }
  return res.status(401).json({ error: 'No autorizado' });
};

router.post('/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ ok: true, token: password });
  } else {
    res.status(401).json({ error: 'Contraseña incorrecta' });
  }
});

// Rutas Públicas (Operadores las usan)
router.get('/departamentos',              ctrl.listarDepartamentos);
router.get('/usuarios',                   ctrl.listarUsuarios);
router.get('/productos',                  ctrl.buscarProductos);

// Rutas Privadas (Admin Panel)
router.use('/departamentos',              authAdmin);
router.use('/admin',                      authAdmin);

router.post('/departamentos',             ctrl.crearDepartamento);
router.put('/departamentos/:depId',       ctrl.actualizarDepartamento);
router.get('/admin/config/:depId',        ctrl.obtenerConfig);
router.put('/admin/config/:depId',        ctrl.actualizarConfig);
router.post('/admin/csv-upload',          upload.single('file'), ctrl.subirCSV);
router.get('/admin/productos/:plu',       ctrl.obtenerProducto);
router.put('/admin/productos/:plu',       ctrl.actualizarProducto);
router.get('/admin/export',               ctrl.exportarExcel);

module.exports = router;
