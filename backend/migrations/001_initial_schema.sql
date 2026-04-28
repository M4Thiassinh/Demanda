-- =============================================================
-- Teja Market — Gestión de Demanda & Reposición
-- Migración 001: Esquema inicial
-- Motor: MySQL (InnoDB)
-- Base de datos: Demanda
-- =============================================================

-- Asegurar que usamos la base de datos correcta
CREATE DATABASE IF NOT EXISTS `Demanda`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `Demanda`;

-- =============================================================
-- 1. DEPARTAMENTOS
-- Catálogo de departamentos (dep_id viene del ERP, ej: '22')
-- =============================================================
CREATE TABLE IF NOT EXISTS departamentos (
    dep_id     VARCHAR(10)  NOT NULL,
    dep_nombre VARCHAR(100) NOT NULL,
    CONSTRAINT pk_departamentos PRIMARY KEY (dep_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================
-- 2. CONFIGURACIONES
-- Reglas dinámicas por departamento (sin hardcodeo en el backend)
-- =============================================================
CREATE TABLE IF NOT EXISTS configuraciones (
    id             INT            NOT NULL AUTO_INCREMENT,
    dep_id         VARCHAR(10)    NOT NULL,
    factor_ajuste  DECIMAL(10,4)  NOT NULL DEFAULT 1.2857,
    dias_seguridad INT            NOT NULL DEFAULT 2,
    CONSTRAINT pk_configuraciones PRIMARY KEY (id),
    CONSTRAINT fk_config_dep     FOREIGN KEY (dep_id)
        REFERENCES departamentos(dep_id) ON DELETE CASCADE,
    CONSTRAINT uq_config_dep     UNIQUE (dep_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================
-- 3. PRODUCTOS (Maestro — alimentado por CSV del ERP)
-- =============================================================
CREATE TABLE IF NOT EXISTS productos (
    pro_codigo_plu      VARCHAR(20)   NOT NULL,
    pro_nombre_producto VARCHAR(255)  NOT NULL,
    vta_total_periodo   DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    dias_historial      INT           NOT NULL DEFAULT 30,
    dep_id              VARCHAR(10)   NOT NULL,
    CONSTRAINT pk_productos     PRIMARY KEY (pro_codigo_plu),
    CONSTRAINT fk_productos_dep FOREIGN KEY (dep_id)
        REFERENCES departamentos(dep_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Índices para búsqueda rápida de productos
CREATE INDEX IF NOT EXISTS idx_productos_dep    ON productos(dep_id);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(pro_nombre_producto);


-- =============================================================
-- 4. REVISIONES (Cabecera)
-- MySQL soporta ENUM directamente en la columna
-- =============================================================
CREATE TABLE IF NOT EXISTS revisiones (
    rev_id      INT          NOT NULL AUTO_INCREMENT,
    rev_fecha   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rev_usuario VARCHAR(100) NOT NULL DEFAULT 'Operador',
    dep_id      VARCHAR(10)  NOT NULL,
    rev_estado  ENUM('en_proceso', 'completada') NOT NULL DEFAULT 'en_proceso',
    CONSTRAINT pk_revisiones     PRIMARY KEY (rev_id),
    CONSTRAINT fk_revisiones_dep FOREIGN KEY (dep_id)
        REFERENCES departamentos(dep_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_revisiones_dep   ON revisiones(dep_id);
CREATE INDEX IF NOT EXISTS idx_revisiones_fecha ON revisiones(rev_fecha);


-- =============================================================
-- 5. DETALLE REVISIÓN (Líneas de stock)
-- =============================================================
CREATE TABLE IF NOT EXISTS detalle_revision (
    det_id         INT         NOT NULL AUTO_INCREMENT,
    rev_id         INT         NOT NULL,
    pro_codigo_plu VARCHAR(20) NOT NULL,
    det_stock_sala INT         NOT NULL DEFAULT 0,
    CONSTRAINT pk_detalle         PRIMARY KEY (det_id),
    CONSTRAINT fk_detalle_rev     FOREIGN KEY (rev_id)
        REFERENCES revisiones(rev_id) ON DELETE CASCADE,
    CONSTRAINT fk_detalle_pro     FOREIGN KEY (pro_codigo_plu)
        REFERENCES productos(pro_codigo_plu) ON DELETE RESTRICT,
    -- Evita duplicar el mismo PLU en la misma revisión
    CONSTRAINT uq_detalle_rev_pro UNIQUE (rev_id, pro_codigo_plu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_detalle_rev ON detalle_revision(rev_id);


-- =============================================================
-- DATOS SEMILLA
-- INSERT IGNORE evita error si el registro ya existe (equivale
-- al ON CONFLICT DO NOTHING de PostgreSQL)
-- =============================================================
INSERT IGNORE INTO departamentos (dep_id, dep_nombre) VALUES
    ('22', 'Pastelería');

INSERT IGNORE INTO configuraciones (dep_id, factor_ajuste, dias_seguridad) VALUES
    ('22', 1.2857, 2);
