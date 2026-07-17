-- =============================================================
-- 011 — Correos de infaltables por TURNO (AM/PM), no por departamento
--   * Antes: los destinatarios se tomaban de infaltables_config.correos_destino
--     de cada departamento y se unían. Confuso de mantener.
--   * Ahora: 2 listas fijas (una AM, una PM). El reporte del turno usa
--     directamente la lista de ese turno.
--   * infaltables_config.correos_destino queda en desuso (se conserva por
--     compatibilidad; la meta % sigue siendo por departamento).
-- =============================================================

CREATE TABLE IF NOT EXISTS infaltables_correos_turno (
  turno            ENUM('am','pm') NOT NULL,
  correos_destino  VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (turno)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Semilla: ambos turnos a Vladimir (editable desde la app)
INSERT INTO infaltables_correos_turno (turno, correos_destino) VALUES
  ('am', 'vladimir.bohorquez@tejamarket.cl'),
  ('pm', 'vladimir.bohorquez@tejamarket.cl')
ON DUPLICATE KEY UPDATE correos_destino = VALUES(correos_destino);
