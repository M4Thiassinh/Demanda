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
        WHERE dep_id = ? AND rev_estado = 'en_proceso'
        ORDER BY rev_fecha DESC LIMIT 1`,
      [dep_id]
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
    const { pro_codigo_plu, det_stock_sala, cantidad_pedir } = req.body;
    if (det_stock_sala === undefined) return res.status(400).json({ error: 'det_stock_sala requerido' });

    const { rows } = await db.query(
      `INSERT INTO detalle_revision (rev_id, pro_codigo_plu, det_stock_sala, det_cantidad_pedir)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE det_stock_sala = VALUES(det_stock_sala), det_cantidad_pedir = VALUES(det_cantidad_pedir)`,
      [revId, pro_codigo_plu, parseInt(det_stock_sala, 10), cantidad_pedir !== undefined ? parseInt(cantidad_pedir, 10) : null]
    );
    res.status(201).json({ det_id: rows.insertId, ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/revision/:revId/detalle/bulk
async function agregarDetalleBulk(req, res) {
  try {
    const { revId } = req.params;
    const { items } = req.body; // Array de { pro_codigo_plu, cantidad_pedir }
    if (!items || !items.length) return res.status(400).json({ error: 'items requeridos' });

    for (const item of items) {
      await db.query(
        `INSERT INTO detalle_revision (rev_id, pro_codigo_plu, det_stock_sala, det_cantidad_pedir)
         VALUES (?, ?, 0, ?)
         ON DUPLICATE KEY UPDATE det_cantidad_pedir = VALUES(det_cantidad_pedir)`,
        [revId, item.pro_codigo_plu, parseInt(item.cantidad_pedir, 10)]
      );
    }
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/revision/:revId/calcular-item
async function calcularItem(req, res) {
  try {
    const { revId } = req.params;
    const { pro_codigo_plu, det_stock_sala } = req.body;

    const revRes = await db.query(`SELECT dep_id, rev_fecha FROM revisiones WHERE rev_id = ?`, [revId]);
    if (!revRes.rows.length) return res.status(404).json({ error: 'Revisión no encontrada' });
    const rev = revRes.rows[0];

    const prodRes = await db.query(
      `SELECT * FROM productos WHERE pro_codigo_plu = ? AND dep_id = ?`,
      [pro_codigo_plu, rev.dep_id]
    );
    if (!prodRes.rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    const prod = prodRes.rows[0];

    const config = await ConfigService.getConfig(rev.dep_id);
    const demanda = calcularDemanda(config, prod, parseInt(det_stock_sala, 10), rev.rev_fecha);

    res.json({
      ...demanda,
      pro_cantidad_minima: prod.pro_cantidad_minima || 0
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/revision/:revId/no-escaneados
async function obtenerNoEscaneados(req, res) {
  try {
    const { revId } = req.params;
    const revRes = await db.query(`SELECT dep_id, rev_fecha FROM revisiones WHERE rev_id = ?`, [revId]);
    if (!revRes.rows.length) return res.status(404).json({ error: 'Revisión no encontrada' });
    const rev = revRes.rows[0];

    // Traer todos los productos del departamento que no estén en la revisión
    const prodRes = await db.query(
      `SELECT p.* 
       FROM productos p
       LEFT JOIN detalle_revision dr ON dr.pro_codigo_plu = p.pro_codigo_plu AND dr.rev_id = ?
       WHERE p.dep_id = ? AND dr.det_id IS NULL`,
      [revId, rev.dep_id]
    );

    const config = await ConfigService.getConfig(rev.dep_id);
    const resultados = prodRes.rows.map(prod => {
      const demanda = calcularDemanda(config, prod, 0, rev.rev_fecha);
      return {
        ...prod,
        ...demanda
      };
    });

    res.json(resultados);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/revision/:revId/finalizar
async function finalizarRevision(req, res) {
  try {
    const { revId } = req.params;

    const revRes = await db.query(
      `SELECT r.rev_id, r.rev_folio, r.dep_id, r.rev_fecha,
              d.dep_nombre, d.dep_email_jefe, d.dep_emails_cc, COALESCE(u.usu_nombre,'Operador') AS usu_nombre
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
      `SELECT p.pro_codigo_plu, 
              dr.det_stock_sala,
              dr.det_cantidad_pedir,
              p.pro_codigo_barra, p.pro_nombre_producto,
              p.vta_total_periodo, p.dias_historial,
              p.pro_dias_produccion_override, p.pro_dias_seguridad_override,
              p.pro_dias_elaboracion, p.pro_cantidad_minima
         FROM detalle_revision dr
         JOIN productos p ON p.pro_codigo_plu = dr.pro_codigo_plu
        WHERE dr.rev_id = ? AND p.dep_id = ?`,
      [revId, rev.dep_id]
    );

    const resultados = detRes.rows.map((item) => {
      const calc = calcularDemanda(config, item, item.det_stock_sala, rev.rev_fecha);
      return {
        ...item,
        ...calc,
        fue_escaneado: true,
        cantidadAProducir: item.det_cantidad_pedir || 0, // Override final amount with user choice
        sugerenciaSistema: calc.cantidadAProducir, // Keep the math for the excel
        pedidoMinimo: item.pro_cantidad_minima || 0
      };
    });

    // Solo productos que se pidió explícitamente > 0
    const quiebres = resultados.filter((r) => r.cantidadAProducir > 0);

    await db.query(`UPDATE revisiones SET rev_estado = 'completada' WHERE rev_id = ?`, [revId]);

    if (quiebres.length > 0) {
      await enviarOrdenProduccion({
        depNombre: rev.dep_nombre,
        depEmail:  rev.dep_email_jefe,
        depEmailsCc: rev.dep_emails_cc,
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
              p.pro_codigo_barra, dr.det_stock_sala, dr.det_cantidad_pedir
         FROM detalle_revision dr
         JOIN revisiones r ON r.rev_id = dr.rev_id
         JOIN productos p ON p.pro_codigo_plu = dr.pro_codigo_plu AND p.dep_id = r.dep_id
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

module.exports = { buscarRevisionActiva, iniciarRevision, agregarDetalle, agregarDetalleBulk, calcularItem, obtenerNoEscaneados, finalizarRevision, obtenerRevision, eliminarDetalle };
