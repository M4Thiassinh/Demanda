require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const adminRoutes    = require('./routes/admin.routes');
const operatorRoutes = require('./routes/operator.routes');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middlewares ──────────────────────────────────────────────
// CORS: si se define CORS_ORIGINS (lista separada por comas) se restringe a esos orígenes;
// si no, se permite cualquiera (útil en LAN). Como la auth viaja en headers (no cookies),
// no se habilitan credenciales.
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigins.length ? corsOrigins : '*' }));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── API ──────────────────────────────────────────────────────
app.use('/api', adminRoutes);
app.use('/api/revision', operatorRoutes);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

// ── Frontend estático (producción) ───────────────────────────
const distPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(distPath));
// SPA fallback: cualquier ruta no-API devuelve el index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ── Error global ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err.stack || err.message);
  const status = err.status || 500;
  // No filtrar detalles internos al cliente salvo errores de validación (4xx) controlados.
  const mensaje = status < 500 ? err.message : 'Error interno del servidor';
  res.status(status).json({ error: mensaje });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Teja Market corriendo en http://0.0.0.0:${PORT}`);
  console.log(`   → Desde la red local: http://TU_IP:${PORT}`);
});

