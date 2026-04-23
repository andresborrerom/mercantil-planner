/**
 * Métricas del panel de stats del Mercantil Planner (§6 del spec).
 *
 * Todas las métricas se calculan sobre una **ventana** [startMonth, endMonth]
 * (1-indexada, inclusiva en ambos extremos) y se agregan across paths a
 * percentiles (default P10/P50/P90), EXCEPTO dos que son escalares globales:
 *
 *   - Probabilidad de ruina: sobre el HORIZONTE TOTAL, no la ventana. Es el
 *     único número del panel que no depende del slider.
 *   - Probabilidad de shortfall: `P(V[endWindow] < netContributions[endWindow])`.
 *
 * Inputs (ver types.ts SimulationResult):
 *   - values: Float32Array[nPaths × (H+1)] — trayectorias patrimoniales post-flujo.
 *   - portfolioReturns: Float32Array[nPaths × H] — retornos mensuales del portafolio.
 *   - ruined: Uint8Array[nPaths] — 1 si el path quedó ruinado.
 *   - netContributions: Float32Array[H+1] — capital aportado neto acumulado (determinístico).
 *   - flowSchedule: Float32Array[H] — flujos nominales por mes (determinístico).
 *
 * Notas de diseño:
 *   - MaxDrawdown (Bug 2 fix 2026-04-17) se calcula a nivel MANAGER sobre la
 *     curva de equidad de retornos puros del portafolio, INDEPENDIENTE de los
 *     aportes/retiros del cliente. Para la ventana [s, e]:
 *       E[0] = 1
 *       E[k] = E[k-1] · (1 + r_port[s + k - 1])   para k = 1..(e - s + 1)
 *     y MDD = min_k ( E[k] / peak_k − 1 ).
 *     Esto mide la caída máxima que sufriría $1 invertido en el portafolio al
 *     inicio de la ventana — la "vara del manager" — sin que los retiros del
 *     cliente (que pueden llevar `values` a 0) distorsionen la métrica.
 *     La definición anterior (sobre serie pre-flujo de `values`) producía MDD
 *     = −100% en paths ruinados por retiros agresivos, mezclando performance
 *     del portafolio con decisiones de flujo del cliente. NOTA: §6 del spec
 *     INSTRUCCIONES-PLANNER.md todavía describe "pre-flujo" — requiere update
 *     pendiente con OK explícito del usuario.
 *   - Worst rolling 12m requiere window length ≥ 12. Si es más corta, retorna
 *     `null` en lugar de bands.
 *   - XIRR se calcula con Newton-Raphson con fallback a bisección. Paths que
 *     no convergen se excluyen del agregado y se cuentan en `nValidXirr`.
 */

import type { FlowsOutput } from './flows';
import { band, type Band } from './stats';

export type { Band } from './stats';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type Window = {
  /** Primer mes de la ventana (1-indexado, inclusivo). */
  startMonth: number;
  /** Último mes de la ventana (1-indexado, inclusivo). */
  endMonth: number;
};

export type WindowMetrics = {
  window: Window;
  /** Número de meses en la ventana (= endMonth − startMonth + 1). */
  windowLengthMonths: number;

  /** TWR anualizado, ignora flujos. Agregado por path. */
  twrAnnualized: Band;
  /** XIRR (money-weighted), anualizado. NaN para paths que no convergen. */
  xirrAnnualized: Band;
  /** Número de paths con XIRR finito que participaron en el cálculo de `xirrAnnualized`. */
  nValidXirr: number;

  /** Max drawdown manager-level sobre retornos puros del portafolio, independiente de flujos. Valores ≤ 0. */
  maxDrawdown: Band;

  /** Meses negativos anualizados: `(#meses con r<0 en ventana) · 12 / len`. */
  negMonthsPerYear: Band;

  /** Desviación estándar anualizada (sqrt(12)). */
  volatilityAnnualized: Band;

  /** Peor retorno rolling 12 meses (cumulativo) dentro de la ventana. null si len < 12. */
  worstRolling12m: Band | null;

  /** Valor final al cierre de la ventana (USD nominales). */
  finalValue: Band;

  /** Probabilidad de shortfall al cierre de la ventana. Escalar. */
  shortfallProbability: number;

  /** Probabilidad de ruina sobre el HORIZONTE TOTAL. Escalar, no depende de la ventana. */
  ruinProbability: number;

  /** Número de paths total usados en el agregado. */
  nPaths: number;
};

export type MetricsInput = {
  simulation: FlowsOutput;
  /** Retornos del portafolio usados en la simulación (necesarios para vol / neg months / rolling). */
  portfolioReturns: Float32Array;
  /** Número de paths (consistente con `values.length / (H+1)`). */
  nPaths: number;
  /** Horizonte total de la simulación (meses). */
  horizonMonths: number;
  /** Ventana de análisis (1-indexada, inclusiva). */
  window: Window;
};

// ---------------------------------------------------------------------------
// Constantes numéricas para XIRR
// ---------------------------------------------------------------------------

const XIRR_MAX_NEWTON_ITERS = 100;
const XIRR_TOLERANCE = 1e-9;
const XIRR_STEP_TOLERANCE = 1e-12;
const XIRR_INITIAL_GUESS_ANNUAL = 0.1;
const XIRR_BISECTION_LOWER = -0.99; // > -1
const XIRR_BISECTION_UPPER = 10;
const XIRR_BISECTION_MAX_ITERS = 200;

// ---------------------------------------------------------------------------
// Per-path: TWR anualizado
// ---------------------------------------------------------------------------

/**
 * TWR anualizado de una ventana [start..end] para un path dado.
 * Recibe un slice de retornos mensuales del path y retorna la tasa compuesta
 * anualizada.
 */
function twrAnnualizedPath(
  portfolioReturns: Float32Array,
  rowOffset: number,
  startIdx: number,
  endIdx: number,
): number {
  // startIdx y endIdx son 0-indexados y exclusivos en endIdx.
  let growth = 1;
  const n = endIdx - startIdx;
  if (n <= 0) return NaN;
  for (let i = startIdx; i < endIdx; i++) {
    growth *= 1 + portfolioReturns[rowOffset + i];
  }
  return Math.pow(growth, 12 / n) - 1;
}

// ---------------------------------------------------------------------------
// Per-path: volatilidad anualizada
// ---------------------------------------------------------------------------

function volatilityAnnualizedPath(
  portfolioReturns: Float32Array,
  rowOffset: number,
  startIdx: number,
  endIdx: number,
): number {
  const n = endIdx - startIdx;
  if (n < 2) return NaN;
  let sum = 0;
  for (let i = startIdx; i < endIdx; i++) sum += portfolioReturns[rowOffset + i];
  const m = sum / n;
  let sq = 0;
  for (let i = startIdx; i < endIdx; i++) {
    const d = portfolioReturns[rowOffset + i] - m;
    sq += d * d;
  }
  const variance = sq / (n - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
}

// ---------------------------------------------------------------------------
// Per-path: meses negativos anualizados
// ---------------------------------------------------------------------------

function negMonthsPerYearPath(
  portfolioReturns: Float32Array,
  rowOffset: number,
  startIdx: number,
  endIdx: number,
): number {
  const n = endIdx - startIdx;
  if (n <= 0) return NaN;
  let neg = 0;
  for (let i = startIdx; i < endIdx; i++) {
    if (portfolioReturns[rowOffset + i] < 0) neg++;
  }
  return (neg * 12) / n;
}

// ---------------------------------------------------------------------------
// Per-path: peor retorno rolling 12m
// ---------------------------------------------------------------------------

function worstRolling12mPath(
  portfolioReturns: Float32Array,
  rowOffset: number,
  startIdx: number,
  endIdx: number,
): number {
  const n = endIdx - startIdx;
  if (n < 12) return NaN;
  let worst = Infinity;
  // Ventana deslizante: los 12 meses son [t, t+12). Hay (n - 11) ventanas.
  for (let t = startIdx; t <= endIdx - 12; t++) {
    let growth = 1;
    for (let k = 0; k < 12; k++) growth *= 1 + portfolioReturns[rowOffset + t + k];
    const r = growth - 1;
    if (r < worst) worst = r;
  }
  return worst;
}

// ---------------------------------------------------------------------------
// Per-path: max drawdown manager-level (sobre retornos puros del portafolio)
// ---------------------------------------------------------------------------

/**
 * MDD manager-level de una ventana [startMonth, endMonth] para un path dado.
 *
 * Construye la curva de equidad teórica de $1 invertido al inicio de la ventana
 * usando ÚNICAMENTE los retornos del portafolio — sin aportes ni retiros.
 *   E[0] = 1
 *   E[k] = E[k-1] · (1 + r_port[startMonth + k − 1])   con k = 1..n
 *   peak[k] = max(E[0..k]);  dd[k] = E[k]/peak[k] − 1
 *   MDD = min(dd)  (≤ 0; 0 = sin caída)
 *
 * Diseño Bug 2 (2026-04-17): antes usaba `V_pre[t] = V[t-1]·(1+r[t])` que mezclaba
 * performance con flujos (paths ruinados por retiros daban MDD = −100%). Ahora
 * la métrica es independiente de `values` y depende solo del portafolio —
 * misma MDD para un cliente que aporta agresivamente vs. uno que retira agresivo.
 */
function maxDrawdownManagerPath(
  portfolioReturns: Float32Array,
  retRowOffset: number,
  startMonth: number,
  endMonth: number,
): number {
  const n = endMonth - startMonth + 1;
  if (n <= 0) return 0;

  let equity = 1;
  let peak = 1;
  let mdd = 0;

  for (let k = 1; k <= n; k++) {
    // r[t] vive en el índice (t − 1) del array 0-indexado.
    const r = portfolioReturns[retRowOffset + (startMonth + k - 1 - 1)];
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const dd = equity / peak - 1;
      if (dd < mdd) mdd = dd;
    } else {
      // Retorno < −1 en teoría lleva la equidad a ≤ 0. No debería pasar con
      // retornos mensuales reales pero lo atajamos para no propagar NaN.
      mdd = -1;
      break;
    }
  }
  return mdd;
}

// ---------------------------------------------------------------------------
// Per-path: XIRR (money-weighted return, annualized)
// ---------------------------------------------------------------------------

/**
 * Construye los cashflows (desde la perspectiva del inversor) para un path
 * sobre la ventana dada:
 *   - En t=0: −V[startMonth − 1] (hipotética compra al inicio)
 *   - En t=k (k=1..n): −flow[startMonth + k − 1] (deposit = salida, withdraw = entrada)
 *   - En t=n: += +V[endMonth] (hipotética liquidación al final)
 * El vector retornado es denso y tiene length = n + 1.
 */
function buildXirrCashflowsPath(
  values: Float32Array,
  valRowOffset: number,
  flowSchedule: Float32Array,
  startMonth: number,
  endMonth: number,
): Float64Array {
  const n = endMonth - startMonth + 1;
  const cf = new Float64Array(n + 1);
  cf[0] = -values[valRowOffset + (startMonth - 1)];
  for (let k = 1; k <= n; k++) {
    const flowIdx = startMonth + k - 1 - 1; // convertir mes 1-indexado a índice 0-indexado en flowSchedule
    cf[k] = -flowSchedule[flowIdx];
  }
  cf[n] += values[valRowOffset + endMonth];
  return cf;
}

/** f(r) = Σ cf[k] · (1+r)^(−k/12). */
function xirrF(cf: Float64Array, r: number): number {
  const base = 1 + r;
  let sum = 0;
  for (let k = 0; k < cf.length; k++) {
    sum += cf[k] * Math.pow(base, -k / 12);
  }
  return sum;
}

/** f'(r) = Σ cf[k] · (−k/12) · (1+r)^(−k/12 − 1). */
function xirrDF(cf: Float64Array, r: number): number {
  const base = 1 + r;
  let sum = 0;
  for (let k = 1; k < cf.length; k++) {
    sum += cf[k] * (-k / 12) * Math.pow(base, -k / 12 - 1);
  }
  return sum;
}

/**
 * Resuelve XIRR para un vector de cashflows denso [cf[0]..cf[n]] con steps
 * de 1 mes. Retorna la tasa anual efectiva (no mensual).
 *
 * Estrategia:
 *   1) Rápido check: si todos los cashflows son no-positivos o no-negativos,
 *      no hay raíz → NaN.
 *   2) Newton-Raphson desde XIRR_INITIAL_GUESS_ANNUAL. Termina cuando
 *      |f(r)| < tolerancia o el step es menor que XIRR_STEP_TOLERANCE.
 *   3) Si Newton sale del dominio razonable o diverge, fallback a bisección
 *      en [XIRR_BISECTION_LOWER, XIRR_BISECTION_UPPER].
 *   4) Si ni uno ni otro encuentra solución → NaN.
 */
function xirrSolve(cf: Float64Array): number {
  // Check de signo
  let hasPos = false;
  let hasNeg = false;
  for (let k = 0; k < cf.length; k++) {
    if (cf[k] > 0) hasPos = true;
    else if (cf[k] < 0) hasNeg = true;
    if (hasPos && hasNeg) break;
  }
  if (!(hasPos && hasNeg)) return NaN;

  // Newton-Raphson
  let r = XIRR_INITIAL_GUESS_ANNUAL;
  let newtonConverged = false;
  for (let iter = 0; iter < XIRR_MAX_NEWTON_ITERS; iter++) {
    if (!Number.isFinite(r) || r <= -0.999999) break;
    const fr = xirrF(cf, r);
    if (Math.abs(fr) < XIRR_TOLERANCE) {
      newtonConverged = true;
      break;
    }
    const dfr = xirrDF(cf, r);
    if (!Number.isFinite(dfr) || dfr === 0) break;
    const step = fr / dfr;
    const rNew = r - step;
    if (Math.abs(step) < XIRR_STEP_TOLERANCE) {
      r = rNew;
      newtonConverged = true;
      break;
    }
    r = rNew;
  }
  if (newtonConverged && Number.isFinite(r)) return r;

  // Fallback: bisección
  let lo = XIRR_BISECTION_LOWER;
  let hi = XIRR_BISECTION_UPPER;
  const fLo = xirrF(cf, lo);
  const fHi = xirrF(cf, hi);
  if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return NaN;
  if (fLo === 0) return lo;
  if (fHi === 0) return hi;
  if (fLo * fHi > 0) return NaN; // no hay cambio de signo en [lo, hi]

  let fMid = 0;
  for (let iter = 0; iter < XIRR_BISECTION_MAX_ITERS; iter++) {
    const mid = 0.5 * (lo + hi);
    fMid = xirrF(cf, mid);
    if (Math.abs(fMid) < XIRR_TOLERANCE) return mid;
    if (xirrF(cf, lo) * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
    }
    if (hi - lo < XIRR_STEP_TOLERANCE) return mid;
  }
  return 0.5 * (lo + hi);
}

// ---------------------------------------------------------------------------
// Función principal: computeMetrics
// ---------------------------------------------------------------------------

export function computeMetrics(input: MetricsInput): WindowMetrics {
  const { simulation, portfolioReturns, nPaths, horizonMonths, window } = input;
  const { values, ruined, netContributions, flowSchedule } = simulation;

  // Validación de ventana
  if (
    !Number.isInteger(window.startMonth) ||
    !Number.isInteger(window.endMonth) ||
    window.startMonth < 1 ||
    window.endMonth > horizonMonths ||
    window.startMonth > window.endMonth
  ) {
    throw new Error(
      `computeMetrics: ventana inválida {start: ${window.startMonth}, end: ${window.endMonth}} ` +
        `para horizonte ${horizonMonths}`,
    );
  }
  if (values.length !== nPaths * (horizonMonths + 1)) {
    throw new Error(
      `computeMetrics: values.length=${values.length} ≠ nPaths*(H+1)=${nPaths * (horizonMonths + 1)}`,
    );
  }
  if (portfolioReturns.length !== nPaths * horizonMonths) {
    throw new Error(
      `computeMetrics: portfolioReturns.length=${portfolioReturns.length} ≠ nPaths*H=${nPaths * horizonMonths}`,
    );
  }

  const len = window.endMonth - window.startMonth + 1;
  const startIdxReturns = window.startMonth - 1; // 0-indexed en portfolioReturns
  const endIdxReturns = window.endMonth; // exclusivo

  // --- Buffers per-path para agregar ---
  const twrArr = new Float64Array(nPaths);
  const xirrArr = new Float64Array(nPaths);
  const mddArr = new Float64Array(nPaths);
  const negArr = new Float64Array(nPaths);
  const volArr = new Float64Array(nPaths);
  const worstArr = new Float64Array(nPaths);
  const finalArr = new Float64Array(nPaths);

  for (let p = 0; p < nPaths; p++) {
    const valOff = p * (horizonMonths + 1);
    const retOff = p * horizonMonths;

    twrArr[p] = twrAnnualizedPath(portfolioReturns, retOff, startIdxReturns, endIdxReturns);
    volArr[p] = volatilityAnnualizedPath(portfolioReturns, retOff, startIdxReturns, endIdxReturns);
    negArr[p] = negMonthsPerYearPath(portfolioReturns, retOff, startIdxReturns, endIdxReturns);
    worstArr[p] = worstRolling12mPath(portfolioReturns, retOff, startIdxReturns, endIdxReturns);
    mddArr[p] = maxDrawdownManagerPath(
      portfolioReturns,
      retOff,
      window.startMonth,
      window.endMonth,
    );
    finalArr[p] = values[valOff + window.endMonth];

    const cf = buildXirrCashflowsPath(values, valOff, flowSchedule, window.startMonth, window.endMonth);
    xirrArr[p] = xirrSolve(cf);
  }

  // Agregados
  const twrB = band(twrArr);
  const xirrB = band(xirrArr);
  const mddB = band(mddArr);
  const negB = band(negArr);
  const volB = band(volArr);
  const finalB = band(finalArr);
  const worstB = len >= 12 ? band(worstArr) : null;

  // Conteo de XIRRs válidos
  let nValidXirr = 0;
  for (let p = 0; p < nPaths; p++) if (Number.isFinite(xirrArr[p])) nValidXirr++;

  // Probabilidad de shortfall: P(V[endWindow] < netContributions[endWindow])
  const netAtEnd = netContributions[window.endMonth];
  let shortfallCount = 0;
  for (let p = 0; p < nPaths; p++) {
    if (finalArr[p] < netAtEnd) shortfallCount++;
  }
  const shortfallProbability = shortfallCount / nPaths;

  // Probabilidad de ruina: sobre horizonte total (no ventana)
  let ruinCount = 0;
  for (let p = 0; p < nPaths; p++) if (ruined[p] !== 0) ruinCount++;
  const ruinProbability = ruinCount / nPaths;

  return {
    window,
    windowLengthMonths: len,
    twrAnnualized: twrB,
    xirrAnnualized: xirrB,
    nValidXirr,
    maxDrawdown: mddB,
    negMonthsPerYear: negB,
    volatilityAnnualized: volB,
    worstRolling12m: worstB,
    finalValue: finalB,
    shortfallProbability,
    ruinProbability,
    nPaths,
  };
}

// ---------------------------------------------------------------------------
// Fan chart bands (para el gráfico principal del §7)
// ---------------------------------------------------------------------------

export type FanChartBands = {
  /** Meses 0..H (inclusivo). Length = H + 1. */
  monthIdx: Int32Array;
  /** Percentil 10 por mes (across paths). */
  p10: Float32Array;
  /** Percentil 25 por mes. */
  p25: Float32Array;
  /** Mediana por mes. */
  p50: Float32Array;
  /** Percentil 75 por mes. */
  p75: Float32Array;
  /** Percentil 90 por mes. */
  p90: Float32Array;
};

/**
 * Calcula los percentiles mes a mes para generar el fan chart.
 *
 * Ordena `values[:, t]` cross-sectional para cada t y extrae percentiles.
 * Complejidad: O((H+1) · nPaths · log(nPaths)). Para 361 × 5000 → ~6M ops,
 * ~200 ms. Ok para corrida única (el slider NO re-muestrea, solo recalcula
 * stats por ventana, así que esta función se llama UNA VEZ por simulación).
 */
export function computeFanChartBands(
  values: Float32Array,
  nPaths: number,
  horizonMonths: number,
  /**
   * Subconjunto de paths sobre el que computar las bandas (Fase C.2c).
   * Si es null/undefined, usa todos los paths (comportamiento original).
   * Si es un Uint32Array, solo usa los paths indexados allí.
   * Si el subset está vacío, lanza error (usar `null` para el comportamiento default).
   */
  indices?: Uint32Array | null,
): FanChartBands {
  const nCols = horizonMonths + 1;
  if (values.length !== nPaths * nCols) {
    throw new Error(
      `computeFanChartBands: values.length=${values.length} ≠ nPaths*(H+1)=${nPaths * nCols}`,
    );
  }
  if (indices && indices.length === 0) {
    throw new Error(
      `computeFanChartBands: indices pasado pero vacío. Usá null para computar sobre todos los paths.`,
    );
  }
  const useSubset = indices != null;
  const n = useSubset ? indices.length : nPaths;

  const monthIdx = new Int32Array(nCols);
  for (let t = 0; t < nCols; t++) monthIdx[t] = t;

  const p10 = new Float32Array(nCols);
  const p25 = new Float32Array(nCols);
  const p50 = new Float32Array(nCols);
  const p75 = new Float32Array(nCols);
  const p90 = new Float32Array(nCols);

  const col = new Float64Array(n);

  for (let t = 0; t < nCols; t++) {
    if (useSubset) {
      for (let k = 0; k < n; k++) {
        col[k] = values[indices[k] * nCols + t];
      }
    } else {
      for (let p = 0; p < nPaths; p++) {
        col[p] = values[p * nCols + t];
      }
    }
    const sorted = Array.from(col).sort((a, b) => a - b);
    const pick = (q: number): number => {
      const idx = q * (n - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return sorted[lo];
      const frac = idx - lo;
      return sorted[lo] * (1 - frac) + sorted[hi] * frac;
    };
    // Red de seguridad (2026-04-17, Bug 1): el motor de flujos ya garantiza
    // V[t] ≥ 0 (ver `applyFlows` en flows.ts), así que cada pick() debería ser
    // ≥ 0 en condiciones normales. Este floor es belt-and-suspenders — si una
    // regresión futura deja filtrar un residuo negativo (roundoff Float32, etc.),
    // el fan chart NUNCA mostrará bandas por debajo de 0 USD. No es un workaround,
    // es un invariante visual del chart (el valor patrimonial no puede ser < 0).
    p10[t] = Math.max(0, pick(0.1));
    p25[t] = Math.max(0, pick(0.25));
    p50[t] = Math.max(0, pick(0.5));
    p75[t] = Math.max(0, pick(0.75));
    p90[t] = Math.max(0, pick(0.9));
  }

  return { monthIdx, p10, p25, p50, p75, p90 };
}
