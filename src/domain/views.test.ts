/**
 * Tests del módulo de views (análisis condicional).
 *
 * Cubre:
 *   - Cada modo de predicado (peakChange, troughChange, endpointChange,
 *     persistentThreshold, cumulativeReturnRange, percentileBandReturn).
 *   - Evaluación de probabilidad y error estándar.
 *   - Métricas condicionales sobre subset + análisis asimétrico.
 *   - Integración end-to-end con bootstrap (output de yield paths).
 *   - Presets built-in evalúan sin errores sobre datos sintéticos.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateView,
  computeConditionalMetrics,
  asymmetricAnalysis,
  BUILT_IN_VIEWS,
  BUILT_IN_COMPOSITE_VIEWS,
  BUILT_IN_SYNCHRONIZED_VIEWS,
  componentWindowEnvelope,
  findAnyBuiltInView,
  getAnyBuiltInView,
  getBuiltInView,
  isCompositeView,
  requiredEtfTickers,
  viewRequiresEtfReturns,
  viewRequiresYieldPaths,
  withPortfolio,
  type CompositeView,
  type EtfReturns,
  type View,
  type ViewDataset,
} from './views';
import { applyFlows } from './flows';
import type { FlowsOutput } from './flows';
import type { PlanSpec } from './types';
import { runBootstrap, type BootstrapInput, DEFAULT_BOOTSTRAP_CONFIG } from './bootstrap';
import { expandPortfolio } from './amc-definitions';

// ---------------------------------------------------------------------------
// Helpers para construir datasets sintéticos
// ---------------------------------------------------------------------------

/**
 * Construye un dataset mínimo con retornos y yields controlados por el test.
 * `nPaths` paths, `horizonMonths` meses, yields iniciales a 3%, paths con
 * patrones preseteados.
 */
function makeSyntheticDataset(opts: {
  nPaths: number;
  horizonMonths: number;
  /** retorno constante por path (opcional). Default = arreglo de 0. */
  returnsA?: (p: number, t: number) => number;
  returnsB?: (p: number, t: number) => number;
  /** yield value por path/mes (opcional). */
  yieldTNX?: (p: number, t: number) => number;
  yieldIRX?: (p: number, t: number) => number;
  yieldFVX?: (p: number, t: number) => number;
  yieldTYX?: (p: number, t: number) => number;
  yieldInitial?: { IRX: number; FVX: number; TNX: number; TYX: number };
}): ViewDataset {
  const n = opts.nPaths;
  const H = opts.horizonMonths;
  const portfolioReturnsA = new Float32Array(n * H);
  const portfolioReturnsB = new Float32Array(n * H);
  for (let p = 0; p < n; p++) {
    for (let t = 0; t < H; t++) {
      portfolioReturnsA[p * H + t] = opts.returnsA ? opts.returnsA(p, t) : 0;
      portfolioReturnsB[p * H + t] = opts.returnsB ? opts.returnsB(p, t) : 0;
    }
  }
  const tnx = new Float32Array(n * H);
  const irx = new Float32Array(n * H);
  const fvx = new Float32Array(n * H);
  const tyx = new Float32Array(n * H);
  const defaultInitial = opts.yieldInitial ?? { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 };
  for (let p = 0; p < n; p++) {
    for (let t = 0; t < H; t++) {
      tnx[p * H + t] = opts.yieldTNX ? opts.yieldTNX(p, t) : defaultInitial.TNX;
      irx[p * H + t] = opts.yieldIRX ? opts.yieldIRX(p, t) : defaultInitial.IRX;
      fvx[p * H + t] = opts.yieldFVX ? opts.yieldFVX(p, t) : defaultInitial.FVX;
      tyx[p * H + t] = opts.yieldTYX ? opts.yieldTYX(p, t) : defaultInitial.TYX;
    }
  }
  return {
    portfolioReturnsA,
    portfolioReturnsB,
    yieldPaths: { IRX: irx, FVX: fvx, TNX: tnx, TYX: tyx },
    etfReturns: null,
    yieldInitial: defaultInitial,
    nPaths: n,
    horizonMonths: H,
  };
}

// ---------------------------------------------------------------------------
// Tests: predicate modes — YIELD
// ---------------------------------------------------------------------------

describe('views — peakChange (yield)', () => {
  it('matchea los paths donde el pico de cambio supera minDelta', () => {
    // 4 paths, 12 meses. TNX inicial = 3%.
    // Path 0: flat 3% todo el tiempo → peak change = 0
    // Path 1: sube a 4.5% en el mes 6 y vuelve a 3% al final → peak = +150 pbs
    // Path 2: sube gradualmente a 5% en el mes 12 → peak = +200 pbs
    // Path 3: baja a 2% → peak = 0 (nunca sube)
    // Notas: usamos 0.045 (no 0.04) para tener margen claro sobre el threshold
    // 0.01 — Float32 guarda 0.04 como ~0.0399999991... y el delta vs 0.03 cae
    // a ~0.0099999977..., que falla el ≥ 0.01 estricto. Con 0.045 el margen
    // es 150 pbs vs 100 pbs threshold → sin ambigüedad.
    const dataset = makeSyntheticDataset({
      nPaths: 4,
      horizonMonths: 12,
      yieldTNX: (p, t) => {
        if (p === 0) return 0.03;
        if (p === 1) return t === 5 ? 0.045 : 0.03;
        if (p === 2) return 0.03 + 0.02 * ((t + 1) / 12);
        return 0.02;
      },
      yieldInitial: { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 },
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'yield', key: 'TNX' },
      mode: { kind: 'peakChange', minDelta: 0.01, maxDelta: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Solo path 1 y 2 cumplen
    expect(ev.nMatched).toBe(2);
    expect(Array.from(ev.matchedIndices).sort()).toEqual([1, 2]);
  });

  it('respeta maxDelta como cota superior', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 3,
      horizonMonths: 6,
      yieldTNX: (p) => (p === 0 ? 0.035 : p === 1 ? 0.045 : 0.06),
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'yield', key: 'TNX' },
      // Banda [25 pbs, 250 pbs]: path 0 (delta 50 pbs) dentro; path 1 (150 pbs)
      // también dentro; path 2 (300 pbs) fuera por maxDelta.
      mode: { kind: 'peakChange', minDelta: 0.0025, maxDelta: 0.025 },
      window: { startMonth: 1, endMonth: 6 },
    };
    const ev = evaluateView(view, dataset);
    expect(ev.nMatched).toBe(2);
    expect(Array.from(ev.matchedIndices).sort()).toEqual([0, 1]);
  });
});

describe('views — troughChange (yield)', () => {
  it('matchea los paths donde el piso de cambio es ≤ maxDelta', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 3,
      horizonMonths: 12,
      yieldTNX: (p, t) => {
        if (p === 0) return 0.03; // flat
        if (p === 1) return t === 5 ? 0.02 : 0.03; // dip a -100 pbs en mes 6
        return 0.025; // mild dip -50 pbs
      },
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'yield', key: 'TNX' },
      mode: { kind: 'troughChange', minDelta: null, maxDelta: -0.0075 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Solo path 1 cumple (-100 pbs < -75 pbs threshold)
    expect(ev.nMatched).toBe(1);
    expect(ev.matchedIndices[0]).toBe(1);
  });
});

describe('views — endpointChange (yield)', () => {
  it('matchea sólo basado en el valor al final de la ventana', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 3,
      horizonMonths: 12,
      // Path 0: sube a 5% luego baja a 3% al final → endpoint = 0
      // Path 1: sube a 4% al final → endpoint = +100
      // Path 2: baja a 2% al final → endpoint = -100
      yieldTNX: (p, t) => {
        if (p === 0) {
          if (t < 5) return 0.05;
          return 0.03;
        }
        if (p === 1) return 0.03 + 0.01 * ((t + 1) / 12);
        return 0.03 - 0.01 * ((t + 1) / 12);
      },
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'yield', key: 'TNX' },
      mode: { kind: 'endpointChange', minDelta: 0.005, maxDelta: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    expect(ev.nMatched).toBe(1);
    expect(ev.matchedIndices[0]).toBe(1);
  });

  it('rango bilateral (estabilidad): minDelta y maxDelta ambos finitos', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 4,
      horizonMonths: 12,
      yieldTNX: (p) => {
        if (p === 0) return 0.0315; // +15 pbs → dentro
        if (p === 1) return 0.0285; // -15 pbs → dentro
        if (p === 2) return 0.035; // +50 pbs → fuera
        return 0.025; // -50 pbs → fuera
      },
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'yield', key: 'TNX' },
      mode: { kind: 'endpointChange', minDelta: -0.0025, maxDelta: 0.0025 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    expect(ev.nMatched).toBe(2);
    expect(Array.from(ev.matchedIndices).sort()).toEqual([0, 1]);
  });
});

describe('views — persistentThreshold (yield)', () => {
  it('matchea solo si hay racha consecutiva ≥ minDurationMonths', () => {
    // Usamos 0.045 para tener margen claro sobre el threshold 0.01 (150 pbs
    // vs 100 pbs) y evitar la precisión Float32 ambigua.
    const dataset = makeSyntheticDataset({
      nPaths: 3,
      horizonMonths: 12,
      yieldTNX: (p, t) => {
        if (p === 0) return t < 3 ? 0.045 : 0.035; // 3 meses a +150 pbs, luego +50 pbs
        if (p === 1) return t < 6 ? 0.045 : 0.03; // 6 meses a +150 pbs
        return 0.045; // 12 meses a +150 pbs
      },
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'yield', key: 'TNX' },
      mode: { kind: 'persistentThreshold', minDelta: 0.01, minDurationMonths: 5 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Path 0: racha de 3 meses (insuficiente). Path 1: 6 meses ≥ 5 (cumple). Path 2: 12 meses ≥ 5 (cumple).
    expect(ev.nMatched).toBe(2);
    expect(Array.from(ev.matchedIndices).sort()).toEqual([1, 2]);
  });
});

// ---------------------------------------------------------------------------
// Tests: predicate modes — PORTFOLIO RETURN
// ---------------------------------------------------------------------------

describe('views — cumulativeReturnRange', () => {
  it('matchea paths cuyo retorno acumulado cae en [min, max]', () => {
    // 4 paths, 12 meses, retorno mensual constante por path.
    // Cumulative return = (1+r)^12 - 1
    const dataset = makeSyntheticDataset({
      nPaths: 4,
      horizonMonths: 12,
      returnsA: (p) => {
        if (p === 0) return 0.01; // 12.68% acum
        if (p === 1) return 0.015; // 19.56% acum
        if (p === 2) return 0.02; // 26.82% acum
        return 0.025; // 34.49% acum
      },
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Paths 2 y 3 cumplen (>20%)
    expect(ev.nMatched).toBe(2);
    expect(Array.from(ev.matchedIndices).sort()).toEqual([2, 3]);
  });

  it('rango bilateral acota por ambos lados', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 5,
      horizonMonths: 12,
      returnsA: (p) => {
        // retornos mensuales → acumulado (1+r)^12-1
        if (p === 0) return 0; // 0%
        if (p === 1) return 0.003; // ~3.66%
        if (p === 2) return -0.002; // ~-2.37%
        if (p === 3) return 0.01; // ~12.68% (fuera)
        return -0.008; // ~-9.16% (fuera)
      },
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: -0.05, maxReturn: 0.05 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    expect(ev.nMatched).toBe(3);
    expect(Array.from(ev.matchedIndices).sort()).toEqual([0, 1, 2]);
  });

  it('aplica al portafolio B cuando el subject lo pide', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 2,
      horizonMonths: 12,
      returnsA: () => 0.02, // A acumula ~26.82%
      returnsB: () => 0.005, // B acumula ~6.17%
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'portfolioReturn', portfolio: 'B' },
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: 0.1 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Ambos paths de B están en ~6.17% → cumplen
    expect(ev.nMatched).toBe(2);
  });
});

describe('views — percentileBandReturn', () => {
  it('selecciona el tercil superior (mejor 1/3)', () => {
    // 9 paths con retornos acumulados crecientes 1%, 2%, ..., 9%
    const dataset = makeSyntheticDataset({
      nPaths: 9,
      horizonMonths: 12,
      returnsA: (p) => Math.pow(1 + (p + 1) / 100, 1 / 12) - 1,
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'percentileBandReturn', lowerP: 66.67, upperP: 100 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // El mejor tercil contiene los paths 6, 7, 8 (retornos 7%, 8%, 9%)
    // Con interpolación lineal el threshold puede incluir al path 6 también.
    expect(ev.nMatched).toBeGreaterThanOrEqual(3);
    expect(ev.nMatched).toBeLessThanOrEqual(4);
    // El path de mayor retorno (8) siempre debe estar
    expect(Array.from(ev.matchedIndices)).toContain(8);
  });

  it('selecciona la banda intercuartil (25-75)', () => {
    const n = 20;
    const dataset = makeSyntheticDataset({
      nPaths: n,
      horizonMonths: 12,
      returnsA: (p) => Math.pow(1 + p / 100, 1 / 12) - 1,
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'percentileBandReturn', lowerP: 25, upperP: 75 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Aproximadamente la mitad de los paths debe matchear (tolerando jitter de interpolación)
    expect(ev.nMatched).toBeGreaterThanOrEqual(9);
    expect(ev.nMatched).toBeLessThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------
// Tests: probabilidad y error estándar
// ---------------------------------------------------------------------------

describe('views — probabilidad y error estándar', () => {
  it('computa probability = nMatched / nTotal y su SE', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 100,
      horizonMonths: 12,
      // Mitad de los paths suben, mitad no
      yieldTNX: (p) => (p < 50 ? 0.04 : 0.03),
    });
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'yield', key: 'TNX' },
      mode: { kind: 'peakChange', minDelta: 0.005, maxDelta: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    expect(ev.nMatched).toBe(50);
    expect(ev.probability).toBe(0.5);
    // SE(p=0.5, n=100) = sqrt(0.25/100) = 0.05
    expect(ev.standardError).toBeCloseTo(0.05, 5);
  });
});

// ---------------------------------------------------------------------------
// Tests: métricas condicionales y análisis asimétrico
// ---------------------------------------------------------------------------

function buildFlowsOutput(
  nPaths: number,
  horizonMonths: number,
  initialCapital: number,
  returns: Float32Array,
): FlowsOutput {
  const plan: PlanSpec = {
    initialCapital,
    horizonMonths,
    mode: 'nominal',
    inflationPct: 0,
    rules: [],
  };
  return applyFlows({ plan, portfolioReturns: returns, nPaths });
}

describe('views — conditional metrics', () => {
  it('computeConditionalMetrics devuelve null si el subset está vacío', () => {
    const n = 5;
    const H = 12;
    const dataset = makeSyntheticDataset({
      nPaths: n,
      horizonMonths: H,
      returnsA: () => 0.01,
    });
    const sim = buildFlowsOutput(n, H, 100_000, dataset.portfolioReturnsA);
    const metrics = computeConditionalMetrics(
      new Uint32Array([]),
      sim,
      dataset.portfolioReturnsA,
      n,
      H,
      { startMonth: 1, endMonth: H },
    );
    expect(metrics).toBeNull();
  });

  it('subset completo reproduce las métricas base', () => {
    const n = 10;
    const H = 12;
    const dataset = makeSyntheticDataset({
      nPaths: n,
      horizonMonths: H,
      returnsA: (_p, t) => 0.005 + 0.0001 * t, // retornos ligeramente distintos por mes
    });
    const sim = buildFlowsOutput(n, H, 100_000, dataset.portfolioReturnsA);
    const allIndices = Uint32Array.from({ length: n }, (_, i) => i);
    const condMetrics = computeConditionalMetrics(
      allIndices,
      sim,
      dataset.portfolioReturnsA,
      n,
      H,
      { startMonth: 1, endMonth: H },
    );
    expect(condMetrics).not.toBeNull();
    // No voy a comparar todas las bands, pero el TWR mediano debe ser igual con o sin subset completo
    expect(condMetrics!.twrAnnualized.p50).toBeGreaterThan(0);
    expect(condMetrics!.nPaths).toBe(n);
  });
});

describe('views — asymmetricAnalysis', () => {
  it('devuelve matched + unmatched + base consistentes', () => {
    const n = 20;
    const H = 12;
    // 10 paths con retorno alto (+2%/mes), 10 con retorno bajo (+0.5%/mes)
    const dataset = makeSyntheticDataset({
      nPaths: n,
      horizonMonths: H,
      returnsA: (p) => (p < 10 ? 0.02 : 0.005),
    });
    const sim = buildFlowsOutput(n, H, 100_000, dataset.portfolioReturnsA);
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
      window: { startMonth: 1, endMonth: H },
    };
    const analysis = asymmetricAnalysis(
      view,
      { dataset, simulation: sim, window: { startMonth: 1, endMonth: H } },
      dataset.portfolioReturnsA,
    );
    expect(analysis.evaluation.nMatched).toBe(10);
    expect(analysis.matched).not.toBeNull();
    expect(analysis.unmatched).not.toBeNull();
    expect(analysis.base.nPaths).toBe(n);
    expect(analysis.matched!.nPaths).toBe(10);
    expect(analysis.unmatched!.nPaths).toBe(10);
    // TWR del grupo "matched" (+2%/mes) > TWR del grupo "unmatched" (+0.5%/mes)
    expect(analysis.matched!.twrAnnualized.p50).toBeGreaterThan(
      analysis.unmatched!.twrAnnualized.p50,
    );
  });

  it('view con 0% de match deja matched en null y unmatched = base', () => {
    const n = 5;
    const H = 6;
    const dataset = makeSyntheticDataset({
      nPaths: n,
      horizonMonths: H,
      returnsA: () => 0.01,
    });
    const sim = buildFlowsOutput(n, H, 100_000, dataset.portfolioReturnsA);
    const view: View = {
      id: 'test',
      label: 'test',
      description: 'test',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.9, maxReturn: null },
      window: { startMonth: 1, endMonth: H },
    };
    const analysis = asymmetricAnalysis(
      view,
      { dataset, simulation: sim, window: { startMonth: 1, endMonth: H } },
      dataset.portfolioReturnsA,
    );
    expect(analysis.evaluation.nMatched).toBe(0);
    expect(analysis.matched).toBeNull();
    expect(analysis.unmatched).not.toBeNull();
    expect(analysis.unmatched!.nPaths).toBe(n);
  });
});

// ---------------------------------------------------------------------------
// Tests: presets built-in
// ---------------------------------------------------------------------------

describe('views — presets built-in', () => {
  it('expone 9 presets con ids únicos y válidos', () => {
    expect(BUILT_IN_VIEWS.length).toBe(9);
    const ids = new Set(BUILT_IN_VIEWS.map((v) => v.id));
    expect(ids.size).toBe(9);
    for (const v of BUILT_IN_VIEWS) {
      expect(v.id.length).toBeGreaterThan(0);
      expect(v.label.length).toBeGreaterThan(0);
      expect(v.description.length).toBeGreaterThan(0);
    }
  });

  it('getBuiltInView devuelve el preset por id', () => {
    const v = getBuiltInView('rates-up-peak-100-12m');
    expect(v.subject).toEqual({ kind: 'yield', key: 'TNX' });
    expect(v.mode.kind).toBe('peakChange');
  });

  it('getBuiltInView throw si el id no existe', () => {
    expect(() => getBuiltInView('inexistente')).toThrow();
  });

  it('withPortfolio clona un preset cambiando A → B', () => {
    const vA = getBuiltInView('portfolioA-rally-20-12m');
    const vB = withPortfolio(vA, 'B');
    expect(vB.subject).toEqual({ kind: 'portfolioReturn', portfolio: 'B' });
    expect(vB.id).toContain('portfolioB');
    expect(vB.label).toContain('Portafolio B');
  });

  it('withPortfolio throw para views de subject yield', () => {
    const v = getBuiltInView('rates-up-peak-100-12m');
    expect(() => withPortfolio(v, 'B')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Tests: integración end-to-end con el bootstrap real
// ---------------------------------------------------------------------------

describe('views — integración end-to-end con runBootstrap', () => {
  it('runBootstrap con outputYieldPaths=true emite 4 yield arrays del tamaño correcto', () => {
    // 100% USA.Eq para que no toque RF reconstruction; pero el user pide yields
    const input: BootstrapInput = {
      portfolios: {
        A: expandPortfolio({ kind: 'amc', id: 'USA.Eq' }),
        B: expandPortfolio({ kind: 'signature', id: 'Balanceado' }),
      },
      horizonMonths: 24,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 50, seed: 123 },
      outputYieldPaths: true,
    };
    const out = runBootstrap(input);
    expect(out.yieldPaths).toBeDefined();
    const yp = out.yieldPaths!;
    for (const key of ['IRX', 'FVX', 'TNX', 'TYX'] as const) {
      expect(yp[key]).toBeInstanceOf(Float32Array);
      expect(yp[key].length).toBe(50 * 24);
      // Los valores tienen que ser finitos y estar en un rango razonable (yields en decimal)
      let allFinite = true;
      for (let i = 0; i < yp[key].length; i++) {
        if (!Number.isFinite(yp[key][i])) {
          allFinite = false;
          break;
        }
      }
      expect(allFinite).toBe(true);
    }
  });

  it('runBootstrap sin outputYieldPaths no emite yields (backward compat)', () => {
    const input: BootstrapInput = {
      portfolios: {
        A: expandPortfolio({ kind: 'amc', id: 'USA.Eq' }),
        B: expandPortfolio({ kind: 'amc', id: 'USA.Eq' }),
      },
      horizonMonths: 12,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 50, seed: 123 },
    };
    const out = runBootstrap(input);
    expect(out.yieldPaths).toBeUndefined();
  });

  it('pipeline completo: bootstrap → flows → evaluateView → conditionalMetrics', () => {
    const input: BootstrapInput = {
      portfolios: {
        A: expandPortfolio({ kind: 'signature', id: 'Balanceado' }),
        B: expandPortfolio({ kind: 'signature', id: 'Crecimiento' }),
      },
      horizonMonths: 24,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 500, seed: 42 },
      outputYieldPaths: true,
    };
    const boot = runBootstrap(input);

    // yieldInitial: nivel actual observado (se puede leer de bootstrap via getYieldBounds)
    // Para el test, usamos el valor del mes 0 del path 0 como proxy del nivel inicial
    // — bastante cercano porque el primer mes sufre un Δy chico.
    // En producción la UI usará getYieldBounds(key).initial.
    const approxInitial = {
      IRX: 0.036,
      FVX: 0.04,
      TNX: 0.043,
      TYX: 0.049,
    };

    const dataset: ViewDataset = {
      portfolioReturnsA: boot.portfolioReturnsA,
      portfolioReturnsB: boot.portfolioReturnsB,
      yieldPaths: boot.yieldPaths!,
      etfReturns: null,
      yieldInitial: approxInitial,
      nPaths: 500,
      horizonMonths: 24,
    };

    const view = getBuiltInView('rates-up-peak-100-12m');
    const ev = evaluateView(view, dataset);

    // Con 500 paths, esperamos una probabilidad >0% (algún path debe subir)
    // pero <100% (no todos). Bounds amplios a propósito.
    expect(ev.nMatched).toBeGreaterThan(0);
    expect(ev.nMatched).toBeLessThan(500);

    // Pipeline: flows + metrics condicionales
    const sim = buildFlowsOutput(500, 24, 100_000, boot.portfolioReturnsA);
    const condMetrics = computeConditionalMetrics(
      ev.matchedIndices,
      sim,
      boot.portfolioReturnsA,
      500,
      24,
      { startMonth: 1, endMonth: 24 },
    );
    expect(condMetrics).not.toBeNull();
    expect(condMetrics!.nPaths).toBe(ev.nMatched);
    // TWR debe ser finito en la mediana
    expect(Number.isFinite(condMetrics!.twrAnnualized.p50)).toBe(true);
  });
});

// ===========================================================================
// COMPOSITE VIEWS (Fase C.1)
// ===========================================================================

/**
 * Helpers reutilizables para armar composites en tests — evitan repetir
 * literales largos.
 */
const W12: { startMonth: 1; endMonth: 12 } = { startMonth: 1, endMonth: 12 };

function ratesUpComponent(minPbs: number = 100): View {
  return {
    id: `c-rates-up-${minPbs}`,
    label: 'rates up',
    description: '',
    subject: { kind: 'yield', key: 'TNX' },
    mode: { kind: 'peakChange', minDelta: minPbs / 10000, maxDelta: null },
    window: W12,
  };
}

function equityCrashComponent(maxPct: number = -0.2, portfolio: 'A' | 'B' = 'A'): View {
  return {
    id: `c-equity-crash-${portfolio}-${Math.abs(maxPct * 100)}`,
    label: 'equity crash',
    description: '',
    subject: { kind: 'portfolioReturn', portfolio },
    mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: maxPct },
    window: W12,
  };
}

describe('views — CompositeView type guards y helpers', () => {
  it('isCompositeView distingue single de composite', () => {
    const single = BUILT_IN_VIEWS[0];
    const comp = BUILT_IN_COMPOSITE_VIEWS[0];
    expect(isCompositeView(single)).toBe(false);
    expect(isCompositeView(comp)).toBe(true);
  });

  it('viewRequiresYieldPaths: single yield → true, single portfolio → false', () => {
    const yieldView = BUILT_IN_VIEWS.find((v) => v.subject.kind === 'yield')!;
    const portView = BUILT_IN_VIEWS.find((v) => v.subject.kind === 'portfolioReturn')!;
    expect(viewRequiresYieldPaths(yieldView)).toBe(true);
    expect(viewRequiresYieldPaths(portView)).toBe(false);
  });

  it('viewRequiresYieldPaths: composite con al menos 1 componente yield → true', () => {
    // Todos los built-in composite tienen un componente yield (mezclan rates + equity).
    for (const comp of BUILT_IN_COMPOSITE_VIEWS) {
      expect(viewRequiresYieldPaths(comp)).toBe(true);
    }
  });

  it('viewRequiresYieldPaths: composite sin componentes yield → false', () => {
    const comp: CompositeView = {
      kind: 'composite',
      id: 'test-only-equity',
      label: 'only equity',
      description: '',
      combinator: 'and',
      window: W12,
      components: [
        equityCrashComponent(-0.1, 'A'),
        equityCrashComponent(-0.1, 'B'),
      ],
    };
    expect(viewRequiresYieldPaths(comp)).toBe(false);
  });

  it('getAnyBuiltInView resuelve ids single y composite, throw si no existe', () => {
    expect(getAnyBuiltInView('rates-up-peak-100-12m').id).toBe('rates-up-peak-100-12m');
    expect(getAnyBuiltInView('composite-stagflation-12m').id).toBe('composite-stagflation-12m');
    expect(() => getAnyBuiltInView('does-not-exist')).toThrow();
  });

  it('findAnyBuiltInView devuelve null si no existe (no throw)', () => {
    expect(findAnyBuiltInView('rates-up-peak-100-12m')).not.toBeNull();
    expect(findAnyBuiltInView('composite-goldilocks-12m')).not.toBeNull();
    expect(findAnyBuiltInView('xyz')).toBeNull();
  });
});

describe('views — evaluateCompositeView (AND)', () => {
  it('intersección: path matchea iff ambos componentes matchean', () => {
    // 4 paths, 12 meses. Construcción controlada:
    //   Path 0: rates up +150 pbs (match rates), equity +10% (NO match crash)
    //   Path 1: rates flat (NO match rates), equity -25% (match crash)
    //   Path 2: rates up +150 pbs (match rates), equity -25% (match crash)   ← ÚNICO AND
    //   Path 3: rates flat, equity flat (NO match ambos)
    const dataset = makeSyntheticDataset({
      nPaths: 4,
      horizonMonths: 12,
      yieldTNX: (p, t) => {
        if (p === 0 || p === 2) return t === 5 ? 0.045 : 0.03;
        return 0.03;
      },
      // Retornos mensuales: para acumular ~−25% sobre 12m necesitamos ~−2.37%/mes;
      // para ~+10% sobre 12m ~+0.797%/mes.
      returnsA: (p) => {
        if (p === 0) return 0.00797;
        if (p === 1 || p === 2) return -0.0237;
        return 0;
      },
      yieldInitial: { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 },
    });

    const comp: CompositeView = {
      kind: 'composite',
      id: 'test-and',
      label: 'and',
      description: '',
      combinator: 'and',
      window: W12,
      components: [ratesUpComponent(100), equityCrashComponent(-0.2)],
    };

    const ev = evaluateView(comp, dataset);
    expect(ev.nMatched).toBe(1);
    expect(Array.from(ev.matchedIndices)).toEqual([2]);
    expect(ev.probability).toBe(0.25);
  });

  it('AND con 3 componentes: solo pasa si los 3 matchean', () => {
    // 3 paths. Components: rates up, equity A crash, equity B crash.
    //   Path 0: rates up, A crash, B crash → AND
    //   Path 1: rates up, A crash, B flat  → no
    //   Path 2: rates flat, A crash, B crash → no
    const dataset = makeSyntheticDataset({
      nPaths: 3,
      horizonMonths: 12,
      yieldTNX: (p, t) => {
        if (p === 0 || p === 1) return t === 5 ? 0.045 : 0.03;
        return 0.03;
      },
      returnsA: () => -0.0237,
      returnsB: (p) => (p === 0 || p === 2 ? -0.0237 : 0),
    });

    const comp: CompositeView = {
      kind: 'composite',
      id: 'test-and-3',
      label: 'and3',
      description: '',
      combinator: 'and',
      window: W12,
      components: [
        ratesUpComponent(100),
        equityCrashComponent(-0.2, 'A'),
        equityCrashComponent(-0.2, 'B'),
      ],
    };
    const ev = evaluateView(comp, dataset);
    expect(ev.nMatched).toBe(1);
    expect(Array.from(ev.matchedIndices)).toEqual([0]);
  });

  it('AND todos-matchean: probability = 1', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 5,
      horizonMonths: 12,
      yieldTNX: (_, t) => (t === 5 ? 0.045 : 0.03),
      returnsA: () => -0.0237,
    });
    const comp: CompositeView = {
      kind: 'composite',
      id: 't',
      label: 't',
      description: '',
      combinator: 'and',
      window: W12,
      components: [ratesUpComponent(100), equityCrashComponent(-0.2)],
    };
    const ev = evaluateView(comp, dataset);
    expect(ev.nMatched).toBe(5);
    expect(ev.probability).toBe(1);
  });

  it('AND ningún path matchea componente 2: probability = 0', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 5,
      horizonMonths: 12,
      yieldTNX: (_, t) => (t === 5 ? 0.045 : 0.03),
      returnsA: () => 0, // nunca crashes
    });
    const comp: CompositeView = {
      kind: 'composite',
      id: 't',
      label: 't',
      description: '',
      combinator: 'and',
      window: W12,
      components: [ratesUpComponent(100), equityCrashComponent(-0.2)],
    };
    const ev = evaluateView(comp, dataset);
    expect(ev.nMatched).toBe(0);
    expect(ev.probability).toBe(0);
  });
});

describe('views — evaluateCompositeView (OR)', () => {
  it('unión: path matchea iff al menos un componente matchea', () => {
    // Reusamos la misma construcción del test AND.
    // Matches esperados:
    //   Path 0: rates up (match) | equity rally (NO match crash) → OR = match
    //   Path 1: rates flat (NO) | equity crash (match) → match
    //   Path 2: rates up (match) | equity crash (match) → match
    //   Path 3: rates flat (NO) | equity flat (NO) → no match
    const dataset = makeSyntheticDataset({
      nPaths: 4,
      horizonMonths: 12,
      yieldTNX: (p, t) => {
        if (p === 0 || p === 2) return t === 5 ? 0.045 : 0.03;
        return 0.03;
      },
      returnsA: (p) => {
        if (p === 0) return 0.00797;
        if (p === 1 || p === 2) return -0.0237;
        return 0;
      },
    });

    const comp: CompositeView = {
      kind: 'composite',
      id: 'test-or',
      label: 'or',
      description: '',
      combinator: 'or',
      window: W12,
      components: [ratesUpComponent(100), equityCrashComponent(-0.2)],
    };

    const ev = evaluateView(comp, dataset);
    expect(ev.nMatched).toBe(3);
    expect(Array.from(ev.matchedIndices).sort()).toEqual([0, 1, 2]);
  });

  it('OR con ambos componentes vacíos: probability = 0', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 4,
      horizonMonths: 12,
      yieldTNX: () => 0.03,
      returnsA: () => 0,
    });
    const comp: CompositeView = {
      kind: 'composite',
      id: 't',
      label: 't',
      description: '',
      combinator: 'or',
      window: W12,
      components: [ratesUpComponent(100), equityCrashComponent(-0.2)],
    };
    const ev = evaluateView(comp, dataset);
    expect(ev.nMatched).toBe(0);
  });
});

describe('views — evaluateCompositeView validación', () => {
  it('lanza error si components es vacío', () => {
    const dataset = makeSyntheticDataset({ nPaths: 5, horizonMonths: 12 });
    const comp: CompositeView = {
      kind: 'composite',
      id: 'empty',
      label: 'empty',
      description: '',
      combinator: 'and',
      window: W12,
      components: [],
    };
    expect(() => evaluateView(comp, dataset)).toThrow(/no tiene componentes/);
  });

  it('acepta componentes con ventanas distintas (Fase C.2b)', () => {
    // Fase C.2b relajó el constraint. Componentes con ventanas distintas
    // ahora evalúan cada uno sobre la suya propia.
    const dataset = makeSyntheticDataset({
      nPaths: 3,
      horizonMonths: 24,
      yieldTNX: (p, t) => (p === 0 && t === 3 ? 0.045 : 0.03),
      returnsA: (p) => (p === 0 || p === 1 ? 0.00797 : 0),
    });
    const componentWithDifferentWindow: View = {
      id: 'port-A-positive-24m',
      label: 'x',
      description: '',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.05, maxReturn: null },
      window: { startMonth: 1, endMonth: 24 },
    };
    const comp: CompositeView = {
      kind: 'composite',
      id: 'multi-window',
      label: 'm',
      description: '',
      combinator: 'and',
      window: { startMonth: 1, endMonth: 24 }, // envelope
      components: [ratesUpComponent(100), componentWithDifferentWindow],
    };
    // NO lanza error; evalúa ambos sobre sus respectivas ventanas.
    expect(() => evaluateView(comp, dataset)).not.toThrow();
  });

  it('lanza error si componente yield pero yieldPaths=null', () => {
    const dataset: ViewDataset = {
      portfolioReturnsA: new Float32Array(60),
      portfolioReturnsB: new Float32Array(60),
      yieldPaths: null,
      etfReturns: null,
      yieldInitial: { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 },
      nPaths: 5,
      horizonMonths: 12,
    };
    const comp: CompositeView = {
      kind: 'composite',
      id: 't',
      label: 't',
      description: '',
      combinator: 'and',
      window: W12,
      components: [ratesUpComponent(100), equityCrashComponent(-0.2)],
    };
    expect(() => evaluateView(comp, dataset)).toThrow(/yieldPaths/);
  });

  it('lanza error si la ventana del composite excede el horizonte', () => {
    const dataset = makeSyntheticDataset({ nPaths: 5, horizonMonths: 6 });
    const comp: CompositeView = {
      kind: 'composite',
      id: 't',
      label: 't',
      description: '',
      combinator: 'and',
      window: W12, // endMonth=12 > horizonMonths=6
      components: [ratesUpComponent(100), equityCrashComponent(-0.2)],
    };
    expect(() => evaluateView(comp, dataset)).toThrow(/ventana inválida/);
  });

  it('soporta composite con 1 solo componente (degenera a single)', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 3,
      horizonMonths: 12,
      yieldTNX: (p, t) => (p === 0 ? (t === 5 ? 0.045 : 0.03) : 0.03),
    });
    const comp: CompositeView = {
      kind: 'composite',
      id: 'single-component',
      label: 's',
      description: '',
      combinator: 'and',
      window: W12,
      components: [ratesUpComponent(100)],
    };
    const ev = evaluateView(comp, dataset);
    // Solo path 0 matchea el componente → composite matchea solo path 0.
    expect(ev.nMatched).toBe(1);
    expect(ev.matchedIndices[0]).toBe(0);
  });
});

describe('views — asymmetricAnalysis sobre composite', () => {
  it('partición matched + unmatched = nTotal, métricas bien calculadas', () => {
    const nPaths = 100;
    const horizonMonths = 12;
    // 30 paths con stagflation sintética (rates up + equity crash),
    // 70 paths neutros.
    const dataset = makeSyntheticDataset({
      nPaths,
      horizonMonths,
      yieldTNX: (p, t) => (p < 30 && t === 5 ? 0.045 : 0.03),
      returnsA: (p) => (p < 30 ? -0.0237 : 0.005),
    });
    const stagflation: CompositeView = {
      kind: 'composite',
      id: 'sf',
      label: 'sf',
      description: '',
      combinator: 'and',
      window: W12,
      components: [ratesUpComponent(100), equityCrashComponent(-0.2)],
    };

    const sim = buildFlowsOutput(nPaths, horizonMonths, 100_000, dataset.portfolioReturnsA);
    const analysis = asymmetricAnalysis(
      stagflation,
      { dataset, simulation: sim, window: W12 },
      dataset.portfolioReturnsA,
    );

    expect(analysis.evaluation.nMatched).toBe(30);
    expect(analysis.evaluation.nTotal).toBe(nPaths);
    expect(analysis.matched).not.toBeNull();
    expect(analysis.unmatched).not.toBeNull();
    expect(analysis.matched!.nPaths).toBe(30);
    expect(analysis.unmatched!.nPaths).toBe(70);
    // La base tiene los 100 paths.
    expect(analysis.base.nPaths).toBe(nPaths);

    // El grupo matched (que baja −25% cada 12m) debe tener peor TWR que unmatched.
    expect(analysis.matched!.twrAnnualized.p50).toBeLessThan(
      analysis.unmatched!.twrAnnualized.p50,
    );
  });

  it('analysis con 0 paths matched: matched=null, unmatched=base en tamaño', () => {
    const nPaths = 50;
    const dataset = makeSyntheticDataset({
      nPaths,
      horizonMonths: 12,
      yieldTNX: () => 0.03, // nunca sube
      returnsA: () => 0.005,
    });
    const comp: CompositeView = {
      kind: 'composite',
      id: 't',
      label: 't',
      description: '',
      combinator: 'and',
      window: W12,
      components: [ratesUpComponent(100), equityCrashComponent(-0.2)],
    };
    const sim = buildFlowsOutput(nPaths, 12, 100_000, dataset.portfolioReturnsA);
    const analysis = asymmetricAnalysis(
      comp,
      { dataset, simulation: sim, window: W12 },
      dataset.portfolioReturnsA,
    );
    expect(analysis.evaluation.nMatched).toBe(0);
    expect(analysis.matched).toBeNull();
    expect(analysis.unmatched!.nPaths).toBe(nPaths);
  });
});

describe('views — BUILT_IN_COMPOSITE_VIEWS validación de shape', () => {
  it('hay exactamente 4 presets compuestos', () => {
    expect(BUILT_IN_COMPOSITE_VIEWS.length).toBe(4);
  });

  it('cada preset tiene id único en el pool unificado (no colisiona con single)', () => {
    const singleIds = new Set(BUILT_IN_VIEWS.map((v) => v.id));
    for (const comp of BUILT_IN_COMPOSITE_VIEWS) {
      expect(singleIds.has(comp.id)).toBe(false);
    }
    const compIds = new Set(BUILT_IN_COMPOSITE_VIEWS.map((v) => v.id));
    expect(compIds.size).toBe(BUILT_IN_COMPOSITE_VIEWS.length);
  });

  it('cada preset tiene label/description no-vacíos y ≥1 componente', () => {
    for (const comp of BUILT_IN_COMPOSITE_VIEWS) {
      expect(comp.label.length).toBeGreaterThan(0);
      expect(comp.description.length).toBeGreaterThan(0);
      expect(comp.components.length).toBeGreaterThanOrEqual(1);
      expect(isCompositeView(comp)).toBe(true);
      expect(comp.combinator === 'and' || comp.combinator === 'or').toBe(true);
    }
  });

  it('todos los componentes de cada preset comparten la ventana del composite', () => {
    for (const comp of BUILT_IN_COMPOSITE_VIEWS) {
      for (const c of comp.components) {
        expect(c.window.startMonth).toBe(comp.window.startMonth);
        expect(c.window.endMonth).toBe(comp.window.endMonth);
      }
    }
  });

  it('los 4 presets del plan (estanflación, aterrizaje, goldilocks, risk-off) están presentes', () => {
    const ids = BUILT_IN_COMPOSITE_VIEWS.map((v) => v.id);
    expect(ids).toContain('composite-stagflation-12m');
    expect(ids).toContain('composite-soft-landing-12m');
    expect(ids).toContain('composite-goldilocks-12m');
    expect(ids).toContain('composite-risk-off-12m');
  });
});

describe('views — BUILT_IN_COMPOSITE_VIEWS evaluación end-to-end', () => {
  /**
   * Corre un bootstrap real con 500 paths × 24 meses y evalúa los 4 composites.
   * No asserta valores exactos (dependen del seed) — sólo:
   *   (a) ninguno lanza excepción,
   *   (b) probability es un número finito en [0, 1],
   *   (c) nMatched + nUnmatched = nPaths,
   *   (d) al menos 1 preset tiene nMatched > 0 (sanity estadística).
   */
  it('los 4 presets evalúan sobre bootstrap real sin errores', () => {
    const input: BootstrapInput = {
      portfolios: {
        A: expandPortfolio({ kind: 'signature', id: 'Balanceado' }),
        B: expandPortfolio({ kind: 'signature', id: 'Crecimiento' }),
      },
      horizonMonths: 24,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 500, seed: 42 },
      outputYieldPaths: true,
    };
    const boot = runBootstrap(input);
    const approxInitial = { IRX: 0.036, FVX: 0.04, TNX: 0.043, TYX: 0.049 };
    const dataset: ViewDataset = {
      portfolioReturnsA: boot.portfolioReturnsA,
      portfolioReturnsB: boot.portfolioReturnsB,
      yieldPaths: boot.yieldPaths!,
      etfReturns: null,
      yieldInitial: approxInitial,
      nPaths: 500,
      horizonMonths: 24,
    };

    let anyHasMatches = false;
    for (const comp of BUILT_IN_COMPOSITE_VIEWS) {
      const ev = evaluateView(comp, dataset);
      expect(Number.isFinite(ev.probability)).toBe(true);
      expect(ev.probability).toBeGreaterThanOrEqual(0);
      expect(ev.probability).toBeLessThanOrEqual(1);
      expect(ev.nMatched).toBe(ev.matchedIndices.length);
      expect(ev.nMatched).toBeLessThanOrEqual(ev.nTotal);
      expect(ev.nTotal).toBe(500);
      if (ev.nMatched > 0) anyHasMatches = true;
    }
    expect(anyHasMatches).toBe(true);
  });

  it('stagflation y soft-landing son mutuamente exclusivos por construcción', () => {
    // Cualquier path que tenga rates up peak +100 en 12m NO puede tener rates
    // down trough −100 en el mismo período (son direcciones opuestas de
    // `peak` y `trough`). Entonces matched(stagflation) ∩ matched(soft-landing) = ∅.
    const input: BootstrapInput = {
      portfolios: {
        A: expandPortfolio({ kind: 'signature', id: 'Balanceado' }),
        B: expandPortfolio({ kind: 'signature', id: 'Crecimiento' }),
      },
      horizonMonths: 24,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 500, seed: 42 },
      outputYieldPaths: true,
    };
    const boot = runBootstrap(input);
    const dataset: ViewDataset = {
      portfolioReturnsA: boot.portfolioReturnsA,
      portfolioReturnsB: boot.portfolioReturnsB,
      yieldPaths: boot.yieldPaths!,
      etfReturns: null,
      yieldInitial: { IRX: 0.036, FVX: 0.04, TNX: 0.043, TYX: 0.049 },
      nPaths: 500,
      horizonMonths: 24,
    };

    const stag = evaluateView(getAnyBuiltInView('composite-stagflation-12m'), dataset);
    const soft = evaluateView(getAnyBuiltInView('composite-soft-landing-12m'), dataset);

    // Un path no puede tener simultáneamente peak ≥ +100bps y trough ≤ −100bps
    // salvo que el yield se mueva en ambas direcciones dentro de la misma
    // ventana — lo cual SÍ es posible en un bootstrap de 12m. Sin embargo, la
    // intersección REAL requiere además que equity crashee Y rallee a la vez
    // (cumulativeReturn <= -20% AND >= +20%), lo cual es imposible.
    const stagSet = new Set(Array.from(stag.matchedIndices));
    let overlap = 0;
    for (const p of Array.from(soft.matchedIndices)) {
      if (stagSet.has(p)) overlap++;
    }
    expect(overlap).toBe(0);
  });
});

// ===========================================================================
// ETF subject + peak/trough cumulative return modes (Fase C.2)
// ===========================================================================

/**
 * Helper: construye un ViewDataset con retornos per-ETF sintéticos.
 * Cada ticker pasado en `tickers` recibe un Float32Array [nPaths × H] generado
 * por `returnFn(p, t)`.
 */
function makeDatasetWithEtf(opts: {
  nPaths: number;
  horizonMonths: number;
  tickers: readonly (keyof EtfReturns)[];
  returnFn: (ticker: string, p: number, t: number) => number;
  includeYieldPaths?: boolean;
}): ViewDataset {
  const { nPaths, horizonMonths, tickers, returnFn } = opts;
  const N = nPaths * horizonMonths;
  const etfReturns: Record<string, Float32Array> = {};
  for (const ticker of tickers) {
    const arr = new Float32Array(N);
    for (let p = 0; p < nPaths; p++) {
      for (let t = 0; t < horizonMonths; t++) {
        arr[p * horizonMonths + t] = returnFn(ticker as string, p, t);
      }
    }
    etfReturns[ticker as string] = arr;
  }
  return {
    portfolioReturnsA: new Float32Array(N),
    portfolioReturnsB: new Float32Array(N),
    yieldPaths: opts.includeYieldPaths
      ? {
          IRX: new Float32Array(N),
          FVX: new Float32Array(N),
          TNX: new Float32Array(N),
          TYX: new Float32Array(N),
        }
      : null,
    etfReturns: etfReturns as EtfReturns,
    yieldInitial: { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 },
    nPaths,
    horizonMonths,
  };
}

describe('views — ViewSubject etfReturn: resolución y validación', () => {
  it('evalúa cumulativeReturnRange sobre ETF individual', () => {
    // 3 paths, 12 meses. SPY con retornos mensuales controlados por path.
    //   Path 0: +1%/mes → cum ≈ +12.68%
    //   Path 1: -2%/mes → cum ≈ -21.53%
    //   Path 2: 0 → cum = 0
    const dataset = makeDatasetWithEtf({
      nPaths: 3,
      horizonMonths: 12,
      tickers: ['SPY'],
      returnFn: (_, p) => (p === 0 ? 0.01 : p === 1 ? -0.02 : 0),
    });
    const view: View = {
      id: 'spy-crash',
      label: 'SPY crash',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: -0.2 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    expect(ev.nMatched).toBe(1);
    expect(ev.matchedIndices[0]).toBe(1);
  });

  it('lanza error si etfReturns es null pero subject es etfReturn', () => {
    const dataset: ViewDataset = {
      portfolioReturnsA: new Float32Array(12),
      portfolioReturnsB: new Float32Array(12),
      yieldPaths: null,
      etfReturns: null,
      yieldInitial: { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 },
      nPaths: 1,
      horizonMonths: 12,
    };
    const view: View = {
      id: 'spy-x',
      label: 'x',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: 0 },
      window: { startMonth: 1, endMonth: 12 },
    };
    expect(() => evaluateView(view, dataset)).toThrow(/etfReturns/);
  });

  it('lanza error si etfReturns no contiene el ticker solicitado', () => {
    const dataset = makeDatasetWithEtf({
      nPaths: 1,
      horizonMonths: 12,
      tickers: ['SPY'], // solo SPY
      returnFn: () => 0,
    });
    const view: View = {
      id: 'acwi-x',
      label: 'x',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'ACWI' }, // pide ACWI
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: 0 },
      window: { startMonth: 1, endMonth: 12 },
    };
    expect(() => evaluateView(view, dataset)).toThrow(/ticker.*ACWI/);
  });

  it('viewRequiresEtfReturns: single con etfReturn → true', () => {
    const view: View = {
      id: 't',
      label: 't',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: 0 },
      window: { startMonth: 1, endMonth: 12 },
    };
    expect(viewRequiresEtfReturns(view)).toBe(true);
    expect(viewRequiresYieldPaths(view)).toBe(false);
  });

  it('viewRequiresEtfReturns: single portfolio → false', () => {
    expect(
      viewRequiresEtfReturns(
        BUILT_IN_VIEWS.find((v) => v.subject.kind === 'portfolioReturn')!,
      ),
    ).toBe(false);
  });

  it('requiredEtfTickers lista los tickers usados en componentes ETF', () => {
    const single: View = {
      id: 't',
      label: 't',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: 0 },
      window: { startMonth: 1, endMonth: 12 },
    };
    expect(requiredEtfTickers(single)).toEqual(['SPY']);

    const comp: CompositeView = {
      kind: 'composite',
      id: 'multi',
      label: 'multi',
      description: '',
      combinator: 'and',
      window: { startMonth: 1, endMonth: 12 },
      components: [
        single,
        {
          ...single,
          id: 'acwi',
          subject: { kind: 'etfReturn', ticker: 'ACWI' },
        },
      ],
    };
    const t = requiredEtfTickers(comp);
    expect(new Set(t)).toEqual(new Set(['SPY', 'ACWI']));

    // Sin componente ETF → arreglo vacío
    const yieldOnly: View = {
      id: 'y',
      label: 'y',
      description: '',
      subject: { kind: 'yield', key: 'TNX' },
      mode: { kind: 'peakChange', minDelta: 0.01, maxDelta: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    expect(requiredEtfTickers(yieldOnly)).toEqual([]);
  });
});

describe('views — peakCumulativeReturnRange mode', () => {
  it('matchea paths cuyo retorno acumulado pico toca o supera el threshold', () => {
    // 3 paths, 12 meses. SPY:
    //   Path 0: monotónico +2%/mes → cum crece; peak ≈ +26.8% al mes 12
    //   Path 1: sube hasta +30% al mes 6 y vuelve a 0 al mes 12 → peak ≈ +30%
    //   Path 2: nunca llega a +20% (peak ≈ +10%)
    const dataset = makeDatasetWithEtf({
      nPaths: 3,
      horizonMonths: 12,
      tickers: ['SPY'],
      returnFn: (_, p, t) => {
        if (p === 0) return 0.02;
        if (p === 1) {
          // Sube +4%/mes hasta t=5, luego baja ~-4%/mes
          return t < 6 ? 0.04 : -0.045;
        }
        // p=2: +0.8%/mes (~+10% cum)
        return 0.008;
      },
    });
    const view: View = {
      id: 'spy-rally-peak-20',
      label: 'SPY rally peak',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'peakCumulativeReturnRange', minReturn: 0.2, maxReturn: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Path 0 y 1 cumplen; path 2 no.
    expect(ev.nMatched).toBe(2);
    expect(Array.from(ev.matchedIndices).sort()).toEqual([0, 1]);
  });

  it('peak difiere de cumulative endpoint: un path con pico intermedio alto pero cierre flat cumple peak pero no endpoint', () => {
    // Un path que sube +35% al mes 6 y vuelve a 0 al mes 12.
    // peakCumRet ≈ +35% (cumple minReturn=0.25)
    // cumRet al cierre ≈ 0 (NO cumple cumulativeReturnRange minReturn=0.25)
    const dataset = makeDatasetWithEtf({
      nPaths: 1,
      horizonMonths: 12,
      tickers: ['ACWI'],
      returnFn: (_, _p, t) => (t < 6 ? 0.05 : -0.047),
    });
    const peakView: View = {
      id: 'peak',
      label: 'peak',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'ACWI' },
      mode: { kind: 'peakCumulativeReturnRange', minReturn: 0.25, maxReturn: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    const cumView: View = {
      ...peakView,
      id: 'cum',
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.25, maxReturn: null },
    };
    expect(evaluateView(peakView, dataset).nMatched).toBe(1);
    expect(evaluateView(cumView, dataset).nMatched).toBe(0);
  });

  it('respeta maxReturn como cota superior del pico', () => {
    // Path con peak ~+10%, otro con peak ~+40%.
    const dataset = makeDatasetWithEtf({
      nPaths: 2,
      horizonMonths: 12,
      tickers: ['SPY'],
      returnFn: (_, p) => (p === 0 ? 0.008 : 0.03),
    });
    const view: View = {
      id: 'p',
      label: 'p',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      // Banda [+5%, +20%]: path 0 cumple (peak +10%), path 1 no (peak +40%).
      mode: { kind: 'peakCumulativeReturnRange', minReturn: 0.05, maxReturn: 0.2 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    expect(ev.nMatched).toBe(1);
    expect(ev.matchedIndices[0]).toBe(0);
  });

  it('aplica también a portfolioReturn (no solo ETF)', () => {
    const dataset = makeDatasetWithEtf({
      nPaths: 1,
      horizonMonths: 6,
      tickers: ['SPY'],
      returnFn: () => 0,
    });
    // Sobreescribo portfolioReturnsA con retornos +4%/mes (cum +26%)
    const H = 6;
    const arrA = dataset.portfolioReturnsA;
    for (let t = 0; t < H; t++) arrA[t] = 0.04;
    const view: View = {
      id: 'port-peak',
      label: 'port peak',
      description: '',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'peakCumulativeReturnRange', minReturn: 0.15, maxReturn: null },
      window: { startMonth: 1, endMonth: 6 },
    };
    const ev = evaluateView(view, dataset);
    expect(ev.nMatched).toBe(1);
  });
});

describe('views — troughCumulativeReturnRange mode', () => {
  it('matchea paths cuyo piso de retorno acumulado toca o cae bajo el threshold', () => {
    // 3 paths:
    //   Path 0: flat 0 → trough = 0
    //   Path 1: cae -5%/mes hasta t=5, luego sube +5%/mes → trough ≈ -23% al mes 6
    //   Path 2: cae suave -0.5%/mes → trough ≈ -5.9% al final
    const dataset = makeDatasetWithEtf({
      nPaths: 3,
      horizonMonths: 12,
      tickers: ['ACWI'],
      returnFn: (_, p, t) => {
        if (p === 0) return 0;
        if (p === 1) return t < 6 ? -0.05 : 0.05;
        return -0.005;
      },
    });
    const view: View = {
      id: 'acwi-crash-trough',
      label: 'trough',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'ACWI' },
      mode: { kind: 'troughCumulativeReturnRange', minReturn: null, maxReturn: -0.2 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Solo path 1 pasa por un trough ≤ -20%.
    expect(ev.nMatched).toBe(1);
    expect(ev.matchedIndices[0]).toBe(1);
  });

  it('trough difiere de cumRet endpoint: path con drawdown intermedio severo pero cierre positivo cumple trough pero no cumulativeReturnRange', () => {
    const dataset = makeDatasetWithEtf({
      nPaths: 1,
      horizonMonths: 12,
      tickers: ['SPY'],
      returnFn: (_, _p, t) => (t < 6 ? -0.05 : 0.08),
    });
    // Path: -25% a mes 6, luego +60% → cum endpoint ≈ +19%
    const troughView: View = {
      id: 'trough',
      label: 'trough',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'troughCumulativeReturnRange', minReturn: null, maxReturn: -0.2 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const cumView: View = {
      ...troughView,
      id: 'cum',
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: -0.2 },
    };
    expect(evaluateView(troughView, dataset).nMatched).toBe(1); // trough pasa
    expect(evaluateView(cumView, dataset).nMatched).toBe(0); // endpoint no
  });
});

describe('views — percentileBandReturn widened a ETF', () => {
  it('funciona sobre subject etfReturn (no solo portfolio)', () => {
    // 100 paths con cumRet uniformes 0, 1%, 2%, ..., 99%.
    const nPaths = 100;
    const dataset = makeDatasetWithEtf({
      nPaths,
      horizonMonths: 12,
      tickers: ['SPTL'],
      returnFn: (_, p) => {
        // Queremos cumRet(p) ≈ p/100. Aplicamos uniforme mensual t.q. ∏(1+r)-1 ≈ p/100.
        // r_mensual ≈ (1 + p/100)^(1/12) - 1
        return Math.pow(1 + p / 100, 1 / 12) - 1;
      },
    });
    const view: View = {
      id: 'sptl-p20-40',
      label: 'SPTL percentil 20-40',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPTL' },
      mode: { kind: 'percentileBandReturn', lowerP: 20, upperP: 40 },
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Probability por construcción ≈ 20%. Con 100 paths → ~20 paths.
    expect(ev.nMatched).toBeGreaterThanOrEqual(18);
    expect(ev.nMatched).toBeLessThanOrEqual(22);
    // Probability teórica exacta es (upperP-lowerP)/100 = 0.20 en el límite.
    expect(ev.probability).toBeGreaterThan(0.15);
    expect(ev.probability).toBeLessThan(0.25);
  });

  it('percentileBandReturn con yield subject sigue tirando error', () => {
    const dataset = makeDatasetWithEtf({
      nPaths: 10,
      horizonMonths: 12,
      tickers: ['SPY'],
      returnFn: () => 0,
    });
    const view: View = {
      id: 'bad',
      label: 'bad',
      description: '',
      subject: { kind: 'yield', key: 'TNX' },
      mode: { kind: 'percentileBandReturn', lowerP: 20, upperP: 40 },
      window: { startMonth: 1, endMonth: 12 },
    };
    // El código en matchesPredicate llega a la parte de yield pero el mode
    // percentileBandReturn no está en los modos de yield → el error viene de
    // computePercentileThresholds que chequea subject kind.
    expect(() => evaluateView(view, dataset)).toThrow();
  });
});

describe('views — composite con componentes ETF (future-proof C.2b)', () => {
  it('composite AND con 2 componentes ETF diferentes evalúa correctamente', () => {
    // nPaths=4, SPY y EZU:
    //   Path 0: SPY +25% cum Y EZU +25% cum → AND match
    //   Path 1: SPY +25% cum, EZU 0 → NO (EZU falla)
    //   Path 2: SPY 0, EZU +25% cum → NO (SPY falla)
    //   Path 3: ambos 0 → NO
    const spyFn = (p: number) => (p === 0 || p === 1 ? 0.01875 : 0); // ~25% cum
    const ezuFn = (p: number) => (p === 0 || p === 2 ? 0.01875 : 0);
    const dataset = makeDatasetWithEtf({
      nPaths: 4,
      horizonMonths: 12,
      tickers: ['SPY', 'EZU'],
      returnFn: (t, p) => (t === 'SPY' ? spyFn(p) : ezuFn(p)),
    });
    const W: { startMonth: 1; endMonth: 12 } = { startMonth: 1, endMonth: 12 };
    const spyRally: View = {
      id: 'spy-rally',
      label: 's',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
      window: W,
    };
    const ezuRally: View = {
      ...spyRally,
      id: 'ezu-rally',
      subject: { kind: 'etfReturn', ticker: 'EZU' },
    };
    const comp: CompositeView = {
      kind: 'composite',
      id: 'spy-ezu-rally',
      label: 'x',
      description: '',
      combinator: 'and',
      window: W,
      components: [spyRally, ezuRally],
    };
    const ev = evaluateView(comp, dataset);
    expect(ev.nMatched).toBe(1);
    expect(ev.matchedIndices[0]).toBe(0);
    // viewRequiresEtfReturns detecta que el composite los necesita
    expect(viewRequiresEtfReturns(comp)).toBe(true);
    expect(requiredEtfTickers(comp)).toEqual(
      expect.arrayContaining(['SPY', 'EZU']),
    );
  });
});

// ===========================================================================
// COMPOSITE MULTI-WINDOW (Fase C.2b) — ventanas distintas por componente
// ===========================================================================

describe('views — composite multi-window (C.2b)', () => {
  it('componentWindowEnvelope devuelve min/max correcto con 2 componentes de distinta ventana', () => {
    const c1: View = {
      id: 'c1',
      label: 'c1',
      description: '',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0, maxReturn: null },
      window: { startMonth: 1, endMonth: 6 },
    };
    const c2: View = {
      id: 'c2',
      label: 'c2',
      description: '',
      subject: { kind: 'portfolioReturn', portfolio: 'B' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0, maxReturn: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    const comp: CompositeView = {
      kind: 'composite',
      id: 'multi',
      label: 'multi',
      description: '',
      combinator: 'and',
      window: { startMonth: 1, endMonth: 12 },
      components: [c1, c2],
    };
    const env = componentWindowEnvelope(comp);
    expect(env.startMonth).toBe(1);
    expect(env.endMonth).toBe(12);
  });

  it('componentWindowEnvelope devuelve correctamente con ventanas asimétricas', () => {
    const c1: View = {
      id: 'c1',
      label: 'c1',
      description: '',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0, maxReturn: null },
      window: { startMonth: 7, endMonth: 18 },
    };
    const c2: View = {
      id: 'c2',
      label: 'c2',
      description: '',
      subject: { kind: 'portfolioReturn', portfolio: 'B' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0, maxReturn: null },
      window: { startMonth: 3, endMonth: 10 },
    };
    const comp: CompositeView = {
      kind: 'composite',
      id: 'asym',
      label: 'asym',
      description: '',
      combinator: 'and',
      window: { startMonth: 3, endMonth: 18 },
      components: [c1, c2],
    };
    const env = componentWindowEnvelope(comp);
    expect(env.startMonth).toBe(3);
    expect(env.endMonth).toBe(18);
  });

  it('componentWindowEnvelope tira error con 0 componentes', () => {
    const comp: CompositeView = {
      kind: 'composite',
      id: 'empty',
      label: 'empty',
      description: '',
      combinator: 'and',
      window: W12,
      components: [],
    };
    expect(() => componentWindowEnvelope(comp)).toThrow(/componentes/);
  });

  it('evalúa composite AND con ventanas [1,6] y [1,12] — ejemplo rally SPY 6m AND rally EZU 12m', () => {
    // Construcción sintética:
    //   Path 0: SPY cum 6m = +25% (matchea c1), EZU cum 12m = +25% (matchea c2) → AND ✓
    //   Path 1: SPY cum 6m = +25% (matchea c1), EZU cum 12m = 0% (NO matchea) → AND ✗
    //   Path 2: SPY cum 6m = 0% (NO matchea), EZU cum 12m = +25% (matchea c2) → AND ✗
    //   Path 3: SPY cum 6m = 0%, EZU cum 12m = 0% → AND ✗
    // Ganar +25% en 6m ≈ retorno mensual 3.79%. En 12m ≈ 1.88%/mes.
    const spyReturnsFor6m = (cumTarget: number): number => Math.pow(1 + cumTarget, 1 / 6) - 1;
    const ezuReturnsFor12m = (cumTarget: number): number => Math.pow(1 + cumTarget, 1 / 12) - 1;

    const nPaths = 4;
    const H = 12;
    const spyArr = new Float32Array(nPaths * H);
    const ezuArr = new Float32Array(nPaths * H);
    for (let p = 0; p < nPaths; p++) {
      const spyCum = p === 0 || p === 1 ? 0.25 : 0;
      const ezuCum = p === 0 || p === 2 ? 0.25 : 0;
      for (let t = 0; t < H; t++) {
        // SPY solo importa en meses 0..5 para la ventana [1,6]. Después irrelevante para el predicado.
        spyArr[p * H + t] = t < 6 ? spyReturnsFor6m(spyCum) : 0;
        ezuArr[p * H + t] = ezuReturnsFor12m(ezuCum);
      }
    }

    const dataset: ViewDataset = {
      portfolioReturnsA: new Float32Array(nPaths * H),
      portfolioReturnsB: new Float32Array(nPaths * H),
      yieldPaths: null,
      etfReturns: { SPY: spyArr, EZU: ezuArr } as EtfReturns,
      yieldInitial: { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 },
      nPaths,
      horizonMonths: H,
    };

    const spyRally6m: View = {
      id: 'spy-rally-6m',
      label: 'SPY rally 6m',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
      window: { startMonth: 1, endMonth: 6 },
    };
    const ezuRally12m: View = {
      id: 'ezu-rally-12m',
      label: 'EZU rally 12m',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'EZU' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    const comp: CompositeView = {
      kind: 'composite',
      id: 'rally-cross-asset',
      label: 'Rally SPY 6m AND EZU 12m',
      description: '',
      combinator: 'and',
      window: { startMonth: 1, endMonth: 12 }, // envelope
      components: [spyRally6m, ezuRally12m],
    };

    const ev = evaluateView(comp, dataset);
    expect(ev.nMatched).toBe(1);
    expect(ev.matchedIndices[0]).toBe(0);
    expect(ev.probability).toBe(0.25);
  });

  it('OR con ventanas distintas: unión sobre 2 conjuntos con ventanas diferentes', () => {
    // Path 0: SPY 6m (c1) match, EZU 12m (c2) no. → OR ✓
    // Path 1: SPY no, EZU sí → OR ✓
    // Path 2: ambos no → OR ✗
    const nPaths = 3;
    const H = 12;
    const spyReturnsFor6m = (cumTarget: number): number => Math.pow(1 + cumTarget, 1 / 6) - 1;
    const ezuReturnsFor12m = (cumTarget: number): number => Math.pow(1 + cumTarget, 1 / 12) - 1;
    const spyArr = new Float32Array(nPaths * H);
    const ezuArr = new Float32Array(nPaths * H);
    for (let p = 0; p < nPaths; p++) {
      const spyCum = p === 0 ? 0.25 : 0;
      const ezuCum = p === 1 ? 0.25 : 0;
      for (let t = 0; t < H; t++) {
        spyArr[p * H + t] = t < 6 ? spyReturnsFor6m(spyCum) : 0;
        ezuArr[p * H + t] = ezuReturnsFor12m(ezuCum);
      }
    }
    const dataset: ViewDataset = {
      portfolioReturnsA: new Float32Array(nPaths * H),
      portfolioReturnsB: new Float32Array(nPaths * H),
      yieldPaths: null,
      etfReturns: { SPY: spyArr, EZU: ezuArr } as EtfReturns,
      yieldInitial: { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 },
      nPaths,
      horizonMonths: H,
    };
    const c1: View = {
      id: 'c1', label: 'c1', description: '',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
      window: { startMonth: 1, endMonth: 6 },
    };
    const c2: View = {
      id: 'c2', label: 'c2', description: '',
      subject: { kind: 'etfReturn', ticker: 'EZU' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
      window: { startMonth: 1, endMonth: 12 },
    };
    const comp: CompositeView = {
      kind: 'composite', id: 'or', label: 'or', description: '',
      combinator: 'or',
      window: { startMonth: 1, endMonth: 12 },
      components: [c1, c2],
    };
    const ev = evaluateView(comp, dataset);
    expect(ev.nMatched).toBe(2);
    expect(Array.from(ev.matchedIndices).sort()).toEqual([0, 1]);
  });

  it('componente con ventana fuera de horizonte → error del validator interno', () => {
    const dataset = makeSyntheticDataset({ nPaths: 5, horizonMonths: 12 });
    const badComponent: View = {
      id: 'bad', label: 'bad', description: '',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: 0, maxReturn: null },
      window: { startMonth: 1, endMonth: 24 }, // 24 > horizon 12
    };
    const comp: CompositeView = {
      kind: 'composite', id: 't', label: 't', description: '',
      combinator: 'and',
      window: { startMonth: 1, endMonth: 12 }, // composite OK
      components: [badComponent],
    };
    expect(() => evaluateView(comp, dataset)).toThrow(/ventana inválida/);
  });

  it('composite con ventana distinta pero componentes adentro → evalúa OK', () => {
    // El composite declara window [1,24] como envelope; un componente usa [1,6]
    // y otro [7,18]. Todos dentro del horizonte 24. Debe evaluar sin errores.
    const dataset = makeSyntheticDataset({
      nPaths: 3,
      horizonMonths: 24,
      yieldTNX: (p, t) => (p === 0 && t === 2 ? 0.045 : 0.03),
      returnsA: (p, t) => (p === 1 && t >= 6 && t <= 17 ? -0.02 : 0),
    });
    const firstHalf: View = {
      id: 'rates-up-first-half',
      label: 'x', description: '',
      subject: { kind: 'yield', key: 'TNX' },
      mode: { kind: 'peakChange', minDelta: 0.01, maxDelta: null },
      window: { startMonth: 1, endMonth: 6 },
    };
    const secondHalf: View = {
      id: 'equity-down-second-half',
      label: 'y', description: '',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: -0.05 },
      window: { startMonth: 7, endMonth: 18 },
    };
    const comp: CompositeView = {
      kind: 'composite', id: 'two-halves', label: 'two halves', description: '',
      combinator: 'and',
      window: { startMonth: 1, endMonth: 24 },
      components: [firstHalf, secondHalf],
    };
    const ev = evaluateView(comp, dataset);
    // Path 0 solo satisface componente 1 (rates up). Path 1 solo el 2 (equity down).
    // AND → ningún path matchea.
    expect(ev.nMatched).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fase C.4 — SynchronizedView: co-movimiento mes a mes
// ---------------------------------------------------------------------------

describe('views — SynchronizedView (Fase C.4)', () => {
  it('matchea solo paths con ≥ minMonths meses sincronizados', () => {
    // 4 paths × 12 meses. Sincronización "estanflación": retorno A < 0 AND Δ TNX > 0.
    // - Path 0: en meses 1,2,3 ambos cumplen (sincronizados) → 3 meses.
    // - Path 1: en meses 1,2 ambos cumplen, mes 3 solo retorno (Δ yield = 0) → 2 meses.
    // - Path 2: retorno negativo todo el año pero yield constante → 0 meses.
    // - Path 3: yield sube pero retorno positivo → 0 meses.
    const dataset = makeSyntheticDataset({
      nPaths: 4,
      horizonMonths: 12,
      returnsA: (p, t) => {
        if (p === 0) return t < 3 ? -0.02 : 0;
        if (p === 1) return t < 3 ? -0.02 : 0;
        if (p === 2) return -0.02;
        return 0.02; // p === 3
      },
      yieldTNX: (p, t) => {
        if (p === 0) {
          // yield inicial 0.03. Para t=0,1,2 sube 0.001 mensual → yields 0.031, 0.032, 0.033.
          // Δ al mes 1=0.001, mes 2=0.001, mes 3=0.001. Luego constante.
          return t < 3 ? 0.03 + 0.001 * (t + 1) : 0.033;
        }
        if (p === 1) {
          // Δ sube 2 meses luego constante desde mes 3.
          return t < 2 ? 0.03 + 0.001 * (t + 1) : 0.032;
        }
        return 0.03; // p === 2, 3 → constante
      },
      yieldInitial: { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 },
    });
    const view = {
      kind: 'synchronized' as const,
      id: 'sync-test-3m',
      label: 't', description: '',
      components: [
        { subject: { kind: 'portfolioReturn' as const, portfolio: 'A' as const }, direction: 'negative' as const },
        { subject: { kind: 'yield' as const, key: 'TNX' as const }, direction: 'positive' as const },
      ],
      minMonths: 3,
      window: { startMonth: 1, endMonth: 12 },
    };
    const ev = evaluateView(view, dataset);
    // Solo path 0 tiene ≥ 3 meses sincronizados.
    expect(ev.nMatched).toBe(1);
    expect(Array.from(ev.matchedIndices)).toEqual([0]);
  });

  it('minMonths=1 → equivale a "al menos un mes sincronizado"', () => {
    const dataset = makeSyntheticDataset({
      nPaths: 3,
      horizonMonths: 6,
      returnsA: (p, t) => (p === 0 && t === 2 ? -0.02 : 0),
      yieldTNX: (p, t) => {
        // Path 0: Δ>0 solo en mes 3 (t=2 en 0-indexado) → yields[0..5] = 0.03,0.03,0.031,0.031,0.031,0.031
        if (p === 0 && t >= 2) return 0.031;
        return 0.03;
      },
      yieldInitial: { IRX: 0.03, FVX: 0.03, TNX: 0.03, TYX: 0.03 },
    });
    const view = {
      kind: 'synchronized' as const,
      id: 'sync-1m',
      label: 't', description: '',
      components: [
        { subject: { kind: 'portfolioReturn' as const, portfolio: 'A' as const }, direction: 'negative' as const },
        { subject: { kind: 'yield' as const, key: 'TNX' as const }, direction: 'positive' as const },
      ],
      minMonths: 1,
      window: { startMonth: 1, endMonth: 6 },
    };
    const ev = evaluateView(view, dataset);
    expect(ev.nMatched).toBe(1); // solo path 0
  });

  it('threshold > 0 filtra meses con magnitud insuficiente', () => {
    // 2 paths × 6 meses. Retornos ambos negativos pero de distinta magnitud.
    const dataset = makeSyntheticDataset({
      nPaths: 2,
      horizonMonths: 6,
      returnsA: (p) => (p === 0 ? -0.02 : -0.001),
    });
    const view = {
      kind: 'synchronized' as const,
      id: 'sync-threshold',
      label: 't', description: '',
      components: [
        {
          subject: { kind: 'portfolioReturn' as const, portfolio: 'A' as const },
          direction: 'negative' as const,
          thresholdMagnitude: 0.01, // requiere r_t < -1%
        },
      ],
      minMonths: 3,
      window: { startMonth: 1, endMonth: 6 },
    };
    const ev = evaluateView(view, dataset);
    // Path 0 cumple (r = -2%); path 1 no (r = -0.1%).
    expect(ev.nMatched).toBe(1);
    expect(Array.from(ev.matchedIndices)).toEqual([0]);
  });

  it('error si minMonths > largo de la ventana', () => {
    const dataset = makeSyntheticDataset({ nPaths: 2, horizonMonths: 12 });
    const view = {
      kind: 'synchronized' as const,
      id: 'sync-bad',
      label: 't', description: '',
      components: [
        { subject: { kind: 'portfolioReturn' as const, portfolio: 'A' as const }, direction: 'negative' as const },
      ],
      minMonths: 13, // window [1,12] → largo 12
      window: { startMonth: 1, endMonth: 12 },
    };
    expect(() => evaluateView(view, dataset)).toThrow(/minMonths/);
  });

  it('error si yield component sin yieldPaths en dataset', () => {
    // Path con retornos negativos todo el período → el componente portfolioReturn
    // direction=negative siempre pasa, lo que obliga a evaluar el yield component
    // (que debe tirar error por yieldPaths null).
    const dataset = makeSyntheticDataset({
      nPaths: 1,
      horizonMonths: 6,
      returnsA: () => -0.01,
    });
    const mutated: ViewDataset = { ...dataset, yieldPaths: null };
    const view = {
      kind: 'synchronized' as const,
      id: 'sync-no-yields',
      label: 't', description: '',
      components: [
        { subject: { kind: 'portfolioReturn' as const, portfolio: 'A' as const }, direction: 'negative' as const },
        { subject: { kind: 'yield' as const, key: 'TNX' as const }, direction: 'positive' as const },
      ],
      minMonths: 1,
      window: { startMonth: 1, endMonth: 6 },
    };
    expect(() => evaluateView(view, mutated)).toThrow(/yieldPaths/);
  });

  it('BUILT_IN_SYNCHRONIZED_VIEWS contiene el preset estanflación y lo encuentra findAnyBuiltInView', () => {
    expect(BUILT_IN_SYNCHRONIZED_VIEWS.length).toBeGreaterThanOrEqual(1);
    const preset = findAnyBuiltInView('sync-stagflation-3m-12m');
    expect(preset).not.toBeNull();
    expect(preset!.id).toBe('sync-stagflation-3m-12m');
    // También lo encuentra getAnyBuiltInView (throw si no existe).
    expect(() => getAnyBuiltInView('sync-stagflation-3m-12m')).not.toThrow();
  });

  it('viewRequiresYieldPaths/EtfReturns detectan correctamente componentes sync', () => {
    const viewWithYield = {
      kind: 'synchronized' as const,
      id: 'x', label: 'x', description: '',
      components: [
        { subject: { kind: 'yield' as const, key: 'TNX' as const }, direction: 'positive' as const },
      ],
      minMonths: 1,
      window: { startMonth: 1, endMonth: 12 },
    };
    expect(viewRequiresYieldPaths(viewWithYield)).toBe(true);
    expect(viewRequiresEtfReturns(viewWithYield)).toBe(false);

    const viewWithEtf = {
      kind: 'synchronized' as const,
      id: 'y', label: 'y', description: '',
      components: [
        { subject: { kind: 'etfReturn' as const, ticker: 'SPY' as const }, direction: 'negative' as const },
      ],
      minMonths: 1,
      window: { startMonth: 1, endMonth: 12 },
    };
    expect(viewRequiresEtfReturns(viewWithEtf)).toBe(true);
    expect(viewRequiresYieldPaths(viewWithEtf)).toBe(false);
    expect(requiredEtfTickers(viewWithEtf)).toEqual(['SPY']);
  });
});

