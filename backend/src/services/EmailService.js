const nodemailer = require('nodemailer');
const ExcelJS    = require('exceljs');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

/** Genera buffer .xlsx con los quiebres */
async function generarExcel(quiebres, depNombre, folio, fecha) {
  const wb  = new ExcelJS.Workbook();
  const ws  = wb.addWorksheet('Reposición');

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
    { header: 'A Producir',     key: 'reponer', width: 12 },
  ];

  // Estilo encabezado
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
      stock:  q.det_stock_sala,
      vd:     q.ventaDiaria,
      lote:   q.loteProduccionBase,
      seg:    q.stockSeguridadCalculado,
      dem:    q.demandaTotalRequerida,
      reponer: q.cantidadAProducir,
    });
    // Alternar color de fila
    if (i % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } };
      });
    }
  });

  // Resaltar columna "A Reponer"
  ws.getColumn('reponer').eachCell({ includeEmpty: false }, (cell, rowNum) => {
    if (rowNum > 1) {
      cell.font = { bold: true, color: { argb: 'FFEA580C' } };
      cell.alignment = { horizontal: 'center' };
    }
  });

  return wb.xlsx.writeBuffer();
}

/**
 * Envía correo HTML + adjunto Excel con los quiebres.
 */
async function enviarOrdenProduccion({ depNombre, revFecha, folio, usuNombre, quiebres }) {
  const fecha = new Date(revFecha).toLocaleString('es-CL', {
    timeZone: 'America/Santiago', dateStyle: 'full', timeStyle: 'short',
  });

  const filas = quiebres.map((q) => `
    <tr>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;">${q.pro_codigo_plu}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;">${q.pro_nombre_producto}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${q.det_stock_sala}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-weight:700;color:#ea580c;font-size:17px;">${q.cantidadAProducir}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="es"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
  <tr><td align="center">
  <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">
    <tr><td style="background:linear-gradient(135deg,#ea580c,#f97316);padding:24px 28px;color:#fff;">
      <p style="margin:0;font-size:11px;text-transform:uppercase;letter-spacing:2px;opacity:.8;">Teja Market — Sistema de Producción</p>
      <h1 style="margin:6px 0 0;font-size:22px;">📋 Orden de Reposición</h1>
    </td></tr>
    <tr><td style="padding:18px 28px;background:#fff7ed;border-bottom:1px solid #fed7aa;">
      <p style="margin:0;font-size:13px;color:#7c2d12;">
        <b>Folio:</b> ${folio} &nbsp;|&nbsp; <b>Depto:</b> ${depNombre} &nbsp;|&nbsp;
        <b>Usuario:</b> ${usuNombre || 'Operador'} &nbsp;|&nbsp; <b>Fecha:</b> ${fecha}
      </p>
      <p style="margin:8px 0 0;font-size:13px;color:#9a3412;">
        <b>${quiebres.length}</b> producto(s) requieren reposición inmediata.
      </p>
    </td></tr>
    <tr><td style="padding:20px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead><tr style="background:#1e293b;color:#fff;">
          <th style="padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;">PLU</th>
          <th style="padding:11px 12px;text-align:left;font-size:11px;text-transform:uppercase;">Producto</th>
          <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">Stock Sala</th>
          <th style="padding:11px 12px;text-align:center;font-size:11px;text-transform:uppercase;">A Reponer</th>
        </tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </td></tr>
    <tr><td style="padding:16px 28px;background:#f8fafc;text-align:center;font-size:11px;color:#94a3b8;">
      Generado automáticamente — ${fecha}
    </td></tr>
  </table></td></tr></table></body></html>`;

  const excelBuffer = await generarExcel(quiebres, depNombre, folio, revFecha);

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM,
    to:      process.env.EMAIL_PRODUCCION,
    subject: `[Reposición] ${folio} — ${depNombre} — ${quiebres.length} ítem(s)`,
    html,
    attachments: [{
      filename:    `reposicion_${folio}.xlsx`,
      content:     excelBuffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  });
}

module.exports = { enviarOrdenProduccion, generarExcel };
