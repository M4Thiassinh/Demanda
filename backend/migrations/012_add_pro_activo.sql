-- =============================================================
-- 012 — Producto activo/inactivo
--   * pro_activo = 1 (activo, por defecto) / 0 (desactivado).
--   * Los desactivados NO aparecen en el escaneo de sala del operador
--     (búsqueda por código/nombre ni en la lista de "no escaneados"),
--     pero SIGUEN en la base (se pueden reactivar) — no se eliminan.
--   * Se gestiona desde el Panel Maestro.
-- =============================================================

ALTER TABLE productos
  ADD COLUMN pro_activo TINYINT(1) NOT NULL DEFAULT 1;
