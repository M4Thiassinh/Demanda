require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const adminRoutes    = require('./routes/admin.routes');
const operatorRoutes = require('./routes/operator.routes');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middlewares ──────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  console.error('[ERROR]', err.message);
  res.status(err.status || 500).json({ error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Teja Market corriendo en http://0.0.0.0:${PORT}`);
  console.log(`   → Desde la red local: http://TU_IP:${PORT}`);
});

