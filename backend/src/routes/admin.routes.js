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

router.get('/departamentos',              ctrl.listarDepartamentos);
router.get('/usuarios',                   ctrl.listarUsuarios);
router.get('/productos',                  ctrl.buscarProductos);
router.get('/admin/config/:depId',        ctrl.obtenerConfig);
router.put('/admin/config/:depId',        ctrl.actualizarConfig);
router.post('/admin/csv-upload',          upload.single('file'), ctrl.subirCSV);
router.get('/admin/productos/:plu',       ctrl.obtenerProducto);
router.put('/admin/productos/:plu',       ctrl.actualizarProducto);
router.get('/admin/export',               ctrl.exportarExcel);

module.exports = router;
