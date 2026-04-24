/**
 * Views — análisis condicional sobre las simulaciones del bootstrap.
 *
 * Un **view** es una hipótesis sobre el comportamiento del mercado en una
 * ventana específica: "las tasas suben 100 pbs en los próximos 12 meses",
 * "el portafolio cae más de 20% en algún momento del primer año", "se
 * comporta como el mejor tercil histórico a 24 meses", etc.
 *
 * La herramienta evalúa el view sobre las 5000 (o N) trayectorias simuladas
 * y responde dos preguntas:
 *   1. ¿Cuántas trayectorias cumplen el view? → probabilidad empírica del view.
 *   2. En esas trayectorias, ¿cómo se comporta el portafolio? → métricas
 *      condicionales (Familia A y B) calculadas sobre el subset.
 *
 * Esto es conceptualmente **condicionamiento bayesiano sobre la posterior
 * bootstrap**: la distribución simulada es la "prior" derivada de la historia,
 * y el view es un filtro que la recorta. No se cambia el motor ni se
 * introducen supuestos nuevos — se recicla la salida existente.
 *
 * ### Convenciones
 *   - Ventanas [startMonth, endMonth] son 1-indexadas e inclusivas en ambos
 *     extremos (consistente con `metrics.ts`).
 *   - Yields y Δy están en decimal (0.0434 para 4.34%). "100 pbs" = 0.01.
 *   - El nivel inicial del yield (pre-simulación, mes 0) es
 *     `getYieldBounds(key).initial`.
 *
 * ### Scope de Fase A (este archivo)
 *   - Single-predicate views (subject = 1 yield o 1 portfolio).
 *   - 6 modos de predicado: peak / trough / endpoint change, persistent
 *     threshold, cumulative return range, percentile band return.
 *   - 9 presets built-in cableados.
 *   - Evaluación individual + análisis asimétrico (matched vs unmatched).
 *
 * ### Fuera de scope (Fase B)
 *   - Views compuestos (AND/OR de múltiples predicados).
 *   - Views sobre regímenes históricos (2008-like, etc.).
 *   - Views sobre retornos per-ETF (dólar, emergentes vs desarrollados, etc.).
 *   - Descomposición del impacto por clase de activo.
 */

import type { Ticker } from '../data/market.generated';
import type { FlowsOutput } from './flows';
import { computeMetrics, type Window, type WindowMetrics } from './metrics';
import type { YieldKey } from './rf-config';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/**
 * Yield paths simulados alineados con la salida del bootstrap.
 * Shape por yield: [nPaths × horizonMonths] con el nivel AL CIERRE de cada mes.
 */
export type YieldPaths = Readonly<Record<YieldKey, Float32Array>>;

/**
 * Qué observamos: un yield simulado, el retorno mensual de uno de los dos
 * portafolios simulados (A o B), o el retorno mensual de un ETF individual
 * (requiere `outputEtfReturns: true` en el bootstrap).
 */
export type ViewSubject =
  | { kind: 'yield'; key: YieldKey }
  | { kind: 'portfolioReturn'; portfolio: 'A' | 'B' }
  | { kind: 'etfReturn'; ticker: Ticker };

/**
 * Cómo evaluamos el subject dentro de la ventana del view.
 *
 *   - **peakChange**: el máximo `subject[t] − subject[start]` dentro de la ventana
 *     cae en `[minDelta, maxDelta]`. Uso típico: "tasas suben 100 pbs en algún
 *     momento" → `minDelta = 0.01`, `maxDelta = null`. Solo aplica a yields.
 *
 *   - **troughChange**: el mínimo `subject[t] − subject[start]` dentro de la
 *     ventana cae en `[minDelta, maxDelta]`. `minDelta` debe ser ≤ 0 (es el
 *     piso, más negativo). Solo aplica a yields.
 *
 *   - **endpointChange**: `subject[end] − subject[start]` cae en
 *     `[minDelta, maxDelta]`. Uso típico: "tasas cierran 25-50 pbs arriba"
 *     (estables). Solo aplica a yields.
 *
 *   - **persistentThreshold**: existe una racha de al menos `minDurationMonths`
 *     meses consecutivos DENTRO de la ventana donde `subject[t] − subject[start]
 *     ≥ minDelta`. Solo aplica a yields.
 *
 *   - **cumulativeReturnRange**: retorno acumulado sobre la ventana cae en
 *     `[minReturn, maxReturn]`. Decimales (0.20 = 20%). Solo aplica a
 *     `portfolioReturn`. Uso típico: "rally +20% en 12m" → `minReturn = 0.20`,
 *     `maxReturn = null`; "año plano" → `[-0.05, 0.05]`; "caída severa" →
 *     `[null, -0.20]`.
 *
 *   - **percentileBandReturn**: el retorno acumulado del path sobre la ventana
 *     está entre los percentiles `lowerP` y `upperP` de todos los paths.
 *     Captura "mejor tercil" (`[67, 100]`), "peor tercil" (`[0, 33]`),
 *     "percentiles 25-75" (la banda mediana), etc. Solo aplica a
 *     `portfolioReturn`.
 */
export type PredicateMode =
  | { kind: 'peakChange'; minDelta: number; maxDelta: number | null }
  | { kind: 'troughChange'; minDelta: number | null; maxDelta: number }
  | { kind: 'endpointChange'; minDelta: number | null; maxDelta: number | null }
  | { kind: 'persistentThreshold'; minDelta: number; minDurationMonths: number }
  | {
      kind: 'cumulativeReturnRange';
      minReturn: number | null;
      maxReturn: number | null;
    }
  | {
      /**
       * Pico del retorno acumulado dentro de la ventana.
       *   peakCumRet = max over t ∈ [startMonth..endMonth] de (∏(1+r[s..t]) − 1)
       * Aplica a `portfolioReturn` y `etfReturn`. Uso típico: "rally +25% en
       * algún momento antes de 24 meses" → `minReturn = 0.25`, `maxReturn = null`.
       */
      kind: 'peakCumulativeReturnRange';
      minReturn: number | null;
      maxReturn: number | null;
    }
  | {
      /**
       * Piso del retorno acumulado dentro de la ventana.
       *   troughCumRet = min over t ∈ [startMonth..endMonth] de (∏(1+r[s..t]) − 1)
       * Aplica a `portfolioReturn` y `etfReturn`. Uso típico: "drawdown ≤ −20%
       * en algún momento antes de 12 meses" → `minReturn = null`, `maxReturn = -0.20`.
       */
      kind: 'troughCumulativeReturnRange';
      minReturn: number | null;
      maxReturn: number | null;
    }
  | {
      kind: 'percentileBandReturn';
      lowerP: number; // 0..100
      upperP: number; // 0..100
    };

export type View = {
  /** Id estable para referencias de UI / tests. */
  id: string;
  /** Etiqueta corta mostrada al asesor. */
  label: string;
  /** Frase explicativa user-facing (una línea). */
  description: string;
  subject: ViewSubject;
  mode: PredicateMode;
  /** Ventana de evaluación del predicado. 1-indexada, inclusiva. */
  window: Window;
};

/**
 * View compuesto — combina múltiples predicados single-view con AND/OR.
 *
 * Casos típicos: "estanflación" (rates up AND equity crash), "aterrizaje suave"
 * (rates down AND equity rally), "goldilocks" (rates stable AND equity top tercile),
 * "risk-off" (rates down AND equity crash), "rally cross-asset" (rally SPY en 6m
 * AND rally EZU en 12m — ventanas distintas por componente, Fase C.2b).
 *
 * Constraints:
 *   - **Fase C.2b (2026-04-20):** las ventanas NO necesitan coincidir entre
 *     componentes. Cada componente evalúa sobre su propia `window`. El
 *     `composite.window` se usa como envelope de display (no para validación
 *     cruzada). Ver `componentWindowEnvelope()` para calcular el envelope a
 *     partir de los componentes.
 *   - `components.length >= 1`. Un composite con 0 componentes lanza error.
 *   - Mezcla de subjects permitida (yield + portfolioReturn + etfReturn en el
 *     mismo composite).
 *   - Si cualquier componente requiere yields pero yieldPaths es null, la
 *     evaluación lanza el mismo error que para views single-subject de yield.
 *   - Idem para etfReturns.
 *   - Cada componente valida su propia `window` contra `dataset.horizonMonths`
 *     en `evaluateSingleView`.
 *
 * Representación: discriminada vía `kind: 'composite'` (vs `View` que no tiene
 * `kind` y queda como el tipo default single-predicate).
 */
export type CompositeView = {
  kind: 'composite';
  id: string;
  label: string;
  description: string;
  /** 'and' = intersección de matched paths. 'or' = unión. */
  combinator: 'and' | 'or';
  /**
   * Componentes single-predicate. Cada uno tiene su propia `window`. Las
   * ventanas pueden ser distintas entre componentes (Fase C.2b).
   */
  components: readonly View[];
  /**
   * Ventana de display del composite — envelope típico (start = min de todos
   * los component starts, end = max de todos los ends). Usada por la UI para
   * hints de slider, NO para validación cruzada de componentes.
   */
  window: Window;
};

/**
 * Dirección de un componente en un view sincronizado.
 *   - 'positive': retornos > +threshold (rally) / yields Δ > +threshold (suben).
 *   - 'negative': retornos < −threshold (caída) / yields Δ < −threshold (bajan).
 */
export type SyncDirection = 'positive' | 'negative';

/**
 * Un componente de un `SynchronizedView`. A diferencia de `View`, no tiene
 * `mode` ni `window` propia — todos los componentes de un sincronizado
 * comparten la ventana del view y aplican una condición **por mes** en vez
 * de una condición agregada sobre la ventana.
 */
export type SyncComponent = {
  subject: ViewSubject;
  direction: SyncDirection;
  /**
   * Magnitud mínima absoluta del threshold (decimal). Default 0.
   *   - Para subjects de retorno: |r_t| > threshold con el signo de `direction`.
   *   - Para subjects de yield: |Δy_t| > threshold con el signo de `direction`.
   * Ejemplo: `thresholdMagnitude: 0.005` y `direction: 'negative'` en un
   * portfolioReturn → matchea meses donde r_t < −0.5%.
   */
  thresholdMagnitude?: number;
};

/**
 * View sincronizado (Fase C.4) — captura co-movimiento **mes a mes**.
 *
 * Semántica: para cada path, contamos cuántos meses dentro de `window`
 * cumplen simultáneamente las condiciones de TODOS los componentes en ese
 * mismo mes. El view matchea si ese conteo ≥ `minMonths`.
 *
 * Caso canónico — estanflación real: SPY cayendo (return < 0) Y TNX subiendo
 * (Δy > 0) en el mismo mes. Un composite AND tradicional solo verifica que
 * ambas cosas ocurran en ALGÚN mes de la ventana (potencialmente distintos);
 * un synchronized view exige co-ocurrencia mensual, que es el patrón real
 * de estanflación.
 *
 * Constraints:
 *   - `components.length >= 1` (típico ≥ 2; un componente solo es degenerado
 *     pero sintácticamente válido).
 *   - `minMonths >= 0`, entero. Si excede el largo de la ventana, throw.
 *   - Ventana común (no per-componente) — el co-movimiento requiere alinear
 *     la grilla temporal.
 */
export type SynchronizedView = {
  kind: 'synchronized';
  id: string;
  label: string;
  description: string;
  components: readonly SyncComponent[];
  /** Mínimo de meses distintos con todas las direcciones alineadas simultáneamente. */
  minMonths: number;
  window: Window;
};

/** Unión discriminada de view single-predicate + composite + synchronized. */
export type AnyView = View | CompositeView | SynchronizedView;

/** Type guard: distingue composite de single. */
export function isCompositeView(view: AnyView): view is CompositeView {
  return (view as CompositeView).kind === 'composite';
}

/** Type guard: distingue synchronized de composite/single. */
export function isSynchronizedView(view: AnyView): view is SynchronizedView {
  return (view as SynchronizedView).kind === 'synchronized';
}

/**
 * True si el view (single, composite o synchronized) requiere yield paths
 * para evaluarse. Composite/synchronized requieren yields si cualquiera de
 * sus componentes los requiere.
 */
export function viewRequiresYieldPaths(view: AnyView): boolean {
  if (isCompositeView(view) || isSynchronizedView(view)) {
    return view.components.some((c) => c.subject.kind === 'yield');
  }
  return view.subject.kind === 'yield';
}

/**
 * True si el view requiere retornos per-ETF. Composite/synchronized los
 * requieren si al menos un componente tiene subject `etfReturn`.
 */
export function viewRequiresEtfReturns(view: AnyView): boolean {
  if (isCompositeView(view) || isSynchronizedView(view)) {
    return view.components.some((c) => c.subject.kind === 'etfReturn');
  }
  return view.subject.kind === 'etfReturn';
}

/**
 * Set de tickers requeridos por el view. Devuelve `[]` si el view no usa
 * subjects ETF. Útil para que el caller verifique que el dataset.etfReturns
 * contenga los tickers necesarios antes de evaluar.
 */
export function requiredEtfTickers(view: AnyView): readonly Ticker[] {
  const set = new Set<Ticker>();
  if (isCompositeView(view) || isSynchronizedView(view)) {
    for (const c of view.components) {
      if (c.subject.kind === 'etfReturn') set.add(c.subject.ticker);
    }
  } else if (view.subject.kind === 'etfReturn') {
    set.add(view.subject.ticker);
  }
  return Array.from(set);
}

/**
 * Calcula el envelope de ventana cubierto por los componentes de un composite:
 * start = min(component.window.startMonth), end = max(component.window.endMonth).
 *
 * Útil para:
 *   - UI: hint del slider sobre qué rango temporal abarca el composite.
 *   - Validación: verificar que `composite.window` ⊇ envelope (convención
 *     recomendada pero no enforced — un composite puede declarar un window
 *     más amplio como display envelope).
 *
 * Throw si el composite tiene 0 componentes (usar el validator de `evaluateCompositeView`).
 */
export function componentWindowEnvelope(view: CompositeView): Window {
  if (view.components.length === 0) {
    throw new Error(
      `componentWindowEnvelope: view "${view.id}" no tiene componentes`,
    );
  }
  let startMonth = Infinity;
  let endMonth = -Infinity;
  for (const c of view.components) {
    if (c.window.startMonth < startMonth) startMonth = c.window.startMonth;
    if (c.window.endMonth > endMonth) endMonth = c.window.endMonth;
  }
  return { startMonth, endMonth };
}

export type ViewEvaluation = {
  /** Puede ser single (View) o compuesto (CompositeView). */
  view: AnyView;
  /** Número de paths que cumplen el view. */
  nMatched: number;
  /** Total de paths evaluados. */
  nTotal: number;
  /** Probabilidad empírica = nMatched / nTotal. */
  probability: number;
  /** Error estándar de la probabilidad: sqrt(p(1-p)/n). Para IC 95% ≈ ±1.96·SE. */
  standardError: number;
  /** Indices (0..nTotal-1) de los paths que cumplen el view. */
  matchedIndices: Uint32Array;
};

/**
 * Retornos mensuales per-ETF (32 tickers). Cada Float32Array tiene shape
 * [nPaths × horizonMonths]. Solo disponible si el bootstrap corrió con
 * `outputEtfReturns: true`.
 */
export type EtfReturns = Readonly<Partial<Record<Ticker, Float32Array>>>;

/**
 * Datos simulados mínimos para evaluar views. Alineado con la salida del
 * bootstrap + applyFlows.
 */
export type ViewDataset = {
  /** Retornos del portafolio A. [nPaths × horizonMonths]. */
  portfolioReturnsA: Float32Array;
  /** Retornos del portafolio B. [nPaths × horizonMonths]. */
  portfolioReturnsB: Float32Array;
  /** Yield paths (opcional — requerido para views con subject 'yield'). */
  yieldPaths: YieldPaths | null;
  /**
   * Retornos per-ETF (opcional — requerido para views con subject 'etfReturn').
   * Mapeo parcial: puede no contener todos los 32 tickers si el worker emitió
   * un subset. La evaluación lanza error si el ticker solicitado no está.
   */
  etfReturns: EtfReturns | null;
  /**
   * Yield inicial (pre-simulación, mes 0) por yield key. Necesario para
   * construir `yieldAtStart` cuando la ventana arranca en mes 1.
   */
  yieldInitial: Readonly<Record<YieldKey, number>>;
  nPaths: number;
  horizonMonths: number;
};

/** Input de `applyAndComputeConditional`: dataset + simulación de flujos. */
export type ConditionalInput = {
  dataset: ViewDataset;
  /** Simulación de flujos (values + ruined + netContributions + flowSchedule). */
  simulation: FlowsOutput;
  /** Ventana de evaluación de las métricas. Puede diferir de view.window. */
  window: Window;
};

export type AsymmetricAnalysis = {
  /** Evaluación completa del view. */
  evaluation: ViewEvaluation;
  /** Métricas de los paths que cumplen el view (si nMatched > 0). */
  matched: WindowMetrics | null;
  /** Métricas de los paths que NO cumplen el view (si nMatched < nTotal). */
  unmatched: WindowMetrics | null;
  /** Métricas sobre todos los paths (sin condicionar). */
  base: WindowMetrics;
};

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function validateWindow(window: Window, horizonMonths: number): void {
  if (
    !Number.isInteger(window.startMonth) ||
    !Number.isInteger(window.endMonth) ||
    window.startMonth < 1 ||
    window.endMonth > horizonMonths ||
    window.startMonth > window.endMonth
  ) {
    throw new Error(
      `evaluateView: ventana inválida {start: ${window.startMonth}, end: ${window.endMonth}} ` +
        `para horizonte ${horizonMonths}`,
    );
  }
}

/**
 * Retorna el nivel del yield al "inicio" de la ventana (antes del primer mes
 * observado). Si `startMonth === 1`, es el yield inicial pre-simulación;
 * si no, es el yield al cierre del mes anterior (`startMonth - 1`, 1-indexado
 * = índice `startMonth - 2` 0-indexado).
 */
function yieldAtStart(
  yieldArr: Float32Array,
  pathIdx: number,
  horizonMonths: number,
  startMonth: number,
  initial: number,
): number {
  if (startMonth === 1) return initial;
  return yieldArr[pathIdx * horizonMonths + (startMonth - 2)];
}

/** Retorna el retorno acumulado del path sobre la ventana (decimal). */
function cumulativeReturn(
  returns: Float32Array,
  pathIdx: number,
  horizonMonths: number,
  window: Window,
): number {
  const rowOffset = pathIdx * horizonMonths;
  const startIdx = window.startMonth - 1; // 0-indexed
  const endIdx = window.endMonth; // exclusive
  let growth = 1;
  for (let i = startIdx; i < endIdx; i++) {
    growth *= 1 + returns[rowOffset + i];
  }
  return growth - 1;
}

/**
 * Retorna `{ peak, trough }` del retorno acumulado desde el inicio de la
 * ventana hasta cada mes t dentro de la ventana. Ambos son medidos desde el
 * nivel inicial (cumRet(start, start-1) = 0, cumRet(start, t) = ∏(1+r)−1).
 *
 *   peak = max cumRet(start, t) over t ∈ [start..end]
 *   trough = min cumRet(start, t) over t ∈ [start..end]
 *
 * Nota: incluye el valor inicial 0 implícitamente — si todos los retornos son
 * positivos, trough siempre será el valor del primer mes (no 0), porque
 * evaluamos después de aplicar el retorno. Si querés incluir el punto
 * "mes 0" como candidato, agregá un clamp: `peak = Math.max(0, peak)`.
 * Decisión actual: **no** clampear — el peak/trough es de los valores
 * observables dentro de la ventana, consistente con `peakChange` de yields.
 */
function peakTroughCumulative(
  returns: Float32Array,
  pathIdx: number,
  horizonMonths: number,
  window: Window,
): { peak: number; trough: number } {
  const rowOffset = pathIdx * horizonMonths;
  const startIdx = window.startMonth - 1;
  const endIdx = window.endMonth; // exclusive
  let growth = 1;
  let peak = -Infinity;
  let trough = Infinity;
  for (let i = startIdx; i < endIdx; i++) {
    growth *= 1 + returns[rowOffset + i];
    const cum = growth - 1;
    if (cum > peak) peak = cum;
    if (cum < trough) trough = cum;
  }
  return { peak, trough };
}

/** Evalúa un view sobre un single path. */
function matchesPredicate(
  view: View,
  pathIdx: number,
  dataset: ViewDataset,
  percentileBandThresholds: { lo: number; hi: number } | null,
): boolean {
  const { subject, mode, window } = view;
  const { horizonMonths } = dataset;
  const startMonth = window.startMonth;
  const endMonth = window.endMonth;

  if (subject.kind === 'yield') {
    if (!dataset.yieldPaths) {
      throw new Error(
        `evaluateView: yieldPaths es null pero el view "${view.id}" requiere ` +
          `subject yield=${subject.key}. Re-corré el bootstrap con outputYieldPaths=true.`,
      );
    }
    const yArr = dataset.yieldPaths[subject.key];
    const initial = dataset.yieldInitial[subject.key];
    const yStart = yieldAtStart(yArr, pathIdx, horizonMonths, startMonth, initial);
    const rowOffset = pathIdx * horizonMonths;

    if (mode.kind === 'peakChange') {
      let peakDelta = -Infinity;
      for (let m = startMonth; m <= endMonth; m++) {
        const delta = yArr[rowOffset + (m - 1)] - yStart;
        if (delta > peakDelta) peakDelta = delta;
      }
      if (peakDelta < mode.minDelta) return false;
      if (mode.maxDelta !== null && peakDelta > mode.maxDelta) return false;
      return true;
    }

    if (mode.kind === 'troughChange') {
      let troughDelta = Infinity;
      for (let m = startMonth; m <= endMonth; m++) {
        const delta = yArr[rowOffset + (m - 1)] - yStart;
        if (delta < troughDelta) troughDelta = delta;
      }
      if (mode.minDelta !== null && troughDelta < mode.minDelta) return false;
      if (troughDelta > mode.maxDelta) return false;
      return true;
    }

    if (mode.kind === 'endpointChange') {
      const delta = yArr[rowOffset + (endMonth - 1)] - yStart;
      if (mode.minDelta !== null && delta < mode.minDelta) return false;
      if (mode.maxDelta !== null && delta > mode.maxDelta) return false;
      return true;
    }

    if (mode.kind === 'persistentThreshold') {
      // racha consecutiva ≥ minDurationMonths con (y - yStart) ≥ minDelta
      let currentRun = 0;
      for (let m = startMonth; m <= endMonth; m++) {
        const delta = yArr[rowOffset + (m - 1)] - yStart;
        if (delta >= mode.minDelta) {
          currentRun++;
          if (currentRun >= mode.minDurationMonths) return true;
        } else {
          currentRun = 0;
        }
      }
      return false;
    }

    throw new Error(`evaluateView: modo incompatible ${mode.kind} con subject yield`);
  }

  // subject.kind === 'portfolioReturn' | 'etfReturn' — ambos operan sobre
  // retornos mensuales
  const returnsArr = resolveReturnsArray(subject, dataset);

  if (mode.kind === 'cumulativeReturnRange') {
    const cumRet = cumulativeReturn(returnsArr, pathIdx, horizonMonths, window);
    if (mode.minReturn !== null && cumRet < mode.minReturn) return false;
    if (mode.maxReturn !== null && cumRet > mode.maxReturn) return false;
    return true;
  }

  if (mode.kind === 'peakCumulativeReturnRange') {
    const { peak } = peakTroughCumulative(returnsArr, pathIdx, horizonMonths, window);
    if (mode.minReturn !== null && peak < mode.minReturn) return false;
    if (mode.maxReturn !== null && peak > mode.maxReturn) return false;
    return true;
  }

  if (mode.kind === 'troughCumulativeReturnRange') {
    const { trough } = peakTroughCumulative(returnsArr, pathIdx, horizonMonths, window);
    if (mode.minReturn !== null && trough < mode.minReturn) return false;
    if (mode.maxReturn !== null && trough > mode.maxReturn) return false;
    return true;
  }

  if (mode.kind === 'percentileBandReturn') {
    if (!percentileBandThresholds) {
      throw new Error(
        `evaluateView: modo percentileBandReturn requiere pre-computar thresholds`,
      );
    }
    const cumRet = cumulativeReturn(returnsArr, pathIdx, horizonMonths, window);
    return cumRet >= percentileBandThresholds.lo && cumRet <= percentileBandThresholds.hi;
  }

  throw new Error(
    `evaluateView: modo incompatible ${mode.kind} con subject ${subject.kind}`,
  );
}

/**
 * Dado un subject (portfolio o etf), resuelve la Float32Array de retornos
 * correspondiente. Lanza error legible si el subject es etfReturn pero el
 * dataset no contiene el ticker solicitado.
 */
function resolveReturnsArray(
  subject: Extract<ViewSubject, { kind: 'portfolioReturn' | 'etfReturn' }>,
  dataset: ViewDataset,
): Float32Array {
  if (subject.kind === 'portfolioReturn') {
    return subject.portfolio === 'A' ? dataset.portfolioReturnsA : dataset.portfolioReturnsB;
  }
  // etfReturn
  if (!dataset.etfReturns) {
    throw new Error(
      `evaluateView: etfReturns es null pero el view requiere subject etfReturn=${subject.ticker}. ` +
        `Re-corré el bootstrap con outputEtfReturns=true.`,
    );
  }
  const arr = dataset.etfReturns[subject.ticker];
  if (!arr) {
    throw new Error(
      `evaluateView: ticker "${subject.ticker}" no está en dataset.etfReturns. ` +
        `El worker emite todos los 32 tickers cuando outputEtfReturns=true — verificá la configuración.`,
    );
  }
  return arr;
}

/**
 * Para modos `percentileBandReturn`, computa los thresholds `lo` y `hi` sobre
 * toda la población de paths. Los paths cuyo retorno acumulado cae en
 * `[lo, hi]` son los que matchean.
 */
function computePercentileThresholds(
  view: View,
  dataset: ViewDataset,
): { lo: number; hi: number } {
  const { subject, mode, window } = view;
  if (mode.kind !== 'percentileBandReturn') {
    throw new Error('computePercentileThresholds: sólo aplica a percentileBandReturn');
  }
  if (subject.kind !== 'portfolioReturn' && subject.kind !== 'etfReturn') {
    throw new Error(
      `computePercentileThresholds: subject ${subject.kind} no soporta percentileBandReturn ` +
        `(solo portfolioReturn y etfReturn).`,
    );
  }
  const { lowerP, upperP } = mode;
  if (lowerP < 0 || lowerP > 100 || upperP < 0 || upperP > 100 || lowerP > upperP) {
    throw new Error(
      `computePercentileThresholds: percentiles inválidos lowerP=${lowerP}, upperP=${upperP}`,
    );
  }
  const returnsArr = resolveReturnsArray(subject, dataset);
  const n = dataset.nPaths;
  const cumRets = new Float64Array(n);
  for (let p = 0; p < n; p++) {
    cumRets[p] = cumulativeReturn(returnsArr, p, dataset.horizonMonths, window);
  }
  const sorted = Array.from(cumRets).sort((a, b) => a - b);
  const pickPercentile = (pct: number): number => {
    const idx = (pct / 100) * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
  };
  return {
    lo: pickPercentile(lowerP),
    hi: pickPercentile(upperP),
  };
}

// ---------------------------------------------------------------------------
// Función principal: evaluateView (single + composite)
// ---------------------------------------------------------------------------

/**
 * Evalúa un view single-predicate. Separada de `evaluateView` para reusar
 * desde `evaluateCompositeView` sin la ramificación por tipo.
 */
function evaluateSingleView(view: View, dataset: ViewDataset): ViewEvaluation {
  validateWindow(view.window, dataset.horizonMonths);

  const n = dataset.nPaths;
  const matched: number[] = [];

  const percentileThresholds =
    view.mode.kind === 'percentileBandReturn'
      ? computePercentileThresholds(view, dataset)
      : null;

  for (let p = 0; p < n; p++) {
    if (matchesPredicate(view, p, dataset, percentileThresholds)) {
      matched.push(p);
    }
  }

  const nMatched = matched.length;
  const probability = nMatched / n;
  const standardError = Math.sqrt((probability * (1 - probability)) / n);
  const matchedIndices = Uint32Array.from(matched);

  return {
    view,
    nMatched,
    nTotal: n,
    probability,
    standardError,
    matchedIndices,
  };
}

/**
 * Evalúa un view compuesto combinando sus componentes con AND o OR sobre
 * los matchedIndices. Complejidad O(k · nPaths · windowLength) donde k es
 * la cantidad de componentes.
 *
 * Precondiciones (validadas con throw):
 *   - `view.components.length >= 1`.
 *   - Todos los componentes comparten la misma ventana que el composite.
 *   - Si algún componente tiene subject.kind === 'yield', yieldPaths no debe
 *     ser null (error heredado de `evaluateSingleView`).
 */
function evaluateCompositeView(view: CompositeView, dataset: ViewDataset): ViewEvaluation {
  validateWindow(view.window, dataset.horizonMonths);
  if (view.components.length === 0) {
    throw new Error(`evaluateCompositeView: view "${view.id}" no tiene componentes`);
  }
  // Fase C.2b: las ventanas ya NO necesitan coincidir entre componentes. Cada
  // componente valida su propia window contra dataset.horizonMonths dentro de
  // evaluateSingleView. El composite.window es solo display envelope.

  const n = dataset.nPaths;
  const componentEvals = view.components.map((c) => evaluateSingleView(c, dataset));

  // Bitmap por componente (membership O(1) por path).
  const bitmaps: Uint8Array[] = componentEvals.map((ev) => {
    const bm = new Uint8Array(n);
    for (let i = 0; i < ev.matchedIndices.length; i++) bm[ev.matchedIndices[i]] = 1;
    return bm;
  });

  const matched: number[] = [];
  if (view.combinator === 'and') {
    for (let p = 0; p < n; p++) {
      let all = true;
      for (const bm of bitmaps) {
        if (bm[p] === 0) {
          all = false;
          break;
        }
      }
      if (all) matched.push(p);
    }
  } else {
    // 'or' — unión
    for (let p = 0; p < n; p++) {
      let any = false;
      for (const bm of bitmaps) {
        if (bm[p] === 1) {
          any = true;
          break;
        }
      }
      if (any) matched.push(p);
    }
  }

  const nMatched = matched.length;
  const probability = nMatched / n;
  const standardError = Math.sqrt((probability * (1 - probability)) / n);
  const matchedIndices = Uint32Array.from(matched);

  return {
    view,
    nMatched,
    nTotal: n,
    probability,
    standardError,
    matchedIndices,
  };
}

/**
 * True si un componente sincronizado cumple su condición direccional en un
 * mes específico (1-indexado). Throw si el dataset no tiene los datos
 * requeridos (yieldPaths/etfReturns).
 *
 * Convención de Δy: el cambio en el mes t es y_at_end_of_t − y_at_end_of_(t−1),
 * y para t=1 usamos y_at_end_of_1 − yieldInitial (consistente con
 * `yieldAtStart` del resto del módulo).
 */
function syncComponentMatchesAtMonth(
  component: SyncComponent,
  pathIdx: number,
  month: number, // 1-indexed
  dataset: ViewDataset,
): boolean {
  const threshold = component.thresholdMagnitude ?? 0;
  const H = dataset.horizonMonths;
  const p = pathIdx;
  const t = month;

  if (component.subject.kind === 'yield') {
    const yieldPaths = dataset.yieldPaths;
    if (!yieldPaths) {
      throw new Error(
        'evaluateSynchronizedView: yieldPaths null pero un componente tiene subject.kind === "yield"',
      );
    }
    const yieldArr = yieldPaths[component.subject.key];
    const prev =
      t === 1
        ? dataset.yieldInitial[component.subject.key]
        : yieldArr[p * H + (t - 2)];
    const curr = yieldArr[p * H + (t - 1)];
    const delta = curr - prev;
    return component.direction === 'positive' ? delta > threshold : delta < -threshold;
  }

  if (component.subject.kind === 'portfolioReturn') {
    const returns =
      component.subject.portfolio === 'A'
        ? dataset.portfolioReturnsA
        : dataset.portfolioReturnsB;
    const r = returns[p * H + (t - 1)];
    return component.direction === 'positive' ? r > threshold : r < -threshold;
  }

  // etfReturn
  const etfReturns = dataset.etfReturns;
  if (!etfReturns) {
    throw new Error(
      'evaluateSynchronizedView: etfReturns null pero un componente tiene subject.kind === "etfReturn"',
    );
  }
  const arr = etfReturns[component.subject.ticker];
  if (!arr) {
    throw new Error(
      `evaluateSynchronizedView: ticker "${component.subject.ticker}" no está en etfReturns`,
    );
  }
  const r = arr[p * H + (t - 1)];
  return component.direction === 'positive' ? r > threshold : r < -threshold;
}

/**
 * Evalúa un view sincronizado (Fase C.4). Para cada path, cuenta cuántos
 * meses dentro de la ventana cumplen simultáneamente la dirección de
 * TODOS los componentes. Match si count ≥ `view.minMonths`.
 *
 * Complejidad: O(nPaths · windowLength · k) donde k es # componentes.
 *
 * Validaciones:
 *   - `components.length >= 1`.
 *   - `minMonths` entero no-negativo.
 *   - `minMonths` ≤ largo de la ventana (si no, imposible de satisfacer).
 */
function evaluateSynchronizedView(
  view: SynchronizedView,
  dataset: ViewDataset,
): ViewEvaluation {
  validateWindow(view.window, dataset.horizonMonths);
  if (view.components.length === 0) {
    throw new Error(
      `evaluateSynchronizedView: view "${view.id}" no tiene componentes`,
    );
  }
  if (!Number.isInteger(view.minMonths) || view.minMonths < 0) {
    throw new Error(
      `evaluateSynchronizedView: view "${view.id}" tiene minMonths inválido (${view.minMonths})`,
    );
  }
  const windowLen = view.window.endMonth - view.window.startMonth + 1;
  if (view.minMonths > windowLen) {
    throw new Error(
      `evaluateSynchronizedView: view "${view.id}" tiene minMonths (${view.minMonths}) mayor que el largo de la ventana (${windowLen})`,
    );
  }

  const n = dataset.nPaths;
  const matched: number[] = [];

  for (let p = 0; p < n; p++) {
    let syncCount = 0;
    for (let m = view.window.startMonth; m <= view.window.endMonth; m++) {
      let allMatch = true;
      for (const c of view.components) {
        if (!syncComponentMatchesAtMonth(c, p, m, dataset)) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        syncCount++;
        // Early exit: si ya superamos el threshold, no necesitamos seguir contando.
        if (syncCount >= view.minMonths) {
          break;
        }
      }
    }
    if (syncCount >= view.minMonths) matched.push(p);
  }

  const nMatched = matched.length;
  const probability = nMatched / n;
  const standardError = Math.sqrt((probability * (1 - probability)) / n);

  return {
    view,
    nMatched,
    nTotal: n,
    probability,
    standardError,
    matchedIndices: Uint32Array.from(matched),
  };
}

/**
 * Aplica un view (single, composite o synchronized) al dataset simulado y
 * devuelve el conjunto de paths que lo cumplen, junto con la probabilidad
 * empírica y su error estándar.
 *
 * Complejidad:
 *   - single: O(nPaths · windowLength).
 *   - composite: O(k · nPaths · windowLength).
 *   - synchronized: O(nPaths · windowLength · k) con early exit al alcanzar minMonths.
 *   - extra O(nPaths · log(nPaths)) si el modo es `percentileBandReturn`.
 */
export function evaluateView(view: AnyView, dataset: ViewDataset): ViewEvaluation {
  if (isCompositeView(view)) return evaluateCompositeView(view, dataset);
  if (isSynchronizedView(view)) return evaluateSynchronizedView(view, dataset);
  return evaluateSingleView(view, dataset);
}

// ---------------------------------------------------------------------------
// Métricas condicionales y análisis asimétrico
// ---------------------------------------------------------------------------

/**
 * Calcula métricas restringidas a un subconjunto de paths. Construye una vista
 * filtrada de `simulation` y `portfolioReturns` y delega a `computeMetrics`.
 *
 * Si `indices` es un subset vacío devuelve `null` (no hay muestra para
 * estadísticas).
 */
export function computeConditionalMetrics(
  indices: Uint32Array,
  simulation: FlowsOutput,
  portfolioReturns: Float32Array,
  nPaths: number,
  horizonMonths: number,
  window: Window,
): WindowMetrics | null {
  if (indices.length === 0) return null;

  // Validación: todos los indices deben ser < nPaths (ya que se usan como
  // offsets en simulation.values y portfolioReturns).
  for (let k = 0; k < indices.length; k++) {
    if (indices[k] >= nPaths) {
      throw new Error(
        `computeConditionalMetrics: índice ${indices[k]} fuera de rango [0, ${nPaths})`,
      );
    }
  }

  const subsetN = indices.length;
  const H = horizonMonths;
  const H1 = H + 1;

  // Subset de arrays. Compacta-copy para reutilizar computeMetrics sin cambios.
  const subValues = new Float32Array(subsetN * H1);
  const subReturns = new Float32Array(subsetN * H);
  const subRuined = new Uint8Array(subsetN);

  for (let k = 0; k < subsetN; k++) {
    const p = indices[k];
    // values
    const srcValuesOff = p * H1;
    const dstValuesOff = k * H1;
    for (let t = 0; t < H1; t++) subValues[dstValuesOff + t] = simulation.values[srcValuesOff + t];
    // portfolioReturns
    const srcRetOff = p * H;
    const dstRetOff = k * H;
    for (let t = 0; t < H; t++) subReturns[dstRetOff + t] = portfolioReturns[srcRetOff + t];
    // ruined
    subRuined[k] = simulation.ruined[p];
  }

  const subSimulation: FlowsOutput = {
    values: subValues,
    ruined: subRuined,
    // netContributions y flowSchedule son determinísticas — no dependen del path.
    netContributions: simulation.netContributions,
    flowSchedule: simulation.flowSchedule,
  };

  return computeMetrics({
    simulation: subSimulation,
    portfolioReturns: subReturns,
    nPaths: subsetN,
    horizonMonths: H,
    window,
  });
}

/**
 * Análisis asimétrico: métricas para matched, unmatched y base (todos).
 * El output facilita presentar al cliente "si el view se materializa" vs
 * "si no se materializa" vs "el base case sin condicionar".
 */
export function asymmetricAnalysis(
  view: AnyView,
  input: ConditionalInput,
  portfolioReturns: Float32Array,
): AsymmetricAnalysis {
  const evaluation = evaluateView(view, input.dataset);

  const { nTotal, matchedIndices } = evaluation;

  // Base: todos los paths (evitamos pasar por computeConditionalMetrics con un
  // array de 0..n-1 para no copiar innecesariamente).
  const base = computeMetrics({
    simulation: input.simulation,
    portfolioReturns,
    nPaths: nTotal,
    horizonMonths: input.dataset.horizonMonths,
    window: input.window,
  });

  const matched = computeConditionalMetrics(
    matchedIndices,
    input.simulation,
    portfolioReturns,
    nTotal,
    input.dataset.horizonMonths,
    input.window,
  );

  // Unmatched = complemento de matched
  const matchedSet = new Set<number>(Array.from(matchedIndices));
  const unmatchedArr: number[] = [];
  for (let p = 0; p < nTotal; p++) {
    if (!matchedSet.has(p)) unmatchedArr.push(p);
  }
  const unmatchedIndices = Uint32Array.from(unmatchedArr);
  const unmatched = computeConditionalMetrics(
    unmatchedIndices,
    input.simulation,
    portfolioReturns,
    nTotal,
    input.dataset.horizonMonths,
    input.window,
  );

  return { evaluation, matched, unmatched, base };
}

// ---------------------------------------------------------------------------
// Presets built-in
// ---------------------------------------------------------------------------

/**
 * 9 presets iniciales de views — cubren los escenarios más comunes que un
 * asesor conversa con un cliente. Todos son single-predicate. Los que apuntan
 * a portfolioReturn usan portfolio A por default; si se quiere aplicar a B,
 * se puede clonar el preset cambiando `subject.portfolio` a 'B'.
 *
 * Las ventanas están expresadas como meses futuros (`startMonth: 1`). Si se
 * necesita evaluar un view en otro tramo del horizonte (ej. "meses 24-36"),
 * basta con clonar el preset y cambiar `window`.
 */
export const BUILT_IN_VIEWS: readonly View[] = [
  // === YIELD VIEWS (Tasa 10 años / TNX como default) ===
  {
    id: 'rates-up-peak-100-12m',
    label: 'Tasas suben 100 pbs (pico, 12m)',
    description:
      'En algún momento de los próximos 12 meses la tasa 10 años toca +100 pbs o más sobre el nivel actual.',
    subject: { kind: 'yield', key: 'TNX' },
    mode: { kind: 'peakChange', minDelta: 0.01, maxDelta: null },
    window: { startMonth: 1, endMonth: 12 },
  },
  {
    id: 'rates-up-endpoint-100-12m',
    label: 'Tasas cierran +100 pbs (12m)',
    description:
      'La tasa 10 años al cierre del mes 12 está 100 pbs o más arriba del nivel actual.',
    subject: { kind: 'yield', key: 'TNX' },
    mode: { kind: 'endpointChange', minDelta: 0.01, maxDelta: null },
    window: { startMonth: 1, endMonth: 12 },
  },
  {
    id: 'rates-down-peak-100-12m',
    label: 'Tasas bajan 100 pbs (pico, 12m)',
    description:
      'En algún momento de los próximos 12 meses la tasa 10 años toca −100 pbs o más bajo el nivel actual.',
    subject: { kind: 'yield', key: 'TNX' },
    mode: { kind: 'troughChange', minDelta: null, maxDelta: -0.01 },
    window: { startMonth: 1, endMonth: 12 },
  },
  {
    id: 'rates-stable-endpoint-25-12m',
    label: 'Tasas estables ±25 pbs (12m)',
    description:
      'La tasa 10 años al cierre del mes 12 está dentro de ±25 pbs del nivel actual.',
    subject: { kind: 'yield', key: 'TNX' },
    mode: { kind: 'endpointChange', minDelta: -0.0025, maxDelta: 0.0025 },
    window: { startMonth: 1, endMonth: 12 },
  },
  // === EQUITY / PORTFOLIO VIEWS (portfolio A por default) ===
  {
    id: 'portfolioA-crash-20-12m',
    label: 'Portafolio A cae −20% o más (12m)',
    description:
      'El retorno acumulado del portafolio A sobre los próximos 12 meses es −20% o peor.',
    subject: { kind: 'portfolioReturn', portfolio: 'A' },
    mode: { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: -0.2 },
    window: { startMonth: 1, endMonth: 12 },
  },
  {
    id: 'portfolioA-rally-20-12m',
    label: 'Portafolio A sube +20% o más (12m)',
    description:
      'El retorno acumulado del portafolio A sobre los próximos 12 meses es +20% o mejor.',
    subject: { kind: 'portfolioReturn', portfolio: 'A' },
    mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
    window: { startMonth: 1, endMonth: 12 },
  },
  {
    id: 'portfolioA-flat-12m',
    label: 'Portafolio A plano (12m)',
    description:
      'El retorno acumulado del portafolio A sobre los próximos 12 meses cae en el rango ±5%.',
    subject: { kind: 'portfolioReturn', portfolio: 'A' },
    mode: { kind: 'cumulativeReturnRange', minReturn: -0.05, maxReturn: 0.05 },
    window: { startMonth: 1, endMonth: 12 },
  },
  {
    id: 'portfolioA-best-tercile-24m',
    label: 'Portafolio A en el mejor tercil (24m)',
    description:
      'El retorno acumulado del portafolio A a 24 meses está en el tercio superior de todos los escenarios simulados.',
    subject: { kind: 'portfolioReturn', portfolio: 'A' },
    mode: { kind: 'percentileBandReturn', lowerP: 66.67, upperP: 100 },
    window: { startMonth: 1, endMonth: 24 },
  },
  {
    id: 'portfolioA-worst-tercile-24m',
    label: 'Portafolio A en el peor tercil (24m)',
    description:
      'El retorno acumulado del portafolio A a 24 meses está en el tercio inferior de todos los escenarios simulados.',
    subject: { kind: 'portfolioReturn', portfolio: 'A' },
    mode: { kind: 'percentileBandReturn', lowerP: 0, upperP: 33.33 },
    window: { startMonth: 1, endMonth: 24 },
  },
] as const;

/** Lookup por id. Throw si no existe. */
export function getBuiltInView(id: string): View {
  const v = BUILT_IN_VIEWS.find((view) => view.id === id);
  if (!v) throw new Error(`getBuiltInView: no existe preset con id="${id}"`);
  return v;
}

/** Helper para clonar un preset cambiando el portafolio target. */
export function withPortfolio(view: View, portfolio: 'A' | 'B'): View {
  if (view.subject.kind !== 'portfolioReturn') {
    throw new Error(`withPortfolio: view "${view.id}" tiene subject ${view.subject.kind}, no portfolioReturn`);
  }
  return {
    ...view,
    id: `${view.id.replace(/portfolio[AB]/, `portfolio${portfolio}`)}`,
    label: view.label.replace(/Portafolio [AB]/, `Portafolio ${portfolio}`),
    description: view.description.replace(/portafolio [AB]/, `portafolio ${portfolio}`),
    subject: { kind: 'portfolioReturn', portfolio },
  };
}

// ---------------------------------------------------------------------------
// Presets compuestos (4 cuadrantes del plano tasas × equity)
// ---------------------------------------------------------------------------

/**
 * Builder interno: construye un componente single-view con ventana unificada
 * al composite. Evita repetir la ventana en cada literal.
 */
function component(
  id: string,
  subject: ViewSubject,
  mode: PredicateMode,
  window: Window,
): View {
  return {
    id,
    // label/description quedan vacíos porque los componentes no se muestran
    // individualmente al asesor — solo la etiqueta del composite.
    label: id,
    description: '',
    subject,
    mode,
    window,
  };
}

const COMPOSITE_WINDOW_12M: Window = { startMonth: 1, endMonth: 12 };

/**
 * 4 presets compuestos built-in — cubren los 4 cuadrantes del plano
 * tasas × equity a 12m. Todos usan AND porque un OR entre "tasas suben" y
 * "equity cae" es demasiado amplio (se acerca a la probabilidad marginal del
 * componente más frecuente). Un asesor pide AND cuando quiere el escenario
 * combinado específico, no la unión.
 */
export const BUILT_IN_COMPOSITE_VIEWS: readonly CompositeView[] = [
  {
    kind: 'composite',
    id: 'composite-stagflation-12m',
    label: 'Estanflación (12m)',
    description:
      'Las tasas suben 100 pbs o más en algún momento de los 12 meses Y el portafolio A acumula −20% o peor en el mismo período.',
    combinator: 'and',
    window: COMPOSITE_WINDOW_12M,
    components: [
      component(
        'stagflation-rates-up',
        { kind: 'yield', key: 'TNX' },
        { kind: 'peakChange', minDelta: 0.01, maxDelta: null },
        COMPOSITE_WINDOW_12M,
      ),
      component(
        'stagflation-equity-crash',
        { kind: 'portfolioReturn', portfolio: 'A' },
        { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: -0.2 },
        COMPOSITE_WINDOW_12M,
      ),
    ],
  },
  {
    kind: 'composite',
    id: 'composite-soft-landing-12m',
    label: 'Aterrizaje suave (12m)',
    description:
      'Las tasas bajan 100 pbs o más en algún momento de los 12 meses Y el portafolio A acumula +20% o mejor en el mismo período.',
    combinator: 'and',
    window: COMPOSITE_WINDOW_12M,
    components: [
      component(
        'soft-landing-rates-down',
        { kind: 'yield', key: 'TNX' },
        { kind: 'troughChange', minDelta: null, maxDelta: -0.01 },
        COMPOSITE_WINDOW_12M,
      ),
      component(
        'soft-landing-equity-rally',
        { kind: 'portfolioReturn', portfolio: 'A' },
        { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
        COMPOSITE_WINDOW_12M,
      ),
    ],
  },
  {
    kind: 'composite',
    id: 'composite-goldilocks-12m',
    label: 'Goldilocks (12m)',
    description:
      'Las tasas cierran dentro de ±25 pbs al cabo de 12 meses Y el portafolio A queda en el tercio superior de escenarios.',
    combinator: 'and',
    window: COMPOSITE_WINDOW_12M,
    components: [
      component(
        'goldilocks-rates-stable',
        { kind: 'yield', key: 'TNX' },
        { kind: 'endpointChange', minDelta: -0.0025, maxDelta: 0.0025 },
        COMPOSITE_WINDOW_12M,
      ),
      component(
        'goldilocks-equity-best',
        { kind: 'portfolioReturn', portfolio: 'A' },
        { kind: 'percentileBandReturn', lowerP: 66.67, upperP: 100 },
        COMPOSITE_WINDOW_12M,
      ),
    ],
  },
  {
    kind: 'composite',
    id: 'composite-risk-off-12m',
    label: 'Risk-off / vuelo a la calidad (12m)',
    description:
      'Las tasas bajan 100 pbs o más en algún momento de los 12 meses Y el portafolio A acumula −20% o peor — patrón típico de crisis con flight-to-quality.',
    combinator: 'and',
    window: COMPOSITE_WINDOW_12M,
    components: [
      component(
        'risk-off-rates-down',
        { kind: 'yield', key: 'TNX' },
        { kind: 'troughChange', minDelta: null, maxDelta: -0.01 },
        COMPOSITE_WINDOW_12M,
      ),
      component(
        'risk-off-equity-crash',
        { kind: 'portfolioReturn', portfolio: 'A' },
        { kind: 'cumulativeReturnRange', minReturn: null, maxReturn: -0.2 },
        COMPOSITE_WINDOW_12M,
      ),
    ],
  },
] as const;

/**
 * Presets sincronizados built-in (Fase C.4). Detectan co-movimiento mes a mes
 * entre componentes. Complemento pedagógico de los presets composite AND/OR
 * que solo exigen que los predicados se satisfagan en algún punto de la
 * ventana (potencialmente distintos).
 */
export const BUILT_IN_SYNCHRONIZED_VIEWS: readonly SynchronizedView[] = [
  {
    kind: 'synchronized',
    id: 'sync-stagflation-3m-12m',
    label: 'Estanflación sincronizada (≥3m en 12m)',
    description:
      'En al menos 3 meses distintos del primer año, las tasas 10y suben (Δy > 0) en el mismo mes que el portafolio A cae (retorno < 0). Patrón real de estanflación mes a mes — más estricto que el composite AND tradicional, que solo pide que ambos shocks ocurran en algún punto de la ventana.',
    components: [
      {
        subject: { kind: 'portfolioReturn', portfolio: 'A' },
        direction: 'negative',
      },
      {
        subject: { kind: 'yield', key: 'TNX' },
        direction: 'positive',
      },
    ],
    minMonths: 3,
    window: COMPOSITE_WINDOW_12M,
  },
] as const;

/** Lookup unificado (single + composite + synchronized). Throw si no existe. */
export function getAnyBuiltInView(id: string): AnyView {
  const single = BUILT_IN_VIEWS.find((v) => v.id === id);
  if (single) return single;
  const comp = BUILT_IN_COMPOSITE_VIEWS.find((v) => v.id === id);
  if (comp) return comp;
  const sync = BUILT_IN_SYNCHRONIZED_VIEWS.find((v) => v.id === id);
  if (sync) return sync;
  throw new Error(`getAnyBuiltInView: no existe preset con id="${id}"`);
}

/** Lookup seguro. null si no existe en ninguno de los tres pools. */
export function findAnyBuiltInView(id: string): AnyView | null {
  const single = BUILT_IN_VIEWS.find((v) => v.id === id);
  if (single) return single;
  const comp = BUILT_IN_COMPOSITE_VIEWS.find((v) => v.id === id);
  if (comp) return comp;
  return BUILT_IN_SYNCHRONIZED_VIEWS.find((v) => v.id === id) ?? null;
}
