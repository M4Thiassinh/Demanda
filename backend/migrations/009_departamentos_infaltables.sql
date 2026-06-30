-- =============================================================
-- 009 — Marca de departamento "Infaltable"
--   * dep_infaltable: solo los departamentos marcados aparecen
--     en el selector del perfil Infaltables.
--   * Se siembra por dep_id (resueltos contra la base real).
-- =============================================================

ALTER TABLE departamentos
  ADD COLUMN dep_infaltable TINYINT(1) NOT NULL DEFAULT 0;

UPDATE departamentos SET dep_infaltable = 1
 WHERE dep_id IN (
   -- Turno PM
   '345',   -- Autoservicio Carnicería
   '13',    -- Carnes
   '8',     -- Rotisería y Fiambres
   '344',   -- Autoservicio Rotisería
   -- Turno AM
   '16',    -- Panadería
   '22',    -- Pastelería
   '334',   -- Congelados
   '337',   -- Frutas y Verduras
   '1347',  -- Local Teja Food
   '2347'   -- Sala Teja Food
 );

-- Verificación: deberían salir exactamente los 10 esperados.
-- SELECT dep_id, dep_nombre, dep_infaltable FROM departamentos WHERE dep_infaltable = 1 ORDER BY dep_nombre;
