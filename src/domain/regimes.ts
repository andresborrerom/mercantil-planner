/**
 * Regímenes históricos (Fase C.3).
 *
 * Replay determinístico de ventanas históricas concretas — el contra-punto del
 * bootstrap probabilístico. En vez de simular miles de paths, tomamos UN camino
 * fijo con los retornos observados en un rango de fechas específico y lo
 * aplicamos al portafolio actual del usuario.
 *
 * Regímenes incluidos:
 *   1. Crisis financiera global     · oct-2007 a mar-2009 (18 meses)
 *   2. Shock COVID                   · feb-2020 a dic-2020 (11 meses)
 *   3. Bear de inflación             · ene-2022 a oct-2022 (10 meses)
 *
 * Dos interpretaciones coexisten (decisión usuario 2026-04-23):
 *
 *   'historical'   — replay 100% histórico. Equity y RF retornan lo que
 *                    observamos. Para RF, las tasas del período se usan tal
 *                    cual (carry del ticker de entonces).
 *
 *   'currentRates' — replay del shock con tasas de HOY como arranque. Equity
 *                    retorna lo observado (los returns no dependen del nivel
 *                    inicial de yields). Para RF, se reconstruye vía:
 *                      r_current_t = r_hist_t − carry_hist_t + (y_today/12)
 *                    donde y_today = yieldInitial[proxyYield del ticker].
 *                    Es equivalente a decir "mismo shock de duración, pero
 *                    carry arrancando en las tasas actuales".
 *
 * La diferencia carry_today − carry_hist_t capta directamente el impacto de
 * arrancar con tasas más altas/bajas que en el período histórico. Ejemplo
 * pedagógico: si hoy la TNX está a 4.2% y en 2008 arrancó a 4.0% y cerró a
 * 2.5%, el shock de duration es el mismo (capital gain) pero el piso de carry
 * es distinto (+0.2pp de carry mensual extra al arrancar). En RF pura la
 * diferencia se nota; en portafolios equity-heavy es mínima.
 *
 * FIXED blocks (FIXED6, FIXED9): retornos determinísticos 6%/12 y 9%/12
 * mensuales, invariantes al modo — por construcción no dependen de yields.
 */

import {
  DATES,
  N_TICKERS,
  RETURNS,
  RF_DECOMP,
  RF_TICKERS,
  TICKERS,
  type RfTicker,
  type Ticker,
} from '../data/market.generated';
import { expandPortfolio } from './amc-definitions';
import { RF_CONFIG, type YieldKey } from './rf-config';
import type { ExpandedPortfolio, PortfolioSpec } from './types';

// ---------------------------------------------------------------------------
// Definiciones de regímenes
// ---------------------------------------------------------------------------

export type RegimeId = 'crisis2008' | 'covid2020' | 'inflation2022';

export type ReplayMode = 'historical' | 'currentRates';

export interface RegimeDef {
  readonly id: RegimeId;
  readonly label: string;
  readonly short: string;
  readonly startDate: string; // 'YYYY-MM'
  readonly endDate: string;   // 'YYYY-MM' inclusive
  readonly description: string;
}

export const REGIMES: readonly RegimeDef[] = [
  {
    id: 'crisis2008',
    label: 'Crisis financiera global · oct-2007 a mar-2009',
    short: 'Crisis 2008',
    startDate: '2007-10',
    endDate: '2009-03',
    description:
      'Bear market clásico: S&P cae ~50%, crédito HY/EM colapsa, Fed baja tasas de ~5% a ~0%. 18 meses.',
  },
  {
    id: 'covid2020',
    label: 'Shock COVID · feb-2020 a dic-2020',
    short: 'COVID 2020',
    startDate: '2020-02',
    endDate: '2020-12',
    description:
      'Crash rápido en V: -34% en marzo, recovery total a fin de año. Fed + fiscal respondieron masivamente. 11 meses.',
  },
  {
    id: 'inflation2022',
    label: 'Bear de inflación · ene-2022 a oct-2022',
    short: 'Inflación 2022',
    startDate: '2022-01',
    endDate: '2022-10',
    description:
      'Subida agresiva de tasas por la Fed. Equity -25% + bonos largos -30%+. Stagflación atípica (equity y bonos cayendo juntos). 10 meses.',
  },
];

// ---------------------------------------------------------------------------
// Índices en la grilla maestra DATES
// ---------------------------------------------------------------------------

function findDateIndex(date: string): number {
  const idx = DATES.indexOf(date);
  if (idx === -1) {
    throw new Error(
      `regimes: fecha "${date}" no está en DATES (${DATES[0]} → ${DATES[DATES.length - 1]})`,
    );
  }
  return idx;
}

export interface RegimeWindow {
  readonly startIdx: number;
  readonly endIdx: number;
  readonly length: number;
}

export function regimeWindow(regime: RegimeDef): RegimeWindow {
  const startIdx = findDateIndex(regime.startDate);
  const endIdx = findDateIndex(regime.endDate);
  if (endIdx < startIdx) {
    throw new Error(
      `regime ${regime.id}: endDate ${regime.endDate} viene antes de startDate ${regime.startDate}`,
    );
  }
  return { startIdx, endIdx, length: endIdx - startIdx + 1 };
}

// ---------------------------------------------------------------------------
// Cálculo de retornos por ticker en el período + modo
// ---------------------------------------------------------------------------

const FIXED6_MONTHLY = 0.06 / 12;
const FIXED9_MONTHLY = 0.09 / 12;

// Set de RF tickers para lookup O(1).
const RF_TICKER_SET = new Set<Ticker>(RF_TICKERS as readonly Ticker[]);

// Mapeo ticker → índice en la columna de RETURNS.
const TICKER_IDX: Map<Ticker, number> = new Map(
  TICKERS.map((t, i) => [t, i] as const),
);

/**
 * Retorno mensual de un ticker en un mes dado, según el modo.
 *
 * - Tickers de equity y FIXED viven en `RETURNS` directamente, invariante al
 *   modo (los returns de equity no dependen del nivel de yields).
 * - Tickers RF en modo 'historical' → `RETURNS[ticker][monthIdx]`. Equivale a
 *   `RF_DECOMP[ticker].total` pero usa `RETURNS` que está imputado con proxies
 *   para los primeros meses de tickers lanzados después de 2006-01.
 * - Tickers RF en modo 'currentRates' → total − carry_hist + carry_today.
 *   Si `RF_DECOMP[ticker].carry[monthIdx]` es NaN (mes pre-launch del ticker
 *   original, sin decomposition), fallback a `RETURNS` — coincide con el
 *   comportamiento de 'historical' para ese mes, consistente con el proxy
 *   que ya está usándose en la grilla imputada.
 */
function tickerReturnAt(
  ticker: Ticker,
  monthIdx: number,
  mode: ReplayMode,
  yieldInitial: Readonly<Record<YieldKey, number>>,
): number {
  const tIdx = TICKER_IDX.get(ticker);
  if (tIdx === undefined) {
    throw new Error(`regimes: ticker "${ticker}" no existe en TICKERS`);
  }
  const historicalReturn = RETURNS[monthIdx * N_TICKERS + tIdx];

  if (mode === 'historical' || !RF_TICKER_SET.has(ticker)) {
    return historicalReturn;
  }

  // Modo currentRates + ticker RF → reconstruir con carry de hoy
  const rfTicker = ticker as RfTicker;
  const series = RF_DECOMP[rfTicker];
  const carryHist = series.carry[monthIdx];
  const totalHist = series.total[monthIdx];

  // Fallback para meses pre-launch del ticker RF (RF_DECOMP tiene NaN en el
  // prefijo aunque RETURNS esté imputado). En esos meses usamos el proxy
  // imputado directamente — no hay carry propio del ticker contra el cual
  // comparar.
  if (!Number.isFinite(carryHist) || !Number.isFinite(totalHist)) {
    return historicalReturn;
  }

  const cfg = RF_CONFIG[rfTicker];
  const carryToday = yieldInitial[cfg.proxyYield] / 12;
  return totalHist - carryHist + carryToday;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Computa la serie de retornos mensuales del portafolio durante la ventana
 * histórica del régimen, bajo el modo de replay elegido.
 *
 * Implementación:
 *   1. Expandir el PortfolioSpec a pesos de ETFs + FIXED (reusa `expandPortfolio`).
 *   2. Para cada mes del régimen, combinar:
 *        r_port_t = Σ (w_etf[ticker] / totalWeight) × r_ticker_t
 *                 + (w_fixed6 / totalWeight) × FIXED6_MONTHLY
 *                 + (w_fixed9 / totalWeight) × FIXED9_MONTHLY
 *
 * Normalización por `totalWeight`: hace que portafolios con weights que no
 * suman exactamente 100 (ej. custom a medio armar) igual produzcan retornos
 * correctamente ponderados. Para signatures bien definidas, totalWeight ≈ 100
 * y el divisor es el esperado.
 *
 * Longitud del output = `regimeWindow(regime).length`.
 *
 * Throw si la ventana del régimen cae fuera de DATES o si el spec es inválido.
 */
export function computeRegimeReturns(
  spec: PortfolioSpec,
  regime: RegimeDef,
  mode: ReplayMode,
  yieldInitial: Readonly<Record<YieldKey, number>>,
): Float32Array {
  const expanded = expandPortfolio(spec);
  const { startIdx, length } = regimeWindow(regime);
  return computeRegimeReturnsForExpanded(expanded, startIdx, length, mode, yieldInitial);
}

/**
 * Variante para cuando ya tenés el ExpandedPortfolio a mano (evita re-expandir
 * en cada render cuando solo cambia el régimen o el modo).
 */
export function computeRegimeReturnsForExpanded(
  expanded: ExpandedPortfolio,
  startIdx: number,
  length: number,
  mode: ReplayMode,
  yieldInitial: Readonly<Record<YieldKey, number>>,
): Float32Array {
  const { etfs, fixed, totalWeight } = expanded;
  if (totalWeight <= 0) {
    throw new Error('regimes: portafolio vacío (totalWeight = 0)');
  }
  const out = new Float32Array(length);
  const etfEntries = Object.entries(etfs) as [Ticker, number][];

  for (let k = 0; k < length; k++) {
    const monthIdx = startIdx + k;
    let r = 0;

    // Equity + RF tickers
    for (const [ticker, weight] of etfEntries) {
      if (weight === 0) continue;
      const tickerReturn = tickerReturnAt(ticker, monthIdx, mode, yieldInitial);
      r += (weight / totalWeight) * tickerReturn;
    }

    // FIXED blocks — invariantes al modo
    if (fixed.FIXED6 > 0) {
      r += (fixed.FIXED6 / totalWeight) * FIXED6_MONTHLY;
    }
    if (fixed.FIXED9 > 0) {
      r += (fixed.FIXED9 / totalWeight) * FIXED9_MONTHLY;
    }

    out[k] = r;
  }
  return out;
}

/**
 * Aplica una serie de retornos mensuales a un capital inicial. Devuelve
 * array de longitud `returns.length + 1` con el valor al inicio (V[0] = initial)
 * y al final de cada mes (V[t] = V[t-1] × (1 + r[t-1])).
 */
export function computeValuePath(
  initialValue: number,
  monthlyReturns: Float32Array,
): Float32Array {
  const out = new Float32Array(monthlyReturns.length + 1);
  out[0] = initialValue;
  for (let t = 0; t < monthlyReturns.length; t++) {
    out[t + 1] = out[t] * (1 + monthlyReturns[t]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Métricas resumidas para tabla de stats
// ---------------------------------------------------------------------------

export interface RegimeStats {
  /** Retorno total acumulado sobre el período completo. (V_final / V_inicial) − 1. */
  readonly totalReturn: number;
  /** Max drawdown: peor pérdida peak-to-trough sobre V. Negativo o 0. */
  readonly maxDrawdown: number;
  /** Valor final de la path. */
  readonly finalValue: number;
  /**
   * Meses desde el peak del max drawdown hasta el trough correspondiente.
   * 0 si no hay drawdown (path monótona creciente).
   */
  readonly drawdownDurationMonths: number;
  /**
   * Meses desde el trough del max drawdown hasta volver a superar el peak
   * previo. null si el régimen termina antes de que el portafolio recupere.
   * 0 si no hubo drawdown.
   */
  readonly timeToRecoveryMonths: number | null;
  /**
   * Meses con retorno negativo, anualizado: (# meses neg) × 12 / total_meses.
   * Normaliza para comparar regímenes de distinta duración.
   */
  readonly negativeMonthsPerYear: number;
  /** Desvío estándar de los retornos mensuales × √12. */
  readonly volatilityAnnualized: number;
  /** Peor retorno mensual único dentro del régimen. */
  readonly worstMonth: number;
  /** Mejor retorno mensual único dentro del régimen. */
  readonly bestMonth: number;
}

/**
 * Computa las 9 métricas resumen del régimen.
 *
 * Argumentos:
 *   - `valuePath`: serie de valores incluyendo V[0] (longitud = meses + 1).
 *   - `monthlyReturns`: serie de retornos (longitud = meses). Se pasa aparte
 *     porque varias métricas operan sobre retornos directamente, no sobre V.
 *
 * Convenciones en edge-cases:
 *   - Path monótona creciente → maxDrawdown = 0, drawdownDurationMonths = 0,
 *     timeToRecoveryMonths = 0.
 *   - Drawdown sin recuperación al cierre → timeToRecoveryMonths = null.
 *   - Volatilidad con n = 1 → 0 (n-1 divisor saturado).
 */
export function computeRegimeStats(
  valuePath: Float32Array,
  monthlyReturns: Float32Array,
): RegimeStats {
  if (valuePath.length === 0) {
    throw new Error('regimes: valuePath vacío');
  }
  if (monthlyReturns.length === 0) {
    throw new Error('regimes: monthlyReturns vacío');
  }

  const initial = valuePath[0];
  const final = valuePath[valuePath.length - 1];

  // --- Max drawdown + ubicación (peakIdx, troughIdx) ---
  let peak = valuePath[0];
  let peakIdx = 0;
  let maxDD = 0;
  let maxDDPeakIdx = 0;
  let maxDDTroughIdx = 0;
  for (let t = 1; t < valuePath.length; t++) {
    const v = valuePath[t];
    if (v > peak) {
      peak = v;
      peakIdx = t;
    }
    const dd = v / peak - 1;
    if (dd < maxDD) {
      maxDD = dd;
      maxDDPeakIdx = peakIdx;
      maxDDTroughIdx = t;
    }
  }

  // --- Duración de la caída (peak → trough del max DD) ---
  const drawdownDurationMonths =
    maxDD === 0 ? 0 : maxDDTroughIdx - maxDDPeakIdx;

  // --- Tiempo a recuperación (trough → superar el peak previo) ---
  let timeToRecoveryMonths: number | null;
  if (maxDD === 0) {
    timeToRecoveryMonths = 0;
  } else {
    const priorPeak = valuePath[maxDDPeakIdx];
    let recoveryIdx: number | null = null;
    for (let t = maxDDTroughIdx + 1; t < valuePath.length; t++) {
      if (valuePath[t] >= priorPeak) {
        recoveryIdx = t;
        break;
      }
    }
    timeToRecoveryMonths =
      recoveryIdx !== null ? recoveryIdx - maxDDTroughIdx : null;
  }

  // --- Meses en negativo + peor/mejor mes + media ---
  let negCount = 0;
  let worstMonth = Infinity;
  let bestMonth = -Infinity;
  let sum = 0;
  for (let t = 0; t < monthlyReturns.length; t++) {
    const r = monthlyReturns[t];
    if (r < 0) negCount++;
    if (r < worstMonth) worstMonth = r;
    if (r > bestMonth) bestMonth = r;
    sum += r;
  }
  const mean = sum / monthlyReturns.length;
  const negativeMonthsPerYear =
    (negCount * 12) / monthlyReturns.length;

  // --- Volatilidad anualizada (sd × √12), sample variance ---
  let sumSq = 0;
  for (let t = 0; t < monthlyReturns.length; t++) {
    const dev = monthlyReturns[t] - mean;
    sumSq += dev * dev;
  }
  const denom = Math.max(1, monthlyReturns.length - 1);
  const variance = sumSq / denom;
  const volatilityAnnualized = Math.sqrt(variance) * Math.sqrt(12);

  return {
    totalReturn: initial > 0 ? final / initial - 1 : 0,
    maxDrawdown: maxDD,
    finalValue: final,
    drawdownDurationMonths,
    timeToRecoveryMonths,
    negativeMonthsPerYear,
    volatilityAnnualized,
    worstMonth,
    bestMonth,
  };
}

// ---------------------------------------------------------------------------
// Búsqueda de regímenes por id
// ---------------------------------------------------------------------------

export function findRegime(id: RegimeId): RegimeDef {
  const r = REGIMES.find((x) => x.id === id);
  if (!r) throw new Error(`regimes: id "${id}" no existe`);
  return r;
}
