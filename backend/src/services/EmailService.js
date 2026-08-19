const nodemailer = require('nodemailer');
const ExcelJS    = require('exceljs');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '465', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 10000,  // 10 segundos max para conectar
  greetingTimeout:   5000,
  // Por defecto se valida el certificado TLS del servidor SMTP (evita MITM).
  // Solo se desactiva si se define explícitamente SMTP_TLS_REJECT_UNAUTHORIZED=false.
  tls: { rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false' },
});

/** Escapa texto para insertarlo de forma segura en el HTML del correo. */
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const MESES = ['', 'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
  'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

/** Genera buffer .xlsx — Orden de Producción (Áreas Productivas) */
async function generarExcel(quiebres, depNombre, folio, fecha) {
  const wb  = new ExcelJS.Workbook();
  const ws  = wb.addWorksheet('Orden de Producción');

  ws.columns = [
    { header: 'Folio',          key: 'folio',   width: 20 },
    { header: 'Fecha',          key: 'fecha',   width: 22 },
    { header: 'Departamento',   key: 'dep',     width: 16 },
    { header: 'PLU',            key: 'plu',     width: 12 },
    { header: 'Código Barra',   key: 'barra',   width: 16 },
    { header: 'Producto',       key: 'nombre',  width: 40 },
    { header: 'Stock Sala',     key: 'stock',   width: 12 },
    { header: 'Venta Diaria',   key: 'vd',      width: 13 },
    { header: 'Lote Base',      key: 'lote',    width: 13 },
    { header: 'Stock Seg.',     key: 'seg',     width: 12 },
    { header: 'Demanda Total',  key: 'dem',     width: 14 },
    { header: 'Sug. Sist.',     key: 'reponer', width: 12 },
    { header: 'Cant. Pedida',   key: 'pedida',  width: 15 },
    { header: 'Pedido Mínimo',  key: 'minimo',  width: 15 },
  ];

  // Estilo encabezado — naranja para producción
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } };
    cell.alignment = { horizontal: 'center' };
  });

  const fechaStr = new Date(fecha).toLocaleString('es-CL', { timeZone: 'America/Santiago' });

  quiebres.forEach((q, i) => {
    const row = ws.addRow({
      folio:  folio,
      fecha:  fechaStr,
      dep:    depNombre,
      plu:    q.pro_codigo_plu,
      barra:  q.pro_codigo_barra || '',
      nombre: q.pro_nombre_producto,
      stock:  q.fue_escaneado === false ? '0 (No esc.)' : q.det_stock_sala,
      vd:     q.ventaDiaria,
      lote:   q.loteProduccionBase,
      seg:    q.stockSeguridadCalculado,
      dem:    q.demandaTotalRequerida,
      reponer: q.sugerenciaSistema,
      pedida:  q.cantidadAProducir,
      minimo:  q.pedidoMinimo || 0,
    });
    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
      });
    }
  });

  // Resaltar columna "Cant. Pedida"
  ws.getColumn('pedida').eachCell({ includeEmpty: false }, (cell, rowNum) => {
    if (rowNum > 1) {
      cell.font = { bold: true, color: { argb: 'FFEA580C' } };
      cell.alignment = { horizontal: 'center' };
    }
  });

  return wb.xlsx.writeBuffer();
}

/** Genera buffer .xlsx — Reporte de Reposición (Áreas No Productivas) */
async function generarExcelReposicion(quiebres, depNombre, folio, fecha) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Reposición');

  ws.columns = [
    { header: 'Folio',              key: 'folio',        width: 20 },
    { header: 'Fecha',              key: 'fecha',        width: 22 },
    { header: 'Departamento',       key: 'dep',          width: 16 },
    { header: 'PLU',                key: 'plu',          width: 12 },
    { header: 'Producto',           key: 'nombre',       width: 40 },
    { header: 'Demanda Calculada',  key: 'demanda',      width: 18 },
    { header: 'Stock Ingresado',    key: 'stock',        width: 16 },
    { header: 'Requerimiento',      key: 'requerimiento',width: 16 },
  ];

  // Estilo encabezado — azul para reposición
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    cell.alignment = { horizontal: 'center' };
  });

  const fechaStr = new Date(fecha).toLocaleString('es-CL', { timeZone: 'America/Santiago' });

  quiebres.forEach((q, i) => {
    const row = ws.addRow({
      folio:         folio,
      fecha:         fechaStr,
      dep:           depNombre,
      plu:           q.pro_codigo_plu,
      nombre:        q.pro_nombre_producto,
      demanda:       Math.round(q.demandaTotalRequerida || 0),
      stock:         q.det_stock_sala,
      requerimiento: q.cantidadAProducir,
    });
    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
      });
    }
  });

  // Resaltar columna "Requerimiento"
  ws.getColumn('requerimiento').eachCell({ includeEmpty: false }, (cell, rowNum) => {
    if (rowNum > 1) {
      cell.font = { bold: true, color: { argb: 'FF1D4ED8' } };
      cell.alignment = { horizontal: 'center' };
    }
  });

  return wb.xlsx.writeBuffer();
}

/** Genera buffer .xlsx simplificado — PLU y Cantidad (para departamentos de producción) */
async function generarExcelPluCantidad(quiebres) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pedido');

  ws.columns = [
    { header: 'PLU',      key: 'plu',      width: 15 },
    { header: 'Producto', key: 'nombre',   width: 40 },
    { header: 'Cantidad', key: 'cantidad', width: 15 },
  ];

  // Estilo encabezado — Naranja oscuro profesional para combinar con el de producción
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC2410C' } }; // Orange-700
    cell.alignment = { horizontal: 'center' };
  });

  quiebres.forEach((q, i) => {
    const row = ws.addRow({
      plu:      q.pro_codigo_plu,
      nombre:   q.pro_nombre_producto,
      cantidad: q.cantidadAProducir,
    });
    
    // Formato de texto y alineación
    row.getCell('plu').alignment = { horizontal: 'center' };
    row.getCell('nombre').alignment = { horizontal: 'left' };
    row.getCell('cantidad').alignment = { horizontal: 'center' };

    // Fila intercalada
    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }; // Orange-50 tint
      });
    }
  });

  return wb.xlsx.writeBuffer();
}

/**
 * Envía correo HTML + adjunto Excel con los quiebres.
 * tipo: 'produccion' | 'reposicion'
 */
async function enviarOrdenProduccion({ depNombre, depEmail, depEmailsCc, revFecha, folio, usuNombre, quiebres, tipo = 'produccion' }) {
  const esProduccion = tipo === 'produccion';
  const fecha = new Date(revFecha).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short', hour12: false
  });

  const cantLabel = esProduccion ? 'Cant. Pedir' : 'Requerimiento';

  const filasProduccion = quiebres.map((q) => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${esc(q.pro_codigo_plu)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">${esc(q.pro_nombre_producto)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#ea580c;font-size:17px;">${esc(q.cantidadAProducir)}</td>
    </tr>`).join('');

  const filasReposicion = quiebres.map((q) => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${esc(q.pro_codigo_plu)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">${esc(q.pro_nombre_producto)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${Math.round(q.demandaTotalRequerida || 0)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${esc(q.det_stock_sala ?? 0)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#1d4ed8;font-size:17px;">${esc(q.cantidadAProducir)}</td>
    </tr>`).join('');

  const filas = esProduccion ? filasProduccion : filasReposicion;

  const headersProduccion = `
    <th style="padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;">PLU</th>
    <th style="padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;">Producto</th>
    <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Cant. Pedir</th>`;

  const headersReposicion = `
    <th style="padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;">PLU</th>
    <th style="padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;">Producto</th>
    <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Demanda Calc.</th>
    <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Stock Sala</th>
    <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Requerimiento</th>`;

  const headers = esProduccion ? headersProduccion : headersReposicion;

  const headerColor = esProduccion
    ? 'linear-gradient(135deg,#ea580c,#f97316)'
    : 'linear-gradient(135deg,#1d4ed8,#3b82f6)';
  const titulo = esProduccion ? '📋 Orden de Producción' : '📦 Reporte de Reposición';

  const totalItems = quiebres.length;
  const itemsConRequerimiento = quiebres.filter((q) => q.cantidadAProducir > 0).length;
  const descRequerimiento = esProduccion
    ? `<b>${totalItems}</b> producto(s) requiere(n) producción`
    : `<b>${itemsConRequerimiento}</b> de <b>${totalItems}</b> producto(s) requiere(n) reposición`;

  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
  <tr><td align="center">
  <table width="660" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <tr><td style="background:${headerColor};padding:24px 28px;color:#fff;">
      <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:.8;">Teja Market — Sistema de Reposición</p>
      <h1 style="margin:6px 0 0;font-size:22px;">${titulo}</h1>
    </td></tr>
    <tr><td style="padding:18px 28px;background:#fff7ed;border-bottom:1px solid #fed7aa;">
      <p style="margin:0;font-size:13px;color:#7c2d12;">
        <b>Folio:</b> ${esc(folio)} &nbsp;|&nbsp; <b>Depto:</b> ${esc(depNombre)} &nbsp;|&nbsp;
        <b>Usuario:</b> ${esc(usuNombre || 'Operador')} &nbsp;|&nbsp; <b>Fecha:</b> ${esc(fecha)}
      </p>
      <p style="margin:8px 0 0;font-size:13px;color:#9a3412;">
        ${descRequerimiento}
      </p>
    </td></tr>
    <tr><td style="padding:20px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr style="background:#1e293b;color:#fff;">
          ${headers}
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f8fafc;text-align:center;font-size:11px;color:#94a3b8;">
      Generado automáticamente — ${fecha}
    </td></tr>
  </table></td></tr></table></body></html>`;

  const excelBuffer = esProduccion
    ? await generarExcel(quiebres, depNombre, folio, revFecha)
    : await generarExcelReposicion(quiebres, depNombre, folio, revFecha);

  const destinatario = depEmail || process.env.EMAIL_PRODUCCION;
  const tipoLabel = esProduccion ? 'Producción' : 'Reposición';

  const attachments = [{
    filename:    `${tipo}_${folio}.xlsx`,
    content:     excelBuffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }];

  if (esProduccion) {
    const excelPluCantBuffer = await generarExcelPluCantidad(quiebres);
    attachments.push({
      filename:    `pedido_produccion_${folio}.xlsx`,
      content:     excelPluCantBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      destinatario,
    cc:      depEmailsCc || undefined,
    subject: `[${tipoLabel}] ${folio} — ${depNombre} — ${quiebres.length} ítem(s)`,
    html,
    attachments,
  });
}

/** Genera buffer .xlsx — Chequeo de Infaltables */
async function generarExcelInfaltables(productos, depNombre, turno, fecha) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Infaltables');

  ws.columns = [
    { header: 'Departamento', key: 'dep',    width: 18 },
    { header: 'Turno',        key: 'turno',  width: 8 },
    { header: 'Fecha',        key: 'fecha',  width: 22 },
    { header: 'PLU',          key: 'plu',    width: 12 },
    { header: 'Producto',     key: 'nombre', width: 40 },
    { header: 'Estado',       key: 'estado', width: 12 },
    { header: 'Stock Sistema',key: 'stock',  width: 14 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } }; // rojo
    cell.alignment = { horizontal: 'center' };
  });

  const fechaStr = new Date(fecha).toLocaleString('es-CL', { timeZone: 'America/Santiago' });

  productos.forEach((p, i) => {
    const falta = !p.presente;
    const row = ws.addRow({
      dep: depNombre,
      turno: String(turno).toUpperCase(),
      fecha: fechaStr,
      plu: p.pro_codigo_plu,
      nombre: p.pro_nombre_producto,
      estado: falta ? 'FALTA' : 'OK',
      stock: p.stock_referencia != null ? Number(p.stock_referencia) : 's/d',
    });
    if (falta) {
      row.getCell('estado').font = { bold: true, color: { argb: 'FFB91C1C' } };
      row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; });
    }
  });

  return wb.xlsx.writeBuffer();
}

/**
 * Gráfico de barras VERTICALES (Real vs Meta por departamento) en HTML/CSS,
 * compatible con clientes de correo (sin JS ni imágenes externas).
 * dashboard: [{ dep_nombre, real(number|null), meta(number) }]
 */
function graficoDashboardHTML(dashboard) {
  if (!Array.isArray(dashboard) || dashboard.length === 0) return '';

  const ALTO = 140; // px de la barra más alta
  const valores = dashboard.flatMap((d) => [d.real || 0, d.meta || 0]);
  const escalaMax = Math.max(...valores, 10);
  const h = (v) => Math.max(2, Math.round(((Number(v) || 0) / escalaMax) * ALTO));

  const colReal = '#3b82f6';
  const colMeta = '#f59e0b';

  const barras = dashboard.map((d) => {
    const real = d.real != null ? Number(d.real) : null;
    const meta = Number(d.meta) || 0;
    return `
      <td style="vertical-align:bottom;text-align:center;padding:0 6px;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr style="vertical-align:bottom;">
          <td style="vertical-align:bottom;text-align:center;padding:0 2px;">
            <div style="font-size:10px;font-weight:700;color:${colReal};">${real != null ? real + '%' : 's/d'}</div>
            <div style="width:18px;height:${h(real)}px;background:${colReal};border-radius:3px 3px 0 0;margin:0 auto;"></div>
          </td>
          <td style="vertical-align:bottom;text-align:center;padding:0 2px;">
            <div style="font-size:10px;font-weight:700;color:${colMeta};">${meta}%</div>
            <div style="width:18px;height:${h(meta)}px;background:${colMeta};border-radius:3px 3px 0 0;margin:0 auto;"></div>
          </td>
        </tr></table>
      </td>`;
  }).join('');

  const etiquetas = dashboard.map((d) => `
    <td style="text-align:center;font-size:10px;color:#475569;padding:5px 4px 0;border-top:1px solid #cbd5e1;">${esc(d.dep_nombre)}</td>`
  ).join('');

  return `
    <div style="margin:6px 0 20px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#334155;">📊 Índice Faltante por Departamento</p>
      <p style="margin:0 0 10px;font-size:11px;color:#64748b;">
        <span style="display:inline-block;width:10px;height:10px;background:${colReal};border-radius:2px;"></span> Real &nbsp;
        <span style="display:inline-block;width:10px;height:10px;background:${colMeta};border-radius:2px;"></span> Meta
      </p>
      <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr style="vertical-align:bottom;height:${ALTO + 16}px;">${barras}</tr>
        <tr>${etiquetas}</tr>
      </table>
    </div>`;
}

/**
 * Envía el reporte de un chequeo de infaltables.
 * productos: [{ pro_codigo_plu, pro_nombre_producto, presente(bool), stock_referencia }]
 * dashboard: [{ dep_nombre, real, meta }] (para incluir el gráfico Real vs Meta)
 */
async function enviarReporteInfaltables({ depNombre, correosDestino, usuNombre, turno, fecha, meta, indice, productos, dashboard }) {
  const destinatario = correosDestino || process.env.EMAIL_PRODUCCION;
  if (!destinatario) return { enviado: false, motivo: 'sin destinatario' };

  const fechaStr = new Date(fecha).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short', hour12: false,
  });

  const total = productos.length;
  const faltantes = productos.filter((p) => !p.presente);
  const sobreMeta = Number(indice) > Number(meta);
  const colorIndice = sobreMeta ? '#b91c1c' : '#15803d';

  // Gráfico Real vs Meta por departamento (vertical, como el dashboard)
  const grafico = graficoDashboardHTML(dashboard);

  const filasFaltantes = faltantes.length
    ? faltantes.map((p) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${esc(p.pro_codigo_plu)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;">${esc(p.pro_nombre_producto)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#b91c1c;font-weight:700;">${esc(p.stock_referencia != null ? Number(p.stock_referencia) : 's/d')}</td>
      </tr>`).join('')
    : `<tr><td colspan="3" style="padding:14px;text-align:center;color:#15803d;font-weight:700;">✓ Sin faltantes en este chequeo</td></tr>`;

  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center">
  <table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <tr><td style="background:linear-gradient(135deg,#b91c1c,#ef4444);padding:24px 28px;color:#fff;">
      <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:.85;">Teja Market — Control de Infaltables</p>
      <h1 style="margin:6px 0 0;font-size:22px;">🎯 Reporte de Infaltables</h1>
    </td></tr>
    <tr><td style="padding:18px 28px;background:#fef2f2;border-bottom:1px solid #fecaca;">
      <p style="margin:0;font-size:13px;color:#7f1d1d;">
        <b>Depto:</b> ${esc(depNombre)} &nbsp;|&nbsp; <b>Turno:</b> ${esc(String(turno).toUpperCase())} &nbsp;|&nbsp;
        <b>Responsable:</b> ${esc(usuNombre || '—')} &nbsp;|&nbsp; <b>Fecha:</b> ${esc(fechaStr)}
      </p>
    </td></tr>
    <tr><td style="padding:20px 28px;">
      <p style="margin:0 0 6px;font-size:14px;color:#334155;">
        <b>${total}</b> infaltables · <b style="color:#b91c1c;">${faltantes.length}</b> faltante(s) ·
        Índice: <b style="color:${colorIndice};">${indice}%</b> (meta ${meta}%) ${sobreMeta ? '⚠️ sobre la meta' : '✓ dentro de meta'}
      </p>
      ${grafico}
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr style="background:#1e293b;color:#fff;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;">PLU</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;">Producto faltante</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Stock Sist.</th>
        </tr></thead>
        <tbody>${filasFaltantes}</tbody>
      </table>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f8fafc;text-align:center;font-size:11px;color:#94a3b8;">
      Generado automáticamente — ${esc(fechaStr)}
    </td></tr>
  </table></td></tr></table></body></html>`;

  const excelBuffer = await generarExcelInfaltables(productos, depNombre, turno, fecha);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to:   destinatario,
    subject: `[Infaltables] ${depNombre} — Turno ${String(turno).toUpperCase()} — ${faltantes.length} faltante(s) (${indice}%)`,
    html,
    attachments: [{
      filename: `infaltables_${depNombre}_${turno}.xlsx`,
      content: excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  });

  return { enviado: true };
}

/** Excel consolidado del turno: una fila por producto, con columna Departamento. */
async function generarExcelInfaltablesTurno(departamentos, turno, fecha, resumen) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Infaltables');

  ws.columns = [
    { header: 'Departamento', key: 'dep',    width: 24 },
    { header: 'Turno',        key: 'turno',  width: 8 },
    { header: 'Fecha',        key: 'fecha',  width: 22 },
    { header: 'PLU',          key: 'plu',    width: 12 },
    { header: 'Producto',     key: 'nombre', width: 40 },
    { header: 'Estado',       key: 'estado', width: 12 },
    { header: 'Stock Sistema',key: 'stock',  width: 14 },
  ];
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB91C1C' } };
    cell.alignment = { horizontal: 'center' };
  });

  const fechaStr = new Date(fecha).toLocaleString('es-CL', { timeZone: 'America/Santiago' });

  for (const dep of departamentos) {
    for (const p of (dep.productos || [])) {
      const falta = !p.presente;
      const row = ws.addRow({
        dep: dep.dep_nombre,
        turno: String(turno).toUpperCase(),
        fecha: fechaStr,
        plu: p.pro_codigo_plu,
        nombre: p.pro_nombre_producto,
        estado: falta ? 'FALTA' : 'OK',
        stock: p.stock_referencia != null ? Number(p.stock_referencia) : 's/d',
      });
      if (falta) {
        row.getCell('estado').font = { bold: true, color: { argb: 'FFB91C1C' } };
        row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }; });
      }
    }
  }

  // Hoja resumen mensual (matriz de mediciones diarias del turno)
  if (resumen) agregarHojaResumenInfaltables(wb, resumen);

  return wb.xlsx.writeBuffer();
}

/**
 * Agrega a un workbook la hoja "Resumen Mensual": matriz de mediciones diarias
 * por producto (1 = presente, 0 = faltó, en blanco = no medido), agrupada por
 * departamento, con Real / Óptimo / Cumpl% por producto. Filtrada por turno.
 * resumen: { turno, anio, mes, diasHastaHoy, departamentos:[{ dep_nombre,
 *            productos:[{ plu, barra, nombre, dias:{dia:0|1}, real, optimo, cumpl }] }] }
 */
function agregarHojaResumenInfaltables(wb, resumen) {
  const { turno, anio, mes, diasHastaHoy, departamentos = [] } = resumen;
  const ws = wb.addWorksheet('Resumen Mensual');
  const nDias = Math.max(1, Number(diasHastaHoy) || 1);

  const thin = { style: 'thin', color: { argb: 'FFBFBFBF' } };
  const borde = () => ({ top: thin, bottom: thin, left: thin, right: thin });
  const YELLOW = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
  const RED    = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC00000' } };
  const WHITE  = 'FFFFFFFF';
  const UMBRAL = 0.8; // bajo 80% de cumplimiento → rojo

  // Columnas: A Depto | B C.Barra | C Nombre | Cumpl% | Real | Óptimo | días 1..N
  const colCumpl   = 4;
  const colReal    = 5;
  const colOptimo  = 6;
  const FIRST_DAY_COL = 7;
  const lastDayCol = FIRST_DAY_COL + nDias - 1;
  const totalCols  = lastDayCol;

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 40;
  ws.getColumn(colCumpl).width = 9;
  ws.getColumn(colReal).width = 7;
  ws.getColumn(colOptimo).width = 8;
  for (let c = FIRST_DAY_COL; c <= lastDayCol; c++) ws.getColumn(c).width = 4;

  // Título
  ws.mergeCells(1, 1, 1, totalCols);
  const titulo = ws.getCell(1, 1);
  titulo.value = `CHEQUEO INFALTABLES MES DE ${MESES[mes] || ''} ${anio} — TURNO ${String(turno).toUpperCase()}`;
  titulo.font = { bold: true, size: 14 };
  titulo.alignment = { horizontal: 'left', vertical: 'middle' };
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } };
  ws.getRow(1).height = 24;

  // Encabezado (fila 3)
  const HEADER_ROW = 3;
  const header = ['Departamento', 'C. Barra', 'Nombre Producto', 'Cumpl%', 'Real', 'Óptimo'];
  for (let d = 1; d <= nDias; d++) header.push(d);
  const hRow = ws.getRow(HEADER_ROW);
  header.forEach((h, i) => { hRow.getCell(i + 1).value = h; });
  hRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borde();
  });
  hRow.height = 18;

  let rowIdx = HEADER_ROW + 1;
  for (const dep of departamentos) {
    const prods = dep.productos || [];
    if (!prods.length) continue;
    const startRow = rowIdx;
    // Ordenar por cumplimiento de menor a mayor (los sin dato, al final)
    const prodsOrden = [...prods].sort((a, b) => {
      const ca = a.cumpl == null ? Infinity : a.cumpl;
      const cb = b.cumpl == null ? Infinity : b.cumpl;
      return ca - cb;
    });
    for (const p of prodsOrden) {
      const row = ws.getRow(rowIdx);
      const bajo = p.cumpl != null && p.cumpl < UMBRAL;
      row.getCell(2).value = p.barra || '';
      row.getCell(3).value = p.nombre;
      for (let d = 1; d <= nDias; d++) {
        const cell = row.getCell(FIRST_DAY_COL + d - 1);
        const v = p.dias ? p.dias[d] : undefined;
        cell.value = (v === 0 || v === 1) ? v : null;
        cell.alignment = { horizontal: 'center' };
        if (v === 0) cell.font = { bold: true, color: { argb: 'FFB91C1C' } };
      }
      const cCumpl = row.getCell(colCumpl);
      if (p.cumpl != null) { cCumpl.value = p.cumpl; cCumpl.numFmt = '0%'; }
      else cCumpl.value = 's/d';
      cCumpl.alignment = { horizontal: 'center' };
      cCumpl.font = { bold: true };
      const cReal = row.getCell(colReal);
      cReal.value = p.real;
      cReal.alignment = { horizontal: 'center' };
      cReal.font = { bold: true };
      const cOpt = row.getCell(colOptimo);
      cOpt.value = p.optimo;
      cOpt.alignment = { horizontal: 'center' };

      if (bajo) {
        // Fila bajo el umbral: fondo rojo + letra blanca (cols 2..fin; la col 1 va fusionada)
        for (let c = 2; c <= totalCols; c++) {
          const cell = row.getCell(c);
          cell.fill = RED;
          const prev = cell.font || {};
          cell.font = { ...prev, bold: prev.bold || c === colCumpl || c === colReal, color: { argb: WHITE } };
        }
      } else {
        cReal.fill = YELLOW;
        cOpt.fill = YELLOW;
      }
      for (let c = 1; c <= totalCols; c++) row.getCell(c).border = borde();
      rowIdx++;
    }
    const endRow = rowIdx - 1;
    const cDep = ws.getCell(startRow, 1);
    cDep.value = dep.dep_nombre;
    cDep.font = { bold: true };
    cDep.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    if (endRow > startRow) ws.mergeCells(startRow, 1, endRow, 1);
  }

  if (rowIdx === HEADER_ROW + 1) {
    ws.mergeCells(rowIdx, 1, rowIdx, totalCols);
    const c = ws.getCell(rowIdx, 1);
    c.value = `Sin chequeos registrados para el turno ${String(turno).toUpperCase()} en el mes.`;
    c.alignment = { horizontal: 'center' };
    c.font = { italic: true, color: { argb: 'FF6B7280' } };
  }

  return ws;
}

/** Genera buffer .xlsx con SOLO la hoja resumen mensual (descarga desde el panel) */
async function generarExcelResumenInfaltables(resumen) {
  const wb = new ExcelJS.Workbook();
  agregarHojaResumenInfaltables(wb, resumen);
  return wb.xlsx.writeBuffer();
}

/**
 * Envía UN solo correo consolidado del turno.
 * departamentos: [{ dep_nombre, meta, indice, productos:[{...presente}] }] (chequeados)
 * dashboard:     [{ dep_nombre, real, meta }] (TODOS los deptos de la jornada, para el gráfico)
 */
async function enviarReporteTurnoInfaltables({ turno, fecha, usuNombre, correosDestino, departamentos, dashboard, resumen }) {
  const destinatario = correosDestino || process.env.EMAIL_PRODUCCION;
  if (!destinatario) return { enviado: false, motivo: 'sin destinatario' };

  const fechaStr = new Date(fecha).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short', hour12: false,
  });

  const grafico = graficoDashboardHTML(dashboard);
  const totalFaltantes = departamentos.reduce((s, d) => s + (d.productos || []).filter((p) => !p.presente).length, 0);

  // Una sección por departamento chequeado, con su índice y sus faltantes.
  const secciones = departamentos.map((dep) => {
    const productos = dep.productos || [];
    const faltantes = productos.filter((p) => !p.presente);
    const sobreMeta = dep.indice != null && Number(dep.indice) > Number(dep.meta);
    const colorIndice = sobreMeta ? '#b91c1c' : '#15803d';
    const filas = faltantes.length
      ? faltantes.map((p) => `
        <tr>
          <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${esc(p.pro_codigo_plu)}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;">${esc(p.pro_nombre_producto)}</td>
          <td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#b91c1c;font-weight:700;">${esc(p.stock_referencia != null ? Number(p.stock_referencia) : 's/d')}</td>
        </tr>`).join('')
      : `<tr><td colspan="3" style="padding:12px;text-align:center;color:#15803d;font-weight:700;">✓ Sin faltantes</td></tr>`;
    return `
      <div style="margin:0 0 22px;">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#1e293b;">${esc(dep.dep_nombre)}</p>
        <p style="margin:0 0 8px;font-size:13px;color:#334155;">
          <b>${productos.length}</b> infaltables · <b style="color:#b91c1c;">${faltantes.length}</b> faltante(s) ·
          Índice: <b style="color:${colorIndice};">${dep.indice != null ? dep.indice + '%' : 's/d'}</b> (meta ${dep.meta}%)
          ${sobreMeta ? '⚠️ sobre la meta' : '✓ dentro de meta'}
        </p>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <thead><tr style="background:#1e293b;color:#fff;">
            <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;">PLU</th>
            <th style="padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;">Producto faltante</th>
            <th style="padding:9px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Stock Sist.</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center">
  <table width="680" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <tr><td style="background:linear-gradient(135deg,#b91c1c,#ef4444);padding:24px 28px;color:#fff;">
      <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:.85;">Teja Market — Control de Infaltables</p>
      <h1 style="margin:6px 0 0;font-size:22px;">🎯 Reporte de Infaltables — Turno ${esc(String(turno).toUpperCase())}</h1>
    </td></tr>
    <tr><td style="padding:18px 28px;background:#fef2f2;border-bottom:1px solid #fecaca;">
      <p style="margin:0;font-size:13px;color:#7f1d1d;">
        <b>Turno:</b> ${esc(String(turno).toUpperCase())} &nbsp;|&nbsp;
        <b>Departamentos:</b> ${departamentos.length} &nbsp;|&nbsp;
        <b>Total faltantes:</b> ${totalFaltantes} &nbsp;|&nbsp;
        <b>Responsable:</b> ${esc(usuNombre || '—')} &nbsp;|&nbsp; <b>Fecha:</b> ${esc(fechaStr)}
      </p>
    </td></tr>
    <tr><td style="padding:20px 28px;">
      ${grafico}
      ${secciones}
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f8fafc;text-align:center;font-size:11px;color:#94a3b8;">
      Generado automáticamente — ${esc(fechaStr)}
    </td></tr>
  </table></td></tr></table></body></html>`;

  const excelBuffer = await generarExcelInfaltablesTurno(departamentos, turno, fecha, resumen);

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to:   destinatario,
    subject: `[Infaltables] Turno ${String(turno).toUpperCase()} — ${departamentos.length} depto(s) — ${totalFaltantes} faltante(s)`,
    html,
    attachments: [{
      filename: `infaltables_turno_${turno}.xlsx`,
      content: excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  });

  return { enviado: true };
}

/** Genera buffer .xlsx — Pedido unido Teja Food (PLU, Producto, Tienda, Local). */
async function generarExcelPedidoUnidoTejaFood(filas, fecha) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pedido Teja Food');

  ws.columns = [
    { header: 'PLU',      key: 'plu',    width: 15 },
    { header: 'Producto', key: 'nombre', width: 42 },
    { header: 'Sala',     key: 'tienda', width: 12 },
    { header: 'Tienda',   key: 'local',  width: 12 },
    { header: 'Marley',   key: 'marley', width: 12 },
    { header: 'Total',    key: 'total',  width: 12 },
  ];

  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } }; // violeta
    cell.alignment = { horizontal: 'center' };
  });

  filas.forEach((f, i) => {
    const row = ws.addRow({
      plu:    f.plu,
      nombre: f.nombre,
      tienda: f.tienda || 0,
      local:  f.local || 0,
      marley: f.marley || 0,
      total:  (f.tienda || 0) + (f.local || 0) + (f.marley || 0),
    });
    row.getCell('plu').alignment    = { horizontal: 'center' };
    row.getCell('tienda').alignment = { horizontal: 'center' };
    row.getCell('local').alignment  = { horizontal: 'center' };
    row.getCell('marley').alignment = { horizontal: 'center' };
    row.getCell('total').alignment  = { horizontal: 'center' };
    row.getCell('total').font       = { bold: true };
    if (i % 2 === 0) {
      row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F3FF' } }; });
    }
  });

  return wb.xlsx.writeBuffer();
}

/**
 * Envía UN correo consolidado del departamento Teja Food (Tienda + Local),
 * combinado por PLU. Se dispara cuando ambos pedidos del día están completos.
 * items: { tienda: [{pro_codigo_plu, pro_nombre_producto, cantidad}], local: [...] }
 */
/** Fecha de PRODUCCIÓN (mañana) en formato YYYY-MM-DD, hora local del servidor. */
function fechaMananaLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Envía el MISMO Excel del pedido unido Teja Food al KDS (Kitchen Manager),
 * para que la cocina lo vea en pantalla. Idempotente en el KDS (upsert).
 * Resiliente: cualquier fallo (KDS caído/timeout/config faltante) solo se loguea;
 * NUNCA lanza, para no romper el correo ni el flujo de la revisión.
 */
async function enviarPedidoAlKDS(excelBuffer) {
  const base = process.env.KITCHEN_API_URL;
  const apiKey = process.env.KITCHEN_API_KEY;
  if (!base || !apiKey) {
    console.error('[KDS] Omitido: falta KITCHEN_API_URL o KITCHEN_API_KEY en el .env');
    return;
  }
  const fecha = fechaMananaLocal();
  const url = `${base.replace(/\/+$/, '')}/api/integrations/planificacion`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000); // 15s máx
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ fecha, fileData: Buffer.from(excelBuffer).toString('base64') }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.error(`[KDS] Respuesta ${resp.status} al enviar planificación ${fecha}: ${txt.slice(0, 300)}`);
      return;
    }
    const data = await resp.json().catch(() => null);
    if (data && data.success) {
      const errCount = Array.isArray(data.errores) ? data.errores.length : 0;
      console.log(`[KDS] Planificación ${fecha} enviada ✓ — ${data.guardados ?? '?'} producto(s) guardados`
        + (errCount ? ` · ${errCount} error(es): ${JSON.stringify(data.errores).slice(0, 300)}` : ''));
    } else {
      console.error(`[KDS] Planificación ${fecha} sin success:`, JSON.stringify(data));
    }
  } catch (err) {
    console.error(`[KDS] No se pudo enviar la planificación al Kitchen Manager (${fecha}):`, err.message);
  } finally {
    clearTimeout(timeout);
  }
}

async function enviarPedidoUnidoTejaFood({ fecha, items, folios, correo = true, kds = true }) {
  const destinatario = process.env.EMAIL_TEJAFOOD_UNIDO || 'jeanpaulgame@tejamarket.cl';

  const fechaStr = new Date(fecha).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short', hour12: false,
  });

  // Combinar por PLU: { plu, nombre, tienda, local }
  const mapa = new Map();
  const acumular = (lista, campo) => {
    for (const it of (lista || [])) {
      const plu = String(it.pro_codigo_plu);
      if (!mapa.has(plu)) mapa.set(plu, { plu, nombre: it.pro_nombre_producto || '', tienda: 0, local: 0, marley: 0 });
      const reg = mapa.get(plu);
      if (!reg.nombre && it.pro_nombre_producto) reg.nombre = it.pro_nombre_producto;
      reg[campo] += Number(it.cantidad) || 0;
    }
  };
  acumular(items.tienda, 'tienda');
  acumular(items.local, 'local');
  acumular(items.marley, 'marley');

  const filas = [...mapa.values()].sort((a, b) =>
    (a.nombre || '').toLowerCase().localeCompare((b.nombre || '').toLowerCase()));

  const filasHTML = filas.map((f) => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${esc(f.plu)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">${esc(f.nombre)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#7c3aed;">${esc(f.tienda || 0)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#2563eb;">${esc(f.local || 0)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#b45309;">${esc(f.marley || 0)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:800;color:#0f172a;background:#f1f5f9;">${esc((f.tienda || 0) + (f.local || 0) + (f.marley || 0))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;"><tr><td align="center">
  <table width="660" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <tr><td style="background:linear-gradient(135deg,#7c3aed,#a855f7);padding:24px 28px;color:#fff;">
      <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:.85;">Teja Market — Pedido Consolidado</p>
      <h1 style="margin:6px 0 0;font-size:22px;">🍽️ Correo Unido — Depto Teja Food</h1>
    </td></tr>
    <tr><td style="padding:18px 28px;background:#f5f3ff;border-bottom:1px solid #ddd6fe;">
      <p style="margin:0;font-size:13px;color:#5b21b6;">
        <b>Sala + Tienda combinados</b> &nbsp;|&nbsp; <b>${filas.length}</b> producto(s) &nbsp;|&nbsp; <b>Fecha:</b> ${esc(fechaStr)}
      </p>
      ${folios ? `<p style="margin:8px 0 0;font-size:12px;color:#6d28d9;"><b>Pedidos del día:</b> Sala ${esc(folios.tienda || '—')} · Tienda ${esc(folios.local || '—')} · Marley ${esc(folios.marley || '—')}</p>` : ''}
    </td></tr>
    <tr><td style="padding:20px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr style="background:#1e293b;color:#fff;">
          <th style="padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;">PLU</th>
          <th style="padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;">Producto</th>
          <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Sala</th>
          <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Tienda</th>
          <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Marley</th>
          <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Total</th>
        </tr></thead>
        <tbody>${filasHTML || '<tr><td colspan="6" style="padding:14px;text-align:center;color:#64748b;">Sin productos pedidos</td></tr>'}</tbody>
      </table>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f8fafc;text-align:center;font-size:11px;color:#94a3b8;">
      Generado automáticamente — ${esc(fechaStr)}
    </td></tr>
  </table></td></tr></table></body></html>`;

  const excelBuffer = await generarExcelPedidoUnidoTejaFood(filas, fecha);

  // Correo a Jean — opcional. Hoy se envía UNA vez al día (tarea programada),
  // con el total del día; no en cada finalización.
  if (correo) {
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to:   destinatario,
      subject: `[Teja Food] Pedido unido Sala + Tienda — ${filas.length} producto(s)`,
      html,
      attachments: [{
        filename: `pedido_unido_tejafood.xlsx`,
        content: excelBuffer,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }],
    });
  }

  // KDS (Kitchen Manager) — opcional. Se actualiza en CADA finalización con el
  // total del día (upsert por fecha). Resiliente: si falla, solo loguea.
  if (kds) {
    await enviarPedidoAlKDS(excelBuffer);
  }

  return { enviado: correo, destinatario, productos: filas.length, correo, kds };
}

module.exports = { enviarOrdenProduccion, generarExcel, generarExcelReposicion, generarExcelPluCantidad, enviarReporteInfaltables, generarExcelInfaltables, enviarReporteTurnoInfaltables, generarExcelInfaltablesTurno, generarExcelResumenInfaltables, enviarPedidoUnidoTejaFood, enviarPedidoAlKDS };
