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
  tls: { rejectUnauthorized: false },
});

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
      cantidad: q.cantidadAProducir,
    });
    
    // Formato de texto y alineación al centro
    row.getCell('plu').alignment = { horizontal: 'center' };
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
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${q.pro_codigo_plu}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">${q.pro_nombre_producto}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#ea580c;font-size:17px;">${q.cantidadAProducir}</td>
    </tr>`).join('');

  const filasReposicion = quiebres.map((q) => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${q.pro_codigo_plu}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">${q.pro_nombre_producto}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${Math.round(q.demandaTotalRequerida || 0)}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${q.det_stock_sala ?? 0}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#1d4ed8;font-size:17px;">${q.cantidadAProducir}</td>
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
        <b>Folio:</b> ${folio} &nbsp;|&nbsp; <b>Depto:</b> ${depNombre} &nbsp;|&nbsp;
        <b>Usuario:</b> ${usuNombre || 'Operador'} &nbsp;|&nbsp; <b>Fecha:</b> ${fecha}
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

module.exports = { enviarOrdenProduccion, generarExcel, generarExcelReposicion, generarExcelPluCantidad };
