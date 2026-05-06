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
function calcularDemanda(config, producto, stockSala, revFecha) {
  const { dias_produccion_semana } = config;
  const {
    vta_total_periodo,
    dias_historial,
    pro_dias_produccion_override,
    pro_dias_seguridad_override,
    pro_dias_elaboracion,
    pro_cantidad_minima
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

  let hayQuiebre        = requerimientoRaw > 0;
  let cantidadAProducir = hayQuiebre ? Math.ceil(requerimientoRaw) : 0;

  // ── Cantidad Mínima ───────────────────────────────────────
  const min = parseInt(pro_cantidad_minima || 0, 10);

  // ── Días de Elaboración ───────────────────────────────────
  if (hayQuiebre && pro_dias_elaboracion) {
    const fechaBase = revFecha ? new Date(revFecha) : new Date();
    const diaJS = fechaBase.getDay(); // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
    const diaFormato = diaJS === 0 ? 7 : diaJS; // Convertimos a 1=Lunes, ..., 7=Domingo
    
    const diasPermitidos = pro_dias_elaboracion.split(',').map(d => parseInt(d.trim(), 10));
    if (!diasPermitidos.includes(diaFormato)) {
      cantidadAProducir = 0;
      hayQuiebre = false;
    }
  }

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
    pedidoMinimo:             min,
  };
}

const r4 = (n) => Math.round(n * 10000) / 10000;

module.exports = { calcularDemanda };
