const db            = require('../config/db');
const ConfigService  = require('../services/ConfigService');
const CsvImport      = require('../services/CsvImportService');
const { generarExcel } = require('../services/EmailService');
const { calcularDemanda } = require('../services/DemandCalculatorService');

// GET /api/departamentos
async function listarDepartamentos(req, res) {
  try {
    const { rows } = await db.query('SELECT dep_id, dep_nombre, dep_email_jefe, dep_emails_cc FROM departamentos ORDER BY dep_nombre');
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/departamentos
async function crearDepartamento(req, res) {
  try {
    const { dep_id, dep_nombre, dep_email_jefe, dep_emails_cc } = req.body;
    if (!dep_id || !dep_nombre) return res.status(400).json({ error: 'Faltan datos obligatorios' });
    await db.query(
      `INSERT INTO departamentos (dep_id, dep_nombre, dep_email_jefe, dep_emails_cc) VALUES (?, ?, ?, ?)`,
      [dep_id, dep_nombre, dep_email_jefe || null, dep_emails_cc || null]
    );
    // Configuración por defecto para el nuevo departamento
    await db.query(
      `INSERT INTO configuraciones (dep_id, dias_produccion_semana, dias_seguridad_defecto) VALUES (?, 6, 2)`,
      [dep_id]
    );
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PUT /api/departamentos/:depId
async function actualizarDepartamento(req, res) {
  try {
    const { dep_nombre, dep_email_jefe, dep_emails_cc } = req.body;
    await db.query(
      `UPDATE departamentos SET dep_nombre = COALESCE(?, dep_nombre), dep_email_jefe = ?, dep_emails_cc = ? WHERE dep_id = ?`,
      [dep_nombre, dep_email_jefe || null, dep_emails_cc || null, req.params.depId]
    );
    res.json({ ok: true });
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
  try { res.json(await ConfigService.getConfig(req.params.depId)); }
  catch (err) { res.status(404).json({ error: err.message }); }
}

// PUT /api/admin/config/:depId
async function actualizarConfig(req, res) {
  try { await ConfigService.updateConfig(req.params.depId, req.body); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
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

// GET /api/productos?dep_id=22&q=kuchen
async function buscarProductos(req, res) {
  try {
    const { dep_id, q = '' } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const b = `%${q}%`;
    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_codigo_barra, pro_nombre_producto,
              vta_total_periodo, dias_historial,
              pro_dias_produccion_override, pro_dias_seguridad_override,
              pro_dias_elaboracion, pro_cantidad_minima
         FROM productos
        WHERE dep_id = ?
          AND (pro_nombre_producto LIKE ? OR pro_codigo_plu LIKE ? OR pro_codigo_barra LIKE ?)
        ORDER BY pro_nombre_producto LIMIT 15`,
      [dep_id, b, b, b]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/admin/productos/:plu
async function obtenerProducto(req, res) {
  try {
    const { dep_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_codigo_barra, pro_nombre_producto,
              vta_total_periodo, dias_historial, dep_id,
              pro_dias_produccion_override, pro_dias_seguridad_override,
              pro_dias_elaboracion, pro_cantidad_minima
         FROM productos WHERE pro_codigo_plu = ? AND dep_id = ?`,
      [req.params.plu, dep_id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PUT /api/admin/productos/:plu
async function actualizarProducto(req, res) {
  try {
    const { dep_id, pro_codigo_barra, pro_dias_produccion_override, pro_dias_seguridad_override, pro_dias_elaboracion, pro_cantidad_minima } = req.body;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const toNull = (v) => (v === '' || v === undefined || v === null) ? null : parseInt(v, 10);
    await db.query(
      `UPDATE productos
          SET pro_codigo_barra              = COALESCE(?, pro_codigo_barra),
              pro_dias_produccion_override  = ?,
              pro_dias_seguridad_override   = ?,
              pro_dias_elaboracion          = ?,
              pro_cantidad_minima           = ?
        WHERE pro_codigo_plu = ? AND dep_id = ?`,
      [pro_codigo_barra ?? null, toNull(pro_dias_produccion_override), toNull(pro_dias_seguridad_override), pro_dias_elaboracion || null, toNull(pro_cantidad_minima) || 0, req.params.plu, dep_id]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/admin/export
async function exportarExcel(req, res) {
  try {
    const { dep_id, fecha_ini, fecha_fin } = req.query;
    const { rows } = await db.query(
      `SELECT r.rev_folio, r.rev_fecha, d.dep_nombre,
              COALESCE(u.usu_nombre,'Operador') AS usu_nombre,
              dr.pro_codigo_plu, p.pro_codigo_barra, p.pro_nombre_producto,
              dr.det_stock_sala,
              p.vta_total_periodo, p.dias_historial,
              p.pro_dias_produccion_override, p.pro_dias_seguridad_override,
              p.pro_dias_elaboracion, p.pro_cantidad_minima,
              c.dias_produccion_semana
         FROM revisiones r
         JOIN departamentos d    ON d.dep_id = r.dep_id
         LEFT JOIN usuarios u    ON u.usu_id = r.usu_id
         JOIN detalle_revision dr ON dr.rev_id = r.rev_id
         JOIN productos p         ON p.pro_codigo_plu = dr.pro_codigo_plu AND p.dep_id = r.dep_id
         JOIN configuraciones c   ON c.dep_id = r.dep_id
        WHERE r.rev_estado = 'completada'
          AND (? IS NULL OR r.dep_id = ?)
          AND (? IS NULL OR DATE(r.rev_fecha) >= ?)
          AND (? IS NULL OR DATE(r.rev_fecha) <= ?)
        ORDER BY r.rev_fecha DESC, dr.det_id`,
      [dep_id || null, dep_id || null,
       fecha_ini || null, fecha_ini || null,
       fecha_fin || null, fecha_fin || null]
    );

    const lineas = rows.map((row) => {
      const calc = calcularDemanda(
        { dias_produccion_semana: row.dias_produccion_semana },
        { vta_total_periodo: row.vta_total_periodo, dias_historial: row.dias_historial,
          pro_dias_produccion_override: row.pro_dias_produccion_override,
          pro_dias_seguridad_override:  row.pro_dias_seguridad_override,
          pro_dias_elaboracion:         row.pro_dias_elaboracion,
          pro_cantidad_minima:          row.pro_cantidad_minima },
        row.det_stock_sala
      );
      return { ...row, ...calc };
    });

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Consolidado');

    ws.columns = [
      { header: 'Folio',          key: 'rev_folio',              width: 22 },
      { header: 'Fecha',          key: 'rev_fecha',              width: 20 },
      { header: 'Usuario',        key: 'usu_nombre',             width: 14 },
      { header: 'Departamento',   key: 'dep_nombre',             width: 14 },
      { header: 'PLU',            key: 'pro_codigo_plu',         width: 12 },
      { header: 'Código Barra',   key: 'pro_codigo_barra',       width: 16 },
      { header: 'Producto',       key: 'pro_nombre_producto',    width: 40 },
      { header: 'Stock Sala',     key: 'det_stock_sala',         width: 12 },
      { header: 'Venta Diaria',   key: 'ventaDiaria',            width: 13 },
      { header: 'Lote Base',      key: 'loteProduccionBase',     width: 13 },
      { header: 'Stock Seg.',     key: 'stockSeguridadCalculado',width: 13 },
      { header: 'Demanda Total',  key: 'demandaTotalRequerida',  width: 14 },
      { header: 'A Producir',     key: 'cantidadAProducir',      width: 12 },
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
      ventaDiaria: l.ventaDiaria,
      loteProduccionBase: l.loteProduccionBase,
      stockSeguridadCalculado: l.stockSeguridadCalculado,
      demandaTotalRequerida: l.demandaTotalRequerida,
      cantidadAProducir: l.cantidadAProducir,
    }));

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=consolidado_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/admin/master-productos
async function obtenerMasterProductos(req, res) {
  try {
    const { dep_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });

    // Cargar config del departamento
    const config = await ConfigService.getConfig(dep_id);

    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_codigo_barra, pro_nombre_producto,
              vta_total_periodo, dias_historial, dep_id,
              pro_dias_produccion_override, pro_dias_seguridad_override,
              pro_dias_elaboracion, pro_cantidad_minima
         FROM productos WHERE dep_id = ?
        ORDER BY pro_nombre_producto`,
      [dep_id]
    );

    // Calcular demanda para cada uno para que el admin lo vea en la tabla
    const resultados = rows.map((row) => {
      // Pasamos un stock dummy de 0 porque al master panel no le importa el stock de la sala actual,
      // solo quiere ver los parámetros maestros (venta diaria, lote, etc).
      const calc = calcularDemanda(config, row, 0);
      return {
        ...row,
        ventaDiaria: calc.ventaDiaria,
        demandaTotalRequerida: calc.demandaTotalRequerida
      };
    });

    res.json(resultados);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/admin/master-productos/bulk
async function actualizarMasterProductosBulk(req, res) {
  let connection;
  try {
    const { dep_id, productos } = req.body;
    if (!dep_id || !Array.isArray(productos)) return res.status(400).json({ error: 'Datos inválidos' });

    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const toNull = (v) => (v === '' || v === undefined || v === null) ? null : Number(v);

    for (const p of productos) {
      // Determinar si es un insert (nuevo producto) o un update
      if (p.isNew) {
        await connection.query(
          `INSERT INTO productos 
            (pro_codigo_plu, pro_codigo_barra, pro_nombre_producto, vta_total_periodo, dias_historial, dep_id, pro_dias_produccion_override, pro_dias_seguridad_override, pro_cantidad_minima) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            p.pro_codigo_plu, p.pro_codigo_barra || null, p.pro_nombre_producto,
            toNull(p.vta_total_periodo) || 0, toNull(p.dias_historial) || 30, dep_id,
            toNull(p.pro_dias_produccion_override), toNull(p.pro_dias_seguridad_override), toNull(p.pro_cantidad_minima) || 0
          ]
        );
      } else {
        await connection.query(
          `UPDATE productos
              SET pro_codigo_barra              = COALESCE(?, pro_codigo_barra),
                  pro_nombre_producto           = COALESCE(?, pro_nombre_producto),
                  vta_total_periodo             = COALESCE(?, vta_total_periodo),
                  dias_historial                = COALESCE(?, dias_historial),
                  pro_dias_produccion_override  = ?,
                  pro_dias_seguridad_override   = ?,
                  pro_cantidad_minima           = ?
            WHERE pro_codigo_plu = ? AND dep_id = ?`,
          [
            p.pro_codigo_barra ?? null, p.pro_nombre_producto ?? null, 
            toNull(p.vta_total_periodo), toNull(p.dias_historial),
            toNull(p.pro_dias_produccion_override), toNull(p.pro_dias_seguridad_override), toNull(p.pro_cantidad_minima) || 0,
            p.pro_codigo_plu, dep_id
          ]
        );
      }
    }

    await connection.commit();
    connection.release();
    res.json({ ok: true, actualizados: productos.length });
  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({ error: err.message });
  }
}

// POST /api/admin/master-productos/delete
async function eliminarMasterProductosBulk(req, res) {
  let connection;
  try {
    const { dep_id, plus } = req.body;
    if (!dep_id || !Array.isArray(plus) || plus.length === 0) return res.status(400).json({ error: 'Datos inválidos' });

    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const placeholders = plus.map(() => '?').join(',');
    const query = `DELETE FROM productos WHERE dep_id = ? AND pro_codigo_plu IN (${placeholders})`;
    
    await connection.query(query, [dep_id, ...plus]);

    await connection.commit();
    connection.release();
    res.json({ ok: true, eliminados: plus.length });
  } catch (err) {
    if (connection) {
      await connection.rollback();
      connection.release();
    }
    res.status(500).json({ error: err.message });
  }
}

// GET /api/admin/master-productos/export
async function exportarMasterExcel(req, res) {
  try {
    const { dep_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });

    const config = await ConfigService.getConfig(dep_id);

    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_codigo_barra, pro_nombre_producto,
              vta_total_periodo, dias_historial, dep_id,
              pro_dias_produccion_override, pro_dias_seguridad_override,
              pro_cantidad_minima
         FROM productos WHERE dep_id = ?
        ORDER BY pro_nombre_producto`,
      [dep_id]
    );

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Maestro_Productos');

    ws.columns = [
      { header: 'PLU',                  key: 'pro_codigo_plu',               width: 15 },
      { header: 'Nombre del Producto',  key: 'pro_nombre_producto',          width: 50 },
      { header: 'Vta. Diaria',          key: 'ventaDiaria',                  width: 15 },
      { header: 'Fact. Prod',           key: 'pro_dias_produccion_override', width: 15 },
      { header: 'Días Seguridad',       key: 'pro_dias_seguridad_override',  width: 15 },
      { header: 'Dda Total',            key: 'demandaTotalRequerida',        width: 15 },
      { header: 'Req. Mínimo',          key: 'pro_cantidad_minima',          width: 15 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } }; // Azul
    });

    rows.forEach((row) => {
      const calc = calcularDemanda(config, row, 0);
      ws.addRow({
        ...row,
        ventaDiaria: calc.ventaDiaria !== undefined ? Number(calc.ventaDiaria.toFixed(1)) : null,
        demandaTotalRequerida: calc.demandaTotalRequerida !== undefined ? Number(calc.demandaTotalRequerida.toFixed(1)) : null,
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=maestro_productos_${dep_id}_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = {
  listarDepartamentos, crearDepartamento, actualizarDepartamento,
  listarUsuarios,
  obtenerConfig, actualizarConfig,
  subirCSV, buscarProductos,
  obtenerProducto, actualizarProducto,
  exportarExcel,
  obtenerMasterProductos, actualizarMasterProductosBulk, eliminarMasterProductosBulk, exportarMasterExcel
};
