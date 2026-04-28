const db = require('../config/db');

async function getConfig(depId) {
  let { rows } = await db.query(
    'SELECT factor_ajuste, dias_seguridad_defecto FROM configuraciones WHERE dep_id = ?',
    [depId]
  );
  if (!rows.length) {
    await db.query(
      'INSERT IGNORE INTO configuraciones (dep_id, factor_ajuste, dias_seguridad_defecto) VALUES (?, 1.2857, 2)',
      [depId]
    );
    ({ rows } = await db.query(
      'SELECT factor_ajuste, dias_seguridad_defecto FROM configuraciones WHERE dep_id = ?',
      [depId]
    ));
  }
  return {
    factor_ajuste:          parseFloat(rows[0].factor_ajuste),
    dias_seguridad_defecto: parseInt(rows[0].dias_seguridad_defecto, 10),
  };
}

async function updateConfig(depId, campos) {
  const { factor_ajuste, dias_seguridad_defecto } = campos;
  await db.query(
    `UPDATE configuraciones
        SET factor_ajuste          = COALESCE(?, factor_ajuste),
            dias_seguridad_defecto = COALESCE(?, dias_seguridad_defecto)
      WHERE dep_id = ?`,
    [factor_ajuste ?? null, dias_seguridad_defecto ?? null, depId]
  );
}

module.exports = { getConfig, updateConfig };
