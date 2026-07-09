-- =============================================================
-- 010 — Arreglo de la vista v_stock_externo
--   La tabla db_analitica_supermercado.fact_stock_diario renombró su
--   columna clave de `id_producto` a `pro_codigo_plu` (ya es INT).
--   La vista seguía apuntando a `id_producto`, quedando ROTA:
--     "View 'v_stock_externo' references invalid table(s) or column(s)"
--   Eso hacía fallar el checklist de Infaltables (LEFT JOIN a la vista).
--   Se recrea la vista apuntando a la columna actual.
-- =============================================================

CREATE OR REPLACE VIEW v_stock_externo AS
SELECT CAST(f.pro_codigo_plu AS CHAR) COLLATE utf8mb4_unicode_ci AS pro_codigo_plu,
       f.stock_sala,
       f.stock_total_real,
       f.fecha_extraccion
FROM db_analitica_supermercado.fact_stock_diario f;

-- Verificación:
-- SELECT * FROM v_stock_externo LIMIT 5;
