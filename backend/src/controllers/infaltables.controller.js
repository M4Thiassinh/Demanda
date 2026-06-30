const db = require('../config/db');
const { enviarReporteInfaltables } = require('../services/EmailService');

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

    // Enviar correo SIEMPRE al finalizar (sin bloquear la respuesta si el SMTP falla)
    let correoEnviado = false;
    try {
      const { rows: cab } = await db.query(
        `SELECT d.dep_nombre,
                COALESCE(c.meta_faltante, 15) AS meta,
                c.correos_destino,
                (SELECT usu_nombre FROM usuarios WHERE usu_id = ?) AS usu_nombre
           FROM departamentos d
           LEFT JOIN infaltables_config c ON c.dep_id = d.dep_id
          WHERE d.dep_id = ?`,
        [usu_id || null, dep_id]
      );
      const info = cab[0] || {};
      const { rows: prods } = await db.query(
        `SELECT d.pro_codigo_plu, p.pro_nombre_producto, d.presente, d.stock_referencia
           FROM chequeo_infaltables_detalle d
           JOIN productos p ON p.pro_codigo_plu = d.pro_codigo_plu AND p.dep_id = ?
          WHERE d.chk_id = ?
          ORDER BY d.presente ASC, p.pro_nombre_producto`,
        [dep_id, chkId]
      );
      let dashboard = [];
      try { dashboard = await dashboardData(); } catch (_) {}

      const r = await enviarReporteInfaltables({
        depNombre: info.dep_nombre || dep_id,
        correosDestino: info.correos_destino,
        usuNombre: info.usu_nombre,
        turno: turnoOk,
        fecha: new Date(),
        meta: Number(info.meta),
        indice,
        productos: prods.map((p) => ({ ...p, presente: !!p.presente })),
        dashboard,
      });
      correoEnviado = !!r.enviado;
    } catch (mailErr) {
      console.error('[guardarChequeo] correo:', mailErr.message);
    }

    res.status(201).json({
      ok: true, chk_id: chkId, turno: turnoOk,
      total_infaltables: total, total_faltantes: faltantes, indice_faltante: indice,
      correoEnviado,
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

// GET /api/infaltables/config?dep_id=22
async function obtenerConfig(req, res) {
  try {
    const { dep_id } = req.query;
    if (!dep_id) return res.status(400).json({ error: 'dep_id requerido' });
    const { rows } = await db.query(
      `SELECT meta_faltante, correos_destino FROM infaltables_config WHERE dep_id = ?`,
      [dep_id]
    );
    res.json(rows[0] || { meta_faltante: 15, correos_destino: '' });
  } catch (err) {
    console.error('[obtenerConfig]', err.message);
    res.status(500).json({ error: 'No se pudo cargar la configuración' });
  }
}

// PUT /api/infaltables/config/:depId  → { meta_faltante, correos_destino }
async function actualizarConfig(req, res) {
  try {
    const { depId } = req.params;
    const { meta_faltante, correos_destino } = req.body;

    const emailCheck = validarEmails(correos_destino);
    if (!emailCheck.ok) return res.status(400).json({ error: `Correo inválido: ${emailCheck.invalido}` });
    const correos = emailCheck.lista.length ? emailCheck.lista.join(', ') : null;

    let meta = Number(meta_faltante);
    if (!Number.isFinite(meta) || meta < 0 || meta > 100) meta = 15;

    await db.query(
      `INSERT INTO infaltables_config (dep_id, meta_faltante, correos_destino)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE meta_faltante = VALUES(meta_faltante), correos_destino = VALUES(correos_destino)`,
      [depId, meta, correos]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[actualizarConfig]', err.message);
    res.status(500).json({ error: 'No se pudo guardar la configuración' });
  }
}

module.exports = {
  obtenerTurnoActual, listarParaJornada, asignarJornadaBulk, obtenerChecklist, guardarChequeo,
  obtenerDashboard, obtenerConfig, actualizarConfig,
};
