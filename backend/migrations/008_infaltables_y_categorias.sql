-- =============================================================
-- 008 — Perfiles Producción e Infaltables
--   * Áreas productivas marcadas por departamento (reemplaza hardcode)
--   * Clasificación de productos: normal / especial (Producción)
--   * Infaltable sí/no, independiente de la categoría
--   * Clasificación de jornada:  am / pm / ambos (Infaltables)
--   * Configuración de infaltables por departamento (meta + correos)
--   * Historial de chequeos de infaltables
--   * Vista de stock externo (cross-DB con la base analítica)
-- =============================================================

-- 0) Marca de área productiva por departamento (reemplaza el array
--    hardcodeado AREAS_PRODUCTIVAS = [22, 1347, 2347] del backend)
ALTER TABLE departamentos
  ADD COLUMN dep_productiva TINYINT(1) NOT NULL DEFAULT 0;

-- Semilla: las áreas productivas conocidas hasta hoy
UPDATE departamentos SET dep_productiva = 1 WHERE dep_id IN ('22','1347','2347');

-- a) Categoría comercial del producto (clasificación manual normal/especial)
ALTER TABLE productos
  ADD COLUMN pro_categoria ENUM('sin_clasificar','normal','especial')
  NOT NULL DEFAULT 'normal';

-- a.2) Marca de "infaltable" — independiente de la categoría.
--      Un producto puede ser normal/especial Y además infaltable (o no).
ALTER TABLE productos
  ADD COLUMN pro_infaltable TINYINT(1) NOT NULL DEFAULT 0;


-- b) Jornada del infaltable (AM/PM). Default NULL = sin asignar:
--    el producto no aparece en el checklist hasta elegir AM o PM en la clasificación.
ALTER TABLE productos
  ADD COLUMN pro_jornada ENUM('am','pm')
  NULL DEFAULT NULL;

-- c) Configuración de infaltables por departamento (meta % y correos destino)
CREATE TABLE IF NOT EXISTS infaltables_config (
  dep_id           VARCHAR(10) NOT NULL,
  meta_faltante    DECIMAL(5,2) NOT NULL DEFAULT 15.00,
  correos_destino  VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (dep_id),
  CONSTRAINT fk_infcfg_dep FOREIGN KEY (dep_id) REFERENCES departamentos(dep_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Semilla: configuración por defecto para los departamentos existentes
INSERT INTO infaltables_config (dep_id, meta_faltante, correos_destino)
SELECT d.dep_id, 15.00, 'matias.relauquen@tejamarket.cl, maty.rela2003@gmail.com'
FROM departamentos d
ON DUPLICATE KEY UPDATE dep_id = infaltables_config.dep_id;

-- d) Historial de chequeos de infaltables (cabecera)
CREATE TABLE IF NOT EXISTS chequeo_infaltables (
  chk_id            INT NOT NULL AUTO_INCREMENT,
  dep_id            VARCHAR(10) NOT NULL,
  usu_id            INT DEFAULT NULL,
  turno             ENUM('am','pm') NOT NULL,
  chk_fecha         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total_infaltables INT NOT NULL DEFAULT 0,
  total_faltantes   INT NOT NULL DEFAULT 0,
  indice_faltante   DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (chk_id),
  KEY idx_chk_dep_fecha (dep_id, chk_fecha),
  CONSTRAINT fk_chk_dep FOREIGN KEY (dep_id) REFERENCES departamentos(dep_id) ON DELETE CASCADE,
  CONSTRAINT fk_chk_usu FOREIGN KEY (usu_id) REFERENCES usuarios(usu_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- e) Detalle del chequeo (un registro por producto infaltable revisado)
CREATE TABLE IF NOT EXISTS chequeo_infaltables_detalle (
  det_id           INT NOT NULL AUTO_INCREMENT,
  chk_id           INT NOT NULL,
  pro_codigo_plu   VARCHAR(20) NOT NULL,
  presente         TINYINT(1) NOT NULL DEFAULT 1,
  stock_referencia DECIMAL(10,2) DEFAULT NULL,
  PRIMARY KEY (det_id),
  KEY idx_chkd_chk (chk_id),
  CONSTRAINT fk_chkd_chk FOREIGN KEY (chk_id) REFERENCES chequeo_infaltables(chk_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- f) Vista de stock externo (puente cross-DB validado: id_producto INT -> PLU VARCHAR)
CREATE OR REPLACE VIEW v_stock_externo AS
SELECT CAST(f.id_producto AS CHAR) COLLATE utf8mb4_unicode_ci AS pro_codigo_plu,
       f.stock_sala,
       f.stock_total_real,
       f.fecha_extraccion
FROM db_analitica_supermercado.fact_stock_diario f;
