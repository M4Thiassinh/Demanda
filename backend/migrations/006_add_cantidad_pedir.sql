-- =============================================================
-- Migración 006: Agregar cantidad_pedir a detalle_revision
-- Ejecutar en MySQL Workbench sobre la BD Demanda
-- =============================================================
USE `demanda`;

-- 1. Agregar la nueva columna para guardar la decisión del usuario
ALTER TABLE detalle_revision
    ADD COLUMN det_cantidad_pedir INT NULL DEFAULT 0 COMMENT 'Cantidad decidida por el usuario para producir/pedir';
