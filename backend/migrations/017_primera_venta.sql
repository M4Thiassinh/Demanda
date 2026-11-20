-- Fecha de la PRIMERA venta histórica del producto.
--
-- La venta diaria sale de dividir lo vendido por los días del período, y ese período
-- es de 30 días para todos. Para un producto recién lanzado eso lo subestima: si
-- vendió 50 unidades en los 5 días que lleva existiendo, dividir por 30 da 1,7 u/día
-- en vez de 10, y se termina pidiendo seis veces menos de lo que se necesita.
--
-- Guardando la fecha de la primera venta, los días del período se calculan como
--   LEAST(30, días desde la primera venta)
-- que es pura aritmética sobre esta columna: no obliga a la actualización diaria a
-- cruzar otra vez con fact_ventas.
--
-- Pasados 30 días el LEAST lo deja fijo en 30 y el producto se comporta como el resto.
-- NULL = producto ya establecido (todos los existentes) → se usan los 30 días de siempre.
ALTER TABLE productos
  ADD COLUMN pro_primera_venta DATE NULL
  COMMENT 'Fecha de la primera venta historica. NULL = producto establecido, se usan 30 dias';
