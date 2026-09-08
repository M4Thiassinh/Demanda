-- Distingue a los usuarios por área: los que toman stock en SALA vs los que
-- toman inventario en BODEGA. Así cada perfil muestra solo su propia lista y no
-- se mezclan. Por defecto 'sala' (los usuarios existentes no cambian de flujo).
ALTER TABLE usuarios
  ADD COLUMN usu_area ENUM('sala','bodega') NOT NULL DEFAULT 'sala';
