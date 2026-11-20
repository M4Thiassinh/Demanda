-- Demanda total fijada a mano por el jefe de departamento.
--
-- Hasta ahora, ajustar cuánto se pide de un producto se hacía cambiando su venta
-- diaria (es decir, vta_total_periodo). Desde que la venta diaria se recalcula sola
-- todos los días con las ventas reales de los últimos 30 días, ese ajuste manual se
-- perdía a la mañana siguiente.
--
-- Esta columna guarda la demanda total impuesta a mano. Si tiene valor, el cálculo
-- la usa TAL CUAL en vez de deducirla de la venta diaria, y la actualización diaria
-- no la toca. NULL = automático (el comportamiento normal).
ALTER TABLE productos
  ADD COLUMN pro_demanda_override DECIMAL(10,2) NULL
  COMMENT 'Demanda total fijada a mano. NULL = se calcula desde la venta diaria';
