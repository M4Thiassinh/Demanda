-- =============================================================
-- Migración 003: Correos de departamentos y límites de producción
-- Ejecutar en MySQL Workbench sobre la BD Demanda
-- =============================================================
USE `Demanda`;

-- 1. Agregar correo de jefe de departamento
ALTER TABLE departamentos
    ADD COLUMN IF NOT EXISTS dep_email_jefe VARCHAR(255) NULL COMMENT 'Correo del jefe para envío de reportes';

-- 2. Agregar límites y reglas de producción a productos
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS pro_dias_elaboracion VARCHAR(50) NULL COMMENT 'Días específicos de elaboración, ej: 1,3,5 (1=Lunes)',
    ADD COLUMN IF NOT EXISTS pro_cantidad_minima  INT         NULL DEFAULT 0 COMMENT 'Cantidad mínima a producir';
