const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/bodega.controller');

// Rutas específicas ANTES de las paramétricas (/:tbId) para que no las capturen.
router.get('/activa',              ctrl.buscarTomaActiva);
router.get('/productos',           ctrl.buscarProductos);
router.get('/',                    ctrl.listarTomas);
router.post('/',                   ctrl.iniciarToma);

router.get('/:tbId',               ctrl.obtenerToma);
router.get('/:tbId/export',        ctrl.exportarExcel);
router.post('/:tbId/detalle',      ctrl.guardarDetalle);
router.delete('/:tbId/detalle/:plu', ctrl.eliminarDetalle);
router.post('/:tbId/finalizar',    ctrl.finalizarToma);

module.exports = router;
