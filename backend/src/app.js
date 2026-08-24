require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const adminRoutes     = require('./routes/admin.routes');
const operatorRoutes  = require('./routes/operator.routes');
const infaltablesRoutes = require('./routes/infaltables.routes');

const app  = express();
const PORT = process.env.PORT || 3001;

// Detrás de Ngrok/reverse-proxy: confiar en X-Forwarded-For para que req.ip
// sea la IP real del cliente (y no 127.0.0.1 para todos). Imprescindible para
// que el rate-limiter de login distinga un dispositivo de otro.
app.set('trust proxy', true);

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
app.use('/api/infaltables', infaltablesRoutes);
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

// ── Tarea programada: correo diario Teja Food a Jean ──────────
// Envía UNA vez al día el pedido unido (suma del día). El KDS se actualiza en
// tiempo real en cada finalización; esto es solo el correo. Hora de corte
// configurable por env (TEJAFOOD_HORA_CORREO / TEJAFOOD_MIN_CORREO), zona Chile.
//
// A partir de la hora de corte reintenta cada minuto hasta que el pedido del día
// esté COMPLETO (Local + Sala) y ahí lo manda. Así no se pierde aunque el
// personal termine los pedidos pasadas las 21:00. La marca de "ya enviado hoy"
// se guarda en BD (tabla app_estado) para que un reinicio no cause doble envío.
const { enviarCorreoDiarioTejaFood } = require('./controllers/revision.controller');
const db = require('./config/db');
(function iniciarCorreoDiarioTejaFood() {
  const HORA = parseInt(process.env.TEJAFOOD_HORA_CORREO || '21', 10);
  const MIN  = parseInt(process.env.TEJAFOOD_MIN_CORREO  || '0', 10);
  const CLAVE = 'tejafood_ultimo_correo';
  let avisoEsperaDia = null; // para loguear "en espera" solo una vez por día

  const yaEnviadoHoy = async (hoy) => {
    try {
      const { rows } = await db.query('SELECT valor FROM app_estado WHERE clave = ?', [CLAVE]);
      return rows.length > 0 && rows[0].valor === hoy;
    } catch (e) {
      console.error('[TejaFood] No se pudo leer app_estado:', e.message);
      return false; // ante la duda, no bloquear el envío
    }
  };
  const marcarEnviado = async (hoy) => {
    await db.query(
      `INSERT INTO app_estado (clave, valor) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [CLAVE, hoy]
    );
  };

  const chequear = async () => {
    try {
      const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date());
      const val = (t) => partes.find((x) => x.type === t)?.value;
      const hoy = `${val('year')}-${val('month')}-${val('day')}`;
      const h = parseInt(val('hour'), 10), m = parseInt(val('minute'), 10);

      // Solo desde la hora de corte en adelante.
      const enVentana = h > HORA || (h === HORA && m >= MIN);
      if (!enVentana) return;
      if (await yaEnviadoHoy(hoy)) return;

      const r = await enviarCorreoDiarioTejaFood();
      if (r && r.enviado) {
        await marcarEnviado(hoy);
        console.log(`[TejaFood] Correo diario del ${hoy} enviado y marcado (no se repetirá hoy).`);
      } else if (r && r.motivo === 'incompleto' && avisoEsperaDia !== hoy) {
        avisoEsperaDia = hoy;
        console.log(`[TejaFood] ${hoy}: pedido del día aún incompleto; reintentaré cada minuto hasta que esté listo.`);
      }
    } catch (e) { console.error('[TejaFood] Error en tarea programada:', e.message); }
  };
  setInterval(chequear, 60 * 1000);
  console.log(`⏰ Correo diario Teja Food: desde las ${String(HORA).padStart(2, '0')}:${String(MIN).padStart(2, '0')} se envía apenas el pedido del día esté completo (America/Santiago)`);
})();

