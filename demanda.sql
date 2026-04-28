WITH TodasLasVentas AS (
    -- 1. Rescatamos el detalle de las BOLETAS
    SELECT 
        vp.pro_codigo_plu,
        mp.pro_nombre_producto,
        vp.vpr_fecha AS fecha_venta,
        vp.vpr_cantidad AS cantidad,
        vp.vpr_total AS monto_venta,
        vp.vpr_costo AS monto_costo
    FROM com_ventas_productos vp
    INNER JOIN mae_productos mp ON vp.pro_codigo_plu = mp.pro_codigo_plu
    WHERE vp.vpr_fecha BETWEEN '2026-03-01' AND '2026-03-30'
      AND vp.dep_id = '22'
      
    UNION ALL
    
    -- 2. Rescatamos el detalle de las FACTURAS y lo apilamos abajo
    SELECT 
        fd.pro_codigo_plu,
        mp.pro_nombre_producto,
        fd.fac_fecha AS fecha_venta,
        fd.dfe_cantidad AS cantidad,
        fd.dfe_total AS monto_venta,
        fd.dfe_costo AS monto_costo
    FROM gne_facturas_detalle fd
    INNER JOIN mae_productos mp ON fd.pro_codigo_plu = mp.pro_codigo_plu
    WHERE fd.fac_fecha BETWEEN '2026-03-01' AND '2026-03-30'
      AND fd.dep_id = '22'
)

-- 3. Hacemos el análisis sobre este gran bloque unificado (Sin JOIN extra)
SELECT 
    pro_codigo_plu AS PLU,
    pro_nombre_producto AS Producto,
    
    -- Suma real (Boletas + Facturas)
    SUM(cantidad) AS Total_Unidades,
    
    -- Venta promedio semanal
    ROUND(SUM(cantidad) / 4.0, 2) AS Vta_Prom_Semanal,
    
    -- Venta promedio diaria real
    ROUND(SUM(cantidad) / 30.0, 2) AS Vta_Prom_Diaria

FROM TodasLasVentas
GROUP BY 
    pro_codigo_plu,
    pro_nombre_producto;