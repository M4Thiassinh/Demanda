const db      = require('../config/db');
const ExcelJS = require('exceljs');

// ─────────────────────────────────────────────────────────────────────────────
// Toma de inventario de BODEGA (conteo físico).
// Independiente de la revisión de sala: solo cuenta lo que hay en bodega y lo
// compara con el stock del sistema (db_analitica_supermercado.fact_stock_diario)
// para luego corregir el ERP a mano. No toca pedidos, KDS ni correos.
// El "stock del sistema" que mostramos es fact_stock_diario.stock_total_real
// (snapshot diario), unido por PLU. Se guarda una copia al momento de contar.
// ─────────────────────────────────────────────────────────────────────────────

const COLL = 'COLLATE utf8mb4_unicode_ci';

// GET /api/bodega/activa?dep_id=..&usu_id=..
// Reanuda la última toma en proceso de ese depto + usuario (si existe).
async function buscarTomaActiva(req, res) {
  try {
    const { dep_id, usu_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const { rows } = await db.query(
      `SELECT tb_id, dep_id, tb_fecha_inicio
         FROM toma_bodega
        WHERE dep_id = ? AND (? IS NULL OR usu_id = ?) AND tb_estado = 'en_proceso'
        ORDER BY tb_fecha_inicio DESC LIMIT 1`,
      [dep_id, usu_id || null, usu_id || null]
    );
    res.json(rows[0] || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/bodega  { dep_id, usu_id }
async function iniciarToma(req, res) {
  try {
    const { dep_id, usu_id } = req.body;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const { rows } = await db.query(
      `INSERT INTO toma_bodega (dep_id, usu_id, tb_estado) VALUES (?, ?, 'en_proceso')`,
      [dep_id, usu_id || null]
    );
    res.status(201).json({ tb_id: rows.insertId, dep_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/bodega/productos?dep_id=..&q=..
// Busca productos del depto (TODOS, incl. inactivos y sin filtrar por día) y trae
// el stock del sistema. Pensado para el conteo de bodega.
async function buscarProductos(req, res) {
  try {
    const { dep_id, q = '' } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const b = `%${q}%`;
    const { rows } = await db.query(
      `SELECT p.pro_codigo_plu, p.pro_codigo_barra, p.pro_nombre_producto, p.pro_activo,
              s.stock_total_real AS stock_sistema
         FROM productos p
         LEFT JOIN db_analitica_supermercado.fact_stock_diario s
           ON CAST(s.pro_codigo_plu AS CHAR) ${COLL} = p.pro_codigo_plu
        WHERE p.dep_id = ?
          AND (p.pro_nombre_producto LIKE ? OR p.pro_codigo_plu LIKE ? OR p.pro_codigo_barra LIKE ?)
        ORDER BY p.pro_nombre_producto LIMIT 20`,
      [dep_id, b, b, b]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/bodega/:tbId  → cabecera + ítems contados (con stock sistema y diferencia)
async function obtenerToma(req, res) {
  try {
    const { tbId } = req.params;
    const { rows: cab } = await db.query(
      `SELECT t.tb_id, t.dep_id, dep.dep_nombre, t.usu_id, u.usu_nombre,
              t.tb_estado, t.tb_fecha_inicio, t.tb_fecha_fin
         FROM toma_bodega t
         LEFT JOIN departamentos dep ON dep.dep_id = t.dep_id
         LEFT JOIN usuarios u ON u.usu_id = t.usu_id
        WHERE t.tb_id = ?`,
      [tbId]
    );
    if (!cab.length) return res.status(404).json({ error: 'Toma no encontrada' });

    const { rows: det } = await db.query(
      `SELECT d.pro_codigo_plu, p.pro_nombre_producto, p.pro_codigo_barra,
              d.tbd_cantidad_fisica AS fisico, d.tbd_stock_sistema AS sistema
         FROM toma_bodega_detalle d
         JOIN toma_bodega t ON t.tb_id = d.tb_id
         LEFT JOIN productos p ON p.pro_codigo_plu = d.pro_codigo_plu AND p.dep_id = t.dep_id
        WHERE d.tb_id = ?
        ORDER BY p.pro_nombre_producto`,
      [tbId]
    );
    const items = det.map((r) => {
      const fisico = Number(r.fisico);
      const sistema = r.sistema === null ? null : Number(r.sistema);
      return { ...r, fisico, sistema, diferencia: sistema === null ? null : Number((fisico - sistema).toFixed(2)) };
    });
    res.json({ ...cab[0], items });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/bodega/:tbId/detalle  { pro_codigo_plu, cantidad_fisica }
// Guarda/actualiza el conteo de un producto, capturando el stock del sistema.
async function guardarDetalle(req, res) {
  try {
    const { tbId } = req.params;
    const { pro_codigo_plu, cantidad_fisica } = req.body;
    if (!pro_codigo_plu) return res.status(400).json({ error: 'pro_codigo_plu requerido' });
    const cant = Number(cantidad_fisica);
    if (!Number.isFinite(cant)) return res.status(400).json({ error: 'cantidad_fisica inválida' });

    // Stock del sistema para ese PLU (snapshot al momento de contar).
    const { rows: st } = await db.query(
      `SELECT stock_total_real FROM db_analitica_supermercado.fact_stock_diario
        WHERE CAST(pro_codigo_plu AS CHAR) ${COLL} = ? LIMIT 1`,
      [pro_codigo_plu]
    );
    const sistema = st.length ? Number(st[0].stock_total_real) : null;

    await db.query(
      `INSERT INTO toma_bodega_detalle (tb_id, pro_codigo_plu, tbd_cantidad_fisica, tbd_stock_sistema)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE tbd_cantidad_fisica = VALUES(tbd_cantidad_fisica),
                               tbd_stock_sistema   = VALUES(tbd_stock_sistema)`,
      [tbId, pro_codigo_plu, cant, sistema]
    );
    res.status(201).json({
      ok: true, pro_codigo_plu, fisico: cant, sistema,
      diferencia: sistema === null ? null : Number((cant - sistema).toFixed(2)),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// DELETE /api/bodega/:tbId/detalle/:plu
async function eliminarDetalle(req, res) {
  try {
    const { tbId, plu } = req.params;
    await db.query('DELETE FROM toma_bodega_detalle WHERE tb_id = ? AND pro_codigo_plu = ?', [tbId, plu]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/bodega/:tbId/finalizar  → marca completada
async function finalizarToma(req, res) {
  try {
    const { tbId } = req.params;
    const { rows: det } = await db.query(
      `SELECT COUNT(*) total,
              SUM(tbd_stock_sistema IS NOT NULL AND tbd_cantidad_fisica <> tbd_stock_sistema) diferencias
         FROM toma_bodega_detalle WHERE tb_id = ?`,
      [tbId]
    );
    await db.query(
      `UPDATE toma_bodega SET tb_estado = 'completada', tb_fecha_fin = NOW() WHERE tb_id = ?`,
      [tbId]
    );
    res.json({ ok: true, total: Number(det[0].total) || 0, diferencias: Number(det[0].diferencias) || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/bodega?dep_id=..  → historial de tomas (últimas 50)
async function listarTomas(req, res) {
  try {
    const { dep_id } = req.query;
    const { rows } = await db.query(
      `SELECT t.tb_id, t.dep_id, dep.dep_nombre, u.usu_nombre, t.tb_estado,
              t.tb_fecha_inicio, t.tb_fecha_fin, COUNT(d.tbd_id) productos
         FROM toma_bodega t
         LEFT JOIN departamentos dep ON dep.dep_id = t.dep_id
         LEFT JOIN usuarios u ON u.usu_id = t.usu_id
         LEFT JOIN toma_bodega_detalle d ON d.tb_id = t.tb_id
        WHERE (? IS NULL OR t.dep_id = ?)
        GROUP BY t.tb_id
        ORDER BY t.tb_fecha_inicio DESC LIMIT 50`,
      [dep_id || null, dep_id || null]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/bodega/:tbId/export  → Excel con físico vs sistema y diferencia
async function exportarExcel(req, res) {
  try {
    const { tbId } = req.params;
    const { rows: cab } = await db.query(
      `SELECT t.tb_id, t.dep_id, dep.dep_nombre, u.usu_nombre, t.tb_fecha_inicio
         FROM toma_bodega t
         LEFT JOIN departamentos dep ON dep.dep_id = t.dep_id
         LEFT JOIN usuarios u ON u.usu_id = t.usu_id
        WHERE t.tb_id = ?`,
      [tbId]
    );
    if (!cab.length) return res.status(404).json({ error: 'Toma no encontrada' });

    const { rows: det } = await db.query(
      `SELECT d.pro_codigo_plu, p.pro_codigo_barra, p.pro_nombre_producto,
              d.tbd_cantidad_fisica AS fisico, d.tbd_stock_sistema AS sistema
         FROM toma_bodega_detalle d
         JOIN toma_bodega t ON t.tb_id = d.tb_id
         LEFT JOIN productos p ON p.pro_codigo_plu = d.pro_codigo_plu AND p.dep_id = t.dep_id
        WHERE d.tb_id = ?
        ORDER BY p.pro_nombre_producto`,
      [tbId]
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Toma de Bodega');
    ws.columns = [
      { header: 'PLU', key: 'plu', width: 14 },
      { header: 'Código Barra', key: 'barra', width: 18 },
      { header: 'Producto', key: 'nombre', width: 44 },
      { header: 'Físico (bodega)', key: 'fisico', width: 16 },
      { header: 'Stock sistema', key: 'sistema', width: 16 },
      { header: 'Diferencia', key: 'dif', width: 14 },
    ];
    ws.getRow(1).font = { bold: true };
    for (const r of det) {
      const fisico = Number(r.fisico);
      const sistema = r.sistema === null ? null : Number(r.sistema);
      const dif = sistema === null ? null : Number((fisico - sistema).toFixed(2));
      const row = ws.addRow({
        plu: r.pro_codigo_plu, barra: r.pro_codigo_barra || '', nombre: r.pro_nombre_producto || '',
        fisico, sistema: sistema === null ? 's/d' : sistema, dif: dif === null ? 's/d' : dif,
      });
      // Resaltar en rojo las diferencias
      if (dif !== null && dif !== 0) {
        row.getCell('dif').font = { bold: true, color: { argb: 'FFC00000' } };
      }
    }

    const buffer = await wb.xlsx.writeBuffer();
    const fecha = new Date(cab[0].tb_fecha_inicio).toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=toma_bodega_${cab[0].dep_id}_${fecha}.xlsx`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[bodega exportarExcel]', err.message);
    res.status(500).json({ error: 'No se pudo exportar' });
  }
}

module.exports = {
  buscarTomaActiva, iniciarToma, buscarProductos, obtenerToma,
  guardarDetalle, eliminarDetalle, finalizarToma, listarTomas, exportarExcel,
};
