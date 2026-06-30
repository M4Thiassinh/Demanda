const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/infaltables.controller');

// Perfil Infaltables (abierto, eligen quién son como operador)
router.get('/turno-actual',   ctrl.obtenerTurnoActual);
router.get('/jornada',        ctrl.listarParaJornada);
router.post('/jornada/bulk',  ctrl.asignarJornadaBulk);
router.get('/checklist',      ctrl.obtenerChecklist);
router.post('/chequeo',       ctrl.guardarChequeo);
router.get('/dashboard',      ctrl.obtenerDashboard);
router.get('/config',         ctrl.obtenerConfig);
router.put('/config/:depId',  ctrl.actualizarConfig);

module.exports = router;
