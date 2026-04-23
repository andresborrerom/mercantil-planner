/**
 * scripts/rf-analysis.ts
 *
 * Análisis empírico previo a Fase 2 (RF yield-path reconstruction).
 *
 * Punto 1 — Estadísticos de niveles de yield (IRX / FVX / TNX / TYX)
 * Punto 2 — Estadísticos de Δy
 * Punto 3 — Regresión OLS: price_return ~ Δy + Δy² por los 11 RF tickers → D, C, R²
 * Punto 4 — Calibración del exponente de damping (simulación 5000×360)
 * Punto 5 — Sanity check: RF_DECOMP.carry vs yield_mapped/12
 * Punto 6 — Análisis de residuales para los 6 tickers credit/otros
 * Punto 7 — Decision matrix por ticker
 *
 * Uso: npm run analyze:rf
 */

import {
  DATES,
  RF_TICKERS,
  RF_DECOMP,
  YIELDS,
  N_MONTHS,
} from '../src/data/market.generated';
import { mulberry32 } from '../src/domain/prng';

type YieldKey = 'IRX' | 'FVX' | 'TNX' | 'TYX';
const YIELD_KEYS: readonly YieldKey[] = ['IRX', 'FVX', 'TNX', 'TYX'] as const;

// --- Utilidades estadísticas ------------------------------------------------

function mean(xs: number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdSample(xs: number[]): number {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

function skewness(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const m = mean(xs);
  const s = stdSample(xs);
  if (s === 0) return NaN;
  let acc = 0;
  for (const x of xs) acc += ((x - m) / s) ** 3;
  return (n / ((n - 1) * (n - 2))) * acc;
}

function kurtosisExcess(xs: number[]): number {
  const n = xs.length;
  if (n < 4) return NaN;
  const m = mean(xs);
  const s = stdSample(xs);
  if (s === 0) return NaN;
  let acc = 0;
  for (const x of xs) acc += ((x - m) / s) ** 4;
  const k = ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * acc;
  const correction = (3 * (n - 1) ** 2) / ((n - 2) * (n - 3));
  return k - correction;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function minMax(xs: number[]): { min: number; max: number } {
  let mn = Infinity, mx = -Infinity;
  for (const x of xs) {
    if (x < mn) mn = x;
    if (x > mx) mx = x;
  }
  return { min: mn, max: mx };
}

function autocorr1(xs: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const m = mean(xs);
  let num = 0, den = 0;
  for (let i = 0; i < n - 1; i++) num += (xs[i] - m) * (xs[i + 1] - m);
  for (let i = 0; i < n; i++) den += (xs[i] - m) * (xs[i] - m);
  return num / den;
}

function correlation(a: number[], b: number[]): number {
  const n = a.length;
  if (n !== b.length || n < 2) return NaN;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma;
    const xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return num / Math.sqrt(da * db);
}

// --- OLS con intercepto + k regresores vía Gauss-Jordan --------------------

function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(M[r][i]) > Math.abs(M[maxRow][i])) maxRow = r;
    }
    if (maxRow !== i) {
      const tmp = M[i];
      M[i] = M[maxRow];
      M[maxRow] = tmp;
    }
    const pivot = M[i][i];
    if (Math.abs(pivot) < 1e-14) throw new Error('Matriz singular en OLS');
    for (let c = i; c <= n; c++) M[i][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const f = M[r][i];
        for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
      }
    }
  }
  return M.map((row) => row[n]);
}

function ols(
  y: number[],
  X: number[][],
): { coefs: number[]; r2: number; residuals: number[]; residStd: number } {
  const n = y.length;
  const k = X[0].length + 1;
  const Xaug = X.map((row) => [1, ...row]);
  const XtX: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xty: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < k; j++) {
      Xty[j] += Xaug[i][j] * y[i];
      for (let l = 0; l < k; l++) XtX[j][l] += Xaug[i][j] * Xaug[i][l];
    }
  }
  const beta = solveLinear(XtX, Xty);
  const yHat = Xaug.map((row) => row.reduce((s, v, j) => s + v * beta[j], 0));
  const residuals = y.map((v, i) => v - yHat[i]);
  const ym = mean(y);
  const rss = residuals.reduce((s, r) => s + r * r, 0);
  const tss = y.reduce((s, v) => s + (v - ym) ** 2, 0);
  const r2 = tss > 0 ? 1 - rss / tss : NaN;
  const residStd = Math.sqrt(rss / Math.max(1, n - k));
  return { coefs: beta, r2, residuals, residStd };
}

// --- Mapeo yield proxy por ticker ------------------------------------------

/** Devuelve el yield mapeado mes a mes (Float32Array N_MONTHS). SPTS interpola. */
function getMappedYield(ticker: string): Float32Array {
  switch (ticker) {
    case 'BIL':
      return YIELDS.IRX;
    case 'SPTS': {
      const irx = YIELDS.IRX, fvx = YIELDS.FVX;
      const out = new Float32Array(N_MONTHS);
      for (let i = 0; i < N_MONTHS; i++) out[i] = 0.63 * irx[i] + 0.37 * fvx[i];
      return out;
    }
    case 'IEI':
      return YIELDS.FVX;
    case 'IEF':
      return YIELDS.TNX;
    case 'SPTL':
      return YIELDS.TYX;
    case 'AGG':
      return YIELDS.FVX;
    case 'LQD':
      return YIELDS.TNX;
    case 'IGOV':
      return YIELDS.TNX;
    case 'GHYG':
      return YIELDS.FVX;
    case 'EMB':
      return YIELDS.TNX;
    case 'CEMB':
      return YIELDS.FVX;
    default:
      throw new Error(`Ticker RF sin mapeo: ${ticker}`);
  }
}

function getProxyLabel(ticker: string): string {
  switch (ticker) {
    case 'BIL': return 'IRX (3mo)';
    case 'SPTS': return '0.63·IRX + 0.37·FVX (~2y)';
    case 'IEI': return 'FVX (5yr)';
    case 'IEF': return 'TNX (10yr)';
    case 'SPTL': return 'TYX (30yr)';
    case 'AGG': return 'FVX (5yr)';
    case 'LQD': return 'TNX (10yr)';
    case 'IGOV': return 'TNX (10yr)';
    case 'GHYG': return 'FVX (5yr)';
    case 'EMB': return 'TNX (10yr)';
    case 'CEMB': return 'FVX (5yr)';
    default: throw new Error(`Ticker RF sin etiqueta: ${ticker}`);
  }
}

// --- Formateo ---------------------------------------------------------------

function pct(x: number, digits = 2): string {
  if (!Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}
function bps(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '—';
  return `${(x * 10000).toFixed(digits)} bps`;
}
function num(x: number, digits = 3): string {
  if (!Number.isFinite(x)) return '—';
  return x.toFixed(digits);
}
function pad(s: string, width: number): string {
  if (s.length >= width) return s;
  return s + ' '.repeat(width - s.length);
}
function rpad(s: string, width: number): string {
  return pad(s, width);
}
function lpad(s: string, width: number): string {
  if (s.length >= width) return s;
  return ' '.repeat(width - s.length) + s;
}

function hr(char = '─', n = 90): void {
  console.log(char.repeat(n));
}
function h1(title: string): void {
  console.log();
  console.log('═'.repeat(90));
  console.log('  ' + title);
  console.log('═'.repeat(90));
}
function h2(title: string): void {
  console.log();
  console.log('─── ' + title + ' ' + '─'.repeat(Math.max(0, 86 - title.length)));
}

// --- Punto 1 + 2 -----------------------------------------------------------

function analyzeYieldLevels(): void {
  h1('Punto 1 — Estadísticos de niveles de yield (histórico 2006-01 → 2026-04)');
  console.log(
    '\n' +
      rpad('Serie', 8) +
      lpad('Actual', 10) +
      lpad('Min', 10) +
      lpad('Max', 10) +
      lpad('Media', 10) +
      lpad('Std', 10) +
      lpad('Piso', 12) +
      lpad('Techo', 12),
  );
  hr();
  for (const k of YIELD_KEYS) {
    const arr = Array.from(YIELDS[k]).filter(Number.isFinite);
    const sorted = [...arr].sort((a, b) => a - b);
    const { min, max } = minMax(arr);
    const m = mean(arr);
    const s = stdSample(arr);
    const current = YIELDS[k][N_MONTHS - 1];
    const floor = min - 0.005; // min - 0.5%
    const ceiling = max * 1.5;
    void sorted;
    console.log(
      rpad(k, 8) +
        lpad(pct(current), 10) +
        lpad(pct(min), 10) +
        lpad(pct(max), 10) +
        lpad(pct(m), 10) +
        lpad(pct(s), 10) +
        lpad(pct(floor), 12) +
        lpad(pct(ceiling), 12),
    );
  }
  console.log(
    '\nPiso = min_hist − 0.5%   Techo = max_hist × 1.5   (damping aplica dentro de estos buffers)',
  );
}

function analyzeYieldChanges(): void {
  h1('Punto 2 — Estadísticos de Δy mensual');
  console.log(
    '\n' +
      rpad('Serie', 8) +
      lpad('n', 6) +
      lpad('Media', 10) +
      lpad('Std', 10) +
      lpad('Min', 10) +
      lpad('Max', 10) +
      lpad('Skew', 8) +
      lpad('ExKurt', 10) +
      lpad('AR(1)', 10),
  );
  hr();
  for (const k of YIELD_KEYS) {
    const y = YIELDS[k];
    const dy: number[] = [];
    for (let i = 1; i < N_MONTHS; i++) {
      const d = y[i] - y[i - 1];
      if (Number.isFinite(d)) dy.push(d);
    }
    const { min, max } = minMax(dy);
    console.log(
      rpad(k, 8) +
        lpad(String(dy.length), 6) +
        lpad(bps(mean(dy)), 10) +
        lpad(bps(stdSample(dy)), 10) +
        lpad(bps(min), 10) +
        lpad(bps(max), 10) +
        lpad(num(skewness(dy)), 8) +
        lpad(num(kurtosisExcess(dy)), 10) +
        lpad(num(autocorr1(dy)), 10),
    );
  }
  console.log('\nΔy expresado en bps (1 bps = 0.01 puntos porcentuales)');
}

// --- Punto 3 ----------------------------------------------------------------

interface RegressionResult {
  ticker: string;
  proxy: string;
  n: number;
  alpha: number;
  duration: number;
  convexity: number;
  r2: number;
  residStd: number;
  canonicalDur: number;
  residStdAnnualized: number;
}

const CANONICAL_DUR: Record<string, number> = {
  BIL: 0.25,
  SPTS: 2,
  IEI: 5,
  IEF: 7.5,
  SPTL: 18,
  IGOV: 8,
  AGG: 6,
  LQD: 8.5,
  GHYG: 4,
  EMB: 7,
  CEMB: 5,
};

function analyzeRegressions(): RegressionResult[] {
  h1('Punto 3 — Regresión OLS: price_return ~ Δy_proxy + Δy_proxy² por ticker');
  console.log(
    '\nModelo: price[t] = α − D · Δy[t] + ½ · C · (Δy[t])² + ε[t]',
  );
  console.log(
    '\n' +
      rpad('Ticker', 8) +
      rpad('Proxy yield', 28) +
      lpad('n', 5) +
      lpad('α (bps)', 10) +
      lpad('D (años)', 11) +
      lpad('C (años²)', 12) +
      lpad('R²', 8) +
      lpad('Resid σ', 10) +
      lpad('Dur canon', 11),
  );
  hr();

  const results: RegressionResult[] = [];
  for (const ticker of RF_TICKERS) {
    const price = RF_DECOMP[ticker].price;
    const proxyYield = getMappedYield(ticker);
    const dyProxy: number[] = [];
    const yReg: number[] = [];
    const xReg: number[][] = [];
    for (let i = 1; i < N_MONTHS; i++) {
      const dy = proxyYield[i] - proxyYield[i - 1];
      const pr = price[i];
      if (Number.isFinite(dy) && Number.isFinite(pr)) {
        dyProxy.push(dy);
        yReg.push(pr);
        xReg.push([dy, 0.5 * dy * dy]);
      }
    }
    const res = ols(yReg, xReg);
    const [alpha, bDy, bDy2] = res.coefs;
    const duration = -bDy; // D es la sensibilidad con signo negativo
    const convexity = bDy2; // ya viene factorizado por 0.5
    const result: RegressionResult = {
      ticker,
      proxy: getProxyLabel(ticker),
      n: yReg.length,
      alpha,
      duration,
      convexity,
      r2: res.r2,
      residStd: res.residStd,
      residStdAnnualized: res.residStd * Math.sqrt(12),
      canonicalDur: CANONICAL_DUR[ticker],
    };
    results.push(result);

    console.log(
      rpad(ticker, 8) +
        rpad(result.proxy, 28) +
        lpad(String(result.n), 5) +
        lpad(bps(result.alpha), 10) +
        lpad(num(result.duration, 2), 11) +
        lpad(num(result.convexity, 2), 12) +
        lpad(num(result.r2, 3), 8) +
        lpad(pct(result.residStd, 3), 10) +
        lpad(num(result.canonicalDur, 2), 11),
    );
  }
  console.log(
    '\nD comparado contra duración canónica publicada (iShares/State Street factsheet).',
  );
  return results;
}

// --- Punto 4 ----------------------------------------------------------------

function simulateYieldPaths(
  yieldSeriesKey: YieldKey,
  nPaths: number,
  horizonMonths: number,
  blockSize: number,
  exponent: number,
  seed: number,
): {
  terminalYields: Float32Array;
  fractionInBuffer: number;
  fractionClipped: number;
  pathsTerminalSamples: Float32Array;
} {
  const y = YIELDS[yieldSeriesKey];
  // Δy histórico completo
  const dyHist: number[] = [];
  for (let i = 1; i < N_MONTHS; i++) dyHist.push(y[i] - y[i - 1]);
  const valid = Array.from(y).filter(Number.isFinite);
  const { min, max } = minMax(valid);
  const yMin = min;
  const yMax = max;
  const yFloor = yMin - 0.005;
  const yCeiling = yMax * 1.5;
  const y0 = y[N_MONTHS - 1];
  const nDy = dyHist.length; // 243 cambios posibles

  const terminalYields = new Float32Array(nPaths);
  const rng = mulberry32(seed);
  let bufferHits = 0;
  let clipHits = 0;

  // Reservar muestras de paths completos para stats intermedios
  const samplePaths = Math.min(10, nPaths);
  const samples = new Float32Array(samplePaths);

  for (let p = 0; p < nPaths; p++) {
    let yPath = y0;
    let t = 0;
    let inBuffer = false;
    let wasClipped = false;
    while (t < horizonMonths) {
      // Sample un bloque
      const startIdx = Math.floor(rng() * (nDy - blockSize + 1));
      const len = Math.min(blockSize, horizonMonths - t);
      for (let k = 0; k < len; k++) {
        const dy = dyHist[startIdx + k];
        let dyEff = dy;
        // Damping upper
        if (dy > 0 && yPath > yMax) {
          const x = Math.min(1, (yPath - yMax) / (yCeiling - yMax));
          const scale = Math.max(0, 1 - Math.pow(x, exponent));
          dyEff = dy * scale;
          inBuffer = true;
          if (scale === 0) wasClipped = true;
        } else if (dy < 0 && yPath < yMin) {
          const x = Math.min(1, (yMin - yPath) / (yMin - yFloor));
          const scale = Math.max(0, 1 - Math.pow(x, exponent));
          dyEff = dy * scale;
          inBuffer = true;
          if (scale === 0) wasClipped = true;
        }
        yPath += dyEff;
      }
      t += len;
    }
    terminalYields[p] = yPath;
    if (p < samplePaths) samples[p] = yPath;
    if (inBuffer) bufferHits++;
    if (wasClipped) clipHits++;
  }

  return {
    terminalYields,
    fractionInBuffer: bufferHits / nPaths,
    fractionClipped: clipHits / nPaths,
    pathsTerminalSamples: samples,
  };
}

function calibrateDamping(): void {
  h1('Punto 4 — Calibración del exponente de damping');

  console.log('\nFunción: scale(x) = max(0, 1 − x^n) con x ∈ [0, 1] dentro del buffer.');
  console.log('Probamos n ∈ {1, 2, 3, 4} sobre simulación TNX 5000 paths × 360 meses, block=12.\n');

  console.log(
    'Tabla de scale(x) por exponente:\n' +
      rpad('x', 6) +
      lpad('n=1', 10) +
      lpad('n=2', 10) +
      lpad('n=3', 10) +
      lpad('n=4', 10),
  );
  hr('─', 46);
  for (const x of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0]) {
    const row =
      rpad(x.toFixed(2), 6) +
      lpad((1 - Math.pow(x, 1)).toFixed(3), 10) +
      lpad((1 - Math.pow(x, 2)).toFixed(3), 10) +
      lpad((1 - Math.pow(x, 3)).toFixed(3), 10) +
      lpad((1 - Math.pow(x, 4)).toFixed(3), 10);
    console.log(row);
  }

  const y = YIELDS.TNX;
  const valid = Array.from(y).filter(Number.isFinite);
  const { min: yMin, max: yMax } = minMax(valid);
  const yFloor = yMin - 0.005;
  const yCeiling = yMax * 1.5;
  const y0 = y[N_MONTHS - 1];

  console.log('\nParámetros TNX:');
  console.log(`  y_actual = ${pct(y0)}    y_min = ${pct(yMin)}    y_max = ${pct(yMax)}`);
  console.log(`  y_floor  = ${pct(yFloor)}    y_ceiling = ${pct(yCeiling)}`);
  console.log(`  buffer inferior = ${pct(yMin - yFloor)}   buffer superior = ${pct(yCeiling - yMax)}`);

  h2('Simulación — distribución de yields terminales (TNX, horizonte 30 años)');
  console.log(
    '\n' +
      rpad('Exponente', 12) +
      lpad('P1', 10) +
      lpad('P5', 10) +
      lpad('P25', 10) +
      lpad('P50', 10) +
      lpad('P75', 10) +
      lpad('P95', 10) +
      lpad('P99', 10) +
      lpad('Max', 10) +
      lpad('% buffer', 12) +
      lpad('% clipped', 12),
  );
  hr('─', 122);

  for (const n of [1, 2, 3, 4] as const) {
    const r = simulateYieldPaths('TNX', 5000, 360, 12, n, 42);
    const sorted = Array.from(r.terminalYields).sort((a, b) => a - b);
    const { max } = minMax(Array.from(r.terminalYields));
    console.log(
      rpad(`n = ${n}`, 12) +
        lpad(pct(percentile(sorted, 1)), 10) +
        lpad(pct(percentile(sorted, 5)), 10) +
        lpad(pct(percentile(sorted, 25)), 10) +
        lpad(pct(percentile(sorted, 50)), 10) +
        lpad(pct(percentile(sorted, 75)), 10) +
        lpad(pct(percentile(sorted, 95)), 10) +
        lpad(pct(percentile(sorted, 99)), 10) +
        lpad(pct(max), 10) +
        lpad(pct(r.fractionInBuffer), 12) +
        lpad(pct(r.fractionClipped), 12),
    );
  }

  // Comparación sin damping (clip duro en el buffer)
  console.log('\nReferencia — mismo setup SIN damping (ilimitado):');
  const unclipped = simulateYieldPathsUnclipped('TNX', 5000, 360, 12, 42);
  const sortedU = Array.from(unclipped).sort((a, b) => a - b);
  console.log(
    rpad('sin damping', 12) +
      lpad(pct(percentile(sortedU, 1)), 10) +
      lpad(pct(percentile(sortedU, 5)), 10) +
      lpad(pct(percentile(sortedU, 25)), 10) +
      lpad(pct(percentile(sortedU, 50)), 10) +
      lpad(pct(percentile(sortedU, 75)), 10) +
      lpad(pct(percentile(sortedU, 95)), 10) +
      lpad(pct(percentile(sortedU, 99)), 10) +
      lpad(pct(minMax(Array.from(unclipped)).max), 10),
  );

  console.log(
    '\nLectura: n bajo = damping agresivo (reduce P95/P99). n alto = damping suave (deja más varianza).',
  );
  console.log(
    'El % buffer mide paths que tocaron la zona de damping en algún punto; % clipped = tocaron el límite duro.',
  );
}

function simulateYieldPathsUnclipped(
  yieldSeriesKey: YieldKey,
  nPaths: number,
  horizonMonths: number,
  blockSize: number,
  seed: number,
): Float32Array {
  const y = YIELDS[yieldSeriesKey];
  const dyHist: number[] = [];
  for (let i = 1; i < N_MONTHS; i++) dyHist.push(y[i] - y[i - 1]);
  const y0 = y[N_MONTHS - 1];
  const nDy = dyHist.length;
  const terminal = new Float32Array(nPaths);
  const rng = mulberry32(seed);
  for (let p = 0; p < nPaths; p++) {
    let yPath = y0;
    let t = 0;
    while (t < horizonMonths) {
      const startIdx = Math.floor(rng() * (nDy - blockSize + 1));
      const len = Math.min(blockSize, horizonMonths - t);
      for (let k = 0; k < len; k++) yPath += dyHist[startIdx + k];
      t += len;
    }
    terminal[p] = yPath;
  }
  return terminal;
}

// --- Punto 5 ----------------------------------------------------------------

function analyzeCarryConsistency(): void {
  h1('Punto 5 — Consistencia de carry: RF_DECOMP.carry vs yield_mapped / 12');
  console.log(
    '\n' +
      rpad('Ticker', 8) +
      rpad('Proxy yield', 28) +
      lpad('n', 5) +
      lpad('ρ(carry, y/12)', 16) +
      lpad('media carry', 14) +
      lpad('media y/12', 14) +
      lpad('ratio', 8),
  );
  hr();
  for (const ticker of RF_TICKERS) {
    const carry = RF_DECOMP[ticker].carry;
    const yMapped = getMappedYield(ticker);
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < N_MONTHS; i++) {
      if (Number.isFinite(carry[i]) && Number.isFinite(yMapped[i])) {
        a.push(carry[i]);
        b.push(yMapped[i] / 12);
      }
    }
    const rho = correlation(a, b);
    const mA = mean(a);
    const mB = mean(b);
    const ratio = mA / mB;
    console.log(
      rpad(ticker, 8) +
        rpad(getProxyLabel(ticker), 28) +
        lpad(String(a.length), 5) +
        lpad(num(rho, 4), 16) +
        lpad(pct(mA, 3), 14) +
        lpad(pct(mB, 3), 14) +
        lpad(num(ratio, 2), 8),
    );
  }
  console.log(
    '\nInterpretación: ρ alto + ratio ≈ 1 → carry ≈ yield/12 funciona como simplificación.',
  );
  console.log('   ratio > 1 → el ticker carga prima (spread, yield propia más alta que el proxy).');
  console.log('   ratio < 1 → carry conservador vs el proxy (ej. descuento de roll-down).');
}

// --- Punto 6 ----------------------------------------------------------------

function analyzeCreditResiduals(regs: RegressionResult[]): void {
  h1('Punto 6 — Análisis de residuales (6 tickers credit/otros)');
  console.log(
    '\nResidual[t] = total_return[t] − carry[t] − rate_component[t]',
  );
  console.log(
    'donde rate_component = −D_reg × Δy_proxy + ½ × C_reg × (Δy_proxy)² (con D, C de Punto 3).',
  );
  console.log(
    '\n' +
      rpad('Ticker', 8) +
      lpad('n', 5) +
      lpad('media', 10) +
      lpad('std mes', 10) +
      lpad('std anual', 11) +
      lpad('min', 10) +
      lpad('max', 10) +
      lpad('AR(1)', 8) +
      lpad('% var total', 14) +
      lpad('% var rate', 12),
  );
  hr('─', 106);

  const CREDIT_TICKERS = ['IGOV', 'AGG', 'LQD', 'GHYG', 'EMB', 'CEMB'] as const;
  for (const ticker of CREDIT_TICKERS) {
    const reg = regs.find((r) => r.ticker === ticker)!;
    const carry = RF_DECOMP[ticker].carry;
    const total = RF_DECOMP[ticker].total;
    const proxyYield = getMappedYield(ticker);
    const residuals: number[] = [];
    const rates: number[] = [];
    const totals: number[] = [];
    for (let i = 1; i < N_MONTHS; i++) {
      const dy = proxyYield[i] - proxyYield[i - 1];
      const c = carry[i];
      const tot = total[i];
      if (Number.isFinite(dy) && Number.isFinite(c) && Number.isFinite(tot)) {
        const rateComp = -reg.duration * dy + 0.5 * reg.convexity * dy * dy;
        const resid = tot - c - rateComp;
        residuals.push(resid);
        rates.push(rateComp);
        totals.push(tot);
      }
    }
    const { min, max } = minMax(residuals);
    const varTot = stdSample(totals) ** 2;
    const varRate = stdSample(rates) ** 2;
    const varResid = stdSample(residuals) ** 2;
    console.log(
      rpad(ticker, 8) +
        lpad(String(residuals.length), 5) +
        lpad(bps(mean(residuals)), 10) +
        lpad(pct(stdSample(residuals), 3), 10) +
        lpad(pct(stdSample(residuals) * Math.sqrt(12), 2), 11) +
        lpad(pct(min, 2), 10) +
        lpad(pct(max, 2), 10) +
        lpad(num(autocorr1(residuals), 3), 8) +
        lpad(pct(varResid / varTot), 14) +
        lpad(pct(varRate / varTot), 12),
    );
  }
  console.log(
    '\n% var total = proporción de varianza del retorno explicada por el residual (bootstrap empírico).',
  );
  console.log(
    '% var rate = proporción atribuida al rate component (modelado estructural).',
  );
  console.log('Nota: pueden no sumar 100% por covarianza rate·residual (esperable y OK).');
}

// --- Punto 7 ----------------------------------------------------------------

function decisionMatrix(regs: RegressionResult[]): void {
  h1('Punto 7 — Decision matrix: modelo recomendado por ticker');
  console.log(
    '\n' +
      rpad('Ticker', 8) +
      rpad('Grupo', 18) +
      lpad('D reg', 8) +
      lpad('D canon', 10) +
      lpad('R²', 8) +
      '  ' +
      rpad('Decisión', 38),
  );
  hr();
  const TREASURY = new Set(['BIL', 'SPTS', 'IEI', 'IEF', 'SPTL']);
  for (const reg of regs) {
    const isTreas = TREASURY.has(reg.ticker);
    const durOk = Math.abs(reg.duration - reg.canonicalDur) / reg.canonicalDur < 0.5;
    let decision = '';
    if (isTreas) {
      decision = reg.r2 > 0.8 && durOk
        ? 'Treasury full yield-path'
        : 'Treasury yield-path (revisar D)';
    } else {
      if (reg.r2 > 0.4) decision = 'Híbrido rate + residual';
      else if (reg.r2 > 0.15) decision = 'Híbrido (R² bajo — residual domina)';
      else decision = 'Evaluar: residual casi explica todo';
    }
    console.log(
      rpad(reg.ticker, 8) +
        rpad(isTreas ? 'Treasury puro' : 'Credit/otros', 18) +
        lpad(num(reg.duration, 2), 8) +
        lpad(num(reg.canonicalDur, 2), 10) +
        lpad(num(reg.r2, 3), 8) +
        '  ' +
        rpad(decision, 38),
    );
  }
}

// --- Main -------------------------------------------------------------------

function main(): void {
  console.log('\n' + '█'.repeat(90));
  console.log(
    '█' +
      pad(
        '  Análisis empírico — Fase 2 RF reconstruction (yield-path simulation)',
        89,
      ) +
      '',
  );
  console.log('█'.repeat(90));
  console.log(
    `\nDataset: ${DATES[0]} → ${DATES[N_MONTHS - 1]}  (${N_MONTHS} meses, 32 ETFs, 11 RF tickers, 4 yield series)`,
  );

  analyzeYieldLevels();
  analyzeYieldChanges();
  const regs = analyzeRegressions();
  calibrateDamping();
  analyzeCarryConsistency();
  analyzeCreditResiduals(regs);
  decisionMatrix(regs);

  console.log('\n' + '█'.repeat(90));
  console.log('  Análisis completo. Esperando revisión del usuario.');
  console.log('█'.repeat(90) + '\n');
}

main();
