const db = require('../config/db');
const { enviarReporteTurnoInfaltables, generarExcelResumenInfaltables } = require('../services/EmailService');

const JORNADAS = ['am', 'pm', 'ambos'];

// Venta diaria segura (mismo criterio que el motor de demanda)
function ventaDiaria(vta, dias) {
  const v = Number(vta), d = Number(dias);
  if (!Number.isFinite(v) || !Number.isFinite(d) || d <= 0) return 0;
  return Math.round((v / d) * 100) / 100;
}

// Validación simple de lista de correos separados por coma/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validarEmails(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return { ok: true, lista: [] };
  const lista = String(raw).split(/[,;]/).map((e) => e.trim()).filter(Boolean);
  const invalido = lista.find((e) => !EMAIL_RE.test(e));
  if (invalido) return { ok: false, invalido };
  return { ok: true, lista };
}

/**
 * Turno actual según la hora de Chile (America/Santiago = Valdivia).
 * Corte a las 12:00: antes = 'am', desde las 12:00 = 'pm'.
 */
function turnoActual() {
  const horaStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago', hour: '2-digit', hour12: false,
  }).format(new Date());
  const h = parseInt(horaStr, 10);
  return (Number.isFinite(h) && h < 12) ? 'am' : 'pm';
}

// GET /api/infaltables/turno-actual  → para que el front sepa el turno por defecto
function obtenerTurnoActual(_req, res) {
  res.json({ turno: turnoActual() });
}

// GET /api/infaltables/departamentos?turno=am|pm
// Departamentos que tienen al menos un producto infaltable con esa jornada.
async function listarDepartamentosTurno(req, res) {
  try {
    const turno = (req.query.turno === 'am' || req.query.turno === 'pm') ? req.query.turno : turnoActual();
    const { rows } = await db.query(
      `SELECT DISTINCT d.dep_id, d.dep_nombre
         FROM departamentos d
         JOIN productos p ON p.dep_id = d.dep_id
        WHERE d.dep_infaltable = 1
          AND p.pro_infaltable = 1
          AND p.pro_jornada = ?
        ORDER BY d.dep_nombre`,
      [turno]
    );
    res.json({ turno, departamentos: rows });
  } catch (err) {
    console.error('[listarDepartamentosTurno]', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los departamentos' });
  }
}

// GET /api/infaltables/jornada?dep_id=22  → productos NORMALES para asignar AM/PM/Ambos
async function listarParaJornada(req, res) {
  try {
    const { dep_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const { rows } = await db.query(
      `SELECT pro_codigo_plu, pro_nombre_producto, pro_jornada
         FROM productos
        WHERE dep_id = ? AND pro_infaltable = 1
        ORDER BY pro_nombre_producto`,
      [dep_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('[listarParaJornada]', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los productos' });
  }
}

// POST /api/infaltables/jornada/bulk  → { dep_id, cambios: [{ pro_codigo_plu, pro_jornada }] }
async function asignarJornadaBulk(req, res) {
  const { dep_id, cambios } = req.body;
  if (!dep_id || !Array.isArray(cambios) || cambios.length === 0) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  const invalido = cambios.find((c) => !c.pro_codigo_plu || !JORNADAS.includes(c.pro_jornada));
  if (invalido) return res.status(400).json({ error: 'Jornada o PLU inválido' });

  let connection;
  try {
    connection = await db.pool.getConnection();
    await connection.beginTransaction();
    for (const c of cambios) {
      await connection.query(
        `UPDATE productos SET pro_jornada = ? WHERE pro_codigo_plu = ? AND dep_id = ?`,
        [c.pro_jornada, c.pro_codigo_plu, dep_id]
      );
    }
    await connection.commit();
    res.json({ ok: true, actualizados: cambios.length });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('[asignarJornadaBulk]', err.message);
    res.status(500).json({ error: 'No se pudo guardar la jornada' });
  } finally {
    if (connection) connection.release();
  }
}

// GET /api/infaltables/checklist?dep_id=22[&turno=am|pm]
// Productos normales del turno (su jornada = turno o 'ambos') + stock de referencia.
async function obtenerChecklist(req, res) {
  try {
    const { dep_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const turno = (req.query.turno === 'am' || req.query.turno === 'pm') ? req.query.turno : turnoActual();

    const { rows } = await db.query(
      `SELECT p.pro_codigo_plu, p.pro_nombre_producto, p.pro_jornada,
              p.vta_total_periodo, p.dias_historial,
              s.stock_sala AS stock_referencia
         FROM productos p
         LEFT JOIN v_stock_externo s ON s.pro_codigo_plu = p.pro_codigo_plu
        WHERE p.dep_id = ?
          AND p.pro_infaltable = 1
          AND p.pro_jornada = ?
        ORDER BY p.pro_nombre_producto`,
      [dep_id, turno]
    );

    const productos = rows.map((r) => ({
      pro_codigo_plu: r.pro_codigo_plu,
      pro_nombre_producto: r.pro_nombre_producto,
      pro_jornada: r.pro_jornada,
      stock_referencia: r.stock_referencia,
      vta_diaria: ventaDiaria(r.vta_total_periodo, r.dias_historial),
    }));

    res.json({ turno, total: productos.length, productos });
  } catch (err) {
    console.error('[obtenerChecklist]', err.message);
    res.status(500).json({ error: 'No se pudo cargar el checklist' });
  }
}

// POST /api/infaltables/chequeo
// Body: { dep_id, usu_id, turno, items: [{ pro_codigo_plu, presente(bool), stock_referencia }] }
async function guardarChequeo(req, res) {
  const { dep_id, usu_id, turno, items } = req.body;
  if (!dep_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }
  const turnoOk = (turno === 'am' || turno === 'pm') ? turno : turnoActual();

  const total = items.length;
  const faltantes = items.filter((i) => !i.presente).length;
  const indice = total > 0 ? Math.round((faltantes / total) * 10000) / 100 : 0; // % con 2 decimales

  let connection;
  try {
    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    const [cab] = await connection.query(
      `INSERT INTO chequeo_infaltables
         (dep_id, usu_id, turno, total_infaltables, total_faltantes, indice_faltante)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [dep_id, usu_id || null, turnoOk, total, faltantes, indice]
    );
    const chkId = cab.insertId;

    for (const i of items) {
      const stock = (i.stock_referencia === null || i.stock_referencia === undefined || i.stock_referencia === '')
        ? null : Number(i.stock_referencia);
      await connection.query(
        `INSERT INTO chequeo_infaltables_detalle (chk_id, pro_codigo_plu, presente, stock_referencia)
         VALUES (?, ?, ?, ?)`,
        [chkId, i.pro_codigo_plu, i.presente ? 1 : 0, Number.isFinite(stock) ? stock : null]
      );
    }

    await connection.commit();
    connection.release();
    connection = null; // ya liberada; evita doble release en finally

    // El correo ya NO se envía aquí: cada chequeo solo se guarda. El reporte
    // consolidado del turno se manda con POST /reporte-turno (un solo correo).
    res.status(201).json({
      ok: true, chk_id: chkId, turno: turnoOk,
      total_infaltables: total, total_faltantes: faltantes, indice_faltante: indice,
    });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('[guardarChequeo]', err.message);
    res.status(500).json({ error: 'No se pudo guardar el chequeo' });
  } finally {
    if (connection) connection.release();
  }
}

// Datos del dashboard (reutilizado por el endpoint y por el correo)
async function dashboardData() {
  const { rows } = await db.query(
    `SELECT d.dep_id, d.dep_nombre,
            COALESCE(c.meta_faltante, 15) AS meta,
            ci.indice_faltante AS real_indice,
            ci.turno, ci.chk_fecha
       FROM departamentos d
       LEFT JOIN infaltables_config c ON c.dep_id = d.dep_id
       LEFT JOIN chequeo_infaltables ci ON ci.chk_id = (
          SELECT x.chk_id FROM chequeo_infaltables x
           WHERE x.dep_id = d.dep_id
           ORDER BY x.chk_fecha DESC, x.chk_id DESC LIMIT 1
       )
      ORDER BY d.dep_nombre`
  );
  return rows.map((r) => ({
    dep_id: r.dep_id,
    dep_nombre: r.dep_nombre,
    meta: Number(r.meta),
    real: r.real_indice != null ? Number(r.real_indice) : null,
    turno: r.turno || null,
    fecha: r.chk_fecha || null,
  }));
}

// GET /api/infaltables/dashboard  → por depto: índice real (último chequeo) vs meta
async function obtenerDashboard(_req, res) {
  try {
    res.json(await dashboardData());
  } catch (err) {
    console.error('[obtenerDashboard]', err.message);
    res.status(500).json({ error: 'No se pudo cargar el dashboard' });
  }
}

// POST /api/infaltables/reporte-turno  → { turno, usu_id }
// Envía UN solo correo del turno: gráfico con TODOS los departamentos de la
// jornada + Excel con los productos (faltantes/OK) de cada depto chequeado hoy.
async function enviarReporteTurno(req, res) {
  const turno = (req.body.turno === 'am' || req.body.turno === 'pm') ? req.body.turno : turnoActual();
  const usu_id = req.body.usu_id || null;
  try {
    // Departamentos infaltables de la jornada + su último chequeo de HOY para ese turno
    const { rows: deps } = await db.query(
      `SELECT d.dep_id, d.dep_nombre,
              COALESCE(c.meta_faltante, 15) AS meta,
              ci.chk_id, ci.indice_faltante, ci.chk_fecha
         FROM departamentos d
         LEFT JOIN infaltables_config c ON c.dep_id = d.dep_id
         LEFT JOIN chequeo_infaltables ci ON ci.chk_id = (
            SELECT x.chk_id FROM chequeo_infaltables x
             WHERE x.dep_id = d.dep_id AND x.turno = ? AND x.chk_fecha >= CURDATE()
             ORDER BY x.chk_fecha DESC, x.chk_id DESC LIMIT 1
         )
        WHERE d.dep_infaltable = 1
          AND EXISTS (SELECT 1 FROM productos p
                       WHERE p.dep_id = d.dep_id AND p.pro_infaltable = 1 AND p.pro_jornada = ?)
        ORDER BY d.dep_nombre`,
      [turno, turno]
    );

    if (!deps.length) return res.status(400).json({ error: `No hay departamentos infaltables en el turno ${turno.toUpperCase()}` });
    const chequeados = deps.filter((d) => d.chk_id);
    if (!chequeados.length) return res.status(400).json({ error: `Aún no se ha chequeado ningún departamento del turno ${turno.toUpperCase()} hoy` });

    // Productos de cada departamento chequeado
    const departamentos = [];
    for (const d of chequeados) {
      const { rows: prods } = await db.query(
        `SELECT det.pro_codigo_plu, p.pro_nombre_producto, det.presente, det.stock_referencia
           FROM chequeo_infaltables_detalle det
           JOIN productos p ON p.pro_codigo_plu = det.pro_codigo_plu AND p.dep_id = ?
          WHERE det.chk_id = ?
          ORDER BY det.presente ASC, p.pro_nombre_producto`,
        [d.dep_id, d.chk_id]
      );
      departamentos.push({
        dep_nombre: d.dep_nombre,
        meta: Number(d.meta),
        indice: d.indice_faltante != null ? Number(d.indice_faltante) : null,
        productos: prods.map((p) => ({ ...p, presente: !!p.presente })),
      });
    }

    // Gráfico: TODOS los departamentos de la jornada (los no chequeados van sin dato)
    const dashboard = deps.map((d) => ({
      dep_nombre: d.dep_nombre,
      real: d.indice_faltante != null ? Number(d.indice_faltante) : null,
      meta: Number(d.meta),
    }));

    // Destinatarios: lista fija del turno (AM/PM), configurable desde la app.
    const { rows: correosRows } = await db.query(
      `SELECT correos_destino FROM infaltables_correos_turno WHERE turno = ?`,
      [turno]
    );
    const set = new Set();
    (correosRows[0]?.correos_destino || '')
      .split(/[,;]/).map((e) => e.trim()).filter(Boolean).forEach((e) => set.add(e));
    const correos = set.size ? [...set].join(', ') : null;

    // Responsable
    let usuNombre = null;
    if (usu_id) {
      const { rows } = await db.query(`SELECT usu_nombre FROM usuarios WHERE usu_id = ?`, [usu_id]);
      usuNombre = rows[0]?.usu_nombre || null;
    }

    // Hoja resumen: matriz de mediciones diarias del mes (solo este turno)
    const resumen = await resumenMensualData(turno);

    const r = await enviarReporteTurnoInfaltables({
      turno, fecha: new Date(), usuNombre, correosDestino: correos, departamentos, dashboard, resumen,
    });

    res.json({
      ok: true, enviado: !!r.enviado, motivo: r.motivo,
      turno, departamentos_chequeados: chequeados.length, departamentos_turno: deps.length,
      destinatarios: [...set],
    });
  } catch (err) {
    console.error('[enviarReporteTurno]', err.message);
    res.status(500).json({ error: 'No se pudo enviar el reporte del turno' });
  }
}

// Datos de la hoja resumen mensual (matriz de mediciones diarias por producto),
// filtrada por turno y acotada al mes en curso HASTA HOY. Reutilizada por el
// correo del turno y por la descarga del panel.
async function resumenMensualData(turno) {
  const turnoOk = (turno === 'am' || turno === 'pm') ? turno : turnoActual();

  // Fecha del servidor (misma referencia que usa el resto: CURDATE()).
  const { rows: fechaRows } = await db.query(
    `SELECT DAY(CURDATE()) AS dia, MONTH(CURDATE()) AS mes, YEAR(CURDATE()) AS anio`
  );
  const { dia: diasHastaHoy, mes, anio } = fechaRows[0];

  const { rows } = await db.query(
    `SELECT ci.dep_id, d.dep_nombre,
            det.pro_codigo_plu, p.pro_nombre_producto, p.pro_codigo_barra,
            DAY(ci.chk_fecha) AS dia, det.presente
       FROM chequeo_infaltables ci
       JOIN chequeo_infaltables_detalle det ON det.chk_id = ci.chk_id
       JOIN departamentos d ON d.dep_id = ci.dep_id
       JOIN productos p ON p.pro_codigo_plu = det.pro_codigo_plu AND p.dep_id = ci.dep_id
      WHERE ci.turno = ?
        AND ci.chk_fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        AND ci.chk_fecha <  CURDATE() + INTERVAL 1 DAY
        AND d.dep_infaltable = 1
      ORDER BY d.dep_nombre, p.pro_nombre_producto, ci.chk_id`,
    [turnoOk]
  );

  // Agrupar dep -> producto -> día. El ORDER BY chk_id asc hace que el chequeo
  // más reciente del día sobrescriba a uno anterior del mismo turno.
  const depMap = new Map();
  for (const r of rows) {
    if (!depMap.has(r.dep_id)) {
      depMap.set(r.dep_id, { dep_id: r.dep_id, dep_nombre: r.dep_nombre, productos: new Map() });
    }
    const dep = depMap.get(r.dep_id);
    if (!dep.productos.has(r.pro_codigo_plu)) {
      dep.productos.set(r.pro_codigo_plu, {
        plu: r.pro_codigo_plu,
        barra: r.pro_codigo_barra || '',
        nombre: r.pro_nombre_producto,
        dias: {},
      });
    }
    dep.productos.get(r.pro_codigo_plu).dias[r.dia] = r.presente ? 1 : 0;
  }

  const departamentos = [...depMap.values()].map((dep) => ({
    dep_id: dep.dep_id,
    dep_nombre: dep.dep_nombre,
    productos: [...dep.productos.values()].map((p) => {
      const valores = Object.values(p.dias);
      const optimo = valores.length;
      const real = valores.filter((v) => v === 1).length;
      return { ...p, real, optimo, cumpl: optimo > 0 ? real / optimo : null };
    }),
  }));

  return { turno: turnoOk, anio, mes, diasHastaHoy, departamentos };
}

// GET /api/infaltables/reporte-mensual?turno=am|pm  → descarga xlsx de la hoja resumen
async function descargarResumenMensual(req, res) {
  try {
    const turno = (req.query.turno === 'am' || req.query.turno === 'pm') ? req.query.turno : turnoActual();
    const resumen = await resumenMensualData(turno);
    const buffer = await generarExcelResumenInfaltables(resumen);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="resumen_infaltables_${turno}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error('[descargarResumenMensual]', err.message);
    res.status(500).json({ error: 'No se pudo generar el resumen mensual' });
  }
}

// GET /api/infaltables/config?dep_id=22  → meta % por departamento
async function obtenerConfig(req, res) {
  try {
    const { dep_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const { rows } = await db.query(
      `SELECT meta_faltante FROM infaltables_config WHERE dep_id = ?`,
      [dep_id]
    );
    res.json(rows[0] || { meta_faltante: 15 });
  } catch (err) {
    console.error('[obtenerConfig]', err.message);
    res.status(500).json({ error: 'No se pudo cargar la configuración' });
  }
}

// PUT /api/infaltables/config/:depId  → { meta_faltante }
// Los correos ya NO se configuran por departamento: ver correos-turno.
async function actualizarConfig(req, res) {
  try {
    const { depId } = req.params;
    let meta = Number(req.body.meta_faltante);
    if (!Number.isFinite(meta) || meta < 0 || meta > 100) meta = 15;

    await db.query(
      `INSERT INTO infaltables_config (dep_id, meta_faltante)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE meta_faltante = VALUES(meta_faltante)`,
      [depId, meta]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[actualizarConfig]', err.message);
    res.status(500).json({ error: 'No se pudo guardar la configuración' });
  }
}

// GET /api/infaltables/correos-turno?turno=am|pm  → destinatarios del turno
async function obtenerCorreosTurno(req, res) {
  try {
    const turno = (req.query.turno === 'am' || req.query.turno === 'pm') ? req.query.turno : turnoActual();
    const { rows } = await db.query(
      `SELECT correos_destino FROM infaltables_correos_turno WHERE turno = ?`,
      [turno]
    );
    res.json({ turno, correos_destino: rows[0]?.correos_destino || '' });
  } catch (err) {
    console.error('[obtenerCorreosTurno]', err.message);
    res.status(500).json({ error: 'No se pudieron cargar los correos del turno' });
  }
}

// PUT /api/infaltables/correos-turno/:turno  → { correos_destino }
async function actualizarCorreosTurno(req, res) {
  try {
    const turno = (req.params.turno === 'am' || req.params.turno === 'pm') ? req.params.turno : null;
    if (!turno) return res.status(400).json({ error: 'Turno inválido' });

    const emailCheck = validarEmails(req.body.correos_destino);
    if (!emailCheck.ok) return res.status(400).json({ error: `Correo inválido: ${emailCheck.invalido}` });
    const correos = emailCheck.lista.length ? emailCheck.lista.join(', ') : null;

    await db.query(
      `INSERT INTO infaltables_correos_turno (turno, correos_destino)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE correos_destino = VALUES(correos_destino)`,
      [turno, correos]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[actualizarCorreosTurno]', err.message);
    res.status(500).json({ error: 'No se pudieron guardar los correos del turno' });
  }
}

module.exports = {
  obtenerTurnoActual, listarDepartamentosTurno, listarParaJornada, asignarJornadaBulk,
  obtenerChecklist, guardarChequeo, obtenerDashboard, enviarReporteTurno,
  descargarResumenMensual, obtenerConfig, actualizarConfig,
  obtenerCorreosTurno, actualizarCorreosTurno,
};
