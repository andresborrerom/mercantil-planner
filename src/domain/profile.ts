/**
 * Clasificación de perfil de volatilidad + métricas per-path.
 *
 * Vol profile classification — umbrales basados en la práctica común de
 * firmas grandes de wealth management:
 *
 *   - BlackRock iShares (risk spectrum): conservative <6%, moderate 6-10%,
 *     growth 10-14%, aggressive >14% (4 tiers).
 *   - JPMorgan Asset Management: similar con cortes cerca de 5/10/15.
 *   - Morgan Stanley Wealth: conservative 4-6%, moderate 7-10%, aggressive
 *     11-15%, very aggressive >15%.
 *   - Vanguard: ~7/12/17 para 3-4 tiers.
 *   - Raymond James: conservative <8%, moderate 8-12%, aggressive >12%.
 *
 * Para un modelo de 3 tiers, el consenso aproximado es 6% / 12% como cortes,
 * que es lo que usamos acá. Los valores son constantes hardcodeadas — si más
 * adelante se necesita permitir overrides por cliente, mover a config.
 *
 * Métrica base: volatilidad anualizada del portafolio ponderado contra el
 * histórico completo 2006-2026 (determinística, NO depende de una corrida de
 * simulación). Esto permite mostrar el perfil inmediatamente cuando el usuario
 * selecciona un portafolio, antes de correr el worker.
 */

import {
  N_MONTHS,
  N_TICKERS,
  RETURNS,
  TICKERS,
  type Ticker,
} from '../data/market.generated';
import { expandPortfolio } from './amc-definitions';
import { DEFAULT_BOOTSTRAP_CONFIG } from './bootstrap';
import { stdSample } from './stats';
import type { PortfolioSpec } from './types';

// ---------------------------------------------------------------------------
// Umbrales
// ---------------------------------------------------------------------------

/**
 * Umbrales de volatilidad anualizada expresados como fracción (NO porcentaje).
 *   - `baja`: corte inferior. `vol < baja` → 'baja'.
 *   - `media`: corte superior de "media". `baja ≤ vol < media` → 'media'.
 *   - `vol ≥ media` → 'alta'.
 */
export const VOL_THRESHOLDS = {
  baja: 0.06,
  media: 0.12,
} as const;

export type VolProfile = 'baja' | 'media' | 'alta';

export const VOL_PROFILE_LABELS: Record<VolProfile, string> = {
  baja: 'Volatilidad Baja',
  media: 'Volatilidad Media',
  alta: 'Volatilidad Alta',
};

export const VOL_PROFILE_DESCRIPTION: Record<VolProfile, string> = {
  baja: `Vol anual < ${(VOL_THRESHOLDS.baja * 100).toFixed(0)}%. Perfil conservador típico.`,
  media: `Vol anual entre ${(VOL_THRESHOLDS.baja * 100).toFixed(0)}% y ${(VOL_THRESHOLDS.media * 100).toFixed(0)}%. Perfil balanceado.`,
  alta: `Vol anual > ${(VOL_THRESHOLDS.media * 100).toFixed(0)}%. Perfil orientado a crecimiento.`,
};

// ---------------------------------------------------------------------------
// Cálculo de volatilidad histórica del portafolio (determinístico)
// ---------------------------------------------------------------------------

/**
 * Volatilidad anualizada histórica del portafolio ponderado.
 *
 * Construye la serie `r_port[t] = Σ_j w_j · r_{t,j} + fixed_contrib` sobre los
 * 244 meses del dataset, calcula std muestral con corrección Bessel y
 * anualiza con `√12`. Totalmente determinístico.
 *
 * FIXED6/FIXED9 al ser retornos mensuales constantes NO contribuyen a la
 * varianza, pero sí diluyen la varianza de los demás activos (restan peso
 * relativo a los ETFs volátiles). Por eso se incluyen en el cálculo del
 * retorno pero no afectan la std más allá del efecto dilución.
 *
 * Las tasas FIXED usadas son las default del worker (6% y 9% anuales).
 * Si más adelante los clientes pueden editarlas, esta función debería
 * aceptarlas como parámetro — por ahora están hardcodeadas intencionalmente
 * porque el "perfil" es una característica canónica del portafolio.
 */
export function computePortfolioHistoricalVol(spec: PortfolioSpec): number {
  const exp = expandPortfolio(spec);
  if (exp.totalWeight <= 0) return NaN;

  // Densificar pesos ETF en un array alineado con TICKERS
  const weights = new Float64Array(N_TICKERS);
  for (const [ticker, w] of Object.entries(exp.etfs)) {
    if (typeof w !== 'number' || !Number.isFinite(w) || w === 0) continue;
    const idx = TICKERS.indexOf(ticker as Ticker);
    if (idx >= 0) weights[idx] = w / 100;
  }

  const fixed6Monthly =
    Math.pow(1 + DEFAULT_BOOTSTRAP_CONFIG.fixed6Annual, 1 / 12) - 1;
  const fixed9Monthly =
    Math.pow(1 + DEFAULT_BOOTSTRAP_CONFIG.fixed9Annual, 1 / 12) - 1;
  const fixedContribution =
    (exp.fixed.FIXED6 / 100) * fixed6Monthly +
    (exp.fixed.FIXED9 / 100) * fixed9Monthly;

  // Construir la serie histórica del portafolio
  const portReturns: number[] = new Array(N_MONTHS);
  for (let t = 0; t < N_MONTHS; t++) {
    let sum = fixedContribution;
    const base = t * N_TICKERS;
    for (let j = 0; j < N_TICKERS; j++) {
      sum += weights[j] * RETURNS[base + j];
    }
    portReturns[t] = sum;
  }

  const std = stdSample(portReturns);
  return std * Math.sqrt(12);
}

// ---------------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------------

export function classifyVolProfile(volAnnual: number): VolProfile {
  if (!Number.isFinite(volAnnual)) return 'alta';
  if (volAnnual < VOL_THRESHOLDS.baja) return 'baja';
  if (volAnnual < VOL_THRESHOLDS.media) return 'media';
  return 'alta';
}

// ---------------------------------------------------------------------------
// Métricas para UN path sample (ventana-dependientes)
// ---------------------------------------------------------------------------

export type SinglePathStats = {
  /** Fracción (0..1) de meses con retorno del portafolio negativo. */
  pctNegMonths: number;
  /** Max drawdown sobre la serie pre-flujo. Fracción ≤ 0. */
  maxDrawdown: number;
  /** TWR anualizado (time-weighted, ignora flujos). Fracción. */
  twrAnnualized: number;
  /** Valor patrimonial al cierre de la ventana (USD nominales). */
  finalValue: number;
};

/**
 * Calcula las 4 métricas del ProfilePreview para un path dado dentro de una
 * ventana específica. No toca el store, no cachea, puro input → output.
 */
export function computeSinglePathMetrics(
  values: Float32Array,
  portfolioReturns: Float32Array,
  pathIdx: number,
  horizonMonths: number,
  startMonth: number,
  endMonth: number,
): SinglePathStats {
  if (startMonth < 1 || endMonth > horizonMonths || startMonth > endMonth) {
    throw new Error(
      `computeSinglePathMetrics: ventana inválida [${startMonth}, ${endMonth}] para H=${horizonMonths}`,
    );
  }

  const valOff = pathIdx * (horizonMonths + 1);
  const retOff = pathIdx * horizonMonths;
  const retStartIdx = startMonth - 1; // 0-indexed
  const retEndIdx = endMonth; // exclusive
  const nReturns = retEndIdx - retStartIdx;

  // % meses negativos
  let neg = 0;
  for (let i = retStartIdx; i < retEndIdx; i++) {
    if (portfolioReturns[retOff + i] < 0) neg++;
  }
  const pctNegMonths = nReturns > 0 ? neg / nReturns : NaN;

  // TWR anualizado
  let growth = 1;
  for (let i = retStartIdx; i < retEndIdx; i++) {
    growth *= 1 + portfolioReturns[retOff + i];
  }
  const twrAnnualized = nReturns > 0 ? Math.pow(growth, 12 / nReturns) - 1 : NaN;

  // Max drawdown sobre serie pre-flujo
  let peak = values[valOff + (startMonth - 1)];
  let mdd = 0;
  if (Number.isFinite(peak) && peak > 0) {
    for (let k = 1; k <= nReturns; k++) {
      const t = startMonth + k - 1;
      const vPrev = values[valOff + (t - 1)];
      const r = portfolioReturns[retOff + (t - 1)];
      const vPre = vPrev * (1 + r);
      if (vPre > peak) peak = vPre;
      if (peak > 0) {
        const dd = (vPre - peak) / peak;
        if (dd < mdd) mdd = dd;
      } else {
        mdd = -1;
        break;
      }
    }
  }

  const finalValue = values[valOff + endMonth];

  return {
    pctNegMonths,
    maxDrawdown: mdd,
    twrAnnualized,
    finalValue,
  };
}
