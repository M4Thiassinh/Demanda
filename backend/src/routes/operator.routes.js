const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/revision.controller');

router.get('/activa',                     ctrl.buscarRevisionActiva);
router.post('/',                          ctrl.iniciarRevision);
router.get('/:revId',                     ctrl.obtenerRevision);
router.post('/:revId/detalle',            ctrl.agregarDetalle);
router.delete('/:revId/detalle/:plu',     ctrl.eliminarDetalle);
router.post('/:revId/finalizar',          ctrl.finalizarRevision);

module.exports = router;
