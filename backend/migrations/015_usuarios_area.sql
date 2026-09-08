-- Distingue a los usuarios por área: los que toman stock en SALA vs los que
-- toman inventario en BODEGA. Así cada perfil muestra solo su propia lista y no
-- se mezclan. Por defecto 'sala' (los usuarios existentes no cambian de flujo).
ALTER TABLE usuarios
  ADD COLUMN usu_area ENUM('sala','bodega') NOT NULL DEFAULT 'sala';

-- Usuario de ejemplo para el perfil Toma de Bodega (renombrable/eliminable desde
-- el panel). Idempotente: si ya existe, no se duplica al re-ejecutar.
INSERT INTO usuarios (usu_nombre, usu_area)
SELECT 'Bodega (ejemplo)', 'bodega' FROM DUAL
 WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE usu_nombre = 'Bodega (ejemplo)');
