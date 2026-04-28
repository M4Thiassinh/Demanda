const { parse } = require('csv-parse');
const db = require('../config/db');

/**
 * Parsea un buffer CSV y hace UPSERT en la tabla productos (MySQL).
 *
 * Formato CSV esperado (con o sin header):
 *   pro_codigo_plu, pro_nombre_producto, vta_total_periodo
 *   1234, "Kuchen de Nuez", 250.5
 */
async function importarCSV(fileBuffer, depId, diasHistorial) {
  const registros = await parsearCSV(fileBuffer);

  let insertados   = 0;
  let actualizados = 0;
  const errores    = [];

  for (const fila of registros) {
    try {
      let barra, plu, nombre, ventas;

      if (fila.length >= 4) {
        // Formato nuevo: Cod_Barra ; PLU ; Nombre ; Ventas_Total
        barra  = String(fila[0]).trim();
        plu    = String(fila[1]).trim();
        nombre = String(fila[2]).trim();
        ventas = parseFloat(String(fila[3]).replace(',', '.'));
      } else {
        // Formato antiguo: PLU ; Nombre ; Ventas_Total
        barra  = null;
        plu    = String(fila[0]).trim();
        nombre = String(fila[1]).trim();
        ventas = parseFloat(String(fila[2]).replace(',', '.'));
      }

      if (!plu || !nombre || isNaN(ventas)) {
        errores.push(`Fila inválida: ${JSON.stringify(fila)}`);
        continue;
      }

      const { rows: result } = await db.query(
        `INSERT INTO productos
           (pro_codigo_plu, pro_codigo_barra, pro_nombre_producto, vta_total_periodo, dias_historial, dep_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           pro_codigo_barra    = VALUES(pro_codigo_barra),
           pro_nombre_producto = VALUES(pro_nombre_producto),
           vta_total_periodo   = VALUES(vta_total_periodo),
           dias_historial      = VALUES(dias_historial),
           dep_id              = VALUES(dep_id)`,
        [plu, barra || null, nombre, ventas, diasHistorial, depId]
      );

      if (result.affectedRows === 1)      insertados++;
      else if (result.affectedRows === 2) actualizados++;

    } catch (err) {
      errores.push(`Error en fila ${JSON.stringify(fila)}: ${err.message}`);
    }
  }

  return { insertados, actualizados, errores };
}

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

      // Si la primera fila es header (PLU no numérico), la omitimos
      if (records.length && isNaN(parseFloat(records[0][0]))) {
        records.shift();
      }

      resolve(records);
    });
  });
}

module.exports = { importarCSV };
