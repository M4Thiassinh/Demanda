/**
 * Motor de Cálculo de Demanda v3 — Teja Market
 * Lógica de Lotes de Producción Semanales
 *
 * Paso A: venta_diaria = vta_total_periodo / dias_historial
 *
 * Paso B: Parámetros efectivos (override > automático)
 *   dias_prod_efectivo: pro_dias_produccion_override ?? config.dias_produccion_semana
 *   dias_seg_efectivo:  pro_dias_seguridad_override  ?? (venta_diaria > 20 ? 1 : 2)
 *
 * Paso C: Ecuación final
 *   lote_produccion_base    = (venta_diaria × 7) / dias_prod_efectivo
 *   stock_seguridad_calculado = venta_diaria × dias_seg_efectivo
 *   demanda_total_requerida  = lote_produccion_base + stock_seguridad_calculado
 *   requerimiento_a_producir = demanda_total_requerida - det_stock_sala
 *   → Si <= 0: no se produce. Si > 0: Math.ceil()
 */
function calcularDemanda(config, producto, stockSala) {
  const { dias_produccion_semana } = config;
  const {
    vta_total_periodo,
    dias_historial,
    pro_dias_produccion_override,
    pro_dias_seguridad_override,
  } = producto;

  // ── Paso A ────────────────────────────────────────────────
  const ventaDiaria = vta_total_periodo / dias_historial;

  // ── Paso B ────────────────────────────────────────────────
  const diasProdEfectivo = (pro_dias_produccion_override !== null && pro_dias_produccion_override !== undefined)
    ? parseInt(pro_dias_produccion_override, 10)
    : dias_produccion_semana;

  const diasSegEfectivo = (pro_dias_seguridad_override !== null && pro_dias_seguridad_override !== undefined)
    ? parseInt(pro_dias_seguridad_override, 10)
    : (ventaDiaria > 20 ? 1 : 2);

  // ── Paso C ────────────────────────────────────────────────
  const loteProduccionBase      = (ventaDiaria * 7) / diasProdEfectivo;
  const stockSeguridadCalculado = ventaDiaria * diasSegEfectivo;
  const demandaTotalRequerida   = loteProduccionBase + stockSeguridadCalculado;
  const requerimientoRaw        = demandaTotalRequerida - stockSala;

  const hayQuiebre        = requerimientoRaw > 0;
  const cantidadAProducir = hayQuiebre ? Math.ceil(requerimientoRaw) : 0;

  return {
    ventaDiaria:              r4(ventaDiaria),
    diasProdEfectivo,
    diasSegEfectivo,
    loteProduccionBase:       r4(loteProduccionBase),
    stockSeguridadCalculado:  r4(stockSeguridadCalculado),
    demandaTotalRequerida:    r4(demandaTotalRequerida),
    requerimiento:            r4(requerimientoRaw),
    hayQuiebre,
    cantidadAProducir,
  };
}

const r4 = (n) => Math.round(n * 10000) / 10000;

module.exports = { calcularDemanda };
