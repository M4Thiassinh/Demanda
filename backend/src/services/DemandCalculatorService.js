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
 *
 * Excepción: si el producto tiene pro_demanda_override, esa es la demanda total y
 * los pasos A–C solo sirven de referencia. Existe porque la venta diaria se
 * recalcula sola cada día desde las ventas reales, y sin una columna aparte el
 * ajuste manual del jefe de departamento se perdía en la siguiente actualización.
 */

const r4 = (n) => Math.round(n * 10000) / 10000;

// Convierte cualquier entrada a un número finito; si no se puede, devuelve `def`.
const toFiniteNumber = (v, def = 0) => {
  if (v === null || v === undefined || v === '') return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

// Resultado neutro cuando no es posible calcular (sin historial, datos corruptos, etc.)
function resultadoVacio(min = 0) {
  return {
    ventaDiaria:              0,
    diasProdEfectivo:         0,
    diasSegEfectivo:          0,
    loteProduccionBase:       0,
    stockSeguridadCalculado:  0,
    demandaTotalRequerida:    0,
    demandaCalculada:         0,
    demandaEsOverride:        false,
    requerimiento:            0,
    hayQuiebre:               false,
    cantidadAProducir:        0,
    pedidoMinimo:             min,
  };
}

/**
 * Calcula el día de la semana (1=Lunes … 7=Domingo) en la zona horaria de Santiago,
 * independientemente de la zona horaria en la que corra el servidor (UTC, etc.).
 */
function diaSemanaSantiago(fechaBase) {
  const corto = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Santiago',
    weekday: 'short',
  }).format(fechaBase);
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[corto] || null;
}

function calcularDemanda(config, producto, stockSala, revFecha) {
  const {
    pro_dias_produccion_override,
    pro_dias_seguridad_override,
    pro_dias_elaboracion,
    pro_cantidad_minima,
    pro_demanda_override,
  } = producto;

  const min = Math.max(0, Math.trunc(toFiniteNumber(pro_cantidad_minima, 0)));

  // Demanda fijada a mano por el jefe de departamento. Se lee antes que nada porque
  // manda incluso sobre un producto sin historial de ventas: si alguien dijo "de esto
  // se piden 20", se piden 20 aunque el sistema no tenga con qué estimarlo.
  const overrideRaw = toFiniteNumber(pro_demanda_override, NaN);
  const hayOverride = Number.isFinite(overrideRaw) && overrideRaw >= 0;

  // ── Paso A — Venta diaria (protección contra división por cero / valores no numéricos) ──
  const ventas = toFiniteNumber(producto.vta_total_periodo, 0);
  const dias   = toFiniteNumber(producto.dias_historial, 0);
  if (dias <= 0) {
    // Sin historial válido no se puede estimar la demanda. Si hay override, igual se
    // respeta; si no, resultado neutro.
    if (!hayOverride) return resultadoVacio(min);
    const stockSinHist   = toFiniteNumber(stockSala, 0);
    const requerimiento  = overrideRaw - stockSinHist;
    return {
      ...resultadoVacio(min),
      demandaTotalRequerida: r4(overrideRaw),
      demandaEsOverride:     true,
      requerimiento:         r4(requerimiento),
      hayQuiebre:            requerimiento > 0,
      cantidadAProducir:     requerimiento > 0 ? Math.ceil(requerimiento) : 0,
    };
  }
  const ventaDiaria = ventas / dias;

  // ── Paso B — Parámetros efectivos (override > automático), nunca cero ni inválido ──
  let diasProdEfectivo = (pro_dias_produccion_override !== null && pro_dias_produccion_override !== undefined && pro_dias_produccion_override !== '')
    ? parseInt(pro_dias_produccion_override, 10)
    : toFiniteNumber(config && config.dias_produccion_semana, 6);
  if (!Number.isFinite(diasProdEfectivo) || diasProdEfectivo <= 0) {
    // Un override de 0 o basura provocaría división por cero → caemos al default seguro.
    diasProdEfectivo = toFiniteNumber(config && config.dias_produccion_semana, 6) || 6;
  }

  let diasSegEfectivo = (pro_dias_seguridad_override !== null && pro_dias_seguridad_override !== undefined && pro_dias_seguridad_override !== '')
    ? parseInt(pro_dias_seguridad_override, 10)
    : (ventaDiaria > 20 ? 1 : 2);
  if (!Number.isFinite(diasSegEfectivo) || diasSegEfectivo < 0) {
    diasSegEfectivo = (ventaDiaria > 20 ? 1 : 2);
  }

  // ── Paso C — Ecuación final ──
  const loteProduccionBase      = (ventaDiaria * 7) / diasProdEfectivo;
  const stockSeguridadCalculado = ventaDiaria * diasSegEfectivo;
  const demandaCalculada        = loteProduccionBase + stockSeguridadCalculado;

  // Si el jefe fijó cuánto se pide, ese valor manda por sobre la fórmula. La venta
  // diaria se recalcula sola todos los días, pero esto no se toca (por eso vive en su
  // propia columna y no en vta_total_periodo).
  const demandaTotalRequerida = hayOverride ? overrideRaw : demandaCalculada;

  const stock                   = toFiniteNumber(stockSala, 0);
  const requerimientoRaw        = demandaTotalRequerida - stock;

  let hayQuiebre        = requerimientoRaw > 0;
  let cantidadAProducir = hayQuiebre ? Math.ceil(requerimientoRaw) : 0;

  // ── Días de Elaboración (zona horaria Santiago, no la del servidor) ──
  if (hayQuiebre && pro_dias_elaboracion) {
    const fechaBase = revFecha ? new Date(revFecha) : new Date();
    if (!isNaN(fechaBase.getTime())) {
      const diaFormato = diaSemanaSantiago(fechaBase);
      const diasPermitidos = String(pro_dias_elaboracion)
        .split(',')
        .map((d) => parseInt(d.trim(), 10))
        .filter((d) => Number.isFinite(d));
      if (diaFormato && diasPermitidos.length && !diasPermitidos.includes(diaFormato)) {
        cantidadAProducir = 0;
        hayQuiebre = false;
      }
    }
  }

  return {
    ventaDiaria:              r4(ventaDiaria),
    diasProdEfectivo,
    diasSegEfectivo,
    loteProduccionBase:       r4(loteProduccionBase),
    stockSeguridadCalculado:  r4(stockSeguridadCalculado),
    demandaTotalRequerida:    r4(demandaTotalRequerida),
    // Para que el panel pueda distinguir una demanda fijada a mano de una calculada.
    demandaCalculada:         r4(demandaCalculada),
    demandaEsOverride:        hayOverride,
    requerimiento:            r4(requerimientoRaw),
    hayQuiebre,
    cantidadAProducir,
    pedidoMinimo:             min,
  };
}

module.exports = { calcularDemanda, diaSemanaSantiago };
