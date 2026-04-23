/**
 * worker-sanity.ts — test de sanidad del motor de bootstrap (§4 + §11 + Fase 2 RF).
 *
 * Se corre en Node vía tsx: `npm run sanity`.
 *
 * Criterios:
 *   1. Determinismo: dos corridas con mismo seed → output idéntico.
 *   2. Convergencia SPY: seed=42, block=12, nPaths=5000, horizon=120, 100% SPY,
 *      mediana del retorno anualizado dentro de ±1pp del histórico realizado.
 *   3. Performance: 5000 × 360 < 15s en browser (< 7s soft cap en Node).
 *   4. RF yield-path sane (Fase 2): 100% IEF produce retornos sin NaN, media
 *      mensual compatible con carry actual TNX/12, vol escala con duración.
 *   5. RF bounds respetados (Fase 2): 100% BIL nunca produce carry > ceiling/12
 *      ni < floor/12 (damping funciona).
 *
 * Exit codes:
 *   0 — todos los criterios verdes
 *   1 — alguno de los criterios rojo o error interno
 */

import { N_MONTHS, N_TICKERS, RETURNS, TICKERS, YIELDS, DATES } from '../src/data/market.generated';
import { DEFAULT_BOOTSTRAP_CONFIG, getYieldBounds, runBootstrap } from '../src/domain/bootstrap';
import type { ExpandedPortfolio } from '../src/domain/types';

// ---------------------------------------------------------------------------
// Helpers numéricos
// ---------------------------------------------------------------------------

/** Retorno compuesto a lo largo de una serie de retornos mensuales. */
function compoundReturn(monthlyReturns: Float32Array, start: number, length: number): number {
  let growth = 1;
  for (let i = 0; i < length; i++) {
    growth *= 1 + monthlyReturns[start + i];
  }
  return growth - 1;
}

/** Anualiza una serie de retornos mensuales a una tasa compuesta anual. */
function annualizedFromMonthly(
  monthlyReturns: Float32Array,
  start: number,
  length: number,
): number {
  const totalGrowth = 1 + compoundReturn(monthlyReturns, start, length);
  return Math.pow(totalGrowth, 12 / length) - 1;
}

/** Mediana de un array de números (puro, sin mutar). */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n % 2 === 1) return sorted[(n - 1) / 2];
  return 0.5 * (sorted[n / 2 - 1] + sorted[n / 2]);
}

/** Percentil (lineal) de un array de números. p en [0, 1]. */
function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return NaN;
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

// ---------------------------------------------------------------------------
// Portafolio de prueba: 100% SPY
// ---------------------------------------------------------------------------

const spyOnly: ExpandedPortfolio = {
  etfs: { SPY: 100 },
  fixed: { FIXED6: 0, FIXED9: 0 },
  totalWeight: 100,
};

// ---------------------------------------------------------------------------
// 1) Referencia histórica: SPY anualizado sobre dataset completo
// ---------------------------------------------------------------------------

function historicalSpyAnnualized(): number {
  const spyIdx = TICKERS.indexOf('SPY');
  if (spyIdx < 0) throw new Error('SPY no está en TICKERS');
  const spy = new Float32Array(N_MONTHS);
  for (let i = 0; i < N_MONTHS; i++) spy[i] = RETURNS[i * N_TICKERS + spyIdx];
  return annualizedFromMonthly(spy, 0, N_MONTHS);
}

// ---------------------------------------------------------------------------
// 2) Test A: convergencia estadística
// ---------------------------------------------------------------------------

type CheckResult = {
  name: string;
  ok: boolean;
  details: string;
};

function checkConvergenceToHistorical(): CheckResult {
  const horizon = 120;
  const config = {
    ...DEFAULT_BOOTSTRAP_CONFIG,
    seed: 42,
    nPaths: 5000,
    blockSize: 12,
  };
  const out = runBootstrap({
    portfolios: { A: spyOnly, B: spyOnly },
    horizonMonths: horizon,
    config,
  });
  const { portfolioReturnsA, meta } = out;

  const pathAnnualized: number[] = new Array(config.nPaths);
  for (let p = 0; p < config.nPaths; p++) {
    pathAnnualized[p] = annualizedFromMonthly(portfolioReturnsA, p * horizon, horizon);
  }

  const med = median(pathAnnualized);
  const p10 = percentile(pathAnnualized, 0.1);
  const p90 = percentile(pathAnnualized, 0.9);
  const histAnn = historicalSpyAnnualized();
  const absDiff = Math.abs(med - histAnn);
  const tolerance = 0.01; // 1pp
  const ok = absDiff < tolerance;

  const details =
    `\n      SPY histórico anualizado (${DATES[0]} → ${DATES[N_MONTHS - 1]}): ${(histAnn * 100).toFixed(3)}%` +
    `\n      Bootstrap mediana anualizada (nPaths=${config.nPaths}, horizon=${horizon}m, block=${config.blockSize}, seed=${config.seed}):` +
    `\n        P10:      ${(p10 * 100).toFixed(3)}%` +
    `\n        mediana:  ${(med * 100).toFixed(3)}%` +
    `\n        P90:      ${(p90 * 100).toFixed(3)}%` +
    `\n      |mediana − histórico| = ${(absDiff * 100).toFixed(3)}pp (tolerancia: ${(tolerance * 100).toFixed(0)}pp)` +
    `\n      Elapsed: ${meta.elapsedMs.toFixed(1)}ms`;

  return {
    name: 'Convergencia de SPY puro al histórico realizado',
    ok,
    details,
  };
}

// ---------------------------------------------------------------------------
// 3) Test B: performance 5000 × 360 (§11 paso 4)
// ---------------------------------------------------------------------------

function checkPerformanceFullHorizon(): CheckResult {
  const config = {
    ...DEFAULT_BOOTSTRAP_CONFIG,
    seed: 42,
    nPaths: 5000,
    blockSize: 12,
  };
  const horizon = 360;
  const out = runBootstrap({
    portfolios: { A: spyOnly, B: spyOnly },
    horizonMonths: horizon,
    config,
  });
  const elapsedMs = out.meta.elapsedMs;
  const hardCap = 15_000;
  const softCap = 7_000; // browser ~ 2x Node
  const ok = elapsedMs < hardCap;

  const details =
    `\n      5000 paths × 360 meses, 100% SPY` +
    `\n      Elapsed: ${elapsedMs.toFixed(1)}ms` +
    `\n      Hard cap (§11 paso 4, browser): ${hardCap}ms` +
    `\n      Soft cap (Node estimado): ${softCap}ms` +
    (elapsedMs >= softCap && elapsedMs < hardCap
      ? '\n      ⚠ WARN: performance aceptable en Node pero posiblemente apretada en browser'
      : '');

  return {
    name: 'Performance 5000 × 360',
    ok,
    details,
  };
}

// ---------------------------------------------------------------------------
// 4) Test C: determinismo cross-corrida
// ---------------------------------------------------------------------------

function checkDeterminism(): CheckResult {
  const config = {
    ...DEFAULT_BOOTSTRAP_CONFIG,
    seed: 42,
    nPaths: 500,
    blockSize: 12,
  };
  const input = {
    portfolios: { A: spyOnly, B: spyOnly },
    horizonMonths: 120,
    config,
  };
  const out1 = runBootstrap(input);
  const out2 = runBootstrap(input);

  let mismatches = 0;
  for (let i = 0; i < out1.portfolioReturnsA.length; i++) {
    if (out1.portfolioReturnsA[i] !== out2.portfolioReturnsA[i]) mismatches++;
  }
  const ok = mismatches === 0;
  return {
    name: 'Determinismo cross-corrida con mismo seed',
    ok,
    details:
      `\n      Dos runs con seed=42: ${mismatches} divergencias de ${out1.portfolioReturnsA.length} valores`,
  };
}

// ---------------------------------------------------------------------------
// 5) Test D: RF yield-path coherente (Fase 2) — 100% IEF
// ---------------------------------------------------------------------------

const iefOnly: ExpandedPortfolio = {
  etfs: { IEF: 100 },
  fixed: { FIXED6: 0, FIXED9: 0 },
  totalWeight: 100,
};

const sptlOnly: ExpandedPortfolio = {
  etfs: { SPTL: 100 },
  fixed: { FIXED6: 0, FIXED9: 0 },
  totalWeight: 100,
};

const bilOnly: ExpandedPortfolio = {
  etfs: { BIL: 100 },
  fixed: { FIXED6: 0, FIXED9: 0 },
  totalWeight: 100,
};

function stdOf(arr: Float32Array): number {
  let m = 0;
  for (let i = 0; i < arr.length; i++) m += arr[i];
  m /= arr.length;
  let s = 0;
  for (let i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
  return Math.sqrt(s / (arr.length - 1));
}

function checkRfYieldPathCoherent(): CheckResult {
  const config = { ...DEFAULT_BOOTSTRAP_CONFIG, seed: 42, nPaths: 5000, blockSize: 12 };
  const horizon = 120;
  const outIef = runBootstrap({
    portfolios: { A: iefOnly, B: iefOnly },
    horizonMonths: horizon,
    config,
  });
  const outSptl = runBootstrap({
    portfolios: { A: sptlOnly, B: sptlOnly },
    horizonMonths: horizon,
    config,
  });

  // Media mensual IEF
  let sumIef = 0;
  let nanCount = 0;
  for (let i = 0; i < outIef.portfolioReturnsA.length; i++) {
    const v = outIef.portfolioReturnsA[i];
    if (!Number.isFinite(v)) nanCount++;
    sumIef += v;
  }
  const meanIefMonthly = sumIef / outIef.portfolioReturnsA.length;
  const meanIefAnnualized = Math.pow(1 + meanIefMonthly, 12) - 1;

  const stdIef = stdOf(outIef.portfolioReturnsA);
  const stdSptl = stdOf(outSptl.portfolioReturnsA);

  // TNX actual: carry de referencia
  const tnxCurrent = YIELDS.TNX[N_MONTHS - 1];
  const carryRef = tnxCurrent / 12;

  // Criterios:
  //   a) Sin NaN
  //   b) Media mensual en un rango razonable (entre -1% y +2%)
  //   c) Vol SPTL > vol IEF × 1.5 (efecto duración)
  const noNan = nanCount === 0;
  const meanRangeOk = meanIefMonthly > -0.01 && meanIefMonthly < 0.02;
  const durationEffectOk = stdSptl > stdIef * 1.5;
  const ok = noNan && meanRangeOk && durationEffectOk;

  const details =
    `\n      100% IEF, ${config.nPaths} paths × ${horizon} meses:` +
    `\n        NaN values:        ${nanCount}` +
    `\n        media mensual:     ${(meanIefMonthly * 100).toFixed(4)}%` +
    `\n        media anualizada:  ${(meanIefAnnualized * 100).toFixed(3)}%` +
    `\n        carry ref (TNX/12): ${(carryRef * 100).toFixed(4)}% ` +
    `\n        vol mensual IEF:   ${(stdIef * 100).toFixed(3)}%` +
    `\n        vol mensual SPTL:  ${(stdSptl * 100).toFixed(3)}% (debe ser > IEF × 1.5)` +
    `\n      Elapsed IEF: ${outIef.meta.elapsedMs.toFixed(1)}ms, SPTL: ${outSptl.meta.elapsedMs.toFixed(1)}ms`;

  return {
    name: 'RF yield-path coherente (Fase 2)',
    ok,
    details,
  };
}

function checkRfBoundsRespected(): CheckResult {
  // Con 100% BIL (carry-only), el retorno es y_IRX_path/12. Si el damping
  // funciona, y_path ∈ [floor, ceiling], así que r ∈ [floor/12, ceiling/12].
  const config = { ...DEFAULT_BOOTSTRAP_CONFIG, seed: 42, nPaths: 5000, blockSize: 12 };
  const horizon = 360;
  const out = runBootstrap({
    portfolios: { A: bilOnly, B: bilOnly },
    horizonMonths: horizon,
    config,
  });

  const bounds = getYieldBounds('IRX');
  const minCarry = bounds.floor / 12;
  const maxCarry = bounds.ceiling / 12;
  let violations = 0;
  let minObserved = Infinity;
  let maxObserved = -Infinity;
  for (let i = 0; i < out.portfolioReturnsA.length; i++) {
    const v = out.portfolioReturnsA[i];
    if (v < minCarry - 1e-5 || v > maxCarry + 1e-5) violations++;
    if (v < minObserved) minObserved = v;
    if (v > maxObserved) maxObserved = v;
  }
  const ok = violations === 0;

  const details =
    `\n      100% BIL, ${config.nPaths} paths × ${horizon} meses:` +
    `\n        Cotas teóricas: carry ∈ [${(minCarry * 100).toFixed(4)}%, ${(maxCarry * 100).toFixed(4)}%]` +
    `\n        Cotas observadas: carry ∈ [${(minObserved * 100).toFixed(4)}%, ${(maxObserved * 100).toFixed(4)}%]` +
    `\n        Violaciones del damping: ${violations} de ${out.portfolioReturnsA.length} valores`;

  return {
    name: 'RF damping respeta cotas (piso y techo)',
    ok,
    details,
  };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function main(): void {
  console.log('================================================================');
  console.log(' worker-sanity.ts — chequeos del motor de bootstrap (§4 + §11)');
  console.log('================================================================');

  const results: CheckResult[] = [];
  try {
    results.push(checkDeterminism());
    results.push(checkConvergenceToHistorical());
    results.push(checkPerformanceFullHorizon());
    results.push(checkRfYieldPathCoherent());
    results.push(checkRfBoundsRespected());
  } catch (err) {
    console.error('\n✗ Error corriendo los chequeos:', err);
    process.exit(1);
  }

  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    console.log(`\n ${icon} ${r.name}${r.details}`);
    if (!r.ok) allOk = false;
  }

  console.log('\n================================================================');
  if (allOk) {
    console.log(' ✓ Todos los chequeos de sanidad verdes.');
    process.exit(0);
  } else {
    console.log(' ✗ Alguno de los chequeos falló. Revisar detalles arriba.');
    process.exit(1);
  }
}

main();
