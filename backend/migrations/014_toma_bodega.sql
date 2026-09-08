-- Toma de inventario de BODEGA (conteo físico), independiente de la revisión de
-- sala. Solo sirve para contar lo que hay en bodega y compararlo con el stock del
-- sistema (fact_stock_diario) y luego corregir el ERP a mano. NO afecta pedidos,
-- KDS ni correos: por eso vive en tablas aparte de `revisiones`.
CREATE TABLE IF NOT EXISTS toma_bodega (
  tb_id           INT          NOT NULL AUTO_INCREMENT,
  dep_id          VARCHAR(10)  NOT NULL,
  usu_id          INT          NULL,
  tb_estado       ENUM('en_proceso','completada') NOT NULL DEFAULT 'en_proceso',
  tb_fecha_inicio TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tb_fecha_fin    TIMESTAMP    NULL,
  CONSTRAINT pk_toma_bodega PRIMARY KEY (tb_id),
  KEY idx_tb_dep_estado (dep_id, tb_estado),
  CONSTRAINT fk_tb_dep FOREIGN KEY (dep_id) REFERENCES departamentos(dep_id) ON DELETE RESTRICT,
  CONSTRAINT fk_tb_usu FOREIGN KEY (usu_id) REFERENCES usuarios(usu_id)      ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS toma_bodega_detalle (
  tbd_id              INT           NOT NULL AUTO_INCREMENT,
  tb_id               INT           NOT NULL,
  pro_codigo_plu      VARCHAR(20)   NOT NULL,
  tbd_cantidad_fisica DECIMAL(10,2) NOT NULL DEFAULT 0,
  tbd_stock_sistema   DECIMAL(10,2) NULL,   -- snapshot del stock del sistema al contar
  CONSTRAINT pk_tbd PRIMARY KEY (tbd_id),
  CONSTRAINT fk_tbd_tb FOREIGN KEY (tb_id) REFERENCES toma_bodega(tb_id) ON DELETE CASCADE,
  CONSTRAINT uq_tbd UNIQUE (tb_id, pro_codigo_plu)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
