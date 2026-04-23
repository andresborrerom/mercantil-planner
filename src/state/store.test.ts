/**
 * Tests del slice de Views del store Zustand.
 *
 * Cubre:
 *   - Estado inicial (sin view activo, sin yieldPaths).
 *   - Activar view antes de simular (→ viewError).
 *   - Activar preset id inválido (→ viewError).
 *   - Activar view de yield sin yieldPaths en la simulación (→ viewError).
 *   - Activar view de portfolio con simulación (→ analysis poblado).
 *   - Activar view de yield con yieldPaths (→ analysis poblado para A y B).
 *   - Cambiar ventana re-evalúa el view activo.
 *   - ingestSimulation re-evalúa el view si ya estaba activo.
 *   - resetSimulation limpia analysis/error pero preserva activeViewId.
 *   - setActiveView(null) limpia todo.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePlannerStore, type RawSimulationInput } from './store';

// ---------------------------------------------------------------------------
// Helpers para construir una simulación sintética
// ---------------------------------------------------------------------------

function makeSyntheticReturns(
  nPaths: number,
  horizonMonths: number,
  valueFn: (p: number, t: number) => number,
): Float32Array {
  const arr = new Float32Array(nPaths * horizonMonths);
  for (let p = 0; p < nPaths; p++) {
    for (let t = 0; t < horizonMonths; t++) {
      arr[p * horizonMonths + t] = valueFn(p, t);
    }
  }
  return arr;
}

function makeSyntheticYields(
  nPaths: number,
  horizonMonths: number,
  valueFn: (p: number, t: number) => number,
) {
  return {
    IRX: makeSyntheticReturns(nPaths, horizonMonths, valueFn),
    FVX: makeSyntheticReturns(nPaths, horizonMonths, valueFn),
    TNX: makeSyntheticReturns(nPaths, horizonMonths, valueFn),
    TYX: makeSyntheticReturns(nPaths, horizonMonths, valueFn),
  };
}

function buildRawSim(
  opts: {
    nPaths?: number;
    horizonMonths?: number;
    returnFn?: (p: number, t: number) => number;
    includeYieldPaths?: boolean;
    yieldFn?: (p: number, t: number) => number;
  } = {},
): RawSimulationInput {
  const nPaths = opts.nPaths ?? 100;
  const horizonMonths = opts.horizonMonths ?? 60;
  const returnFn = opts.returnFn ?? (() => 0.005);
  const raw: RawSimulationInput = {
    portfolioReturnsA: makeSyntheticReturns(nPaths, horizonMonths, returnFn),
    portfolioReturnsB: makeSyntheticReturns(nPaths, horizonMonths, returnFn),
    nPaths,
    horizonMonths,
    elapsedMs: 42,
  };
  if (opts.includeYieldPaths) {
    raw.yieldPaths = makeSyntheticYields(
      nPaths,
      horizonMonths,
      opts.yieldFn ?? (() => 0.04),
    );
  }
  return raw;
}

// ---------------------------------------------------------------------------
// Reset del store antes de cada test (el store es singleton)
// ---------------------------------------------------------------------------

const INITIAL_STATE_SNAPSHOT = usePlannerStore.getState();

beforeEach(() => {
  // Reset a estado inicial. Preservamos las funciones de acción (son las mismas
  // referencias; cambian sólo los campos de datos).
  usePlannerStore.setState(
    {
      portfolioA: { kind: 'signature', id: 'Conservador' },
      portfolioB: { kind: 'signature', id: 'Balanceado' },
      plan: { ...INITIAL_STATE_SNAPSHOT.plan, horizonMonths: 60, rules: [] },
      window: { startMonth: 1, endMonth: 60 },
      status: 'idle',
      errorMessage: null,
      lastRunAt: null,
      lastElapsedMs: null,
      simA: null,
      simB: null,
      rawReturnsA: null,
      rawReturnsB: null,
      bandsA: null,
      bandsB: null,
      metricsA: null,
      metricsB: null,
      condBandsA: null,
      condBandsB: null,
      yieldPaths: null,
      etfReturns: null,
      activeViewId: null,
      viewAnalysisA: null,
      viewAnalysisB: null,
      viewError: null,
      showProposedAmcs: false,
    },
    false,
  );
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('store — estado inicial de views', () => {
  it('activeViewId null, análisis null, error null al arrancar', () => {
    const s = usePlannerStore.getState();
    expect(s.activeViewId).toBeNull();
    expect(s.viewAnalysisA).toBeNull();
    expect(s.viewAnalysisB).toBeNull();
    expect(s.viewError).toBeNull();
    expect(s.yieldPaths).toBeNull();
  });

  it('yieldInitial está pre-poblado con las 4 yields', () => {
    const s = usePlannerStore.getState();
    expect(s.yieldInitial.IRX).toBeTypeOf('number');
    expect(s.yieldInitial.FVX).toBeTypeOf('number');
    expect(s.yieldInitial.TNX).toBeTypeOf('number');
    expect(s.yieldInitial.TYX).toBeTypeOf('number');
    // Rangos realistas (2006-2026 yields fueron < 20% durante todo el período)
    expect(s.yieldInitial.TNX).toBeGreaterThan(0);
    expect(s.yieldInitial.TNX).toBeLessThan(0.2);
  });
});

describe('store — setActiveView sin simulación', () => {
  it('activar un preset válido antes de simular setea viewError legible', () => {
    const { setActiveView } = usePlannerStore.getState();
    setActiveView('portfolioA-rally-20-12m');
    const s = usePlannerStore.getState();
    expect(s.activeViewId).toBe('portfolioA-rally-20-12m');
    expect(s.viewError).toMatch(/simular/i);
    expect(s.viewAnalysisA).toBeNull();
    expect(s.viewAnalysisB).toBeNull();
  });

  it('id inválido setea error "no existe" y deja análisis en null', () => {
    const { setActiveView } = usePlannerStore.getState();
    setActiveView('preset-que-no-existe');
    const s = usePlannerStore.getState();
    expect(s.activeViewId).toBe('preset-que-no-existe');
    expect(s.viewError).toMatch(/no existe/i);
    expect(s.viewAnalysisA).toBeNull();
  });
});

describe('store — setActiveView con simulación pero sin yieldPaths', () => {
  beforeEach(() => {
    const { ingestSimulation } = usePlannerStore.getState();
    ingestSimulation(buildRawSim({ includeYieldPaths: false }));
  });

  it('activar view de portfolio funciona', () => {
    const { setActiveView } = usePlannerStore.getState();
    setActiveView('portfolioA-flat-12m');
    const s = usePlannerStore.getState();
    expect(s.viewError).toBeNull();
    expect(s.viewAnalysisA).not.toBeNull();
    expect(s.viewAnalysisB).not.toBeNull();
    expect(s.viewAnalysisA!.evaluation.nTotal).toBe(100);
  });

  it('activar view de yield sin yieldPaths setea viewError legible', () => {
    const { setActiveView } = usePlannerStore.getState();
    setActiveView('rates-up-peak-100-12m');
    const s = usePlannerStore.getState();
    expect(s.viewError).toMatch(/yields? (simulados|requiere)/i);
    expect(s.viewAnalysisA).toBeNull();
    expect(s.viewAnalysisB).toBeNull();
  });
});

describe('store — setActiveView con simulación + yieldPaths', () => {
  beforeEach(() => {
    const { ingestSimulation } = usePlannerStore.getState();
    // Construimos una sim donde:
    //   - Todos los retornos son +1%/mes (cum a 12m ≈ 12.68%, dentro del rango flat)
    //   - Yield TNX sube linealmente hasta +0.5% (no alcanza el +100 pbs del preset)
    ingestSimulation(
      buildRawSim({
        returnFn: () => 0.01,
        includeYieldPaths: true,
        yieldFn: (_p, t) => 0.04 + 0.005 * ((t + 1) / 60),
      }),
    );
  });

  it('view de yield evaluable pobla analysisA y analysisB', () => {
    const { setActiveView } = usePlannerStore.getState();
    setActiveView('rates-up-peak-100-12m');
    const s = usePlannerStore.getState();
    expect(s.viewError).toBeNull();
    expect(s.viewAnalysisA).not.toBeNull();
    expect(s.viewAnalysisB).not.toBeNull();
    // Los yields no alcanzan +100 pbs → probabilidad debería ser 0
    expect(s.viewAnalysisA!.evaluation.probability).toBe(0);
    expect(s.viewAnalysisA!.matched).toBeNull(); // nada que matchear
    expect(s.viewAnalysisA!.unmatched).not.toBeNull(); // todos caen en unmatched
  });

  it('view de portfolio con rango [−5%, +5%] no matchea retornos cum ~12.7%', () => {
    const { setActiveView } = usePlannerStore.getState();
    setActiveView('portfolioA-flat-12m');
    const s = usePlannerStore.getState();
    expect(s.viewError).toBeNull();
    // Retornos constantes +1%/mes → cum 12m ≈ +12.68% → fuera de ±5%
    expect(s.viewAnalysisA!.evaluation.probability).toBe(0);
  });

  it('setActiveView(null) limpia todo', () => {
    const { setActiveView } = usePlannerStore.getState();
    setActiveView('portfolioA-flat-12m');
    setActiveView(null);
    const s = usePlannerStore.getState();
    expect(s.activeViewId).toBeNull();
    expect(s.viewAnalysisA).toBeNull();
    expect(s.viewAnalysisB).toBeNull();
    expect(s.viewError).toBeNull();
  });
});

describe('store — re-evaluación al cambiar ventana', () => {
  beforeEach(() => {
    const { ingestSimulation } = usePlannerStore.getState();
    ingestSimulation(
      buildRawSim({
        returnFn: (_p, t) => (t < 12 ? -0.02 : 0.01), // primer año negativo, resto positivo
      }),
    );
  });

  it('cambiar window re-evalúa el análisis del view activo', () => {
    const { setActiveView, setWindow } = usePlannerStore.getState();
    setActiveView('portfolioA-flat-12m');
    const beforeAnalysis = usePlannerStore.getState().viewAnalysisA;
    expect(beforeAnalysis).not.toBeNull();
    const beforeWindow = beforeAnalysis!.base.window;
    expect(beforeWindow.endMonth).toBe(60);

    // Cambiar ventana: debería cambiar la base de análisis
    setWindow({ startMonth: 1, endMonth: 24 });
    const afterAnalysis = usePlannerStore.getState().viewAnalysisA;
    expect(afterAnalysis).not.toBeNull();
    expect(afterAnalysis!.base.window.endMonth).toBe(24);
    // El número de paths total no cambia, pero las métricas sí
    expect(afterAnalysis!.base.nPaths).toBe(beforeAnalysis!.base.nPaths);
  });
});

describe('store — resetSimulation preserva activeViewId pero limpia análisis', () => {
  it('después de reset, activeViewId persiste y análisis quedan null', () => {
    const { ingestSimulation, setActiveView, resetSimulation } = usePlannerStore.getState();
    ingestSimulation(buildRawSim({}));
    setActiveView('portfolioA-flat-12m');
    expect(usePlannerStore.getState().viewAnalysisA).not.toBeNull();

    resetSimulation();
    const s = usePlannerStore.getState();
    expect(s.activeViewId).toBe('portfolioA-flat-12m'); // preservado
    expect(s.viewAnalysisA).toBeNull();
    expect(s.viewAnalysisB).toBeNull();
    expect(s.viewError).toBeNull();
    expect(s.yieldPaths).toBeNull();
  });
});

describe('store — ingestSimulation re-evalúa view activo', () => {
  it('si hay view activo, una nueva sim re-evalúa automáticamente', () => {
    const { setActiveView, ingestSimulation } = usePlannerStore.getState();

    // Activar view antes de simular → viewError
    setActiveView('portfolioA-flat-12m');
    expect(usePlannerStore.getState().viewError).not.toBeNull();

    // Ingestar simulación → viewError debe limpiarse y análisis poblarse
    ingestSimulation(buildRawSim({ returnFn: () => 0 })); // retornos 0 → cum 0 → cae en flat
    const s = usePlannerStore.getState();
    expect(s.viewError).toBeNull();
    expect(s.viewAnalysisA).not.toBeNull();
    // Cum 0 está en [-5%, +5%] → debería matchear todos los paths
    expect(s.viewAnalysisA!.evaluation.probability).toBe(1);
  });
});

// ===========================================================================
// Composite views (Fase C.1)
// ===========================================================================

describe('store — setActiveView con preset compuesto', () => {
  it('preset compuesto requiere yields (todos los built-in tienen componente yield)', () => {
    const { setActiveView, ingestSimulation } = usePlannerStore.getState();
    // Simulación sin yieldPaths
    ingestSimulation(buildRawSim({ includeYieldPaths: false }));
    setActiveView('composite-stagflation-12m');
    const s = usePlannerStore.getState();
    expect(s.activeViewId).toBe('composite-stagflation-12m');
    expect(s.viewError).toMatch(/yields/i);
    expect(s.viewAnalysisA).toBeNull();
  });

  it('preset compuesto con yields se evalúa y produce analysis A y B', () => {
    const { setActiveView, ingestSimulation } = usePlannerStore.getState();
    // horizonMonths=60 matchea el default del plan en beforeEach. El composite
    // usa ventana [1,12] internamente, así que los retornos/yields sólo
    // importan en ese rango.
    ingestSimulation(
      buildRawSim({
        nPaths: 100,
        horizonMonths: 60,
        returnFn: () => -0.025, // crash cumulativo ~-26% sobre 12m
        includeYieldPaths: true,
        yieldFn: (_, t) => (t === 5 ? 0.055 : 0.04), // pico +150 pbs en mes 6
      }),
    );
    // Stagflation = rates up +100pbs AND equity -20% → debería matchear todos
    setActiveView('composite-stagflation-12m');
    const s = usePlannerStore.getState();
    expect(s.activeViewId).toBe('composite-stagflation-12m');
    expect(s.viewError).toBeNull();
    expect(s.viewAnalysisA).not.toBeNull();
    expect(s.viewAnalysisB).not.toBeNull();
    expect(s.viewAnalysisA!.evaluation.nTotal).toBe(100);
    expect(s.viewAnalysisA!.evaluation.probability).toBe(1);
  });

  it('preset compuesto con setWindow re-evalúa con ventana nueva', () => {
    const { setActiveView, setWindow, ingestSimulation } = usePlannerStore.getState();
    ingestSimulation(
      buildRawSim({
        nPaths: 50,
        horizonMonths: 60,
        returnFn: () => 0,
        includeYieldPaths: true,
        yieldFn: () => 0.04, // yields flat
      }),
    );
    setActiveView('composite-goldilocks-12m');
    // La ventana del composite es fija (1-12); el store-level window se usa para
    // las métricas base/matched/unmatched. Cambiarlo no debería romper la eval.
    setWindow({ startMonth: 1, endMonth: 24 });
    const s = usePlannerStore.getState();
    expect(s.viewError).toBeNull();
    expect(s.viewAnalysisA).not.toBeNull();
  });

  it('activeViewId inválido con pool unificado devuelve error específico', () => {
    const { setActiveView, ingestSimulation } = usePlannerStore.getState();
    ingestSimulation(buildRawSim({ includeYieldPaths: true }));
    setActiveView('composite-does-not-exist');
    const s = usePlannerStore.getState();
    expect(s.viewError).toMatch(/no existe/);
  });
});

describe('store — customView (dynamic builder) se evalúa y persiste', () => {
  it('setCustomView con view portfolioReturn válido pobla activeViewId + customView + analysis', () => {
    const { setCustomView, ingestSimulation } = usePlannerStore.getState();
    ingestSimulation(buildRawSim({ returnFn: () => 0 }));
    setCustomView({
      id: 'dyn-port-A-flat',
      label: 'dyn',
      description: 'test',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: -0.05, maxReturn: 0.05 },
      window: { startMonth: 1, endMonth: 12 },
    });
    const s = usePlannerStore.getState();
    expect(s.activeViewId).toBe('dyn-port-A-flat');
    expect(s.customView).not.toBeNull();
    expect(s.customView!.id).toBe('dyn-port-A-flat');
    expect(s.viewError).toBeNull();
    expect(s.viewAnalysisA).not.toBeNull();
    expect(s.viewAnalysisA!.evaluation.probability).toBe(1); // retornos 0 → cumRet 0 dentro ±5%
  });

  it('setActiveView después de setCustomView limpia customView', () => {
    const { setCustomView, setActiveView, ingestSimulation } =
      usePlannerStore.getState();
    ingestSimulation(buildRawSim({ returnFn: () => 0 }));
    setCustomView({
      id: 'dyn-x',
      label: 'x',
      description: 'x',
      subject: { kind: 'portfolioReturn', portfolio: 'A' },
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: 0.05 },
      window: { startMonth: 1, endMonth: 12 },
    });
    expect(usePlannerStore.getState().customView).not.toBeNull();
    setActiveView('portfolioA-flat-12m');
    const s = usePlannerStore.getState();
    expect(s.activeViewId).toBe('portfolioA-flat-12m');
    expect(s.customView).toBeNull();
  });
});

describe('store — views con subject etfReturn (Fase C.2)', () => {
  it('requiere etfReturns en la simulación, error legible si falta', () => {
    const { setCustomView, ingestSimulation } = usePlannerStore.getState();
    ingestSimulation(buildRawSim({})); // sin etfReturns
    setCustomView({
      id: 'dyn-etf',
      label: 'etf',
      description: 'etf',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: -0.2 },
      window: { startMonth: 1, endMonth: 12 },
    });
    const s = usePlannerStore.getState();
    expect(s.viewError).toMatch(/ETF/i);
  });

  it('con etfReturns válido, el view ETF se evalúa y produce analysis', () => {
    const { setCustomView, ingestSimulation } = usePlannerStore.getState();
    const nPaths = 50;
    const horizonMonths = 60;
    // SPY: todos los paths tienen -5%/mes → cum a 12m ≈ -46% → matchea crash -20%
    const spyReturns = new Float32Array(nPaths * horizonMonths);
    for (let i = 0; i < spyReturns.length; i++) spyReturns[i] = -0.05;
    ingestSimulation({
      portfolioReturnsA: new Float32Array(nPaths * horizonMonths),
      portfolioReturnsB: new Float32Array(nPaths * horizonMonths),
      nPaths,
      horizonMonths,
      elapsedMs: 42,
      etfReturns: { SPY: spyReturns },
    });
    setCustomView({
      id: 'dyn-spy-crash',
      label: 'spy crash',
      description: 'SPY -20%',
      subject: { kind: 'etfReturn', ticker: 'SPY' },
      mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: -0.2 },
      window: { startMonth: 1, endMonth: 12 },
    });
    const s = usePlannerStore.getState();
    expect(s.viewError).toBeNull();
    expect(s.viewAnalysisA).not.toBeNull();
    expect(s.viewAnalysisA!.evaluation.probability).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// showProposedAmcs + autofallback (toggle de visibilidad de AMCs propuestos)
// ---------------------------------------------------------------------------

describe('store — showProposedAmcs', () => {
  it('default OFF al arrancar', () => {
    expect(usePlannerStore.getState().showProposedAmcs).toBe(false);
  });

  it('toggle ON solo actualiza la flag, no toca portafolios', () => {
    usePlannerStore.setState(
      { portfolioA: { kind: 'amc', id: 'GlFI' } },
      false,
    );
    usePlannerStore.getState().setShowProposedAmcs(true);
    const s = usePlannerStore.getState();
    expect(s.showProposedAmcs).toBe(true);
    expect(s.portfolioA).toEqual({ kind: 'amc', id: 'GlFI' });
  });

  it('toggle OFF con signature seleccionada no afecta el spec', () => {
    usePlannerStore.setState(
      {
        showProposedAmcs: true,
        portfolioA: { kind: 'signature', id: 'Conservador' },
        portfolioB: { kind: 'signature', id: 'Crecimiento' },
      },
      false,
    );
    usePlannerStore.getState().setShowProposedAmcs(false);
    const s = usePlannerStore.getState();
    expect(s.portfolioA).toEqual({ kind: 'signature', id: 'Conservador' });
    expect(s.portfolioB).toEqual({ kind: 'signature', id: 'Crecimiento' });
  });

  it('toggle OFF con AMC propuesto seleccionado → fallback a GlFI', () => {
    usePlannerStore.setState(
      {
        showProposedAmcs: true,
        portfolioA: { kind: 'amc', id: 'USGrTech' },
        portfolioB: { kind: 'amc', id: 'CashST' },
      },
      false,
    );
    usePlannerStore.getState().setShowProposedAmcs(false);
    const s = usePlannerStore.getState();
    expect(s.portfolioA).toEqual({ kind: 'amc', id: 'GlFI' });
    expect(s.portfolioB).toEqual({ kind: 'amc', id: 'GlFI' });
  });

  it('toggle OFF con AMC existente seleccionado no cambia nada', () => {
    usePlannerStore.setState(
      {
        showProposedAmcs: true,
        portfolioA: { kind: 'amc', id: 'GlFI' },
        portfolioB: { kind: 'amc', id: 'USA.Eq' },
      },
      false,
    );
    usePlannerStore.getState().setShowProposedAmcs(false);
    const s = usePlannerStore.getState();
    expect(s.portfolioA).toEqual({ kind: 'amc', id: 'GlFI' });
    expect(s.portfolioB).toEqual({ kind: 'amc', id: 'USA.Eq' });
  });

  it('toggle OFF con custom mixto: zero los pesos propuestos y renormaliza', () => {
    usePlannerStore.setState(
      {
        showProposedAmcs: true,
        portfolioA: {
          kind: 'custom',
          label: 'mix',
          weights: { GlFI: 30, USGrTech: 30, 'USA.Eq': 40 },
        },
      },
      false,
    );
    usePlannerStore.getState().setShowProposedAmcs(false);
    const s = usePlannerStore.getState();
    expect(s.portfolioA.kind).toBe('custom');
    if (s.portfolioA.kind !== 'custom') throw new Error('expected custom');
    const w = s.portfolioA.weights;
    // USGrTech debe estar ausente o en 0
    expect(w.USGrTech ?? 0).toBe(0);
    // GlFI 30 + USA.Eq 40 = 70 → renormalizadas a 100 con mismo ratio
    expect(w.GlFI).toBeCloseTo((30 / 70) * 100, 4);
    expect(w['USA.Eq']).toBeCloseTo((40 / 70) * 100, 4);
    const total = Object.values(w).reduce((a, b) => a + (b ?? 0), 0);
    expect(total).toBeCloseTo(100, 4);
  });

  it('toggle OFF con custom 100% en propuestos → fallback a GlFI: 100', () => {
    usePlannerStore.setState(
      {
        showProposedAmcs: true,
        portfolioA: {
          kind: 'custom',
          label: 'all-proposed',
          weights: { USGrTech: 50, CashST: 50 },
        },
      },
      false,
    );
    usePlannerStore.getState().setShowProposedAmcs(false);
    const s = usePlannerStore.getState();
    if (s.portfolioA.kind !== 'custom') throw new Error('expected custom');
    expect(s.portfolioA.weights).toEqual({ GlFI: 100 });
  });

  it('toggle ON tras OFF preserva los portafolios actuales (no resetea)', () => {
    usePlannerStore.setState(
      {
        showProposedAmcs: true,
        portfolioA: { kind: 'amc', id: 'USGrTech' },
      },
      false,
    );
    const { setShowProposedAmcs } = usePlannerStore.getState();
    setShowProposedAmcs(false);
    expect(usePlannerStore.getState().portfolioA).toEqual({ kind: 'amc', id: 'GlFI' });
    setShowProposedAmcs(true);
    // El portafolio NO se restaura — quedó en GlFI tras el fallback. Esto es
    // intencional: el autofallback es destructivo del lado del estado.
    expect(usePlannerStore.getState().portfolioA).toEqual({ kind: 'amc', id: 'GlFI' });
    expect(usePlannerStore.getState().showProposedAmcs).toBe(true);
  });
});
