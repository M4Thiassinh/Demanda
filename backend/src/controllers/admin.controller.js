const db           = require('../config/db');
const ConfigService = require('../services/ConfigService');
const CsvImport     = require('../services/CsvImportService');
const { generarExcel } = require('../services/EmailService');

// GET /api/departamentos
async function listarDepartamentos(req, res) {
  try {
    const { rows } = await db.query('SELECT dep_id, dep_nombre FROM departamentos ORDER BY dep_nombre');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/usuarios
async function listarUsuarios(req, res) {
  try {
    const { rows } = await db.query('SELECT usu_id, usu_nombre FROM usuarios ORDER BY usu_nombre');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/admin/config/:depId
async function obtenerConfig(req, res) {
  try {
    res.json(await ConfigService.getConfig(req.params.depId));
  } catch (err) { res.status(404).json({ error: err.message }); }
}

// PUT /api/admin/config/:depId
async function actualizarConfig(req, res) {
  try {
    await ConfigService.updateConfig(req.params.depId, req.body);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/admin/csv-upload
async function subirCSV(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const { dep_id, dias_historial } = req.body;
    if (!dep_id || !dias_historial) return res.status(400).json({ error: 'dep_id y dias_historial requeridos' });
    const resultado = await CsvImport.importarCSV(req.file.buffer, dep_id, parseInt(dias_historial, 10));
    res.json({ ok: true, ...resultado });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/productos?dep_id=22&q=kuchen  (busca por PLU, barra o nombre)
async function buscarProductos(req, res) {
  try {
    const { dep_id, q = '' } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const b = `%${q}%`;
    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_codigo_barra, pro_nombre_producto,
              vta_total_periodo, dias_historial, pro_dias_seguridad_override
         FROM productos
        WHERE dep_id = ?
          AND (pro_nombre_producto LIKE ? OR pro_codigo_plu LIKE ? OR pro_codigo_barra LIKE ?)
        ORDER BY pro_nombre_producto LIMIT 15`,
      [dep_id, b, b, b]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/admin/productos/:plu  — detalle de un producto para edición
async function obtenerProducto(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_codigo_barra, pro_nombre_producto,
              vta_total_periodo, dias_historial, dep_id, pro_dias_seguridad_override
         FROM productos WHERE pro_codigo_plu = ?`,
      [req.params.plu]
    );
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PUT /api/admin/productos/:plu  — editar barra + override
async function actualizarProducto(req, res) {
  try {
    const { pro_codigo_barra, pro_dias_seguridad_override } = req.body;
    await db.query(
      `UPDATE productos
          SET pro_codigo_barra           = COALESCE(?, pro_codigo_barra),
              pro_dias_seguridad_override = ?
        WHERE pro_codigo_plu = ?`,
      [
        pro_codigo_barra ?? null,
        pro_dias_seguridad_override === '' ? null : (pro_dias_seguridad_override ?? null),
        req.params.plu,
      ]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/admin/export?dep_id=22&fecha_ini=2026-04-01&fecha_fin=2026-04-30
// Descarga Excel consolidado de todas las revisiones completadas en el rango
async function exportarExcel(req, res) {
  try {
    const { dep_id, fecha_ini, fecha_fin } = req.query;

    const { rows } = await db.query(
      `SELECT r.rev_folio, r.rev_fecha, d.dep_nombre,
              COALESCE(u.usu_nombre,'Operador') AS usu_nombre,
              dr.pro_codigo_plu, p.pro_codigo_barra, p.pro_nombre_producto,
              dr.det_stock_sala,
              p.vta_total_periodo, p.dias_historial, p.pro_dias_seguridad_override,
              c.factor_ajuste
         FROM revisiones r
         JOIN departamentos d   ON d.dep_id = r.dep_id
         LEFT JOIN usuarios u   ON u.usu_id = r.usu_id
         JOIN detalle_revision dr ON dr.rev_id = r.rev_id
         JOIN productos p        ON p.pro_codigo_plu = dr.pro_codigo_plu
         JOIN configuraciones c  ON c.dep_id = r.dep_id
        WHERE r.rev_estado = 'completada'
          AND (? IS NULL OR r.dep_id = ?)
          AND (? IS NULL OR DATE(r.rev_fecha) >= ?)
          AND (? IS NULL OR DATE(r.rev_fecha) <= ?)
        ORDER BY r.rev_fecha DESC, dr.det_id`,
      [dep_id || null, dep_id || null,
       fecha_ini || null, fecha_ini || null,
       fecha_fin || null, fecha_fin || null]
    );

    const { calcularDemanda } = require('../services/DemandCalculatorService');

    // Calcular requerimiento para cada línea
    const lineas = rows.map((row) => {
      const calc = calcularDemanda(
        { factor_ajuste: row.factor_ajuste },
        { vta_total_periodo: row.vta_total_periodo, dias_historial: row.dias_historial, pro_dias_seguridad_override: row.pro_dias_seguridad_override },
        row.det_stock_sala
      );
      return { ...row, ...calc };
    });

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Consolidado');

    ws.columns = [
      { header: 'Folio',        key: 'rev_folio',           width: 22 },
      { header: 'Fecha',        key: 'rev_fecha',           width: 20 },
      { header: 'Usuario',      key: 'usu_nombre',          width: 14 },
      { header: 'Departamento', key: 'dep_nombre',          width: 14 },
      { header: 'PLU',          key: 'pro_codigo_plu',      width: 12 },
      { header: 'Código Barra', key: 'pro_codigo_barra',    width: 16 },
      { header: 'Producto',     key: 'pro_nombre_producto', width: 42 },
      { header: 'Stock Sala',   key: 'det_stock_sala',      width: 12 },
      { header: 'Requerimiento',key: 'requerimiento',       width: 15 },
      { header: 'A Reponer',    key: 'cantidadAProducir',   width: 12 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });

    lineas.forEach((l) => ws.addRow({
      rev_folio: l.rev_folio,
      rev_fecha: new Date(l.rev_fecha).toLocaleString('es-CL'),
      usu_nombre: l.usu_nombre,
      dep_nombre: l.dep_nombre,
      pro_codigo_plu: l.pro_codigo_plu,
      pro_codigo_barra: l.pro_codigo_barra || '',
      pro_nombre_producto: l.pro_nombre_producto,
      det_stock_sala: l.det_stock_sala,
      requerimiento: l.requerimiento,
      cantidadAProducir: l.cantidadAProducir,
    }));

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=consolidado_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = {
  listarDepartamentos, listarUsuarios,
  obtenerConfig, actualizarConfig,
  subirCSV, buscarProductos,
  obtenerProducto, actualizarProducto,
  exportarExcel,
};
