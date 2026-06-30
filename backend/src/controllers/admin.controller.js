const db            = require('../config/db');
const ConfigService  = require('../services/ConfigService');
const CsvImport      = require('../services/CsvImportService');
const { generarExcel } = require('../services/EmailService');
const { calcularDemanda, diaSemanaSantiago } = require('../services/DemandCalculatorService');

// GET /api/departamentos[?productiva=1]
async function listarDepartamentos(req, res) {
  try {
    const soloProductivas = req.query.productiva === '1' || req.query.productiva === 'true';
    const soloInfaltables = req.query.infaltable === '1' || req.query.infaltable === 'true';
    const filtros = [];
    if (soloProductivas) filtros.push('dep_productiva = 1');
    if (soloInfaltables) filtros.push('dep_infaltable = 1');
    const { rows } = await db.query(
      `SELECT dep_id, dep_nombre, dep_email_jefe, dep_emails_cc, dep_productiva, dep_infaltable
         FROM departamentos
        ${filtros.length ? `WHERE ${filtros.join(' AND ')}` : ''}
        ORDER BY dep_nombre`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/departamentos
async function crearDepartamento(req, res) {
  try {
    const { dep_id, dep_nombre, dep_email_jefe, dep_emails_cc, dep_productiva } = req.body;
    if (!dep_id || !dep_nombre) return res.status(400).json({ error: 'Faltan datos obligatorios' });
    await db.query(
      `INSERT INTO departamentos (dep_id, dep_nombre, dep_email_jefe, dep_emails_cc, dep_productiva) VALUES (?, ?, ?, ?, ?)`,
      [dep_id, dep_nombre, dep_email_jefe || null, dep_emails_cc || null, dep_productiva ? 1 : 0]
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
    const { dep_nombre, dep_email_jefe, dep_emails_cc, dep_productiva } = req.body;
    // dep_productiva es opcional: si no viene en el body, se conserva el valor actual.
    await db.query(
      `UPDATE departamentos
          SET dep_nombre     = COALESCE(?, dep_nombre),
              dep_email_jefe = ?,
              dep_emails_cc  = ?,
              dep_productiva = COALESCE(?, dep_productiva)
        WHERE dep_id = ?`,
      [dep_nombre, dep_email_jefe || null, dep_emails_cc || null,
       dep_productiva === undefined ? null : (dep_productiva ? 1 : 0), req.params.depId]
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
    const { dep_id, dias_historial, mode } = req.body;
    if (!dep_id || !dias_historial) return res.status(400).json({ error: 'dep_id y dias_historial requeridos' });
    const onlyUpdateExisting = (mode === 'update');
    const resultado = await CsvImport.importarCSV(req.file.buffer, dep_id, parseInt(dias_historial, 10), onlyUpdateExisting);
    res.json({ ok: true, ...resultado });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/productos?dep_id=22&q=kuchen[&categoria=normal|especial]
async function buscarProductos(req, res) {
  try {
    const { dep_id, q = '' } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const categoria = (req.query.categoria === 'normal' || req.query.categoria === 'especial') ? req.query.categoria : null;
    const b = `%${q}%`;
    const params = [dep_id, b, b, b];
    if (categoria) params.push(categoria);
    // Filtro por día de elaboración: solo aparece si hoy (zona Santiago) es uno de sus
    // días, o si no tiene días asignados. Mantiene la búsqueda alineada con la lista.
    const hoy = diaSemanaSantiago(new Date());
    if (hoy) params.push(hoy);
    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_codigo_barra, pro_nombre_producto,
              vta_total_periodo, dias_historial,
              pro_dias_produccion_override, pro_dias_seguridad_override,
              pro_dias_elaboracion, pro_cantidad_minima
         FROM productos
        WHERE dep_id = ?
          AND (pro_nombre_producto LIKE ? OR pro_codigo_plu LIKE ? OR pro_codigo_barra LIKE ?)
          ${categoria ? 'AND pro_categoria = ?' : ''}
          ${hoy ? "AND (pro_dias_elaboracion IS NULL OR pro_dias_elaboracion = '' OR FIND_IN_SET(?, pro_dias_elaboracion))" : ''}
        ORDER BY pro_nombre_producto LIMIT 15`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// GET /api/productos-lista?dep_id=22[&categoria=normal|especial]
// Lista completa (sin límite) de productos de un depto, opcionalmente filtrada
// por categoría. Pública: la usa el perfil "Áreas Productivas" para ver productos.
async function listarProductosPorCategoria(req, res) {
  try {
    const { dep_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const categoria = (req.query.categoria === 'normal' || req.query.categoria === 'especial') ? req.query.categoria : null;
    const params = [dep_id];
    if (categoria) params.push(categoria);
    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_codigo_barra, pro_nombre_producto,
              vta_total_periodo, dias_historial, pro_categoria
         FROM productos
        WHERE dep_id = ?
          ${categoria ? 'AND pro_categoria = ?' : ''}
        ORDER BY pro_nombre_producto`,
      params
    );
    res.json(rows.map((r) => ({
      pro_codigo_plu: r.pro_codigo_plu,
      pro_codigo_barra: r.pro_codigo_barra,
      pro_nombre_producto: r.pro_nombre_producto,
      pro_categoria: r.pro_categoria,
      vta_diaria: ventaDiaria(r.vta_total_periodo, r.dias_historial),
    })));
  } catch (err) {
    console.error('[listarProductosPorCategoria]', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los productos' });
  }
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

// ── Clasificación de productos (panel admin) ─────────────────────
// Reemplaza los antiguos perfiles "Producción" (normal/especial) e
// "Infaltables → Clasificar" (jornada). Todo se gestiona desde aquí.
const CATEGORIAS = ['sin_clasificar', 'normal', 'especial'];
const JORNADAS   = ['am', 'pm']; // null = sin asignar

// Venta diaria segura (mismo criterio que el motor de demanda)
function ventaDiaria(vta, dias) {
  const v = Number(vta), d = Number(dias);
  if (!Number.isFinite(v) || !Number.isFinite(d) || d <= 0) return 0;
  return Math.round((v / d) * 100) / 100;
}

// GET /api/admin/clasificacion?dep_id=22
// Lista productos con sus 3 marcas + vta diaria para clasificar en lote.
async function listarClasificacion(req, res) {
  try {
    const { dep_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_nombre_producto, vta_total_periodo, dias_historial,
              pro_categoria, pro_infaltable, pro_jornada, pro_dias_elaboracion
         FROM productos
        WHERE dep_id = ?
        ORDER BY (vta_total_periodo / NULLIF(dias_historial,0)) DESC, pro_nombre_producto`,
      [dep_id]
    );
    res.json(rows.map((r) => ({
      pro_codigo_plu: r.pro_codigo_plu,
      pro_nombre_producto: r.pro_nombre_producto,
      vta_diaria: ventaDiaria(r.vta_total_periodo, r.dias_historial),
      pro_categoria: r.pro_categoria,
      pro_infaltable: !!r.pro_infaltable,
      pro_jornada: r.pro_jornada,
      pro_dias_elaboracion: r.pro_dias_elaboracion || '',
    })));
  } catch (err) {
    console.error('[listarClasificacion]', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los productos' });
  }
}

// Normaliza/valida días de elaboración: string CSV de dígitos 1-7 (1=Lunes…7=Domingo).
// Devuelve { ok, valor } donde valor es el CSV ordenado y deduplicado, o null si vacío.
const DIAS_RE = /^[1-7](,[1-7])*$/;
function normalizarDiasElaboracion(raw) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return { ok: true, valor: null };
  const limpio = String(raw).split(',').map((d) => d.trim()).filter(Boolean).join(',');
  if (!DIAS_RE.test(limpio)) return { ok: false };
  const unicos = [...new Set(limpio.split(','))].sort();
  return { ok: true, valor: unicos.join(',') };
}

// POST /api/admin/clasificacion/bulk
// Body: { dep_id, cambios: [{ pro_codigo_plu, pro_categoria?, pro_infaltable?, pro_jornada?, pro_dias_elaboracion? }] }
// Cada campo es opcional: solo se actualiza lo que venga en el cambio.
async function clasificarBulk(req, res) {
  const { dep_id, cambios } = req.body;
  if (!dep_id || !Array.isArray(cambios) || cambios.length === 0) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  // Validar antes de tocar la BD
  for (const c of cambios) {
    if (!c.pro_codigo_plu) return res.status(400).json({ error: 'PLU faltante' });
    if (c.pro_categoria !== undefined && !CATEGORIAS.includes(c.pro_categoria)) {
      return res.status(400).json({ error: `Categoría inválida: ${c.pro_categoria}` });
    }
    if (c.pro_jornada !== undefined && c.pro_jornada !== null && !JORNADAS.includes(c.pro_jornada)) {
      return res.status(400).json({ error: `Jornada inválida: ${c.pro_jornada}` });
    }
    if (c.pro_dias_elaboracion !== undefined && !normalizarDiasElaboracion(c.pro_dias_elaboracion).ok) {
      return res.status(400).json({ error: `Días de elaboración inválidos: ${c.pro_dias_elaboracion}` });
    }
  }

  let connection;
  try {
    connection = await db.pool.getConnection();
    await connection.beginTransaction();
    for (const c of cambios) {
      const sets = [];
      const params = [];
      if (c.pro_categoria !== undefined) { sets.push('pro_categoria = ?'); params.push(c.pro_categoria); }
      if (c.pro_infaltable !== undefined) { sets.push('pro_infaltable = ?'); params.push(c.pro_infaltable ? 1 : 0); }
      if (c.pro_jornada !== undefined) { sets.push('pro_jornada = ?'); params.push(c.pro_jornada); }
      if (c.pro_dias_elaboracion !== undefined) { sets.push('pro_dias_elaboracion = ?'); params.push(normalizarDiasElaboracion(c.pro_dias_elaboracion).valor); }
      if (!sets.length) continue; // nada que actualizar para este ítem
      params.push(c.pro_codigo_plu, dep_id);
      await connection.query(
        `UPDATE productos SET ${sets.join(', ')} WHERE pro_codigo_plu = ? AND dep_id = ?`,
        params
      );
    }
    await connection.commit();
    res.json({ ok: true, actualizados: cambios.length });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('[clasificarBulk]', err.message);
    res.status(500).json({ error: 'No se pudo guardar la clasificación' });
  } finally {
    if (connection) connection.release();
  }
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
    res.json({ ok: true, actualizados: productos.length });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('[actualizarMasterProductosBulk]', err.message);
    res.status(500).json({ error: 'No se pudieron guardar los productos' });
  } finally {
    if (connection) connection.release();
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
    res.json({ ok: true, eliminados: plus.length });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('[eliminarMasterProductosBulk]', err.message);
    res.status(500).json({ error: 'No se pudieron eliminar los productos' });
  } finally {
    if (connection) connection.release();
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
        pro_dias_produccion_override: calc.diasProdEfectivo,
        pro_dias_seguridad_override: calc.diasSegEfectivo,
        demandaTotalRequerida: calc.demandaTotalRequerida !== undefined ? Number(calc.demandaTotalRequerida.toFixed(1)) : null,
      });
    });

    const buffer = await wb.xlsx.writeBuffer();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=maestro_productos_${dep_id}_${Date.now()}.xlsx`);
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// POST /api/admin/usuarios
async function crearUsuario(req, res) {
  try {
    const { usu_nombre } = req.body;
    if (!usu_nombre) return res.status(400).json({ error: 'Nombre requerido' });
    await db.query(`INSERT INTO usuarios (usu_nombre) VALUES (?)`, [usu_nombre]);
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PUT /api/admin/usuarios/:id
async function actualizarUsuario(req, res) {
  try {
    const { usu_nombre } = req.body;
    if (!usu_nombre) return res.status(400).json({ error: 'Nombre requerido' });
    await db.query(`UPDATE usuarios SET usu_nombre = ? WHERE usu_id = ?`, [usu_nombre, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// DELETE /api/admin/usuarios/:id
async function eliminarUsuario(req, res) {
  try {
    await db.query(`DELETE FROM usuarios WHERE usu_id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

module.exports = {
  listarDepartamentos, crearDepartamento, actualizarDepartamento,
  listarUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario,
  obtenerConfig, actualizarConfig,
  subirCSV,
  buscarProductos, listarProductosPorCategoria, obtenerProducto, actualizarProducto, exportarExcel,
  listarClasificacion, clasificarBulk,
  obtenerMasterProductos, actualizarMasterProductosBulk, eliminarMasterProductosBulk, exportarMasterExcel
};
