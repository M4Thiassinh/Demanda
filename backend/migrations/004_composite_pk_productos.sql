-- =============================================================
-- Migración 004: Llave primaria compuesta para productos
-- Ejecutar en MySQL Workbench sobre la BD Demanda
-- =============================================================
USE `demanda`;

-- 1. Eliminar la restricción de llave foránea en detalle_revision
-- Si esta instrucción falla, verifique el nombre de la restricción en la base de datos
ALTER TABLE detalle_revision
    DROP FOREIGN KEY fk_detalle_pro;

-- 2. Eliminar la llave primaria actual de la tabla productos
ALTER TABLE productos
    DROP PRIMARY KEY;

-- 3. Agregar la nueva llave primaria compuesta
ALTER TABLE productos
    ADD CONSTRAINT pk_productos PRIMARY KEY (pro_codigo_plu, dep_id);