const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306', 10),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'Demanda',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+00:00',
  charset:            'utf8mb4',
});

pool.getConnection()
  .then((conn) => { console.log('[DB] ✅ Conectado a MySQL'); conn.release(); })
  .catch((err) => console.error('[DB] ❌ Error de conexión:', err.message));

/**
 * Wrapper compatible con la interfaz { rows } que usan los controllers.
 * mysql2 devuelve [rows, fields]; nosotros devolvemos { rows }.
 */
const query = async (text, params) => {
  const [rows] = await pool.query(text, params);
  return { rows };
};

module.exports = { query, pool };
