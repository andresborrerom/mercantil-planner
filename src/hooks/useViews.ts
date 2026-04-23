/**
 * Hook para consumir el estado de views desde componentes React.
 *
 * Abstrae el acceso al store Zustand y expone una API focalizada en lo que
 * el UI de Views necesita: el preset activo, la evaluación, el análisis
 * asimétrico para A y B, los errores, y las acciones para cambiar el view
 * activo.
 *
 * Uso típico (desde el futuro `ViewsPanel.tsx`):
 *
 *   const {
 *     availablePresets,
 *     activeView,
 *     probability,
 *     nMatched,
 *     analysisA,
 *     analysisB,
 *     error,
 *     isSimulationReady,
 *     requiresYieldPaths,
 *     hasYieldPaths,
 *     setActiveView,
 *     clearView,
 *   } = useViews();
 */

import { useCallback, useMemo } from 'react';
import { usePlannerStore } from '../state/store';
import {
  BUILT_IN_COMPOSITE_VIEWS,
  BUILT_IN_VIEWS,
  findAnyBuiltInView,
  viewRequiresEtfReturns,
  viewRequiresYieldPaths,
  type AnyView,
  type AsymmetricAnalysis,
  type View,
} from '../domain/views';

export type UseViewsResult = {
  /** Lista completa de presets single + composite. */
  availablePresets: readonly AnyView[];

  /** El view activo resuelto (null si no hay). Puede ser single o composite. */
  activeView: AnyView | null;

  /**
   * Probabilidad empírica del view activo, entre 0 y 1. null si no hay view
   * activo o si no se pudo evaluar.
   */
  probability: number | null;

  /** Error estándar de la probabilidad (≈ 1.96·SE para un IC 95%). */
  standardError: number | null;

  /** Paths del bootstrap que cumplen el view. null si no hay view activo. */
  nMatched: number | null;

  /** Total de paths evaluados. */
  nTotal: number | null;

  /** Análisis asimétrico (matched / unmatched / base) para el portafolio A. */
  analysisA: AsymmetricAnalysis | null;

  /** Análisis asimétrico para el portafolio B. */
  analysisB: AsymmetricAnalysis | null;

  /** Mensaje de error legible si la activación falló. null si todo ok. */
  error: string | null;

  /** True si ya corrió una simulación y hay datos para condicionar. */
  isSimulationReady: boolean;

  /** True si el view activo requiere yield paths. */
  requiresYieldPaths: boolean;

  /** True si la simulación actual incluye yield paths. */
  hasYieldPaths: boolean;

  /** True si el view activo requiere retornos per-ETF. */
  requiresEtfReturns: boolean;

  /** True si la simulación actual incluye retornos per-ETF. */
  hasEtfReturns: boolean;

  /**
   * Activa un preset por id. Pasar `null` para desactivar. Si el view
   * requiere yields y no están disponibles, `error` se setea con un mensaje
   * legible en lugar de levantar una excepción.
   */
  setActiveView: (id: string | null) => void;

  /** Shortcut para `setActiveView(null)`. */
  clearView: () => void;

  /**
   * Activa un view dinámico (creado por el builder). Se evalúa inmediatamente.
   */
  setCustomView: (view: View) => void;
};

export function useViews(): UseViewsResult {
  const activeViewId = usePlannerStore((s) => s.activeViewId);
  const customView = usePlannerStore((s) => s.customView);
  const viewAnalysisA = usePlannerStore((s) => s.viewAnalysisA);
  const viewAnalysisB = usePlannerStore((s) => s.viewAnalysisB);
  const viewError = usePlannerStore((s) => s.viewError);
  const simA = usePlannerStore((s) => s.simA);
  const yieldPaths = usePlannerStore((s) => s.yieldPaths);
  const etfReturns = usePlannerStore((s) => s.etfReturns);
  const setActiveViewStore = usePlannerStore((s) => s.setActiveView);
  const setCustomViewStore = usePlannerStore((s) => s.setCustomView);

  // Resolver activeView:
  //   1. Si `customView` existe y su id matchea `activeViewId` → usar custom.
  //      Esto habilita que los dynamic views del builder se reflejen en la UI
  //      (el bug del click "Evaluar" estaba acá: si customView no se miraba,
  //      el panel no renderizaba los resultados del dynamic view).
  //   2. Sino, buscar en los pools built-in (single + composite).
  //   3. Sino, null.
  const activeView: AnyView | null = activeViewId
    ? customView && customView.id === activeViewId
      ? customView
      : findAnyBuiltInView(activeViewId)
    : null;

  const requiresYieldPaths = activeView ? viewRequiresYieldPaths(activeView) : false;
  const hasYieldPaths = yieldPaths !== null;
  const requiresEtfReturns = activeView ? viewRequiresEtfReturns(activeView) : false;
  const hasEtfReturns = etfReturns !== null;

  const availablePresets = useMemo<readonly AnyView[]>(
    () => [...BUILT_IN_VIEWS, ...BUILT_IN_COMPOSITE_VIEWS],
    [],
  );

  // Probability proviene del análisis de A (igual que el de B por construcción).
  const evaluation = viewAnalysisA?.evaluation ?? null;
  const probability = evaluation ? evaluation.probability : null;
  const standardError = evaluation ? evaluation.standardError : null;
  const nMatched = evaluation ? evaluation.nMatched : null;
  const nTotal = evaluation ? evaluation.nTotal : null;

  const setActiveView = useCallback(
    (id: string | null) => setActiveViewStore(id),
    [setActiveViewStore],
  );
  const clearView = useCallback(() => setActiveViewStore(null), [setActiveViewStore]);
  const setCustomView = useCallback(
    (view: View) => setCustomViewStore(view),
    [setCustomViewStore],
  );

  return {
    availablePresets,
    activeView,
    probability,
    standardError,
    nMatched,
    nTotal,
    analysisA: viewAnalysisA,
    analysisB: viewAnalysisB,
    error: viewError,
    isSimulationReady: simA !== null,
    requiresYieldPaths,
    hasYieldPaths,
    requiresEtfReturns,
    hasEtfReturns,
    setActiveView,
    clearView,
    setCustomView,
  };
}
