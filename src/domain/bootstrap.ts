/**
 * Block bootstrap pareado — motor de retornos del Mercantil Planner.
 *
 * Función pura, sin estado global, sin DOM, sin `self`. Reutilizable desde:
 *   - El Web Worker (src/workers/bootstrap.worker.ts)
 *   - Scripts de Node como `scripts/worker-sanity.ts`
 *   - Tests vitest
 *
 * Diseño general (§4):
 *   - Los 32 ETFs se muestrean en bloques alineados por fecha (paired block
 *     bootstrap). Block size default 12 meses. Los índices de inicio de cada
 *     bloque son uniformes en [0, N_MONTHS − blockSize].
 *   - Dos portafolios (A y B) comparten los mismos bloques sampleados para
 *     que sus comparaciones sean pareadas (apples-to-apples).
 *   - FIXED6 y FIXED9 son retornos determinísticos mensuales calculados como
 *     `(1 + annual)^(1/12) − 1`.
 *
 * Reconstrucción RF (Fase 2 — yield-path simulation):
 *   - Los 11 tickers de renta fija (BIL, SPTS, IEI, IEF, SPTL, IGOV, AGG,
 *     LQD, GHYG, EMB, CEMB) se reconstruyen mes a mes desde un path de yield
 *     simulado partiendo del nivel actual del mercado, en vez de usar el
 *     retorno total histórico directamente.
 *   - Cada yield (IRX/FVX/TNX/TYX) evoluciona bootstrapeando Δy históricos
 *     del mismo bloque (preservando correlación cross-maturity y cross-asset).
 *   - Un mecanismo de damping cuadrático modera Δy cuando el path sale del
 *     rango histórico (evita tails irreales sin clipping duro).
 *   - Ver `./rf-config.ts` para los parámetros calibrados (D, C, proxy yield,
 *     exponente de damping).
 */

import {
  N_MONTHS,
  N_TICKERS,
  RETURNS,
  TICKERS,
  YIELDS,
  RF_DECOMP,
  type Ticker,
  type RfTicker,
} from '../data/market.generated';
import { mulberry32 } from './prng';
import type { BootstrapConfig, ExpandedPortfolio } from './types';
import {
  RF_CONFIG,
  DAMPING_EXPONENT,
  FLOOR_ADJUSTMENT,
  CEILING_MULTIPLIER,
  YIELD_KEYS_ORDERED,
  type YieldKey,
  type RfTickerConfig,
} from './rf-config';

// ---------------------------------------------------------------------------
// Constantes de fase y defaults
// ---------------------------------------------------------------------------

/**
 * Tickers de renta fija que usan reconstrucción yield-path en Fase 2.
 * Mantengo el nombre para retrocompatibilidad con imports existentes, pero
 * ahora cubre los 11 RF tickers, no solo los 3 Treasuries largos originales.
 */
export const TIER_A_TICKERS = [
  'BIL',
  'SPTS',
  'IEI',
  'IEF',
  'SPTL',
  'IGOV',
  'AGG',
  'LQD',
  'GHYG',
  'EMB',
  'CEMB',
] as const satisfies readonly RfTicker[];

export const DEFAULT_BOOTSTRAP_CONFIG: BootstrapConfig = {
  seed: 42,
  nPaths: 5000,
  blockSize: 12,
  fixed6Annual: 0.06,
  fixed9Annual: 0.09,
};

export const MAX_N_PATHS = 10_000;
export const MAX_HORIZON_MONTHS = 360;

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export type BootstrapInput = {
  portfolios: {
    A: ExpandedPortfolio;
    B: ExpandedPortfolio;
  };
  horizonMonths: number;
  config: BootstrapConfig;
  /**
   * Si true, también emite los yield paths simulados (IRX/FVX/TNX/TYX) para
   * cada uno de los nPaths. Cada Float32Array tiene shape [nPaths × horizonMonths]
   * con el nivel del yield AL CIERRE de cada mes simulado. Útil para análisis
   * condicional de views (ver src/domain/views.ts).
   *
   * Costo: 4 × nPaths × horizonMonths × 4 bytes = ~29 MB para 5000 × 360.
   * Por eso es opt-in. Por default no se emiten.
   */
  outputYieldPaths?: boolean;
  /**
   * Si true, también emite los retornos mensuales per-ETF para los 32 tickers
   * del dataset. Output: `Record<Ticker, Float32Array>` con cada array
   * `[nPaths × horizonMonths]`. Requerido por views con subject `etfReturn`
   * (ej. "S&P 500 cae entre -10% y -20% en 12m").
   *
   * Costo: 32 × nPaths × horizonMonths × 4 bytes = ~230 MB para 5000 × 360.
   * MUCHO más pesado que yieldPaths — opt-in explícito. Por default false.
   */
  outputEtfReturns?: boolean;
};

/**
 * Opciones runtime no-serializables (no viajan por postMessage).
 * El worker construye su propio `onProgress` que postea mensajes al main thread.
 */
export type BootstrapRunOptions = {
  /** Callback de progreso. Se llama cada ~PROGRESS_INTERVAL paths completados. */
  onProgress?: (completedPaths: number, totalPaths: number) => void;
};

/** Emitimos progreso cada N paths. 250 → 20 updates para nPaths=5000. */
const PROGRESS_INTERVAL = 250;

/**
 * Yield paths simulados. Cada Float32Array tiene shape [nPaths × horizonMonths]
 * con el nivel del yield AL CIERRE de cada mes simulado (en decimal, ej. 0.0434
 * para 4.34%). El nivel pre-simulación (mes 0) es `YIELD_BOUNDS[i].initial` y se
 * obtiene con `getYieldBounds(key).initial`.
 */
export type YieldPathsOutput = Readonly<Record<YieldKey, Float32Array>>;

/**
 * Retornos mensuales per-ETF. Cada Float32Array tiene shape [nPaths × horizonMonths]
 * con el retorno del ticker j-ésimo en el mes t del path p (post-reconstrucción
 * RF si aplica, o retorno histórico directo si es equity).
 */
export type EtfReturnsOutput = Readonly<Record<Ticker, Float32Array>>;

export type BootstrapOutput = {
  /** Retornos mensuales del portafolio A. Row-major [nPaths × horizonMonths]. */
  portfolioReturnsA: Float32Array;
  /** Retornos mensuales del portafolio B. Row-major [nPaths × horizonMonths]. */
  portfolioReturnsB: Float32Array;
  /**
   * Yield paths simulados. Solo presente si `input.outputYieldPaths === true`.
   * Mapeo por yield key: IRX, FVX, TNX, TYX.
   */
  yieldPaths?: YieldPathsOutput;
  /**
   * Retornos per-ETF. Solo presente si `input.outputEtfReturns === true`.
   * Mapeo por ticker (32 tickers). Útil para views con subject `etfReturn`.
   */
  etfReturns?: EtfReturnsOutput;
  /** Meta para que el consumidor verifique parámetros. */
  meta: {
    nPaths: number;
    horizonMonths: number;
    blockSize: number;
    seed: number;
    fixed6Monthly: number;
    fixed9Monthly: number;
    elapsedMs: number;
    nMonthsData: number;
  };
};

// ---------------------------------------------------------------------------
// Pre-procesado del universo RF (se corre una vez al importar el módulo)
// ---------------------------------------------------------------------------

/**
 * Spec de reconstrucción por posición de ticker (0..N_TICKERS-1).
 * El hot loop consulta este array para decidir qué hacer con cada ticker.
 * Los proxy indices 0..3 corresponden a YIELD_KEYS_ORDERED (IRX/FVX/TNX/TYX)
 * y 4 es el slot sintético (SPTS).
 */
type TickerSpec =
  | { readonly kind: 'equity' }
  | { readonly kind: 'carry-only'; readonly proxyIdx: number }
  | {
      readonly kind: 'treasury';
      readonly proxyIdx: number;
      readonly D: number;
      readonly C: number;
    }
  | {
      readonly kind: 'hybrid';
      readonly proxyIdx: number;
      readonly D: number;
      readonly C: number;
      readonly residualArr: Float32Array;
    };

const SYNTH_SLOT = 4;
const N_YIELDS = YIELD_KEYS_ORDERED.length; // 4

/**
 * Δy por yield, alineado a la grilla DATES (length N_MONTHS).
 * Índice 0 se define como Δy[1] (forward-fill) para permitir sampleo de bloques
 * que incluyan el primer mes sin introducir NaN.
 */
const DELTA_YIELDS: readonly Float32Array[] = YIELD_KEYS_ORDERED.map((key) => {
  const y = YIELDS[key];
  const dy = new Float32Array(N_MONTHS);
  for (let i = 1; i < N_MONTHS; i++) dy[i] = y[i] - y[i - 1];
  dy[0] = dy[1]; // forward-fill del primer mes
  return dy;
});

/** Cotas calculadas empíricamente por yield. Inmutables una vez inicializadas. */
interface YieldBounds {
  readonly initial: number; // último valor observado (arranque de la simulación)
  readonly min: number;
  readonly max: number;
  readonly floor: number;
  readonly ceiling: number;
}

const YIELD_BOUNDS: readonly YieldBounds[] = YIELD_KEYS_ORDERED.map((key) => {
  const y = YIELDS[key];
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < N_MONTHS; i++) {
    const v = y[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return {
    initial: y[N_MONTHS - 1],
    min,
    max,
    floor: min - FLOOR_ADJUSTMENT,
    ceiling: max * CEILING_MULTIPLIER,
  } as const;
});

/**
 * Dado un ticker RF, devuelve `proxyIdx`:
 *   - 0..3 para IRX/FVX/TNX/TYX directo
 *   - 4 si usa proxy sintético (solo SPTS)
 */
function resolveProxyIdx(cfg: RfTickerConfig): number {
  if (cfg.syntheticProxy) return SYNTH_SLOT;
  return YIELD_KEYS_ORDERED.indexOf(cfg.proxyYield);
}

/** Pesos del proxy sintético (solo SPTS). Indexed por YIELD_KEYS_ORDERED. */
const SYNTH_WEIGHTS: Float32Array = (() => {
  const weights = new Float32Array(N_YIELDS);
  // Solo SPTS tiene syntheticProxy en Fase 2. Si hubiera más de uno con pesos
  // distintos, necesitaríamos múltiples slots. Por ahora un único slot alcanza.
  const sptsCfg = RF_CONFIG.SPTS;
  if (sptsCfg.syntheticProxy) {
    for (let i = 0; i < N_YIELDS; i++) {
      weights[i] = sptsCfg.syntheticProxy[YIELD_KEYS_ORDERED[i]];
    }
  }
  return weights;
})();

/**
 * Pre-cómputo del residual histórico por ticker híbrido.
 *   residual[m] = total[m] − carry_proxy[m] − rate_component[m]
 * NaN (mes 0 o prefijo de imputación del ticker) se reemplaza con la media
 * empírica de residuales válidos — preserva el nivel de spread carry sin
 * introducir outliers sintéticos.
 */
const RESIDUAL_SERIES: Map<RfTicker, Float32Array> = (() => {
  const out = new Map<RfTicker, Float32Array>();
  for (const ticker of TIER_A_TICKERS) {
    const cfg = RF_CONFIG[ticker];
    if (cfg.model !== 'hybrid') continue;

    const proxyIdx = resolveProxyIdx(cfg);
    const dyProxy = buildProxyDeltaYieldHist(proxyIdx); // Float32Array[N_MONTHS]
    const yProxy = buildProxyYieldHist(proxyIdx); // Float32Array[N_MONTHS]

    const rfData = RF_DECOMP[ticker];
    const resid = new Float32Array(N_MONTHS);
    let sum = 0;
    let count = 0;
    for (let m = 0; m < N_MONTHS; m++) {
      const total = rfData.total[m];
      if (Number.isFinite(total)) {
        const carry = yProxy[m] / 12;
        const dy = dyProxy[m];
        const rate = -cfg.duration * dy + 0.5 * cfg.convexity * dy * dy;
        const r = total - carry - rate;
        resid[m] = r;
        sum += r;
        count++;
      } else {
        resid[m] = NaN;
      }
    }
    const meanResid = count > 0 ? sum / count : 0;
    for (let m = 0; m < N_MONTHS; m++) {
      if (!Number.isFinite(resid[m])) resid[m] = meanResid;
    }
    out.set(ticker, resid);
  }
  return out;
})();

/** Yield histórico del proxy. Para el slot sintético, combina las 4 series. */
function buildProxyYieldHist(proxyIdx: number): Float32Array {
  const out = new Float32Array(N_MONTHS);
  if (proxyIdx >= 0 && proxyIdx < N_YIELDS) {
    out.set(YIELDS[YIELD_KEYS_ORDERED[proxyIdx]]);
    return out;
  }
  // Sintético: suma ponderada
  for (let i = 0; i < N_YIELDS; i++) {
    const w = SYNTH_WEIGHTS[i];
    if (w === 0) continue;
    const y = YIELDS[YIELD_KEYS_ORDERED[i]];
    for (let m = 0; m < N_MONTHS; m++) out[m] += w * y[m];
  }
  return out;
}

/** Δy histórico del proxy. Para el slot sintético, combina las 4 series. */
function buildProxyDeltaYieldHist(proxyIdx: number): Float32Array {
  const out = new Float32Array(N_MONTHS);
  if (proxyIdx >= 0 && proxyIdx < N_YIELDS) {
    out.set(DELTA_YIELDS[proxyIdx]);
    return out;
  }
  for (let i = 0; i < N_YIELDS; i++) {
    const w = SYNTH_WEIGHTS[i];
    if (w === 0) continue;
    const dy = DELTA_YIELDS[i];
    for (let m = 0; m < N_MONTHS; m++) out[m] += w * dy[m];
  }
  return out;
}

/** Spec por posición de ticker (índice en TICKERS). Se consulta en el hot loop. */
const TICKER_SPECS: readonly TickerSpec[] = TICKERS.map((ticker) => {
  const cfg = (RF_CONFIG as Record<string, RfTickerConfig | undefined>)[ticker];
  if (!cfg) return { kind: 'equity' } as const;
  const proxyIdx = resolveProxyIdx(cfg);
  if (cfg.model === 'carry-only') {
    return { kind: 'carry-only', proxyIdx } as const;
  }
  if (cfg.model === 'treasury') {
    return {
      kind: 'treasury',
      proxyIdx,
      D: cfg.duration,
      C: cfg.convexity,
    } as const;
  }
  // hybrid
  const residualArr = RESIDUAL_SERIES.get(ticker as RfTicker);
  if (!residualArr) {
    throw new Error(`bootstrap: residual no pre-computado para híbrido ${ticker}`);
  }
  return {
    kind: 'hybrid',
    proxyIdx,
    D: cfg.duration,
    C: cfg.convexity,
    residualArr,
  } as const;
});

/**
 * ¿Hay al menos un ticker con peso no-cero que requiera reconstrucción RF?
 * Usado para skippear la rama RF cuando el portafolio es 100% equity + FIXED.
 */
function needsRfBranch(weights: Float32Array): boolean {
  for (let j = 0; j < N_TICKERS; j++) {
    const spec = TICKER_SPECS[j];
    if (spec.kind !== 'equity' && weights[j] !== 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Pre-procesado de pesos
// ---------------------------------------------------------------------------

type DensePortfolio = {
  /** Pesos fraccionales (0..1) por posición de ticker. Length = N_TICKERS. */
  weights: Float32Array;
  /** Contribución fraccional de FIXED6+FIXED9 al retorno mensual (constante). */
  fixedContribution: number;
};

function buildDensePortfolio(
  expanded: ExpandedPortfolio,
  fixed6Monthly: number,
  fixed9Monthly: number,
): DensePortfolio {
  const weights = new Float32Array(N_TICKERS);
  for (const [ticker, w] of Object.entries(expanded.etfs)) {
    if (typeof w !== 'number' || !Number.isFinite(w) || w === 0) continue;
    const idx = TICKERS.indexOf(ticker as Ticker);
    if (idx < 0) {
      throw new Error(`runBootstrap: ticker desconocido en portafolio: "${ticker}"`);
    }
    weights[idx] = w / 100;
  }
  const fixedContribution =
    (expanded.fixed.FIXED6 / 100) * fixed6Monthly +
    (expanded.fixed.FIXED9 / 100) * fixed9Monthly;
  return { weights, fixedContribution };
}

// ---------------------------------------------------------------------------
// Motor principal
// ---------------------------------------------------------------------------

/**
 * Corre un block bootstrap pareado sobre ambos portafolios usando los mismos
 * bloques sampleados. No muta el input. Determinista dado `config.seed`.
 *
 * Lanza Error si los parámetros están fuera de rango o si el portafolio
 * referencia un ticker desconocido.
 */
export function runBootstrap(
  input: BootstrapInput,
  options: BootstrapRunOptions = {},
): BootstrapOutput {
  const t0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const { portfolios, horizonMonths, config } = input;
  const outputYieldPaths = input.outputYieldPaths === true;
  const outputEtfReturns = input.outputEtfReturns === true;
  const { seed, nPaths, blockSize, fixed6Annual, fixed9Annual } = config;
  const { onProgress } = options;

  // --- Validación de parámetros ---
  if (!Number.isInteger(horizonMonths) || horizonMonths < 1 || horizonMonths > MAX_HORIZON_MONTHS) {
    throw new Error(
      `runBootstrap: horizonMonths=${horizonMonths} fuera de rango [1, ${MAX_HORIZON_MONTHS}]`,
    );
  }
  if (!Number.isInteger(nPaths) || nPaths < 1 || nPaths > MAX_N_PATHS) {
    throw new Error(`runBootstrap: nPaths=${nPaths} fuera de rango [1, ${MAX_N_PATHS}]`);
  }
  if (!Number.isInteger(blockSize) || blockSize < 1 || blockSize > N_MONTHS) {
    throw new Error(`runBootstrap: blockSize=${blockSize} fuera de rango [1, ${N_MONTHS}]`);
  }
  if (blockSize > N_MONTHS) {
    throw new Error(`runBootstrap: blockSize (${blockSize}) > nMonths disponibles (${N_MONTHS})`);
  }

  // --- Conversión de tasas anuales a mensuales ---
  const fixed6Monthly = Math.pow(1 + fixed6Annual, 1 / 12) - 1;
  const fixed9Monthly = Math.pow(1 + fixed9Annual, 1 / 12) - 1;

  // --- Densificación de pesos (una vez, reutilizado por todos los paths) ---
  const denseA = buildDensePortfolio(portfolios.A, fixed6Monthly, fixed9Monthly);
  const denseB = buildDensePortfolio(portfolios.B, fixed6Monthly, fixed9Monthly);
  const wA = denseA.weights;
  const wB = denseB.weights;
  const fixedAddA = denseA.fixedContribution;
  const fixedAddB = denseB.fixedContribution;
  const rfActive = needsRfBranch(wA) || needsRfBranch(wB);
  // Si el usuario pidió yield paths O ETF returns, hay que simular los yields
  // aunque el portafolio no toque RF — los RF tickers se reconstruyen desde
  // el path de yield, no desde retornos históricos totales. Forzamos la rama
  // unified para que los outputs opcionales sean coherentes con los portfolio
  // returns.
  const needsYieldSim = rfActive || outputYieldPaths || outputEtfReturns;

  // --- Output buffers ---
  const rA = new Float32Array(nPaths * horizonMonths);
  const rB = new Float32Array(nPaths * horizonMonths);

  // --- Yield paths output (opt-in) ---
  let yIRX: Float32Array | null = null;
  let yFVX: Float32Array | null = null;
  let yTNX: Float32Array | null = null;
  let yTYX: Float32Array | null = null;
  if (outputYieldPaths) {
    yIRX = new Float32Array(nPaths * horizonMonths);
    yFVX = new Float32Array(nPaths * horizonMonths);
    yTNX = new Float32Array(nPaths * horizonMonths);
    yTYX = new Float32Array(nPaths * horizonMonths);
  }

  // --- ETF returns output (opt-in). Allocar 32 Float32Array separados.
  //     Total: 32 × nPaths × horizonMonths × 4 bytes = ~230 MB para 5000×360.
  //     Justificación del trade-off: el loop de reconstrucción ya calcula cada
  //     retorno por ticker (en `reconstructed[j]` en la rama RF, o leyendo
  //     directamente de `RETURNS` en el fast path equity). Escribir el valor
  //     a un buffer dedicado es O(1) extra por ticker por mes — no afecta
  //     perceptiblemente el tiempo. La memoria sí es significativa, por eso
  //     es opt-in. ---
  const etfBuffers: Float32Array[] | null = outputEtfReturns
    ? (() => {
        const bufs: Float32Array[] = new Array(N_TICKERS);
        for (let j = 0; j < N_TICKERS; j++) {
          bufs[j] = new Float32Array(nPaths * horizonMonths);
        }
        return bufs;
      })()
    : null;

  // --- PRNG ---
  const rand = mulberry32(seed);

  const maxStartExclusive = N_MONTHS - blockSize + 1;

  // --- Estado de simulación por path (reusado) ---
  // yPath[i] = nivel de yield actual para YIELD_KEYS_ORDERED[i]
  const yPath = new Float32Array(N_YIELDS);
  // dyEffPath[i] = Δy efectivo del último mes simulado (post-damping)
  const dyEffPath = new Float32Array(N_YIELDS);
  // proxyYields[0..3] = yPath; [4] = SPTS sintético
  const proxyYields = new Float32Array(N_YIELDS + 1);
  // proxyDyEff[0..3] = dyEffPath; [4] = sintético
  const proxyDyEff = new Float32Array(N_YIELDS + 1);
  // reconstructed[j] = retorno del ticker j en el mes actual (equity histórico | RF reconstruido)
  const reconstructed = new Float32Array(N_TICKERS);

  // --- Fast path: si ninguno de los portafolios toca RF tickers Y no se pidieron
  //     yield paths, usamos el loop equity-only original (más rápido). ---
  if (!needsYieldSim) {
    for (let p = 0; p < nPaths; p++) {
      const pOff = p * horizonMonths;
      let t = 0;
      while (t < horizonMonths) {
        const blockStart = Math.floor(rand() * maxStartExclusive);
        const remaining = horizonMonths - t;
        const len = remaining < blockSize ? remaining : blockSize;
        for (let k = 0; k < len; k++) {
          const month = blockStart + k;
          const base = month * N_TICKERS;
          let sumA = fixedAddA;
          let sumB = fixedAddB;
          const outIdx = pOff + t + k;
          for (let j = 0; j < N_TICKERS; j++) {
            const r = RETURNS[base + j];
            sumA += wA[j] * r;
            sumB += wB[j] * r;
            if (etfBuffers) etfBuffers[j][outIdx] = r;
          }
          rA[outIdx] = sumA;
          rB[outIdx] = sumB;
        }
        t += len;
      }
      if (onProgress && ((p + 1) % PROGRESS_INTERVAL === 0 || p + 1 === nPaths)) {
        onProgress(p + 1, nPaths);
      }
    }
  } else {
    // --- Loop con reconstrucción RF yield-path ---
    for (let p = 0; p < nPaths; p++) {
      // Reset del estado por path: yields arrancan en su nivel actual
      for (let i = 0; i < N_YIELDS; i++) yPath[i] = YIELD_BOUNDS[i].initial;

      const pOff = p * horizonMonths;
      let t = 0;
      while (t < horizonMonths) {
        const blockStart = Math.floor(rand() * maxStartExclusive);
        const remaining = horizonMonths - t;
        const len = remaining < blockSize ? remaining : blockSize;
        for (let k = 0; k < len; k++) {
          const month = blockStart + k;

          // 1. Actualizar yield paths con damping cuadrático simétrico.
          //    El damping modera la velocidad en los buffers, pero para un Δy
          //    grande entrando en zona buffer puede haber overshoot residual;
          //    aplicamos un cap duro final para garantizar yPath ∈ [floor, ceiling].
          for (let i = 0; i < N_YIELDS; i++) {
            const b = YIELD_BOUNDS[i];
            const dy = DELTA_YIELDS[i][month];
            let dyEff = dy;
            if (dy > 0 && yPath[i] > b.max) {
              const buf = b.ceiling - b.max;
              const x = buf > 0 ? (yPath[i] - b.max) / buf : 1;
              const xc = x > 1 ? 1 : x;
              const scale = 1 - Math.pow(xc, DAMPING_EXPONENT);
              dyEff = dy * (scale > 0 ? scale : 0);
            } else if (dy < 0 && yPath[i] < b.min) {
              const buf = b.min - b.floor;
              const x = buf > 0 ? (b.min - yPath[i]) / buf : 1;
              const xc = x > 1 ? 1 : x;
              const scale = 1 - Math.pow(xc, DAMPING_EXPONENT);
              dyEff = dy * (scale > 0 ? scale : 0);
            }
            // Cap duro: si dyEff aún haría overshoot, limitar al step máximo factible.
            // Preserva consistencia price_return = f(dyEff) con yield movement real.
            const maxStep = b.ceiling - yPath[i];
            const minStep = b.floor - yPath[i];
            if (dyEff > maxStep) dyEff = maxStep > 0 ? maxStep : 0;
            else if (dyEff < minStep) dyEff = minStep < 0 ? minStep : 0;
            dyEffPath[i] = dyEff;
            yPath[i] += dyEff;
            proxyYields[i] = yPath[i];
            proxyDyEff[i] = dyEff;
          }
          // Slot sintético (SPTS)
          let synthY = 0;
          let synthDy = 0;
          for (let i = 0; i < N_YIELDS; i++) {
            const w = SYNTH_WEIGHTS[i];
            if (w !== 0) {
              synthY += w * yPath[i];
              synthDy += w * dyEffPath[i];
            }
          }
          proxyYields[SYNTH_SLOT] = synthY;
          proxyDyEff[SYNTH_SLOT] = synthDy;

          // 1b. (Opcional) Emitir yield paths. El orden sigue YIELD_KEYS_ORDERED:
          //     IRX=0, FVX=1, TNX=2, TYX=3. Cada array es [nPaths × horizonMonths].
          if (outputYieldPaths) {
            const yOutIdx = pOff + t + k;
            yIRX![yOutIdx] = yPath[0];
            yFVX![yOutIdx] = yPath[1];
            yTNX![yOutIdx] = yPath[2];
            yTYX![yOutIdx] = yPath[3];
          }

          // 2. Reconstrucción por ticker (RF) + lectura histórica (equity)
          const base = month * N_TICKERS;
          for (let j = 0; j < N_TICKERS; j++) {
            const spec = TICKER_SPECS[j];
            if (spec.kind === 'equity') {
              reconstructed[j] = RETURNS[base + j];
            } else {
              const y = proxyYields[spec.proxyIdx];
              const carry = y / 12;
              if (spec.kind === 'carry-only') {
                reconstructed[j] = carry;
              } else {
                const dy = proxyDyEff[spec.proxyIdx];
                const rate = -spec.D * dy + 0.5 * spec.C * dy * dy;
                if (spec.kind === 'treasury') {
                  reconstructed[j] = carry + rate;
                } else {
                  // hybrid
                  reconstructed[j] = carry + rate + spec.residualArr[month];
                }
              }
            }
          }

          // 3. Combinación con pesos del portafolio (+ emisión ETF opcional)
          const outIdx = pOff + t + k;
          let sumA = fixedAddA;
          let sumB = fixedAddB;
          for (let j = 0; j < N_TICKERS; j++) {
            const r = reconstructed[j];
            sumA += wA[j] * r;
            sumB += wB[j] * r;
            if (etfBuffers) etfBuffers[j][outIdx] = r;
          }
          rA[outIdx] = sumA;
          rB[outIdx] = sumB;
        }
        t += len;
      }
      if (onProgress && ((p + 1) % PROGRESS_INTERVAL === 0 || p + 1 === nPaths)) {
        onProgress(p + 1, nPaths);
      }
    }
  }

  const t1 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  const output: BootstrapOutput = {
    portfolioReturnsA: rA,
    portfolioReturnsB: rB,
    meta: {
      nPaths,
      horizonMonths,
      blockSize,
      seed,
      fixed6Monthly,
      fixed9Monthly,
      elapsedMs: t1 - t0,
      nMonthsData: N_MONTHS,
    },
  };
  if (outputYieldPaths) {
    output.yieldPaths = {
      IRX: yIRX!,
      FVX: yFVX!,
      TNX: yTNX!,
      TYX: yTYX!,
    };
  }
  if (etfBuffers) {
    const etfReturns = {} as Record<Ticker, Float32Array>;
    for (let j = 0; j < N_TICKERS; j++) {
      etfReturns[TICKERS[j]] = etfBuffers[j];
    }
    output.etfReturns = etfReturns;
  }
  return output;
}

// ---------------------------------------------------------------------------
// Diagnóstico (exportado para tests y sanity)
// ---------------------------------------------------------------------------

/**
 * Exporta las cotas calculadas por yield (solo lectura). Útil para tests y
 * para la UI si se quiere mostrar el rango del simulador.
 */
export function getYieldBounds(key: YieldKey): YieldBounds {
  const idx = YIELD_KEYS_ORDERED.indexOf(key);
  if (idx < 0) throw new Error(`getYieldBounds: yield desconocido ${key}`);
  return YIELD_BOUNDS[idx];
}

/** Indica si el ticker usa reconstrucción RF (vs bootstrap equity directo). */
export function getTickerModel(ticker: Ticker): TickerSpec['kind'] {
  const idx = TICKERS.indexOf(ticker);
  if (idx < 0) throw new Error(`getTickerModel: ticker desconocido ${ticker}`);
  return TICKER_SPECS[idx].kind;
}
