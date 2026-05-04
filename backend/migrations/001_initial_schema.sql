-- =============================================================
-- Teja Market — Gestión de Demanda & Reposición
-- Script completo desde CERO (MySQL / InnoDB)
-- Base de datos: Demanda
-- =============================================================

CREATE DATABASE IF NOT EXISTS `Demanda`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `Demanda`;

-- =============================================================
-- 1. DEPARTAMENTOS
-- =============================================================
CREATE TABLE IF NOT EXISTS departamentos (
    dep_id         VARCHAR(10)  NOT NULL,
    dep_nombre     VARCHAR(100) NOT NULL,
    dep_email_jefe VARCHAR(255) NULL COMMENT 'Correo del jefe para envío de reportes',
    CONSTRAINT pk_departamentos PRIMARY KEY (dep_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 2. USUARIOS (sin contraseña)
-- =============================================================
CREATE TABLE IF NOT EXISTS usuarios (
    usu_id     INT          NOT NULL AUTO_INCREMENT,
    usu_nombre VARCHAR(100) NOT NULL,
    CONSTRAINT pk_usuarios PRIMARY KEY (usu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 3. CONFIGURACIONES
--    dias_produccion_semana: días a la semana que se produce (default 6)
--    dias_seguridad_defecto: colchón de stock automático (default 2)
-- =============================================================
CREATE TABLE IF NOT EXISTS configuraciones (
    id                     INT           NOT NULL AUTO_INCREMENT,
    dep_id                 VARCHAR(10)   NOT NULL,
    dias_produccion_semana INT           NOT NULL DEFAULT 6,
    dias_seguridad_defecto INT           NOT NULL DEFAULT 2,
    CONSTRAINT pk_configuraciones PRIMARY KEY (id),
    CONSTRAINT fk_config_dep       FOREIGN KEY (dep_id)
        REFERENCES departamentos(dep_id) ON DELETE CASCADE,
    CONSTRAINT uq_config_dep       UNIQUE (dep_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 4. PRODUCTOS (Maestro — alimentado por CSV del ERP)
--    pro_dias_produccion_override: override de días de producción/semana
--    pro_dias_seguridad_override:  override de días de stock de seguridad
-- =============================================================
CREATE TABLE IF NOT EXISTS productos (
    pro_codigo_plu               VARCHAR(20)   NOT NULL,
    pro_codigo_barra             VARCHAR(50)   NULL,
    pro_nombre_producto          VARCHAR(255)  NOT NULL,
    vta_total_periodo            DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    dias_historial               INT           NOT NULL DEFAULT 30,
    dep_id                       VARCHAR(10)   NOT NULL,
    pro_dias_produccion_override INT           NULL COMMENT 'Override días producción/semana. NULL = usar config departamento',
    pro_dias_seguridad_override  INT           NULL COMMENT 'Override días stock seguridad. NULL = lógica automática',
    pro_dias_elaboracion         VARCHAR(50)   NULL COMMENT 'Días específicos de elaboración, ej: 1,3,5 (1=Lunes)',
    pro_cantidad_minima          INT           NULL DEFAULT 0 COMMENT 'Cantidad mínima a producir',
    CONSTRAINT pk_productos      PRIMARY KEY (pro_codigo_plu),
    CONSTRAINT fk_productos_dep  FOREIGN KEY (dep_id)
        REFERENCES departamentos(dep_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_productos_dep    ON productos(dep_id);
CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(pro_nombre_producto);
CREATE INDEX IF NOT EXISTS idx_productos_barra  ON productos(pro_codigo_barra);

-- =============================================================
-- 5. REVISIONES (Cabecera)
-- =============================================================
CREATE TABLE IF NOT EXISTS revisiones (
    rev_id      INT          NOT NULL AUTO_INCREMENT,
    rev_folio   VARCHAR(30)  NULL UNIQUE,
    usu_id      INT          NULL,
    rev_fecha   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    rev_usuario VARCHAR(100) NOT NULL DEFAULT 'Operador',
    dep_id      VARCHAR(10)  NOT NULL,
    rev_estado  ENUM('en_proceso', 'completada') NOT NULL DEFAULT 'en_proceso',
    CONSTRAINT pk_revisiones     PRIMARY KEY (rev_id),
    CONSTRAINT fk_revisiones_dep FOREIGN KEY (dep_id)
        REFERENCES departamentos(dep_id) ON DELETE RESTRICT,
    CONSTRAINT fk_rev_usu        FOREIGN KEY (usu_id)
        REFERENCES usuarios(usu_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_revisiones_dep   ON revisiones(dep_id);
CREATE INDEX IF NOT EXISTS idx_revisiones_fecha ON revisiones(rev_fecha);

-- =============================================================
-- 6. DETALLE REVISIÓN (Líneas de stock)
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
    CONSTRAINT uq_detalle_rev_pro UNIQUE (rev_id, pro_codigo_plu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX IF NOT EXISTS idx_detalle_rev ON detalle_revision(rev_id);

-- =============================================================
-- DATOS SEMILLA
-- =============================================================
INSERT IGNORE INTO departamentos (dep_id, dep_nombre) VALUES
    ('22', 'Pastelería');

INSERT IGNORE INTO usuarios (usu_nombre) VALUES
    ('Matías'), ('Operador 1'), ('Operador 2');

-- dias_produccion_semana=6 (produce Lu-Sa), dias_seguridad_defecto=2
INSERT IGNORE INTO configuraciones (dep_id, dias_produccion_semana, dias_seguridad_defecto) VALUES
    ('22', 6, 2);
