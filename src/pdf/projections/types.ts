import type { FanChartBands, TailRiskAtHorizon } from '../../domain/metrics';

/**
 * Datos crudos de simulación que el caller pasa al PDF para alimentar la
 * sección E (Proyecciones). NO se embebe en el state container — son MB
 * de Float32Array determinísticos dado seed + portfolio + plan, así que
 * se regeneran al rehidratar.
 */
export type PdfSimulationData = {
  /** Row-major [nPaths × (horizonMonths + 1)]. valuesA[0] = initialCapital. */
  valuesA: Float32Array;
  /** Capital aportado neto por mes. Length = horizonMonths + 1. */
  netContributionsA: Float32Array;
  nPaths: number;
  horizonMonths: number;
  mode: 'nominal' | 'real';
  /** Inflación anual (%) usada por el plan. Necesaria para deflactar si mode='real'. */
  inflationPct: number;
};

export type NarrativeNumbers = {
  /** Mes del horizonte usado para la narrativa (último anchor, casi siempre H). */
  monthIdx: number;
  /** Años redondeados — útil para mostrar al cliente. */
  years: number;
  p5: number;
  p50: number;
  p95: number;
  cvar5: number;
  /**
   * (cvar5 / p50) − 1. Negativo cuando cvar5 < p50 (caso típico: cola izquierda
   * está por debajo de la mediana). 0 si p50 ≤ 0 (evita division por cero).
   */
  cvar5DeltaVsMedian: number;
};

export type ProjectionsData = {
  bands: FanChartBands;
  /** Capital aportado neto, ya en el régimen final (deflactado si mode='real'). */
  netContributions: Float32Array;
  /** Tail risk a los anchors filtrados por horizonte. Último elemento siempre es el horizonte final. */
  tailRisk: TailRiskAtHorizon[];
  narrative: NarrativeNumbers;
  horizonMonths: number;
  mode: 'nominal' | 'real';
};
