const db = require('../config/db');

/**
 * Lee la configuración de un departamento.
 * Si no existe, la crea con valores por defecto.
 */
async function getConfig(depId) {
  let { rows } = await db.query(
    'SELECT dias_produccion_semana, dias_seguridad_defecto FROM configuraciones WHERE dep_id = ?',
    [depId]
  );

  if (!rows.length) {
    await db.query(
      'INSERT IGNORE INTO configuraciones (dep_id, dias_produccion_semana, dias_seguridad_defecto) VALUES (?, 6, 2)',
      [depId]
    );
    ({ rows } = await db.query(
      'SELECT dias_produccion_semana, dias_seguridad_defecto FROM configuraciones WHERE dep_id = ?',
      [depId]
    ));
  }

  return {
    dias_produccion_semana: parseInt(rows[0].dias_produccion_semana, 10),
    dias_seguridad_defecto: parseInt(rows[0].dias_seguridad_defecto, 10),
  };
}

async function updateConfig(depId, campos) {
  const { dias_produccion_semana, dias_seguridad_defecto } = campos;
  await db.query(
    `UPDATE configuraciones
        SET dias_produccion_semana = COALESCE(?, dias_produccion_semana),
            dias_seguridad_defecto = COALESCE(?, dias_seguridad_defecto)
      WHERE dep_id = ?`,
    [dias_produccion_semana ?? null, dias_seguridad_defecto ?? null, depId]
  );
}

module.exports = { getConfig, updateConfig };
