/**
 * Store global del Mercantil Planner (Zustand).
 *
 * Arquitectura:
 *   - Estado de configuración (portafolios, plan, config de bootstrap, ventana)
 *     — reactivo, los componentes lo consumen directamente.
 *   - Estado de simulación (values, portfolioReturns, ruined, bands, métricas)
 *     — se setea como un blob atómico después de cada corrida del worker.
 *   - `setWindow` recalcula las métricas sincrónicamente sobre los valores
 *     ya en memoria — NO vuelve a correr el worker. Esto garantiza los
 *     < 100 ms que pide el spec §7.
 *
 * Los Float32Array grandes (values, portfolioReturns) viven dentro del store
 * como referencias — Zustand no los clona. Los componentes que solo necesitan
 * métricas o bands no re-renderean cuando cambian los arrays grandes.
 */

import { create } from 'zustand';
import { AMC_TIER } from '../domain/amc-definitions';
import { DEFAULT_BOOTSTRAP_CONFIG, getYieldBounds } from '../domain/bootstrap';
import { applyFlows, type FlowsOutput } from '../domain/flows';
import {
  computeFanChartBands,
  computeMetrics,
  type FanChartBands,
  type Window,
  type WindowMetrics,
} from '../domain/metrics';
import { applyPresetToPlan, type PresetId } from '../domain/presets';
import type { YieldKey } from '../domain/rf-config';
import type {
  AmcId,
  BootstrapConfig,
  FlowRule,
  PlanMode,
  PlanSpec,
  PortfolioSpec,
} from '../domain/types';
import {
  asymmetricAnalysis,
  findAnyBuiltInView,
  viewRequiresEtfReturns,
  viewRequiresYieldPaths,
  type AnyView,
  type AsymmetricAnalysis,
  type EtfReturns,
  type ViewDataset,
  type YieldPaths,
} from '../domain/views';

// ---------------------------------------------------------------------------
// Tipos auxiliares del store
// ---------------------------------------------------------------------------

export type SimulationStatus = 'idle' | 'running' | 'done' | 'error';

export type RawSimulationInput = {
  portfolioReturnsA: Float32Array;
  portfolioReturnsB: Float32Array;
  nPaths: number;
  horizonMonths: number;
  elapsedMs: number;
  /**
   * Solo presente si el bootstrap corrió con `outputYieldPaths: true`. Habilita
   * los views con subject yield (ej. "tasas suben 100 pbs"). Si viene ausente,
   * los views de yield se deshabilitan pero los de portfolioReturn siguen
   * funcionando.
   */
  yieldPaths?: YieldPaths;
  /**
   * Solo presente si el bootstrap corrió con `outputEtfReturns: true`. Habilita
   * los views con subject etfReturn (ej. "S&P 500 cae entre -10% y -20% en 12m").
   * Si viene ausente, los views de ETF se deshabilitan.
   */
  etfReturns?: EtfReturns;
};

type PlannerState = {
  // --- Config ---
  portfolioA: PortfolioSpec;
  portfolioB: PortfolioSpec;
  plan: PlanSpec;
  bootstrap: BootstrapConfig;

  // --- UI ---
  window: Window;
  /**
   * Si los AMCs propuestos (CashST/USGrTech/USTDur) son visibles en el
   * PortfolioSelector. Default `false` — no están aprobados aún. Al pasar a
   * `false` se aplica autofallback sobre `portfolioA`/`B` para que ningún
   * portafolio quede apuntando a un AMC oculto.
   */
  showProposedAmcs: boolean;

  // --- Simulación ---
  status: SimulationStatus;
  errorMessage: string | null;
  lastRunAt: number | null;
  lastElapsedMs: number | null;

  simA: FlowsOutput | null;
  simB: FlowsOutput | null;
  rawReturnsA: Float32Array | null;
  rawReturnsB: Float32Array | null;
  bandsA: FanChartBands | null;
  bandsB: FanChartBands | null;
  metricsA: WindowMetrics | null;
  metricsB: WindowMetrics | null;
  /** Bandas condicionales A (Fase C.2c) — se recalculan al cambiar view, NO al mover ventana. */
  condBandsA: FanChartBands | null;
  /** Bandas condicionales B (Fase C.2c). */
  condBandsB: FanChartBands | null;

  // --- Views (análisis condicional) ---
  /** Yield paths de la última simulación, si el bootstrap los emitió. */
  yieldPaths: YieldPaths | null;
  /** Retornos per-ETF de la última simulación, si el bootstrap los emitió. */
  etfReturns: EtfReturns | null;
  /** Niveles iniciales de cada yield (constantes — se pre-computan al importar). */
  yieldInitial: Readonly<Record<YieldKey, number>>;
  /** Id del preset de view activo, null = sin view. */
  activeViewId: string | null;
  /** View dinámico custom (creado por el builder). null si se usa un preset built-in. */
  customView: AnyView | null;
  /** Análisis asimétrico del portafolio A bajo el view activo. */
  viewAnalysisA: AsymmetricAnalysis | null;
  /** Análisis asimétrico del portafolio B bajo el view activo. */
  viewAnalysisB: AsymmetricAnalysis | null;
  /** Mensaje de error si el view no pudo evaluarse (sim ausente, yields faltantes, etc). */
  viewError: string | null;

  // --- Acciones ---
  setPortfolioA: (spec: PortfolioSpec) => void;
  setPortfolioB: (spec: PortfolioSpec) => void;
  setInitialCapital: (v: number) => void;
  setHorizonMonths: (v: number) => void;
  setMode: (m: PlanMode) => void;
  setInflationPct: (v: number) => void;
  setBootstrap: (patch: Partial<BootstrapConfig>) => void;

  addRule: (rule: FlowRule) => void;
  updateRule: (id: string, patch: Partial<FlowRule>) => void;
  removeRule: (id: string) => void;
  applyPreset: (id: PresetId) => void;

  setWindow: (w: Window) => void;
  clampWindowToHorizon: () => void;

  setStatus: (status: SimulationStatus, errorMessage?: string) => void;
  ingestSimulation: (raw: RawSimulationInput) => void;
  resetSimulation: () => void;

  /**
   * Activa un preset de view por su id. Pasar `null` para desactivar.
   * Si no hay simulación lista, o el view requiere yields y no están disponibles,
   * `viewError` se setea con un mensaje legible.
   */
  setActiveView: (id: string | null) => void;
  /**
   * Activa un view dinámico (creado por el builder de la UI). El view se
   * evalúa inmediatamente contra la simulación actual. Para desactivar,
   * usar `setActiveView(null)`.
   */
  setCustomView: (view: AnyView) => void;

  /**
   * Toggle global de visibilidad de los AMCs propuestos. Al pasar a `false`
   * dispara autofallback en `portfolioA`/`B`: AMC propuesto seleccionado →
   * `GlFI`; pesos custom sobre propuestos → 0 + renormalización del resto a
   * 100%; si todos los pesos eran propuestos → `GlFI: 100`.
   */
  setShowProposedAmcs: (show: boolean) => void;
};

// ---------------------------------------------------------------------------
// Defaults iniciales
// ---------------------------------------------------------------------------

const DEFAULT_PLAN: PlanSpec = {
  initialCapital: 250_000,
  horizonMonths: 240,
  mode: 'nominal',
  inflationPct: 2.5,
  rules: [],
};

const DEFAULT_WINDOW: Window = { startMonth: 1, endMonth: 240 };

/**
 * Nivel inicial por yield (último valor observado del mercado). Pre-computado
 * una vez al importar el módulo desde `getYieldBounds` y consumido por la
 * evaluación de views con subject yield.
 */
const DEFAULT_YIELD_INITIAL: Readonly<Record<YieldKey, number>> = {
  IRX: getYieldBounds('IRX').initial,
  FVX: getYieldBounds('FVX').initial,
  TNX: getYieldBounds('TNX').initial,
  TYX: getYieldBounds('TYX').initial,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Autofallback al ocultar AMCs propuestos. No muta — devuelve el spec saneado.
 *
 *   - signature → no afectado.
 *   - amc propuesto → switch a `GlFI`.
 *   - custom con pesos sobre propuestos → zero esos pesos y renormaliza el
 *     resto a 100. Si todos los pesos eran propuestos (suma 0 después del
 *     strip) → fallback a `GlFI: 100`.
 */
function stripProposedFromSpec(spec: PortfolioSpec): PortfolioSpec {
  if (spec.kind === 'signature') return spec;
  if (spec.kind === 'amc') {
    return AMC_TIER[spec.id] === 'proposed'
      ? { kind: 'amc', id: 'GlFI' as AmcId }
      : spec;
  }
  // kind === 'custom'
  const cleaned: Partial<Record<AmcId, number>> = {};
  let totalKept = 0;
  for (const [id, w] of Object.entries(spec.weights) as [AmcId, number][]) {
    if (AMC_TIER[id] === 'existing' && w > 0) {
      cleaned[id] = w;
      totalKept += w;
    }
  }
  if (totalKept <= 0) {
    return { kind: 'custom', label: spec.label, weights: { GlFI: 100 } };
  }
  const scale = 100 / totalKept;
  const renormalized: Partial<Record<AmcId, number>> = {};
  for (const [id, w] of Object.entries(cleaned) as [AmcId, number][]) {
    renormalized[id] = w * scale;
  }
  return { kind: 'custom', label: spec.label, weights: renormalized };
}

function recomputeMetricsFor(
  sim: FlowsOutput | null,
  rawReturns: Float32Array | null,
  nPaths: number | null,
  horizonMonths: number,
  window: Window,
): WindowMetrics | null {
  if (!sim || !rawReturns || !nPaths) return null;
  return computeMetrics({
    simulation: sim,
    portfolioReturns: rawReturns,
    nPaths,
    horizonMonths,
    window,
  });
}

function findViewById(id: string): AnyView | null {
  return findAnyBuiltInView(id);
}

type ViewEvalResult = {
  viewAnalysisA: AsymmetricAnalysis | null;
  viewAnalysisB: AsymmetricAnalysis | null;
  viewError: string | null;
};

/**
 * Calcula las bandas condicionales (fan chart over subset) de A y B dada una
 * evaluación de view. Independiente de la ventana — depende solo del view
 * y de la simulación. Por eso NO se invoca desde `setWindow` (ahorra ~200ms
 * por slider move).
 *
 * Returns null para ambas si no hay paths matched (view.nMatched === 0) o si
 * falta sim. El caller aplica al estado.
 */
function computeConditionalBands(
  viewAnalysisA: AsymmetricAnalysis | null,
  simA: FlowsOutput | null,
  simB: FlowsOutput | null,
  nPaths: number,
  horizonMonths: number,
): { condBandsA: FanChartBands | null; condBandsB: FanChartBands | null } {
  if (!viewAnalysisA || !simA || !simB) {
    return { condBandsA: null, condBandsB: null };
  }
  const matched = viewAnalysisA.evaluation.matchedIndices;
  if (matched.length === 0) {
    return { condBandsA: null, condBandsB: null };
  }
  const condBandsA = computeFanChartBands(simA.values, nPaths, horizonMonths, matched);
  const condBandsB = computeFanChartBands(simB.values, nPaths, horizonMonths, matched);
  return { condBandsA, condBandsB };
}

/**
 * Evalúa el view activo sobre la simulación actual. Usado por:
 *   - `setActiveView` cuando el user activa un preset.
 *   - `setWindow` para re-computar métricas condicionales con la ventana nueva.
 *   - `ingestSimulation` para re-evaluar tras una corrida nueva.
 *
 * No muta el estado — devuelve el resultado para que el caller lo aplique.
 * Si cualquier precondición falla (sim ausente, yields faltantes, id inválido),
 * devuelve `null` para los análisis y un mensaje de error legible.
 */
function evaluateActiveView(
  activeViewId: string | null,
  customView: AnyView | null,
  simA: FlowsOutput | null,
  simB: FlowsOutput | null,
  rawReturnsA: Float32Array | null,
  rawReturnsB: Float32Array | null,
  yieldPaths: YieldPaths | null,
  etfReturns: EtfReturns | null,
  yieldInitial: Readonly<Record<YieldKey, number>>,
  horizonMonths: number,
  window: Window,
): ViewEvalResult {
  if (activeViewId === null) {
    return { viewAnalysisA: null, viewAnalysisB: null, viewError: null };
  }
  // Priorizar customView si existe; sino buscar en built-in.
  const view = customView ?? findViewById(activeViewId);
  if (!view) {
    return {
      viewAnalysisA: null,
      viewAnalysisB: null,
      viewError: `Preset "${activeViewId}" no existe`,
    };
  }
  if (!simA || !simB || !rawReturnsA || !rawReturnsB) {
    return {
      viewAnalysisA: null,
      viewAnalysisB: null,
      viewError: 'Corré Simular antes de activar un view',
    };
  }
  if (viewRequiresYieldPaths(view) && !yieldPaths) {
    return {
      viewAnalysisA: null,
      viewAnalysisB: null,
      viewError:
        'Este view requiere yields simulados. Activá "Incluir yields para views" y volvé a correr Simular.',
    };
  }
  if (viewRequiresEtfReturns(view) && !etfReturns) {
    return {
      viewAnalysisA: null,
      viewAnalysisB: null,
      viewError:
        'Este view requiere retornos per-ETF. Activá "Incluir ETFs individuales para views" y volvé a correr Simular.',
    };
  }

  const nPaths = rawReturnsA.length / horizonMonths;
  if (!Number.isInteger(nPaths) || nPaths < 1) {
    return {
      viewAnalysisA: null,
      viewAnalysisB: null,
      viewError: `Shape inconsistente: portfolioReturnsA tiene ${rawReturnsA.length} elementos (horizonte ${horizonMonths})`,
    };
  }

  const dataset: ViewDataset = {
    portfolioReturnsA: rawReturnsA,
    portfolioReturnsB: rawReturnsB,
    yieldPaths,
    etfReturns,
    yieldInitial,
    nPaths,
    horizonMonths,
  };

  try {
    const viewAnalysisA = asymmetricAnalysis(
      view,
      { dataset, simulation: simA, window },
      rawReturnsA,
    );
    const viewAnalysisB = asymmetricAnalysis(
      view,
      { dataset, simulation: simB, window },
      rawReturnsB,
    );
    return { viewAnalysisA, viewAnalysisB, viewError: null };
  } catch (err) {
    return {
      viewAnalysisA: null,
      viewAnalysisB: null,
      viewError: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlannerStore = create<PlannerState>((set, get) => ({
  portfolioA: { kind: 'signature', id: 'Conservador' },
  portfolioB: { kind: 'signature', id: 'Balanceado' },
  plan: DEFAULT_PLAN,
  bootstrap: { ...DEFAULT_BOOTSTRAP_CONFIG },
  window: DEFAULT_WINDOW,
  showProposedAmcs: false,

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
  yieldInitial: DEFAULT_YIELD_INITIAL,
  activeViewId: null,
  customView: null,
  viewAnalysisA: null,
  viewAnalysisB: null,
  viewError: null,

  setPortfolioA: (spec) => set({ portfolioA: spec }),
  setPortfolioB: (spec) => set({ portfolioB: spec }),

  setInitialCapital: (v) =>
    set((s) => ({ plan: { ...s.plan, initialCapital: v } })),

  setHorizonMonths: (v) => {
    const clamped = Math.max(1, Math.min(360, Math.floor(v)));
    set((s) => ({
      plan: { ...s.plan, horizonMonths: clamped },
      // Si la ventana queda fuera de rango, clamp
      window: {
        startMonth: Math.min(s.window.startMonth, clamped),
        endMonth: Math.min(s.window.endMonth, clamped),
      },
    }));
  },

  setMode: (m) => set((s) => ({ plan: { ...s.plan, mode: m } })),

  setInflationPct: (v) =>
    set((s) => ({ plan: { ...s.plan, inflationPct: v } })),

  setBootstrap: (patch) => set((s) => ({ bootstrap: { ...s.bootstrap, ...patch } })),

  addRule: (rule) =>
    set((s) => ({ plan: { ...s.plan, rules: [...s.plan.rules, rule] } })),

  updateRule: (id, patch) =>
    set((s) => ({
      plan: {
        ...s.plan,
        rules: s.plan.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      },
    })),

  removeRule: (id) =>
    set((s) => ({
      plan: { ...s.plan, rules: s.plan.rules.filter((r) => r.id !== id) },
    })),

  applyPreset: (id) => {
    set((s) => ({ plan: applyPresetToPlan(s.plan, id) }));
  },

  setWindow: (w) => {
    const s = get();
    const clampedEnd = Math.min(Math.max(w.endMonth, 1), s.plan.horizonMonths);
    const clampedStart = Math.min(Math.max(w.startMonth, 1), clampedEnd);
    const clamped: Window = { startMonth: clampedStart, endMonth: clampedEnd };

    // Recalcular métricas en el acto (requisito del spec §7: < 100 ms)
    const metricsA = recomputeMetricsFor(
      s.simA,
      s.rawReturnsA,
      s.simA ? s.simA.values.length / (s.plan.horizonMonths + 1) : null,
      s.plan.horizonMonths,
      clamped,
    );
    const metricsB = recomputeMetricsFor(
      s.simB,
      s.rawReturnsB,
      s.simB ? s.simB.values.length / (s.plan.horizonMonths + 1) : null,
      s.plan.horizonMonths,
      clamped,
    );
    // Si hay view activo, re-evaluar con la ventana nueva.
    const viewResult = evaluateActiveView(
      s.activeViewId,
      s.customView,
      s.simA,
      s.simB,
      s.rawReturnsA,
      s.rawReturnsB,
      s.yieldPaths,
      s.etfReturns,
      s.yieldInitial,
      s.plan.horizonMonths,
      clamped,
    );
    set({
      window: clamped,
      metricsA,
      metricsB,
      viewAnalysisA: viewResult.viewAnalysisA,
      viewAnalysisB: viewResult.viewAnalysisB,
      viewError: viewResult.viewError,
    });
  },

  clampWindowToHorizon: () => {
    const s = get();
    const endMonth = Math.min(s.window.endMonth, s.plan.horizonMonths);
    const startMonth = Math.min(s.window.startMonth, endMonth);
    if (endMonth !== s.window.endMonth || startMonth !== s.window.startMonth) {
      set({ window: { startMonth, endMonth } });
    }
  },

  setStatus: (status, errorMessage) =>
    set({ status, errorMessage: errorMessage ?? null }),

  ingestSimulation: (raw) => {
    const s = get();
    const {
      portfolioReturnsA,
      portfolioReturnsB,
      nPaths,
      horizonMonths,
      elapsedMs,
      yieldPaths,
    } = raw;

    // Sanidad: el horizonte devuelto por el worker debería matchear el del plan.
    if (horizonMonths !== s.plan.horizonMonths) {
      console.warn(
        `[store] horizonMonths del worker (${horizonMonths}) ≠ plan (${s.plan.horizonMonths}). Usando el del worker.`,
      );
    }

    const simA = applyFlows({
      plan: { ...s.plan, horizonMonths },
      portfolioReturns: portfolioReturnsA,
      nPaths,
    });
    const simB = applyFlows({
      plan: { ...s.plan, horizonMonths },
      portfolioReturns: portfolioReturnsB,
      nPaths,
    });

    const bandsA = computeFanChartBands(simA.values, nPaths, horizonMonths);
    const bandsB = computeFanChartBands(simB.values, nPaths, horizonMonths);

    // Clamp ventana al horizonte vigente
    const endMonth = Math.min(s.window.endMonth, horizonMonths);
    const startMonth = Math.min(s.window.startMonth, endMonth);
    const window: Window = { startMonth, endMonth };

    const metricsA = computeMetrics({
      simulation: simA,
      portfolioReturns: portfolioReturnsA,
      nPaths,
      horizonMonths,
      window,
    });
    const metricsB = computeMetrics({
      simulation: simB,
      portfolioReturns: portfolioReturnsB,
      nPaths,
      horizonMonths,
      window,
    });

    // Si había un view activo, re-evaluar con la nueva sim + yields + etfs.
    const yieldPathsOrNull = yieldPaths ?? null;
    const etfReturnsOrNull = raw.etfReturns ?? null;
    const viewResult = evaluateActiveView(
      s.activeViewId,
      s.customView,
      simA,
      simB,
      portfolioReturnsA,
      portfolioReturnsB,
      yieldPathsOrNull,
      etfReturnsOrNull,
      s.yieldInitial,
      horizonMonths,
      window,
    );

    const { condBandsA, condBandsB } = computeConditionalBands(
      viewResult.viewAnalysisA,
      simA,
      simB,
      nPaths,
      horizonMonths,
    );

    set({
      simA,
      simB,
      rawReturnsA: portfolioReturnsA,
      rawReturnsB: portfolioReturnsB,
      bandsA,
      bandsB,
      metricsA,
      metricsB,
      window,
      status: 'done',
      errorMessage: null,
      lastRunAt: Date.now(),
      lastElapsedMs: elapsedMs,
      yieldPaths: yieldPathsOrNull,
      etfReturns: etfReturnsOrNull,
      viewAnalysisA: viewResult.viewAnalysisA,
      viewAnalysisB: viewResult.viewAnalysisB,
      viewError: viewResult.viewError,
      condBandsA,
      condBandsB,
    });
  },

  resetSimulation: () =>
    set({
      simA: null,
      simB: null,
      rawReturnsA: null,
      rawReturnsB: null,
      bandsA: null,
      bandsB: null,
      metricsA: null,
      metricsB: null,
      status: 'idle',
      errorMessage: null,
      yieldPaths: null,
      etfReturns: null,
      // El activeViewId se preserva por si el user vuelve a simular; pero
      // el análisis y el error se limpian porque ya no aplican.
      viewAnalysisA: null,
      viewAnalysisB: null,
      viewError: null,
      condBandsA: null,
      condBandsB: null,
    }),

  setActiveView: (id) => {
    const s = get();
    const viewResult = evaluateActiveView(
      id,
      null, // preset activado por id — no es custom view
      s.simA,
      s.simB,
      s.rawReturnsA,
      s.rawReturnsB,
      s.yieldPaths,
      s.etfReturns,
      s.yieldInitial,
      s.plan.horizonMonths,
      s.window,
    );
    const nPaths = s.rawReturnsA ? s.rawReturnsA.length / s.plan.horizonMonths : 0;
    const { condBandsA, condBandsB } =
      id === null
        ? { condBandsA: null, condBandsB: null }
        : computeConditionalBands(
            viewResult.viewAnalysisA,
            s.simA,
            s.simB,
            nPaths,
            s.plan.horizonMonths,
          );
    set({
      activeViewId: id,
      customView: null,
      viewAnalysisA: viewResult.viewAnalysisA,
      viewAnalysisB: viewResult.viewAnalysisB,
      viewError: viewResult.viewError,
      condBandsA,
      condBandsB,
    });
  },

  setShowProposedAmcs: (show) => {
    if (show) {
      set({ showProposedAmcs: true });
      return;
    }
    const s = get();
    set({
      showProposedAmcs: false,
      portfolioA: stripProposedFromSpec(s.portfolioA),
      portfolioB: stripProposedFromSpec(s.portfolioB),
    });
  },

  setCustomView: (view) => {
    const s = get();
    const viewResult = evaluateActiveView(
      view.id,
      view,
      s.simA,
      s.simB,
      s.rawReturnsA,
      s.rawReturnsB,
      s.yieldPaths,
      s.etfReturns,
      s.yieldInitial,
      s.plan.horizonMonths,
      s.window,
    );
    const nPaths = s.rawReturnsA ? s.rawReturnsA.length / s.plan.horizonMonths : 0;
    const { condBandsA, condBandsB } = computeConditionalBands(
      viewResult.viewAnalysisA,
      s.simA,
      s.simB,
      nPaths,
      s.plan.horizonMonths,
    );
    set({
      activeViewId: view.id,
      customView: view,
      viewAnalysisA: viewResult.viewAnalysisA,
      viewAnalysisB: viewResult.viewAnalysisB,
      viewError: viewResult.viewError,
      condBandsA,
      condBandsB,
    });
  },
}));
