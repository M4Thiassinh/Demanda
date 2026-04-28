/**
 * Motor de Cálculo de Demanda v2 — Teja Market
 *
 * Prioridad de días de seguridad:
 *   1. pro_dias_seguridad_override (si tiene valor)
 *   2. Auto: venta_diaria > 20 → 1 día | <= 20 → 2 días
 */
function calcularDemanda(config, producto, stockSala) {
  const { factor_ajuste } = config;
  const { vta_total_periodo, dias_historial, pro_dias_seguridad_override } = producto;

  const ventaDiariaLD = vta_total_periodo / dias_historial;

  // Determinación dinámica de días de seguridad
  let diasSeguridad;
  if (pro_dias_seguridad_override !== null && pro_dias_seguridad_override !== undefined) {
    diasSeguridad = parseInt(pro_dias_seguridad_override, 10);
  } else {
    diasSeguridad = ventaDiariaLD > 20 ? 1 : 2;
  }

  const ventaDiariaAjustada = ventaDiariaLD * factor_ajuste;
  const stockSeguridad      = ventaDiariaAjustada * diasSeguridad;
  const demandaPrimaria     = ventaDiariaAjustada + stockSeguridad;
  const requerimiento       = stockSala - demandaPrimaria;
  const hayQuiebre          = requerimiento < 0;
  const cantidadAProducir   = hayQuiebre ? Math.ceil(Math.abs(requerimiento)) : 0;

  return {
    ventaDiariaLD:       r4(ventaDiariaLD),
    ventaDiariaAjustada: r4(ventaDiariaAjustada),
    diasSeguridad,
    stockSeguridad:      r4(stockSeguridad),
    demandaPrimaria:     r4(demandaPrimaria),
    requerimiento:       r4(requerimiento),
    hayQuiebre,
    cantidadAProducir,
  };
}

const r4 = (n) => Math.round(n * 10000) / 10000;

module.exports = { calcularDemanda };
