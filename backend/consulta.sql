WITH TodasLasVentas AS (
    -- 1. Rescatamos el detalle de las BOLETAS (quitamos rec_actualizacion de aquí)
    SELECT 
        pro_codigo_plu,
        vpr_fecha AS fecha_venta,
        vpr_cantidad AS cantidad,
        vpr_total AS monto_venta,
        vpr_costo AS monto_costo
    FROM com_ventas_productos
    WHERE vpr_fecha BETWEEN '2026-03-28' AND '2026-04-26'
      AND pro_codigo_plu IN (SELECT pro_codigo_plu FROM gpr_receta)
      
    UNION ALL
    
    -- 2. Rescatamos el detalle de las FACTURAS (quitamos rec_actualizacion de aquí)
    SELECT 
        pro_codigo_plu,
        fac_fecha AS fecha_venta,
        dfe_cantidad AS cantidad,
        dfe_total AS monto_venta,
        dfe_costo AS monto_costo
    FROM gne_facturas_detalle
    WHERE fac_fecha BETWEEN '2026-03-28' AND '2026-04-26'
      AND pro_codigo_plu IN (SELECT pro_codigo_plu FROM gpr_receta)
)

-- 3. Hacemos el análisis sobre este gran bloque unificado
SELECT 
    tv.pro_codigo_plu AS 'PLU',
    mp.pro_nombre_producto AS 'Nombre',
    
    -- Suma real (Boletas + Facturas) del periodo
    SUM(tv.cantidad) AS 'Ventas_Total'

FROM TodasLasVentas tv
-- Unimos con la maestra de productos para rescatar el nombre de la receta
INNER JOIN mae_productos mp ON tv.pro_codigo_plu = mp.pro_codigo_plu

-- NUEVO: Unimos con la tabla de recetas directamente usando el PLU
INNER JOIN gpr_receta r ON tv.pro_codigo_plu = r.pro_codigo_plu

GROUP BY 
    tv.pro_codigo_plu,
    mp.pro_nombre_producto,
    r.rec_actualizacion -- REGLA DE ORO: Todo lo que no sea una SUMA o ROUND, debe ir en el GROUP BY
ORDER BY rec_actualizacion DESC;