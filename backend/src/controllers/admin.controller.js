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
    // Filtro opcional por área ('sala' | 'bodega'); sin filtro devuelve todos.
    const area = (req.query.area === 'sala' || req.query.area === 'bodega') ? req.query.area : null;
    const { rows } = await db.query(
      `SELECT usu_id, usu_nombre, usu_area FROM usuarios
        WHERE (? IS NULL OR usu_area = ?) ORDER BY usu_nombre`,
      [area, area]
    );
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
          AND pro_activo = 1
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

// El esquema de la base analítica fue cambiando entre versiones y no todas las
// copias están al día (fact_mermas renombró id_producto → pro_codigo_plu, igual
// que fact_stock_diario en la migración 010; fact_ventas sumó después la columna
// unidad_negocio_historica). Para que el export funcione contra cualquiera de las
// dos, las diferencias se detectan una vez contra information_schema y se cachean.
const _colsAnalitica = new Map();
async function columnasDe(tabla) {
  if (_colsAnalitica.has(tabla)) return _colsAnalitica.get(tabla);
  const { rows } = await db.query(
    `SELECT COLUMN_NAME AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = 'db_analitica_supermercado' AND TABLE_NAME = ?`,
    [tabla]
  );
  const set = new Set(rows.map((r) => r.c));
  _colsAnalitica.set(tabla, set);
  return set;
}
const columnaPluMermas = async () =>
  (await columnasDe('fact_mermas')).has('pro_codigo_plu') ? 'pro_codigo_plu' : 'id_producto';

// GET /api/admin/export
// Exporta el consolidado de lo ELABORADO (pedido) por departamento y lo cruza con
// las VENTAS y MERMAS reales de la base analítica, más esas mismas ventanas un año
// antes para comparar.
//
// Las tres ventanas son INDEPENDIENTES (fecha_*, vta_*, mer_*): lo que se elabora un
// día no se vende necesariamente ese mismo día, porque una venta de esa fecha puede
// estar saliendo de stock anterior. Si solo se envía fecha_*, las otras dos la copian.
//
// Notas de negocio:
//  · Teja Food (1347 Local / 2347 Sala) vende los MISMOS PLU en dos cajas; las
//    ventas se separan por unidad_negocio igual que en actualizarDemandaDesdeVentas.
//  · fact_mermas NO tiene unidad_negocio: la merma es por PLU y no se puede
//    separar por caja, así que en esos dos deptos se muestra la merma total del PLU.
async function exportarExcel(req, res) {
  try {
    const { dep_id, fecha_ini, fecha_fin, vta_ini, vta_fin, mer_ini, mer_fin } = req.query;

    // Rango obligatorio para poder cruzar con ventas/mermas. Si no viene, se usa
    // AYER: la base analítica carga las ventas con un día de desfase, así que un
    // export de "hoy" saldría siempre sin ventas ni mermas.
    const ayerStr = () => {
      const d = new Date(), p = (n) => String(n).padStart(2, '0');
      d.setDate(d.getDate() - 1);
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
    // Ventana de lo ELABORADO (las revisiones).
    const fIni = esFecha(fecha_ini) ? fecha_ini : ayerStr();
    const fFin = esFecha(fecha_fin) ? fecha_fin : fIni;
    // Ventanas de VENTAS y MERMAS: independientes de la anterior. Lo elaborado un día
    // no se vende necesariamente ese mismo día (lo que se vende puede salir de stock
    // anterior), así que el usuario puede desfasarlas. Si no se envían, se usan las
    // mismas fechas de lo elaborado, que era el comportamiento previo.
    const vIni = esFecha(vta_ini) ? vta_ini : fIni;
    const vFin = esFecha(vta_fin) ? vta_fin : fFin;
    const mIni = esFecha(mer_ini) ? mer_ini : fIni;
    const mFin = esFecha(mer_fin) ? mer_fin : fFin;
    // id_fecha de la base analítica es un entero YYYYMMDD.
    const aId   = (s) => Number(s.replace(/-/g, ''));
    const unAno = (s) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
    // Cada bloque compara contra SU propia ventana corrida un año atrás.
    const [vIniAct, vFinAct] = [aId(vIni), aId(vFin)];
    const [vIniAnt, vFinAnt] = [aId(unAno(vIni)), aId(unAno(vFin))];
    const [mIniAct, mFinAct] = [aId(mIni), aId(mFin)];
    const [mIniAnt, mFinAnt] = [aId(unAno(mIni)), aId(unAno(mFin))];

    // Nombre del departamento para el archivo y la hoja Info. Se consulta aparte
    // (y no se toma de los pedidos) para que salga bien aunque el período no tenga
    // ninguna revisión.
    let nombreDep = 'Todos';
    if (dep_id) {
      const { rows: d } = await db.query('SELECT dep_nombre FROM departamentos WHERE dep_id = ?', [dep_id]);
      nombreDep = d[0]?.dep_nombre || String(dep_id);
    }

    // 1) Lo pedido: una fila por departamento + producto (consolidado del rango).
    const { rows: pedidos } = await db.query(
      `SELECT r.dep_id, d.dep_nombre, dr.pro_codigo_plu,
              p.pro_codigo_barra, p.pro_nombre_producto,
              SUM(COALESCE(dr.det_cantidad_pedir, 0)) AS pedido,
              COUNT(DISTINCT r.rev_id) AS folios
         FROM revisiones r
         JOIN departamentos d     ON d.dep_id = r.dep_id
         JOIN detalle_revision dr ON dr.rev_id = r.rev_id
         JOIN productos p         ON p.pro_codigo_plu = dr.pro_codigo_plu AND p.dep_id = r.dep_id
        WHERE r.rev_estado = 'completada'
          AND COALESCE(dr.det_cantidad_pedir, 0) > 0
          AND (? IS NULL OR r.dep_id = ?)
          AND DATE(r.rev_fecha) >= ? AND DATE(r.rev_fecha) <= ?
        GROUP BY r.dep_id, d.dep_nombre, dr.pro_codigo_plu, p.pro_codigo_barra, p.pro_nombre_producto
        ORDER BY d.dep_nombre, p.pro_nombre_producto`,
      [dep_id || null, dep_id || null, fIni, fFin]
    );

    // 2) Ventas y mermas de ambos períodos (agregadas por PLU en la base analítica).
    const ventasDe = async (desde, hasta) => {
      const { rows } = await db.query(
        `SELECT fv.pro_codigo_plu AS plu, fv.unidad_negocio AS un,
                SUM(fv.cantidad_unidades) AS unid, SUM(fv.venta_neta) AS monto
           FROM db_analitica_supermercado.fact_ventas fv
          WHERE fv.id_fecha >= ? AND fv.id_fecha <= ?
          GROUP BY fv.pro_codigo_plu, fv.unidad_negocio`,
        [desde, hasta]
      );
      // Mapa plu -> { unid, monto, porUnidad: { 'TEJA FOOD SALA': { unid, monto } } }
      const m = new Map();
      for (const r of rows) {
        const k = String(r.plu);
        if (!m.has(k)) m.set(k, { unid: 0, monto: 0, porUnidad: {} });
        const e = m.get(k);
        const unid = Number(r.unid) || 0, monto = Number(r.monto) || 0;
        e.unid += unid; e.monto += monto;
        const un = r.un || '';
        if (!e.porUnidad[un]) e.porUnidad[un] = { unid: 0, monto: 0 };
        e.porUnidad[un].unid += unid; e.porUnidad[un].monto += monto;
      }
      return m;
    };
    const colPlu = await columnaPluMermas(); // nombre validado contra una lista fija
    const mermasDe = async (desde, hasta) => {
      const { rows } = await db.query(
        `SELECT ${colPlu} AS plu,
                SUM(unidades_mermadas) AS unid, SUM(costo_total_merma) AS costo
           FROM db_analitica_supermercado.fact_mermas
          WHERE id_fecha >= ? AND id_fecha <= ?
          GROUP BY ${colPlu}`,
        [desde, hasta]
      );
      return new Map(rows.map((r) => [String(r.plu), { unid: Number(r.unid) || 0, monto: Number(r.costo) || 0 }]));
    };

    const [vAct, vAnt, mAct, mAnt] = await Promise.all([
      ventasDe(vIniAct, vFinAct), ventasDe(vIniAnt, vFinAnt),
      mermasDe(mIniAct, mFinAct), mermasDe(mIniAnt, mFinAnt),
    ]);

    // Teja Food: la venta del depto es solo la de SU caja.
    const ventaDe = (mapa, plu, depId) => {
      const e = mapa.get(String(plu));
      if (!e) return { unid: 0, monto: 0 };
      const un = TEJAFOOD_UNIDAD[depId];
      return un ? (e.porUnidad[un] || { unid: 0, monto: 0 }) : { unid: e.unid, monto: e.monto };
    };
    // Venta consolidada de Teja Food: suma de TODAS sus cajas ('TEJA FOOD SALA' y
    // 'TEJA FOOD TIENDA'). Antes del 26-11-2025 existía una sola, así que para el
    // período del año anterior esto devuelve justamente el total sin separar.
    // No se usa unidad_negocio_historica porque varios PLU de Teja Food la tienen
    // como 'FABRICACION PROPIA' y quedarían fuera del consolidado.
    // Ojo: 'TIENDA TEJA FOOD' es otra unidad de negocio distinta y no entra acá.
    const ventaConsolidadaTF = (mapa, plu) =>
      Object.entries(mapa.get(String(plu))?.porUnidad || {})
        .filter(([un]) => un.startsWith('TEJA FOOD'))
        .reduce((a, [, v]) => ({ unid: a.unid + v.unid, monto: a.monto + v.monto }), { unid: 0, monto: 0 });
    const mermaDe = (mapa, plu) => mapa.get(String(plu)) || { unid: 0, monto: 0 };
    const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
    const esTejaFood = (depId) => TEJAFOOD_DEPS.includes(String(depId));

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Consolidado');

    ws.columns = [
      { header: 'Departamento',      key: 'dep_nombre',   width: 18 },
      { header: 'PLU',               key: 'plu',          width: 12 },
      { header: 'Código Barra',      key: 'barra',        width: 16 },
      { header: 'Producto',          key: 'producto',     width: 40 },
      { header: 'Pedido (unid)',     key: 'pedido',       width: 14 },
      { header: 'Folios',            key: 'folios',       width: 9  },
      { header: 'Venta (unid)',      key: 'vta_unid',     width: 13 },
      { header: 'Venta ($)',         key: 'vta_monto',    width: 14 },
      { header: 'Merma (unid)',      key: 'mer_unid',     width: 13 },
      { header: 'Merma ($)',         key: 'mer_monto',    width: 14 },
      { header: 'Pedido − Venta',    key: 'dif',          width: 14 },
      { header: 'Venta unid (AA)',   key: 'vta_unid_aa',  width: 15 },
      { header: 'Venta $ (AA)',      key: 'vta_monto_aa', width: 15 },
      { header: 'Merma unid (AA)',   key: 'mer_unid_aa',  width: 15 },
      { header: 'Merma $ (AA)',      key: 'mer_monto_aa', width: 15 },
      { header: 'Var. venta unid %', key: 'var_pct',      width: 17 },
    ];

    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: 'P1' };

    const tot = { pedido: 0, vta_unid: 0, vta_monto: 0, mer_unid: 0, mer_monto: 0,
                  vta_unid_aa: 0, vta_monto_aa: 0, mer_unid_aa: 0, mer_monto_aa: 0 };
    // PLU de Teja Food pedidos en el período: su venta del año anterior no existe
    // separada por caja, así que va aparte (consolidada) al final de la planilla.
    const plusTejaFood = new Set();

    pedidos.forEach((l) => {
      const va = ventaDe(vAct, l.pro_codigo_plu, l.dep_id);
      const ma = mermaDe(mAct, l.pro_codigo_plu);
      const mb = mermaDe(mAnt, l.pro_codigo_plu);
      const pedido = Number(l.pedido) || 0;

      // Teja Food: la separación por caja (TEJA FOOD SALA / TEJA FOOD TIENDA) recién
      // existe desde el 26-11-2025. Antes todo entraba consolidado como 'TEJA FOOD',
      // así que la venta del año anterior NO se puede atribuir a una caja: se deja en
      // blanco y el consolidado se informa en una fila aparte.
      const tf = esTejaFood(l.dep_id);
      const vb = tf ? null : ventaDe(vAnt, l.pro_codigo_plu, l.dep_id);
      if (tf) plusTejaFood.add(String(l.pro_codigo_plu));

      ws.addRow({
        dep_nombre:   l.dep_nombre,
        plu:          l.pro_codigo_plu,
        barra:        l.pro_codigo_barra || '',
        producto:     l.pro_nombre_producto,
        pedido,
        folios:       l.folios,
        vta_unid:     r2(va.unid),
        vta_monto:    r2(va.monto),
        mer_unid:     r2(ma.unid),
        mer_monto:    r2(ma.monto),
        dif:          r2(pedido - va.unid),
        // Venta del año anterior: en blanco para Teja Food (ver nota de arriba).
        vta_unid_aa:  vb ? r2(vb.unid)  : null,
        vta_monto_aa: vb ? r2(vb.monto) : null,
        // La merma siempre va consolidada por PLU: fact_mermas no distingue la caja.
        mer_unid_aa:  r2(mb.unid),
        mer_monto_aa: r2(mb.monto),
        var_pct:      vb && vb.unid > 0 ? r2(((va.unid - vb.unid) / vb.unid) * 100) : null,
      });

      tot.pedido      += pedido;
      tot.vta_unid    += va.unid;  tot.vta_monto    += va.monto;
      tot.mer_unid    += ma.unid;  tot.mer_monto    += ma.monto;
      tot.mer_unid_aa += mb.unid;  tot.mer_monto_aa += mb.monto;
      if (vb) { tot.vta_unid_aa += vb.unid; tot.vta_monto_aa += vb.monto; }
    });

    // Fila de totales
    const filaTot = ws.addRow({
      dep_nombre: 'TOTAL', pedido: r2(tot.pedido),
      vta_unid: r2(tot.vta_unid), vta_monto: r2(tot.vta_monto),
      mer_unid: r2(tot.mer_unid), mer_monto: r2(tot.mer_monto),
      dif: r2(tot.pedido - tot.vta_unid),
      vta_unid_aa: r2(tot.vta_unid_aa), vta_monto_aa: r2(tot.vta_monto_aa),
      mer_unid_aa: r2(tot.mer_unid_aa), mer_monto_aa: r2(tot.mer_monto_aa),
      var_pct: tot.vta_unid_aa > 0 ? r2(((tot.vta_unid - tot.vta_unid_aa) / tot.vta_unid_aa) * 100) : null,
    });
    filaTot.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
    });

    // Fila aparte con la venta consolidada de Teja Food del año anterior, que es el
    // único dato que existe para ese período (sin separar por caja). Va fuera del
    // TOTAL para no mezclarla con las cifras por departamento.
    if (plusTejaFood.size) {
      let unid = 0, monto = 0;
      for (const plu of plusTejaFood) {
        const v = ventaConsolidadaTF(vAnt, plu);
        unid += v.unid; monto += v.monto;
      }
      ws.addRow({});
      const filaTF = ws.addRow({
        dep_nombre: 'TEJA FOOD (consolidado)',
        producto:   `Venta del año anterior sin separar por caja · ${plusTejaFood.size} PLU pedidos`,
        vta_unid_aa: r2(unid),
        vta_monto_aa: r2(monto),
      });
      filaTF.eachCell((cell) => {
        cell.font = { bold: true, italic: true, color: { argb: 'FF7C2D12' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
      });
    }

    // Formatos numéricos (unidades · pesos · porcentaje)
    ['E', 'G', 'I', 'K', 'L', 'N'].forEach((c) => { ws.getColumn(c).numFmt = '#,##0.00'; });
    ['H', 'J', 'M', 'O'].forEach((c) => { ws.getColumn(c).numFmt = '$#,##0'; });
    ws.getColumn('P').numFmt = '0.0"%"';

    // Hoja con el detalle de qué se está mirando (evita dudas al compartir el archivo).
    const info = wb.addWorksheet('Info');
    info.columns = [{ header: 'Campo', key: 'k', width: 26 }, { header: 'Valor', key: 'v', width: 70 }];
    info.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    });
    [
      ['Período elaborado',    `${fIni} a ${fFin}`],
      ['Período ventas',       `${vIni} a ${vFin}${vIni === fIni && vFin === fFin ? '  (mismas fechas de lo elaborado)' : '  (desfasado a propósito)'}`],
      ['Período mermas',       `${mIni} a ${mFin}${mIni === fIni && mFin === fFin ? '  (mismas fechas de lo elaborado)' : '  (desfasado a propósito)'}`],
      ['Ventas año anterior',  `${unAno(vIni)} a ${unAno(vFin)}  (mismas fechas, un año antes)`],
      ['Mermas año anterior',  `${unAno(mIni)} a ${unAno(mFin)}  (mismas fechas, un año antes)`],
      ['Departamento',         nombreDep],
      ['Productos',            pedidos.length],
      ['Pedido',               'Suma de cantidades pedidas en revisiones completadas del período elaborado.'],
      ['Por qué 3 períodos',   'Lo elaborado un día no se vende necesariamente ese mismo día: una venta del mismo día puede salir de stock anterior. Por eso las ventanas de venta y merma se pueden correr respecto de la de elaboración.'],
      ['Venta',                'fact_ventas: unidades y venta neta ($).'],
      ['Merma',                'fact_mermas: unidades mermadas y costo total ($).'],
      ['Teja Food · venta',    'La venta del período se separa por caja (Local = TEJA FOOD TIENDA · Sala = TEJA FOOD SALA). Esa separación recién existe desde el 26-11-2025: antes todo se registraba consolidado como TEJA FOOD. Por eso las columnas de venta del AÑO ANTERIOR van en BLANCO para esos dos departamentos, y el consolidado se informa en una fila aparte al final de la planilla, fuera del TOTAL.'],
      ['Teja Food · merma',    'La merma va consolidada por PLU en los dos períodos: fact_mermas no distingue la caja. En un export de "Todos" esa merma aparece en Local y en Sala, así que la fila TOTAL la cuenta dos veces para esos productos.'],
      ['Generado',             new Date().toLocaleString('es-CL')],
    ].forEach(([k, v]) => info.addRow({ k, v }));
    info.getColumn('v').alignment = { wrapText: true, vertical: 'top' };

    const buffer = await wb.xlsx.writeBuffer();
    // Nombre de archivo con el departamento para distinguir un export de otro.
    // Se limpian tildes y caracteres raros porque el header HTTP es ASCII.
    const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'depto';
    const nombreArchivo = `consolidado_${slug(nombreDep)}_${fIni}_${fFin}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}`);
    res.send(buffer);
  } catch (err) {
    console.error('[exportarExcel]', err.message);
    res.status(500).json({ error: err.message });
  }
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
              pro_dias_elaboracion, pro_cantidad_minima, pro_activo
         FROM productos WHERE dep_id = ?
        ORDER BY pro_activo DESC, pro_nombre_producto`,
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
        demandaTotalRequerida: calc.demandaTotalRequerida,
        // Días efectivos usados en el cálculo y el default del departamento. El panel
        // Maestro los necesita para recalcular la demanda en vivo mientras se edita
        // (y para despejar la venta diaria cuando se escribe la demanda total).
        diasProdEfectivo: calc.diasProdEfectivo,
        diasSegEfectivo:  calc.diasSegEfectivo,
        dias_produccion_semana: config?.dias_produccion_semana ?? 6,
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

// POST /api/admin/master-productos/activar  { dep_id, plus: [...], activo: 0|1 }
// Activa o desactiva productos en lote. Los desactivados no aparecen en el
// escaneo de sala del operador, pero siguen en la base (se pueden reactivar).
async function activarProductosBulk(req, res) {
  try {
    const { dep_id, plus, activo } = req.body;
    if (!dep_id || !Array.isArray(plus) || plus.length === 0) return res.status(400).json({ error: 'Datos inválidos' });
    const val = (activo === 0 || activo === false || activo === '0') ? 0 : 1;
    const placeholders = plus.map(() => '?').join(',');
    const { rows } = await db.query(
      `UPDATE productos SET pro_activo = ? WHERE dep_id = ? AND pro_codigo_plu IN (${placeholders})`,
      [val, dep_id, ...plus]
    );
    res.json({ ok: true, activo: val, afectados: rows.affectedRows });
  } catch (err) {
    console.error('[activarProductosBulk]', err.message);
    res.status(500).json({ error: 'No se pudo cambiar el estado de los productos' });
  }
}

// POST /api/admin/master-productos/mover  { dep_origen, dep_destino, plus: [...] }
// Mueve productos de un departamento a otro (cambia su dep_id). Sirve cuando un
// producto quedó en un depto que ya no le corresponde y lo siguen pidiendo ahí.
// El historial de revisiones NO se toca (queda asociado al depto viejo vía la
// revisión); a futuro el producto aparece bajo el nuevo depto.
// Si un PLU ya existe en el destino, se OMITE (no se pisa) y se informa.
async function moverProductosBulk(req, res) {
  let connection;
  try {
    const { dep_origen, dep_destino, plus } = req.body;
    if (!dep_origen || !dep_destino || !Array.isArray(plus) || plus.length === 0) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    if (String(dep_origen) === String(dep_destino)) {
      return res.status(400).json({ error: 'El departamento de origen y destino no pueden ser el mismo' });
    }

    // Validar que el destino exista.
    const { rows: dep } = await db.query('SELECT dep_id FROM departamentos WHERE dep_id = ?', [dep_destino]);
    if (!dep.length) return res.status(400).json({ error: 'El departamento destino no existe' });

    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const ph = plus.map(() => '?').join(',');

    // PLUs que YA existen en el destino → se omiten para no chocar con la PK.
    const [yaEnDestino] = await connection.query(
      `SELECT pro_codigo_plu FROM productos WHERE dep_id = ? AND pro_codigo_plu IN (${ph})`,
      [dep_destino, ...plus]
    );
    const omitidos = yaEnDestino.map((r) => r.pro_codigo_plu);
    const omitidosSet = new Set(omitidos);
    const aMover = plus.filter((p) => !omitidosSet.has(p));

    let movidos = 0;
    if (aMover.length) {
      const phMover = aMover.map(() => '?').join(',');
      const [r] = await connection.query(
        `UPDATE productos SET dep_id = ? WHERE dep_id = ? AND pro_codigo_plu IN (${phMover})`,
        [dep_destino, dep_origen, ...aMover]
      );
      movidos = r.affectedRows;
    }

    await connection.commit();
    res.json({ ok: true, movidos, omitidos });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('[moverProductosBulk]', err.message);
    res.status(500).json({ error: 'No se pudieron mover los productos' });
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
    const area = (req.body.usu_area === 'bodega') ? 'bodega' : 'sala';
    await db.query(`INSERT INTO usuarios (usu_nombre, usu_area) VALUES (?, ?)`, [usu_nombre, area]);
    res.status(201).json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}

// PUT /api/admin/usuarios/:id
async function actualizarUsuario(req, res) {
  try {
    const { usu_nombre } = req.body;
    if (!usu_nombre) return res.status(400).json({ error: 'Nombre requerido' });
    const area = (req.body.usu_area === 'bodega' || req.body.usu_area === 'sala') ? req.body.usu_area : null;
    await db.query(
      `UPDATE usuarios SET usu_nombre = ?, usu_area = COALESCE(?, usu_area) WHERE usu_id = ?`,
      [usu_nombre, area, req.params.id]
    );
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

// POST /api/admin/actualizar-demanda-ventas  { dias?, dep_id? }
// Recalcula vta_total_periodo de los productos con las ventas reales de los
// últimos N días (base analítica db_analitica_supermercado.fact_ventas) y fija
// dias_historial = N. Productos sin ventas en el período → 0. Reemplaza la
// carga manual por CSV. Actualiza todos los departamentos (o uno si viene dep_id).
// Teja Food: Local (1347) y Sala (2347) venden los MISMOS productos; se
// diferencian por la caja → unidad_negocio de la venta. Se separan así:
//   1347 Local → 'TEJA FOOD TIENDA'   ·   2347 Sala → 'TEJA FOOD SALA'
const TEJAFOOD_UNIDAD = { '1347': 'TEJA FOOD TIENDA', '2347': 'TEJA FOOD SALA' };
const TEJAFOOD_DEPS = Object.keys(TEJAFOOD_UNIDAD);

async function actualizarDemandaDesdeVentas(req, res) {
  try {
    let dias = parseInt(req.body?.dias, 10);
    if (!Number.isFinite(dias) || dias < 1 || dias > 365) dias = 30;
    const depId = (req.body?.dep_id && String(req.body.dep_id).trim()) || null;
    const agregarNuevos = req.body?.agregar_nuevos === true || req.body?.agregar_nuevos === 'true' || req.body?.agregar_nuevos === 1;
    let afectados = 0, agregados = 0;

    // 1) Departamentos normales (todos menos Teja Food): suma TODAS las ventas del PLU.
    if (!depId || !TEJAFOOD_DEPS.includes(depId)) {
      const { rows: r1 } = await db.query(
        `UPDATE productos p
           LEFT JOIN (
             SELECT fv.pro_codigo_plu, SUM(fv.cantidad_unidades) AS u
               FROM db_analitica_supermercado.fact_ventas fv
              WHERE fv.id_fecha >= CAST(DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y%m%d') AS UNSIGNED)
                AND fv.id_fecha < CAST(DATE_FORMAT(CURDATE(), '%Y%m%d') AS UNSIGNED)
              GROUP BY fv.pro_codigo_plu
           ) v ON CAST(v.pro_codigo_plu AS CHAR) COLLATE utf8mb4_unicode_ci = p.pro_codigo_plu
            SET p.vta_total_periodo = ROUND(COALESCE(v.u, 0), 2), p.dias_historial = ?
          WHERE p.dep_id NOT IN ('1347','2347') AND (? IS NULL OR p.dep_id = ?)`,
        [dias, dias, depId, depId]
      );
      afectados += r1.affectedRows;
    }

    // 2) Teja Food (1347/2347): separa las ventas por unidad_negocio según el depto.
    if (!depId || TEJAFOOD_DEPS.includes(depId)) {
      const { rows: r2 } = await db.query(
        `UPDATE productos p
           LEFT JOIN (
             SELECT fv.pro_codigo_plu, fv.unidad_negocio, SUM(fv.cantidad_unidades) AS u
               FROM db_analitica_supermercado.fact_ventas fv
              WHERE fv.id_fecha >= CAST(DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y%m%d') AS UNSIGNED)
                AND fv.id_fecha < CAST(DATE_FORMAT(CURDATE(), '%Y%m%d') AS UNSIGNED)
                AND fv.unidad_negocio IN ('TEJA FOOD TIENDA','TEJA FOOD SALA')
              GROUP BY fv.pro_codigo_plu, fv.unidad_negocio
           ) v ON CAST(v.pro_codigo_plu AS CHAR) COLLATE utf8mb4_unicode_ci = p.pro_codigo_plu
              AND v.unidad_negocio = CASE p.dep_id WHEN '1347' THEN 'TEJA FOOD TIENDA' WHEN '2347' THEN 'TEJA FOOD SALA' END
            SET p.vta_total_periodo = ROUND(COALESCE(v.u, 0), 2), p.dias_historial = ?
          WHERE p.dep_id IN ('1347','2347') AND (? IS NULL OR p.dep_id = ?)`,
        [dias, dias, depId, depId]
      );
      afectados += r2.affectedRows;
    }

    // 3) (Opcional) Agregar productos NUEVOS vendidos que no están en el catálogo.
    //    - Deptos normales: se asigna por nombre (dim_productos.dep_nombre → demanda).
    //    - Teja Food: se asigna por la CAJA de venta (unidad_negocio):
    //        TIENDA → Local (1347) · SALA → Sala (2347). Si vende en ambas, se crea en las dos.
    if (agregarNuevos) {
      const { rows: ins } = await db.query(
        `INSERT IGNORE INTO productos (pro_codigo_plu, pro_codigo_barra, pro_nombre_producto, vta_total_periodo, dias_historial, dep_id)
         SELECT CAST(v.pro_codigo_plu AS CHAR), dp.pro_codigo_barra, dp.pro_nombre_producto, ROUND(v.u, 2), ?, d.dep_id
           FROM (
             SELECT fv.pro_codigo_plu, SUM(fv.cantidad_unidades) AS u
               FROM db_analitica_supermercado.fact_ventas fv
              WHERE fv.id_fecha >= CAST(DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y%m%d') AS UNSIGNED)
                AND fv.id_fecha < CAST(DATE_FORMAT(CURDATE(), '%Y%m%d') AS UNSIGNED)
                AND fv.pro_codigo_plu IS NOT NULL
              GROUP BY fv.pro_codigo_plu
           ) v
           JOIN db_analitica_supermercado.dim_productos dp ON dp.pro_codigo_plu = v.pro_codigo_plu
           JOIN departamentos d ON d.dep_nombre COLLATE utf8mb4_0900_ai_ci = dp.dep_nombre COLLATE utf8mb4_0900_ai_ci
           LEFT JOIN productos p2 ON CAST(v.pro_codigo_plu AS CHAR) COLLATE utf8mb4_unicode_ci = p2.pro_codigo_plu AND p2.dep_id = d.dep_id
          WHERE p2.pro_codigo_plu IS NULL
            AND d.dep_id NOT IN ('1347','2347')
            AND (? IS NULL OR d.dep_id = ?)`,
        [dias, dias, depId, depId]
      );
      agregados += ins.affectedRows;

      // 3b) Teja Food: los nuevos se asignan por la CAJA de venta (unidad_negocio).
      //     TIENDA → Local (1347) · SALA → Sala (2347). Vendido en ambas → se crea en las dos.
      const { rows: insTF } = await db.query(
        `INSERT IGNORE INTO productos (pro_codigo_plu, pro_codigo_barra, pro_nombre_producto, vta_total_periodo, dias_historial, dep_id)
         SELECT CAST(v.pro_codigo_plu AS CHAR), dp.pro_codigo_barra, dp.pro_nombre_producto, ROUND(v.u, 2), ?,
                CASE v.unidad_negocio WHEN 'TEJA FOOD TIENDA' THEN '1347' WHEN 'TEJA FOOD SALA' THEN '2347' END
           FROM (
             SELECT fv.pro_codigo_plu, fv.unidad_negocio, SUM(fv.cantidad_unidades) AS u
               FROM db_analitica_supermercado.fact_ventas fv
              WHERE fv.id_fecha >= CAST(DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y%m%d') AS UNSIGNED)
                AND fv.id_fecha < CAST(DATE_FORMAT(CURDATE(), '%Y%m%d') AS UNSIGNED)
                AND fv.pro_codigo_plu IS NOT NULL
                AND fv.unidad_negocio IN ('TEJA FOOD TIENDA','TEJA FOOD SALA')
              GROUP BY fv.pro_codigo_plu, fv.unidad_negocio
           ) v
           JOIN db_analitica_supermercado.dim_productos dp ON dp.pro_codigo_plu = v.pro_codigo_plu
           LEFT JOIN productos p2 ON CAST(v.pro_codigo_plu AS CHAR) COLLATE utf8mb4_unicode_ci = p2.pro_codigo_plu
              AND p2.dep_id = CASE v.unidad_negocio WHEN 'TEJA FOOD TIENDA' THEN '1347' WHEN 'TEJA FOOD SALA' THEN '2347' END
          WHERE p2.pro_codigo_plu IS NULL
            AND (? IS NULL OR ? = CASE v.unidad_negocio WHEN 'TEJA FOOD TIENDA' THEN '1347' WHEN 'TEJA FOOD SALA' THEN '2347' END)`,
        [dias, dias, depId, depId]
      );
      agregados += insTF.affectedRows;
    }

    const { rows } = await db.query(
      `SELECT COUNT(*) AS total, SUM(vta_total_periodo > 0) AS con_venta
         FROM productos WHERE (? IS NULL OR dep_id = ?)`,
      [depId, depId]
    );
    const total = Number(rows[0].total) || 0;
    const conVenta = Number(rows[0].con_venta) || 0;
    res.json({ ok: true, dias, productos: total, con_venta: conVenta, en_cero: total - conVenta, afectados, agregados });
  } catch (err) {
    console.error('[actualizarDemandaDesdeVentas]', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la demanda desde ventas: ' + err.message });
  }
}

// POST /api/admin/actualizar-demanda-ventas-producto  { plu, dep_id, dias? }
// Igual que la masiva, pero recalcula la venta de UN solo producto con su propia
// ventana de días. Respeta la separación de Teja Food por caja (unidad_negocio).
// Producto sin ventas en el período → queda en 0.
async function actualizarDemandaVentasProducto(req, res) {
  try {
    const plu = String(req.body?.plu || '').trim();
    const depId = String(req.body?.dep_id || '').trim();
    let dias = parseInt(req.body?.dias, 10);
    if (!plu || !depId) return res.status(400).json({ error: 'plu y dep_id requeridos' });
    if (!Number.isFinite(dias) || dias < 1 || dias > 365) dias = 30;

    // Verificar que el producto exista en ese departamento.
    const { rows: prod } = await db.query(
      'SELECT pro_nombre_producto FROM productos WHERE pro_codigo_plu = ? AND dep_id = ?',
      [plu, depId]
    );
    if (!prod.length) return res.status(404).json({ error: 'El producto no existe en ese departamento' });

    if (TEJAFOOD_DEPS.includes(depId)) {
      // Teja Food: separa por la caja de venta según el depto.
      await db.query(
        `UPDATE productos p
           LEFT JOIN (
             SELECT fv.pro_codigo_plu, fv.unidad_negocio, SUM(fv.cantidad_unidades) AS u
               FROM db_analitica_supermercado.fact_ventas fv
              WHERE fv.id_fecha >= CAST(DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y%m%d') AS UNSIGNED)
                AND fv.id_fecha < CAST(DATE_FORMAT(CURDATE(), '%Y%m%d') AS UNSIGNED)
                AND fv.unidad_negocio IN ('TEJA FOOD TIENDA','TEJA FOOD SALA')
                AND CAST(fv.pro_codigo_plu AS CHAR) COLLATE utf8mb4_unicode_ci = ?
              GROUP BY fv.pro_codigo_plu, fv.unidad_negocio
           ) v ON CAST(v.pro_codigo_plu AS CHAR) COLLATE utf8mb4_unicode_ci = p.pro_codigo_plu
              AND v.unidad_negocio = CASE p.dep_id WHEN '1347' THEN 'TEJA FOOD TIENDA' WHEN '2347' THEN 'TEJA FOOD SALA' END
            SET p.vta_total_periodo = ROUND(COALESCE(v.u, 0), 2), p.dias_historial = ?
          WHERE p.dep_id = ? AND p.pro_codigo_plu = ?`,
        [dias, plu, dias, depId, plu]
      );
    } else {
      // Departamento normal: suma todas las ventas del PLU.
      await db.query(
        `UPDATE productos p
           LEFT JOIN (
             SELECT fv.pro_codigo_plu, SUM(fv.cantidad_unidades) AS u
               FROM db_analitica_supermercado.fact_ventas fv
              WHERE fv.id_fecha >= CAST(DATE_FORMAT(CURDATE() - INTERVAL ? DAY, '%Y%m%d') AS UNSIGNED)
                AND fv.id_fecha < CAST(DATE_FORMAT(CURDATE(), '%Y%m%d') AS UNSIGNED)
                AND CAST(fv.pro_codigo_plu AS CHAR) COLLATE utf8mb4_unicode_ci = ?
              GROUP BY fv.pro_codigo_plu
           ) v ON CAST(v.pro_codigo_plu AS CHAR) COLLATE utf8mb4_unicode_ci = p.pro_codigo_plu
            SET p.vta_total_periodo = ROUND(COALESCE(v.u, 0), 2), p.dias_historial = ?
          WHERE p.dep_id = ? AND p.pro_codigo_plu = ?`,
        [dias, plu, dias, depId, plu]
      );
    }

    // Leer el resultado para devolverlo.
    const { rows: after } = await db.query(
      'SELECT vta_total_periodo, dias_historial FROM productos WHERE pro_codigo_plu = ? AND dep_id = ?',
      [plu, depId]
    );
    res.json({
      ok: true,
      plu, dep_id: depId,
      nombre: prod[0].pro_nombre_producto,
      vta_total_periodo: Number(after[0]?.vta_total_periodo ?? 0),
      dias,
    });
  } catch (err) {
    console.error('[actualizarDemandaVentasProducto]', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la venta del producto: ' + err.message });
  }
}

module.exports = {
  listarDepartamentos, crearDepartamento, actualizarDepartamento,
  listarUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario,
  obtenerConfig, actualizarConfig,
  subirCSV, actualizarDemandaDesdeVentas, actualizarDemandaVentasProducto,
  buscarProductos, listarProductosPorCategoria, obtenerProducto, actualizarProducto, exportarExcel,
  listarClasificacion, clasificarBulk,
  obtenerMasterProductos, actualizarMasterProductosBulk, eliminarMasterProductosBulk, activarProductosBulk, moverProductosBulk, exportarMasterExcel
};
