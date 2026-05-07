import { computeFanChartBands, computeTailRiskAtHorizons } from '../../domain/metrics';
import type {
  NarrativeNumbers,
  PdfSimulationData,
  ProjectionsData,
} from './types';

/**
 * Anchors default para la tabla tail risk: 5, 10, 20, 30 años. Se filtran
 * dinámicamente según `plan.horizonMonths` y el horizonte final del plan
 * siempre se incluye como último anchor.
 */
export const DEFAULT_TAIL_ANCHORS_MONTHS = [60, 120, 240, 360] as const;

/**
 * Selecciona los anchors aplicables al horizonte del plan.
 *   - Filtra defaults para mantener solo los ≤ horizonMonths.
 *   - Garantiza que el horizonte final siempre esté incluido (para que la
 *     última columna de la tabla sea el cierre del plan, no un anchor genérico
 *     que se quedó corto).
 *   - Dedup + sort ascending.
 */
export function selectAnchors(
  horizonMonths: number,
  defaults: ReadonlyArray<number> = DEFAULT_TAIL_ANCHORS_MONTHS,
): number[] {
  if (horizonMonths < 1) {
    throw new Error(`selectAnchors: horizonMonths debe ser ≥ 1, recibido ${horizonMonths}`);
  }
  const set = new Set<number>();
  for (const m of defaults) {
    if (m <= horizonMonths) set.add(m);
  }
  set.add(horizonMonths);
  return [...set].sort((a, b) => a - b);
}

/**
 * Deflacta una matriz `[nPaths × (H+1)]` de USD nominales a USD de hoy
 * usando la inflación anual del plan. Retorna un nuevo Float32Array.
 */
export function deflateValues(
  values: Float32Array,
  nPaths: number,
  horizonMonths: number,
  inflationPct: number,
): Float32Array {
  const r = inflationPct / 100;
  const nCols = horizonMonths + 1;
  const out = new Float32Array(values.length);
  for (let t = 0; t < nCols; t++) {
    const factor = Math.pow(1 + r, t / 12);
    for (let p = 0; p < nPaths; p++) {
      const idx = p * nCols + t;
      out[idx] = values[idx] / factor;
    }
  }
  return out;
}

/** Deflacta una serie 1D `[H+1]` (ej. capital aportado neto). */
export function deflateSeries(
  series: Float32Array,
  horizonMonths: number,
  inflationPct: number,
): Float32Array {
  const r = inflationPct / 100;
  const out = new Float32Array(series.length);
  for (let t = 0; t <= horizonMonths; t++) {
    const factor = Math.pow(1 + r, t / 12);
    out[t] = series[t] / factor;
  }
  return out;
}

/**
 * Construye los datos de la sección E desde la simulación cruda. Aplica
 * deflación si `mode='real'`, calcula bandas mes a mes, tail risk por anchor,
 * y los números narrativos del párrafo modelo de la adenda 10.1.
 */
export function buildProjectionsData(sim: PdfSimulationData): ProjectionsData {
  const { valuesA, netContributionsA, nPaths, horizonMonths, mode, inflationPct } = sim;

  const expectedLen = nPaths * (horizonMonths + 1);
  if (valuesA.length !== expectedLen) {
    throw new Error(
      `buildProjectionsData: valuesA.length=${valuesA.length} ≠ nPaths*(H+1)=${expectedLen}`,
    );
  }
  if (netContributionsA.length !== horizonMonths + 1) {
    throw new Error(
      `buildProjectionsData: netContributionsA.length=${netContributionsA.length} ≠ H+1=${horizonMonths + 1}`,
    );
  }

  const values =
    mode === 'real'
      ? deflateValues(valuesA, nPaths, horizonMonths, inflationPct)
      : valuesA;
  const contributions =
    mode === 'real'
      ? deflateSeries(netContributionsA, horizonMonths, inflationPct)
      : netContributionsA;

  const bands = computeFanChartBands(values, nPaths, horizonMonths);
  const anchors = selectAnchors(horizonMonths);
  const tailRisk = computeTailRiskAtHorizons(values, nPaths, horizonMonths, anchors);

  const last = tailRisk[tailRisk.length - 1];
  const medianAtLast = bands.p50[last.monthIdx];
  const narrative: NarrativeNumbers = {
    monthIdx: last.monthIdx,
    years: Math.round(last.monthIdx / 12),
    p5: last.p5,
    p50: medianAtLast,
    p95: last.p95,
    cvar5: last.cvar5,
    cvar5DeltaVsMedian: medianAtLast > 0 ? last.cvar5 / medianAtLast - 1 : 0,
  };

  return {
    bands,
    netContributions: contributions,
    tailRisk,
    narrative,
    horizonMonths,
    mode,
  };
}
