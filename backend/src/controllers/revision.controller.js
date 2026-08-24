const db                        = require('../config/db');
const ConfigService             = require('../services/ConfigService');
const { calcularDemanda, diaSemanaSantiago } = require('../services/DemandCalculatorService');
const { enviarOrdenProduccion, enviarPedidoUnidoTejaFood } = require('../services/EmailService');

// Departamentos Teja Food: cuando AMBOS deptos tienen al menos un pedido del día,
// se envía un correo unido (Tienda + Local) con la SUMA de TODOS los pedidos del
// día por PLU. Se re-envía en cada finalización con el total acumulado (el KDS
// hace upsert por fecha, así que siempre queda el total más completo del día).
const TEJAFOOD_LOCAL  = '1347';   // Local Teja Food  (columna "Tienda")
const TEJAFOOD_TIENDA = '2347';   // Sala Teja Food   (columna "Sala")
const TEJAFOOD_MARLEY = 'MARLEY'; // Marley Coffee    (columna "Marley") — opcional

/**
 * Si el depto recién finalizado es Teja Food (Local o Tienda) y el OTRO también
 * tiene un pedido completado hoy, envía el correo unido a Jean Paul.
 * No lanza: cualquier fallo se registra en log para no afectar el pedido principal.
 */
// Construye el pedido combinado del DÍA: suma de TODOS los pedidos completados
// hoy por depto Teja Food, combinado por PLU. Devuelve null si algún depto no
// tiene pedidos hoy (se requiere que AMBOS tengan al menos uno).
async function construirPedidoDiaTejaFood() {
  const { rows: resumen } = await db.query(
    `SELECT dep_id, COUNT(*) AS n
       FROM revisiones
      WHERE rev_estado = 'completada'
        AND dep_id IN (?, ?, ?)
        AND DATE(rev_fecha) = CURDATE()
      GROUP BY dep_id`,
    [TEJAFOOD_LOCAL, TEJAFOOD_TIENDA, TEJAFOOD_MARLEY]
  );
  const nLocal  = Number(resumen.find((r) => String(r.dep_id) === TEJAFOOD_LOCAL)?.n || 0);
  const nTienda = Number(resumen.find((r) => String(r.dep_id) === TEJAFOOD_TIENDA)?.n || 0);
  const nMarley = Number(resumen.find((r) => String(r.dep_id) === TEJAFOOD_MARLEY)?.n || 0);
  // Se requiere el par principal (Local + Sala). Marley es opcional: se suma si tiene pedidos.
  if (!nLocal || !nTienda) return null;

  const itemsDelDia = async (depId) => {
    const { rows: det } = await db.query(
      `SELECT dr.pro_codigo_plu, p.pro_nombre_producto, SUM(dr.det_cantidad_pedir) AS cantidad
         FROM revisiones r
         JOIN detalle_revision dr ON dr.rev_id = r.rev_id
         JOIN productos p ON p.pro_codigo_plu = dr.pro_codigo_plu AND p.dep_id = r.dep_id
        WHERE r.dep_id = ?
          AND r.rev_estado = 'completada'
          AND DATE(r.rev_fecha) = CURDATE()
          AND dr.det_cantidad_pedir > 0
        GROUP BY dr.pro_codigo_plu, p.pro_nombre_producto
        ORDER BY p.pro_nombre_producto`,
      [depId]
    );
    return det;
  };
  const [itemsLocal, itemsTienda, itemsMarley] = await Promise.all([
    itemsDelDia(TEJAFOOD_LOCAL),
    itemsDelDia(TEJAFOOD_TIENDA),
    nMarley ? itemsDelDia(TEJAFOOD_MARLEY) : Promise.resolve([]),
  ]);
  return { itemsLocal, itemsTienda, itemsMarley, nLocal, nTienda, nMarley };
}

// En CADA finalización de un pedido Teja Food: actualiza el KDS con el total del
// día (sin correo). El correo a Jean se manda UNA vez al día (ver enviarCorreoDiarioTejaFood).
async function intentarPedidoUnidoTejaFood(depIdFinalizado) {
  const depId = String(depIdFinalizado);
  if (depId !== TEJAFOOD_LOCAL && depId !== TEJAFOOD_TIENDA && depId !== TEJAFOOD_MARLEY) return;
  try {
    const pedido = await construirPedidoDiaTejaFood();
    if (!pedido) return;
    const r = await enviarPedidoUnidoTejaFood({
      fecha: new Date(),
      items: { local: pedido.itemsLocal, tienda: pedido.itemsTienda, marley: pedido.itemsMarley },
      folios: { local: `${pedido.nLocal} pedido(s) del día`, tienda: `${pedido.nTienda} pedido(s) del día`, marley: `${pedido.nMarley} pedido(s) del día` },
      correo: false, kds: true,
    });
    console.log(`[TejaFood] KDS actualizado — ${r.productos} producto(s) (Local: ${pedido.nLocal}, Sala: ${pedido.nTienda}, Marley: ${pedido.nMarley} pedidos del día)`);
  } catch (err) {
    console.error('[TejaFood] No se pudo actualizar el KDS:', err.message);
  }
}

// Envío del correo consolidado del día a Jean. Lo dispara la tarea programada
// (ver app.js): a partir de la hora de corte, reintenta cada minuto hasta que el
// pedido del día esté COMPLETO (Local + Sala), y ahí lo manda UNA sola vez.
// Devuelve { enviado, motivo? } para que el scheduler sepa si ya puede marcar
// el día como enviado. El KDS ya se fue actualizando en tiempo real aparte.
async function enviarCorreoDiarioTejaFood() {
  try {
    const pedido = await construirPedidoDiaTejaFood();
    // Pedido incompleto: aún no están todos los deptos → NO es error, solo
    // todavía no toca. El scheduler reintentará en el próximo minuto.
    if (!pedido) return { enviado: false, motivo: 'incompleto' };
    const r = await enviarPedidoUnidoTejaFood({
      fecha: new Date(),
      items: { local: pedido.itemsLocal, tienda: pedido.itemsTienda, marley: pedido.itemsMarley },
      folios: { local: `${pedido.nLocal} pedido(s) del día`, tienda: `${pedido.nTienda} pedido(s) del día`, marley: `${pedido.nMarley} pedido(s) del día` },
      correo: true, kds: false,
    });
    console.log(`[TejaFood] Correo diario enviado a ${r.destinatario} — ${r.productos} producto(s) (Local: ${pedido.nLocal}, Sala: ${pedido.nTienda}, Marley: ${pedido.nMarley} pedidos)`);
    return { enviado: true, destinatario: r.destinatario, productos: r.productos };
  } catch (err) {
    console.error('[TejaFood] No se pudo enviar el correo diario:', err.message);
    return { enviado: false, motivo: err.message };
  }
}

// Normaliza el filtro de categoría que envía el front según el perfil:
//   'normal'   → Solicitud Producción Administración
//   'especial' → Solicitud Producción Áreas Productivas
// Cualquier otro valor = sin filtro (compatibilidad).
function normalizarCategoria(cat) {
  return (cat === 'normal' || cat === 'especial') ? cat : null;
}

// Valida una lista de correos separados por coma. Devuelve { ok, lista, invalido }.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function validarEmails(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: true, lista: [] }; // vacío = usar los del departamento
  }
  const lista = String(raw)
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
  const invalido = lista.find((e) => !EMAIL_RE.test(e));
  if (invalido) return { ok: false, invalido };
  return { ok: true, lista };
}

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
    // Solo reanudar revisiones ABIERTAS DE HOY. Las revisiones en_proceso de
    // días anteriores quedaron abandonadas: no deben reanudarse (si no, el pedido
    // se guardaría con la fecha vieja y no contaría como pedido del día).
    const { rows } = await db.query(
      `SELECT rev_id, rev_folio, rev_fecha
         FROM revisiones
        WHERE dep_id = ? AND usu_id = ? AND rev_estado = 'en_proceso'
          AND DATE(rev_fecha) = CURDATE()
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
  const { revId } = req.params;
  const { items } = req.body; // Array de { pro_codigo_plu, cantidad_pedir }
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'items requeridos' });

  let connection;
  try {
    connection = await db.pool.getConnection();
    await connection.beginTransaction();

    for (const item of items) {
      const cant = parseInt(item.cantidad_pedir, 10);
      await connection.query(
        `INSERT INTO detalle_revision (rev_id, pro_codigo_plu, det_stock_sala, det_cantidad_pedir)
         VALUES (?, ?, 0, ?)
         ON DUPLICATE KEY UPDATE det_cantidad_pedir = VALUES(det_cantidad_pedir)`,
        [revId, item.pro_codigo_plu, Number.isFinite(cant) ? cant : 0]
      );
    }

    await connection.commit();
    res.status(201).json({ ok: true, total: items.length });
  } catch (err) {
    if (connection) { try { await connection.rollback(); } catch (_) {} }
    console.error('[agregarDetalleBulk]', err.message);
    res.status(500).json({ error: 'No se pudieron guardar los ítems' });
  } finally {
    if (connection) connection.release();
  }
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
    const { all } = req.query;
    const categoria = normalizarCategoria(req.query.categoria);
    const revRes = await db.query(`SELECT dep_id, rev_fecha FROM revisiones WHERE rev_id = ?`, [revId]);
    if (!revRes.rows.length) return res.status(404).json({ error: 'Revisión no encontrada' });
    const rev = revRes.rows[0];

    // Condiciones dinámicas del producto:
    //  - categoría (normal/especial) según el perfil
    //  - día de elaboración: solo aparece si hoy (zona Santiago) es uno de sus días,
    //    o si no tiene días asignados (entonces aparece siempre).
    const cond = ['p.dep_id = ?', 'p.pro_activo = 1'];
    const condParams = [rev.dep_id];
    if (categoria) { cond.push('p.pro_categoria = ?'); condParams.push(categoria); }
    const hoy = diaSemanaSantiago(rev.rev_fecha ? new Date(rev.rev_fecha) : new Date());
    if (hoy) {
      cond.push("(p.pro_dias_elaboracion IS NULL OR p.pro_dias_elaboracion = '' OR FIND_IN_SET(?, p.pro_dias_elaboracion))");
      condParams.push(hoy);
    }
    const where = cond.join(' AND ');

    // Traer todos los productos del departamento (si all=true) o solo los no escaneados
    const prodRes = await db.query(
      all === 'true'
        ? `SELECT p.* FROM productos p WHERE ${where} ORDER BY p.pro_nombre_producto`
        : `SELECT p.*
           FROM productos p
           LEFT JOIN detalle_revision dr ON dr.pro_codigo_plu = p.pro_codigo_plu AND dr.rev_id = ?
           WHERE ${where} AND dr.det_id IS NULL
           ORDER BY p.pro_nombre_producto`,
      all === 'true' ? condParams : [revId, ...condParams]
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
    const { items, emails_to } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Revisión vacía' });

    // Validar correos provistos por el cliente (previene relay a destinos malformados)
    const emailCheck = validarEmails(emails_to);
    if (!emailCheck.ok) {
      return res.status(400).json({ error: `Correo inválido: ${emailCheck.invalido}` });
    }
    const emailsToLimpio = emailCheck.lista.length ? emailCheck.lista.join(', ') : null;

    const revRes = await db.query(
      `SELECT r.rev_id, r.rev_folio, r.dep_id, r.rev_fecha,
              d.dep_nombre, d.dep_email_jefe, d.dep_emails_cc, d.dep_productiva,
              COALESCE(u.usu_nombre,'Operador') AS usu_nombre
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

    const esProductivo = !!rev.dep_productiva;

    const resultados = detRes.rows.map((item) => {
      const calc = calcularDemanda(config, item, item.det_stock_sala, rev.rev_fecha);
      const requerimiento = Math.max(0, (calc.demandaTotalRequerida || 0) - (item.det_stock_sala || 0));
      return {
        ...item,
        ...calc,
        fue_escaneado: true,
        // Para productivo: el usuario digitó la cantidad. Para no productivo: calculamos el requerimiento.
        cantidadAProducir: esProductivo
          ? (item.det_cantidad_pedir || 0)
          : Math.ceil(requerimiento),
        sugerenciaSistema: calc.cantidadAProducir,
        pedidoMinimo: item.pro_cantidad_minima || 0,
        requerimiento,
      };
    });

    // Para áreas productivas: solo productos que requieren pedido > 0. Para áreas no productivas: incluimos todos los revisados.
    let quiebres = esProductivo
      ? resultados.filter((r) => r.cantidadAProducir > 0)
      : resultados;

    // Ordenar alfabéticamente, luego por cantidad de mayor a menor
    quiebres.sort((a, b) => {
      const nameA = (a.pro_nombre_producto || '').toLowerCase();
      const nameB = (b.pro_nombre_producto || '').toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return b.cantidadAProducir - a.cantidadAProducir;
    });

    // Reclamar la revisión de forma atómica: solo una finalización puede tener éxito.
    // Si ya estaba 'completada', evitamos reenviar correos duplicados.
    const claim = await db.query(
      `UPDATE revisiones SET rev_estado = 'completada' WHERE rev_id = ? AND rev_estado = 'en_proceso'`,
      [revId]
    );
    if (!claim.rows.affectedRows) {
      return res.status(409).json({ error: 'La revisión ya fue finalizada anteriormente' });
    }

    // Enviar el correo DESPUÉS de reclamar pero revirtiendo el estado si falla,
    // para no perder el pedido cuando el SMTP no responde.
    if (quiebres.length > 0) {
      try {
        await enviarOrdenProduccion({
          depNombre: rev.dep_nombre,
          depEmail:  emailsToLimpio || rev.dep_email_jefe,
          depEmailsCc: emailsToLimpio ? null : rev.dep_emails_cc,
          revFecha:  rev.rev_fecha,
          folio:     rev.rev_folio,
          usuNombre: rev.usu_nombre,
          quiebres,
          tipo: esProductivo ? 'produccion' : 'reposicion',
        });
      } catch (mailErr) {
        // Reabrir la revisión para que el operador pueda reintentar el envío.
        await db.query(`UPDATE revisiones SET rev_estado = 'en_proceso' WHERE rev_id = ?`, [revId]);
        console.error('[finalizarRevision] Fallo SMTP:', mailErr.message);
        return res.status(502).json({ error: 'No se pudo enviar el correo. La revisión sigue abierta; intenta nuevamente.' });
      }
    }

    // Correo unido Teja Food: si el otro depto del par también está completo hoy.
    // No bloquea la respuesta ni afecta el pedido si falla.
    await intentarPedidoUnidoTejaFood(rev.dep_id);

    res.json({ ok: true, folio: rev.rev_folio, totalItems: resultados.length, quiebres: quiebres.length, correoEnviado: quiebres.length > 0, detalle: resultados });
  } catch (err) {
    console.error('[finalizarRevision]', err.message);
    res.status(500).json({ error: 'Error al finalizar la revisión' });
  }
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

module.exports = { buscarRevisionActiva, iniciarRevision, agregarDetalle, agregarDetalleBulk, calcularItem, obtenerNoEscaneados, finalizarRevision, obtenerRevision, eliminarDetalle, enviarCorreoDiarioTejaFood };
