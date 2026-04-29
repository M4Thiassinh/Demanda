const db                        = require('../config/db');
const ConfigService             = require('../services/ConfigService');
const { calcularDemanda }       = require('../services/DemandCalculatorService');
const { enviarOrdenProduccion } = require('../services/EmailService');

function generarFolio(depId) {
  const now   = new Date();
  const fecha = now.toISOString().slice(0, 10).replace(/-/g, '');
  const hora  = now.toTimeString().slice(0, 5).replace(':', '');
  return `REV-${depId}-${fecha}-${hora}`;
}

// GET /api/revision/activa?dep_id=22&usu_id=1
async function buscarRevisionActiva(req, res) {
  try {
    const { dep_id, usu_id } = req.query;
    const { rows } = await db.query(
      `SELECT rev_id, rev_folio, rev_fecha
         FROM revisiones
        WHERE dep_id = ? AND usu_id = ? AND rev_estado = 'en_proceso'
        ORDER BY rev_fecha DESC LIMIT 1`,
      [dep_id, usu_id]
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/revision  →  Body: { dep_id, usu_id }
async function iniciarRevision(req, res) {
  try {
    const { dep_id, usu_id } = req.body;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });

    const folio   = generarFolio(dep_id);
    const { rows } = await db.query(
      `INSERT INTO revisiones (rev_folio, dep_id, usu_id, rev_usuario, rev_estado)
       VALUES (?, ?, ?, 'Operador', 'en_proceso')`,
      [folio, dep_id, usu_id || null]
    );
    res.status(201).json({ rev_id: rows.insertId, rev_folio: folio, rev_fecha: new Date() });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/revision/:revId/detalle
async function agregarDetalle(req, res) {
  try {
    const { revId } = req.params;
    const { pro_codigo_plu, det_stock_sala } = req.body;
    if (det_stock_sala === undefined) return res.status(400).json({ error: 'det_stock_sala requerido' });

    const { rows } = await db.query(
      `INSERT INTO detalle_revision (rev_id, pro_codigo_plu, det_stock_sala)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE det_stock_sala = VALUES(det_stock_sala)`,
      [revId, pro_codigo_plu, parseInt(det_stock_sala, 10)]
    );
    res.status(201).json({ det_id: rows.insertId, ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/revision/:revId/finalizar
async function finalizarRevision(req, res) {
  try {
    const { revId } = req.params;

    const revRes = await db.query(
      `SELECT r.rev_id, r.rev_folio, r.dep_id, r.rev_fecha,
              d.dep_nombre, COALESCE(u.usu_nombre,'Operador') AS usu_nombre
         FROM revisiones r
         JOIN departamentos d  ON d.dep_id = r.dep_id
         LEFT JOIN usuarios u  ON u.usu_id = r.usu_id
        WHERE r.rev_id = ?`,
      [revId]
    );
    if (!revRes.rows.length) return res.status(404).json({ error: 'Revisión no encontrada' });
    const rev = revRes.rows[0];

    const config = await ConfigService.getConfig(rev.dep_id);

    const detRes = await db.query(
      `SELECT dr.pro_codigo_plu, dr.det_stock_sala,
              p.pro_codigo_barra, p.pro_nombre_producto,
              p.vta_total_periodo, p.dias_historial,
              p.pro_dias_produccion_override, p.pro_dias_seguridad_override
         FROM detalle_revision dr
         JOIN productos p ON p.pro_codigo_plu = dr.pro_codigo_plu
        WHERE dr.rev_id = ?`,
      [revId]
    );

    const resultados = detRes.rows.map((item) => ({
      ...item,
      ...calcularDemanda(config, item, item.det_stock_sala),
    }));

    // Solo productos con quiebre (requerimiento < 0)
    const quiebres = resultados.filter((r) => r.hayQuiebre);

    await db.query(`UPDATE revisiones SET rev_estado = 'completada' WHERE rev_id = ?`, [revId]);

    if (quiebres.length > 0) {
      await enviarOrdenProduccion({
        depNombre: rev.dep_nombre,
        revFecha:  rev.rev_fecha,
        folio:     rev.rev_folio,
        usuNombre: rev.usu_nombre,
        quiebres,
      });
    }

    res.json({ ok: true, folio: rev.rev_folio, totalItems: resultados.length, quiebres: quiebres.length, correoEnviado: quiebres.length > 0, detalle: resultados });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/revision/:revId
async function obtenerRevision(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT dr.det_id, dr.pro_codigo_plu, p.pro_nombre_producto,
              p.pro_codigo_barra, dr.det_stock_sala
         FROM detalle_revision dr
         JOIN productos p ON p.pro_codigo_plu = dr.pro_codigo_plu
        WHERE dr.rev_id = ? ORDER BY dr.det_id`,
      [req.params.revId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// DELETE /api/revision/:revId/detalle/:plu
async function eliminarDetalle(req, res) {
  try {
    await db.query(
      `DELETE FROM detalle_revision WHERE rev_id = ? AND pro_codigo_plu = ?`,
      [req.params.revId, req.params.plu]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = { buscarRevisionActiva, iniciarRevision, agregarDetalle, finalizarRevision, obtenerRevision, eliminarDetalle };
