-- =============================================================
-- Migración 002: Usuarios, código de barra, override días,
--               folio de revisión y ajuste de configuraciones
-- Ejecutar en MySQL Workbench sobre la BD Demanda
-- =============================================================
USE `Demanda`;

-- 1. Tabla de usuarios (sin contraseña)
CREATE TABLE IF NOT EXISTS usuarios (
    usu_id     INT          NOT NULL AUTO_INCREMENT,
    usu_nombre VARCHAR(100) NOT NULL,
    CONSTRAINT pk_usuarios PRIMARY KEY (usu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO usuarios (usu_nombre) VALUES
    ('Matías'), ('Operador 1'), ('Operador 2');

-- 2. Columnas nuevas en productos
ALTER TABLE productos
    ADD COLUMN IF NOT EXISTS pro_codigo_barra          VARCHAR(50) NULL AFTER pro_codigo_plu,
    ADD COLUMN IF NOT EXISTS pro_dias_seguridad_override INT       NULL COMMENT 'Override manual de días de seguridad. NULL = lógica automática';

CREATE INDEX IF NOT EXISTS idx_productos_barra ON productos(pro_codigo_barra);

-- 3. Renombrar dias_seguridad → dias_seguridad_defecto en configuraciones
-- (ejecutar solo si la columna aún se llama dias_seguridad)
ALTER TABLE configuraciones
    CHANGE COLUMN dias_seguridad dias_seguridad_defecto INT NOT NULL DEFAULT 2;

-- 4. Folio único y usuario en revisiones
ALTER TABLE revisiones
    ADD COLUMN IF NOT EXISTS rev_folio VARCHAR(30) NULL UNIQUE AFTER rev_id,
    ADD COLUMN IF NOT EXISTS usu_id    INT         NULL        AFTER rev_folio,
    ADD CONSTRAINT IF NOT EXISTS fk_rev_usu
        FOREIGN KEY (usu_id) REFERENCES usuarios(usu_id) ON DELETE SET NULL;
