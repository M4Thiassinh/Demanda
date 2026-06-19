const { parse } = require('csv-parse');
const ExcelJS = require('exceljs');
const db = require('../config/db');

/**
 * Parsea un buffer (CSV o Excel) y hace UPSERT en la tabla productos (MySQL).
 */
async function importarCSV(fileBuffer, depId, diasHistorial, onlyUpdateExisting = false) {
  // Detectar si el buffer es un archivo Excel (.xlsx) verificando los bytes 'PK'
  const isExcel = fileBuffer.length > 2 && fileBuffer[0] === 0x50 && fileBuffer[1] === 0x4B;

  let registros = [];
  if (isExcel) {
    registros = await parsearExcel(fileBuffer);
  } else {
    registros = await parsearCSV(fileBuffer);
  }

  // Filtrar registros completamente vacíos
  registros = registros.filter(row => row.some(cell => String(cell).trim() !== ''));

  if (registros.length === 0) {
    return { insertados: 0, actualizados: 0, errores: ['El archivo está vacío o no se pudo procesar.'] };
  }

  // Detectar mapeo de columnas basándonos en la primera fila
  let mapping = detectarColumnas(registros[0]);
  let startIdx = 0;

  if (mapping.hasHeaders) {
    startIdx = 1; // Omitimos la primera fila porque es cabecera
  } else {
    // Si no tiene cabeceras o no se detectaron, usamos mapeo por posición según cantidad de columnas
    const colsCount = registros[0].length;
    mapping = {
      pluIdx: -1,
      nombreIdx: -1,
      barraIdx: -1,
      diasIdx: -1,
      cantIdx: -1,
      diasProdIdx: -1,
      diasSegIdx: -1,
      minReqIdx: -1,
      hasHeaders: false
    };

    if (colsCount >= 8) {
      // Formato Excel completo de 8 columnas: PLU, Nombre, Dias, Cantidad, Prom dia (ignorado), Dias Prod, Dia seg, Min req
      mapping.pluIdx = 0;
      mapping.nombreIdx = 1;
      mapping.diasIdx = 2;
      mapping.cantIdx = 3;
      mapping.diasProdIdx = 5;
      mapping.diasSegIdx = 6;
      mapping.minReqIdx = 7;
    } else if (colsCount === 4) {
      // Formato 4 columnas: Barra, PLU, Nombre, Cantidad
      mapping.barraIdx = 0;
      mapping.pluIdx = 1;
      mapping.nombreIdx = 2;
      mapping.cantIdx = 3;
    } else {
      // Formato tradicional 3 columnas: PLU, Nombre, Cantidad
      mapping.pluIdx = 0;
      mapping.nombreIdx = 1;
      mapping.cantIdx = 2;
    }
  }

  let insertados   = 0;
  let actualizados = 0;
  const errores    = [];

  // Toda la importación corre dentro de una transacción y una sola conexión,
  // garantizando liberación de la conexión (finally) y atomicidad ante fallos graves.
  const connection = await db.pool.getConnection();
  await connection.beginTransaction();

  const cleanInt = (val) => {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    const num = parseInt(String(val).replace(/[^0-9-]/g, ''), 10);
    return isNaN(num) ? null : num;
  };

  const cleanFloat = (val) => {
    if (val === null || val === undefined || String(val).trim() === '') return null;
    if (typeof val === 'number') return val;
    const cleaned = String(val).replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  const cleanString = (val) => {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  };

  // Iterar y guardar
  try {
  for (let i = startIdx; i < registros.length; i++) {
    const fila = registros[i];
    try {
      const plu = mapping.pluIdx !== -1 ? cleanString(fila[mapping.pluIdx]) : '';
      const nombre = mapping.nombreIdx !== -1 ? cleanString(fila[mapping.nombreIdx]) : '';
      const barra = mapping.barraIdx !== -1 ? cleanString(fila[mapping.barraIdx]) : null;
      
      const diasRow = mapping.diasIdx !== -1 ? cleanInt(fila[mapping.diasIdx]) : null;
      const dias = diasRow !== null ? diasRow : diasHistorial;

      let ventas = mapping.cantIdx !== -1 ? cleanFloat(fila[mapping.cantIdx]) : null;
      // Si la venta total no viene especificada pero sí viene el promedio diario (Prom dia / Porm dia)
      if (ventas === null && mapping.promDiaIdx !== -1 && mapping.promDiaIdx !== undefined) {
        const promDiario = cleanFloat(fila[mapping.promDiaIdx]);
        if (promDiario !== null) {
          ventas = Number((promDiario * dias).toFixed(2));
        }
      }

      if (!plu || !nombre || ventas === null) {
        errores.push(`Fila ${i + 1} inválida o incompleta (se requiere PLU, Nombre y Ventas o Promedio Diario): ${JSON.stringify(fila)}`);
        continue;
      }

      // Determinar si el archivo contenía alguna columna de override
      const tieneOverrideCols = mapping.diasProdIdx !== -1 || mapping.diasSegIdx !== -1 || mapping.minReqIdx !== -1;

      let result;
      if (onlyUpdateExisting) {
        if (tieneOverrideCols) {
          const diasProdOverride = mapping.diasProdIdx !== -1 ? cleanInt(fila[mapping.diasProdIdx]) : null;
          const diasSegOverride = mapping.diasSegIdx !== -1 ? cleanInt(fila[mapping.diasSegIdx]) : null;
          const minReqOverride = mapping.minReqIdx !== -1 ? cleanInt(fila[mapping.minReqIdx]) : null;

          const [rows] = await connection.query(
            `UPDATE productos
             SET pro_codigo_barra             = COALESCE(?, pro_codigo_barra),
                 pro_nombre_producto          = ?,
                 vta_total_periodo            = ?,
                 dias_historial               = ?,
                 pro_dias_produccion_override = ?,
                 pro_dias_seguridad_override  = ?,
                 pro_cantidad_minima          = ?
             WHERE pro_codigo_plu = ? AND dep_id = ?`,
            [barra || null, nombre, ventas, dias, diasProdOverride, diasSegOverride, minReqOverride, plu, depId]
          );
          result = rows;
        } else {
          const [rows] = await connection.query(
            `UPDATE productos
             SET pro_codigo_barra    = COALESCE(?, pro_codigo_barra),
                 pro_nombre_producto = ?,
                 vta_total_periodo   = ?,
                 dias_historial      = ?
             WHERE pro_codigo_plu = ? AND dep_id = ?`,
            [barra || null, nombre, ventas, dias, plu, depId]
          );
          result = rows;
        }
        if (result.affectedRows > 0) {
          actualizados++;
        }
      } else {
        if (tieneOverrideCols) {
          const diasProdOverride = mapping.diasProdIdx !== -1 ? cleanInt(fila[mapping.diasProdIdx]) : null;
          const diasSegOverride = mapping.diasSegIdx !== -1 ? cleanInt(fila[mapping.diasSegIdx]) : null;
          const minReqOverride = mapping.minReqIdx !== -1 ? cleanInt(fila[mapping.minReqIdx]) : null;

          const [rows] = await connection.query(
            `INSERT INTO productos
               (pro_codigo_plu, pro_codigo_barra, pro_nombre_producto, vta_total_periodo, dias_historial, dep_id,
                pro_dias_produccion_override, pro_dias_seguridad_override, pro_cantidad_minima)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               pro_codigo_barra             = COALESCE(VALUES(pro_codigo_barra), pro_codigo_barra),
               pro_nombre_producto          = VALUES(pro_nombre_producto),
               vta_total_periodo            = VALUES(vta_total_periodo),
               dias_historial               = VALUES(dias_historial),
               dep_id                       = VALUES(dep_id),
               pro_dias_produccion_override = VALUES(pro_dias_produccion_override),
               pro_dias_seguridad_override  = VALUES(pro_dias_seguridad_override),
               pro_cantidad_minima          = VALUES(pro_cantidad_minima)`,
            [plu, barra || null, nombre, ventas, dias, depId, diasProdOverride, diasSegOverride, minReqOverride]
          );
          result = rows;
        } else {
          // Formato clásico: solo actualiza ventas, y deja intactos los overrides que ya están en la base de datos
          const [rows] = await connection.query(
            `INSERT INTO productos
               (pro_codigo_plu, pro_codigo_barra, pro_nombre_producto, vta_total_periodo, dias_historial, dep_id)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               pro_codigo_barra    = COALESCE(VALUES(pro_codigo_barra), pro_codigo_barra),
               pro_nombre_producto = VALUES(pro_nombre_producto),
               vta_total_periodo   = VALUES(vta_total_periodo),
               dias_historial      = VALUES(dias_historial),
               dep_id              = VALUES(dep_id)`,
            [plu, barra || null, nombre, ventas, dias, depId]
          );
          result = rows;
        }

        if (result.affectedRows === 1)      insertados++;
        else if (result.affectedRows === 2) actualizados++;
      }

    } catch (err) {
      errores.push(`Error en fila ${i + 1} (${JSON.stringify(fila)}): ${err.message}`);
    }
  }

    await connection.commit();
    return { insertados, actualizados, errores };
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * Parsea un buffer de archivo Excel usando exceljs.
 */
async function parsearExcel(fileBuffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const worksheet = workbook.worksheets[0];
  const records = [];

  worksheet.eachRow((row) => {
    const rowData = [];
    const maxCol = worksheet.columnCount;
    // Asegurar leer al menos 8 columnas para capturar celdas vacías del final
    const colsToRead = Math.max(maxCol, 8);
    for (let c = 1; c <= colsToRead; c++) {
      let val = row.getCell(c).value;
      if (val && typeof val === 'object') {
        if (val.result !== undefined) {
          val = val.result;
        } else if (val.richText) {
          val = val.richText.map(t => t.text).join('');
        } else if (val.text) {
          val = val.text;
        }
      }
      rowData.push(val === undefined || val === null ? '' : val);
    }
    records.push(rowData);
  });

  return records;
}

/**
 * Parsea un buffer de CSV usando csv-parse.
 */
function parsearCSV(buffer) {
  return new Promise((resolve, reject) => {
    parse(buffer, {
      delimiter:          ';',   // CSV del ERP usa punto y coma
      quote:              '"',   // valores entre comillas dobles
      trim:               true,
      skip_empty_lines:   true,
      relax_column_count: true,
    }, (err, records) => {
      if (err) return reject(err);
      resolve(records);
    });
  });
}

/**
 * Analiza una fila de cabecera para mapear los índices de columnas.
 */
function detectarColumnas(firstRow) {
  const mapping = {
    pluIdx: -1,
    nombreIdx: -1,
    barraIdx: -1,
    diasIdx: -1,
    cantIdx: -1,
    diasProdIdx: -1,
    diasSegIdx: -1,
    minReqIdx: -1,
    promDiaIdx: -1,
    hasHeaders: false
  };

  if (!firstRow || !firstRow.length) return mapping;

  const normalizar = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // quitar acentos
      .replace(/[^a-z0-9]/g, "") // quitar caracteres especiales
      .trim();
  };

  // El orden importa: reglas más específicas primero. En particular, "ventas" se evalúa
  // ANTES que "días/periodo" para que una cabecera como "Vta total periodo" no se mapee
  // erróneamente como columna de días. Cada índice solo se asigna una vez.
  const set = (key, idx) => { if (mapping[key] === -1) mapping[key] = idx; };

  firstRow.forEach((cell, idx) => {
    const norm = normalizar(cell);
    if (!norm) return;

    if (norm === 'plu' || norm === 'codplu' || norm === 'codigoplu') {
      set('pluIdx', idx);
    } else if (norm.includes('barra') || norm.includes('codbarra') || norm === 'ean') {
      set('barraIdx', idx);
    } else if (norm.includes('desc') || norm === 'nombre' || norm === 'producto') {
      set('nombreIdx', idx);
    } else if (norm.includes('prom') || norm.includes('porm') || norm.includes('promedio')) {
      set('promDiaIdx', idx);
    } else if (norm.includes('cant') || norm.includes('vta') || norm.includes('venta') || norm === 'total') {
      set('cantIdx', idx);
    } else if (norm.includes('prod') || norm.includes('produccion')) {
      set('diasProdIdx', idx);
    } else if (norm.includes('seg') || norm.includes('seguridad')) {
      set('diasSegIdx', idx);
    } else if (norm.includes('min') || norm.includes('req') || norm.includes('requerimiento')) {
      set('minReqIdx', idx);
    } else if (norm === 'dias' || norm === 'dia' || norm.includes('historial') || norm.includes('periodo')) {
      set('diasIdx', idx);
    }
  });

  // Si se encontró al menos PLU y alguno de Nombre o Cantidad, consideramos que tiene cabeceras
  if (mapping.pluIdx !== -1 && (mapping.nombreIdx !== -1 || mapping.cantIdx !== -1)) {
    mapping.hasHeaders = true;
  }

  return mapping;
}

module.exports = { importarCSV };
