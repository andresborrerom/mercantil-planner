/**
 * Utilidades estadísticas puras, sin estado. Usadas por metrics.ts y por
 * scripts de sanidad. Todas operan sobre arrays de números o TypedArrays.
 *
 * Convenciones:
 *   - Los inputs NO se mutan. Cuando se necesita ordenar, se hace sobre
 *     una copia.
 *   - NaN-safe: las funciones de agregación saltan NaN explícitamente y
 *     retornan NaN si todo el input es NaN.
 *   - Los percentiles usan interpolación lineal entre puntos adyacentes.
 */

export type NumericArray = ArrayLike<number>;

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function toSortedFinite(values: NumericArray): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) out.push(v);
  }
  out.sort((a, b) => a - b);
  return out;
}

// ---------------------------------------------------------------------------
// Media, std, var
// ---------------------------------------------------------------------------

/** Media aritmética ignorando NaN. NaN si todo es NaN. */
export function mean(values: NumericArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  return n === 0 ? NaN : sum / n;
}

/**
 * Desviación estándar con corrección de Bessel (ddof = 1).
 * Requiere al menos 2 observaciones finitas — retorna NaN si no.
 */
export function stdSample(values: NumericArray): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  if (n < 2) return NaN;
  const m = sum / n;
  let sq = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (Number.isFinite(v)) {
      const d = v - m;
      sq += d * d;
    }
  }
  return Math.sqrt(sq / (n - 1));
}

// ---------------------------------------------------------------------------
// Percentiles (interpolación lineal)
// ---------------------------------------------------------------------------

/**
 * Percentil (p en [0, 1]) usando interpolación lineal entre los puntos
 * adyacentes del array ordenado. Equivalente a numpy.percentile con
 * method='linear'. NaN si el input no tiene valores finitos.
 */
export function percentile(values: NumericArray, p: number): number {
  if (p < 0 || p > 1 || !Number.isFinite(p)) {
    throw new Error(`percentile: p debe estar en [0,1], recibido ${p}`);
  }
  const sorted = toSortedFinite(values);
  const n = sorted.length;
  if (n === 0) return NaN;
  if (n === 1) return sorted[0];
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  const frac = idx - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Atajo para el percentil 50. */
export function median(values: NumericArray): number {
  return percentile(values, 0.5);
}

/**
 * Calcula p10, p50 y p90 de una sola pasada ordenando una única vez el input.
 * Más eficiente que llamar percentile() tres veces.
 */
export type Band = {
  p10: number;
  p50: number;
  p90: number;
};

export function band(values: NumericArray): Band {
  const sorted = toSortedFinite(values);
  const n = sorted.length;
  if (n === 0) return { p10: NaN, p50: NaN, p90: NaN };
  if (n === 1) return { p10: sorted[0], p50: sorted[0], p90: sorted[0] };
  const pick = (p: number): number => {
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  };
  return { p10: pick(0.1), p50: pick(0.5), p90: pick(0.9) };
}

/**
 * Banda custom con percentiles arbitrarios (ej. P25/P75 además de P10/P50/P90).
 * Ordena una sola vez.
 */
export function bandCustom(values: NumericArray, ps: number[]): number[] {
  const sorted = toSortedFinite(values);
  const n = sorted.length;
  if (n === 0) return ps.map(() => NaN);
  if (n === 1) return ps.map(() => sorted[0]);
  return ps.map((p) => {
    if (p < 0 || p > 1) return NaN;
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  });
}
