/**
 * ViewsPanel — análisis condicional con builder unificado (Fase C.2).
 *
 * 4 dimensiones ortogonales del form:
 *   1. Subject: ETF individual | Portafolio A/B | Yield de Treasury
 *   2. Medida: retorno cierre / pico / piso (ETF/Portfolio); cambio pbs cierre /
 *      pico / piso / persistente (yield)
 *   3. Filtro: rango absoluto (min/max) o rango percentilar (lowerP/upperP,
 *      probabilidad automática)
 *   4. Horizonte: meses
 *
 * Los 13 presets built-in (9 single + 4 composite) se acceden desde la pestaña
 * "Presets". Los compuestos dinámicos se construyen en el tab "Escenario
 * combinado" (Fase C.2b UI) con 2-4 componentes + combinator AND/OR y ventanas
 * independientes por componente.
 */

import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Ticker } from '../data/market.generated';
import {
  ETF_LABELS,
  GROUP_LABELS,
  GROUP_ORDER,
  tickersByGroup,
  type EtfGroup,
} from '../domain/etf-labels';
import type { YieldKey } from '../domain/rf-config';
import {
  BUILT_IN_COMPOSITE_VIEWS,
  BUILT_IN_SYNCHRONIZED_VIEWS,
  BUILT_IN_VIEWS,
  viewRequiresEtfReturns,
  viewRequiresYieldPaths,
  type AsymmetricAnalysis,
  type CompositeView,
  type PredicateMode,
  type SyncDirection,
  type SynchronizedView,
  type SyncComponent,
  type View,
  type ViewSubject,
} from '../domain/views';
import { useViews } from '../hooks/useViews';

// ---------------------------------------------------------------------------
// Tipos de estado del builder
// ---------------------------------------------------------------------------

type SubjectKind = 'etfReturn' | 'portfolioReturn' | 'yield';

type MeasureKind =
  | 'cumulative'       // retorno acumulado al cierre (portfolio/etf)
  | 'peakCumulative'   // pico del retorno acumulado (portfolio/etf)
  | 'troughCumulative' // piso del retorno acumulado (portfolio/etf)
  | 'endpointChange'   // cambio de yield al cierre (yield)
  | 'peakChange'       // pico de cambio de yield (yield)
  | 'troughChange'     // piso de cambio de yield (yield)
  | 'persistent';      // yield persistente sobre threshold N meses (yield)

type FilterKind = 'absolute' | 'percentile';

const YIELD_OPTIONS: { key: YieldKey; label: string }[] = [
  { key: 'IRX', label: 'Tasa 3 meses' },
  { key: 'FVX', label: 'Tasa 5 años' },
  { key: 'TNX', label: 'Tasa 10 años' },
  { key: 'TYX', label: 'Tasa 30 años' },
];

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

function fmtPct(v: number | null | undefined, decimals = 2, signed = false): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const prefix = signed && v >= 0 ? '+' : '';
  return `${prefix}${(v * 100).toFixed(decimals)}%`;
}

function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function confidenceBadge(nMatched: number | null): { label: string; cssClass: string } {
  if (nMatched == null) return { label: '', cssClass: '' };
  if (nMatched >= 500) return { label: `${nMatched.toLocaleString()} paths — confiable`, cssClass: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300' };
  if (nMatched >= 100) return { label: `${nMatched.toLocaleString()} paths — IC amplio en extremos`, cssClass: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' };
  if (nMatched >= 50) return { label: `${nMatched.toLocaleString()} paths — muestra chica`, cssClass: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200' };
  if (nMatched === 0) return { label: '0 paths — view no se materializa', cssClass: 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300' };
  return { label: `${nMatched.toLocaleString()} paths — muestra insuficiente`, cssClass: 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300' };
}

// ---------------------------------------------------------------------------
// Constructor de View dinámico desde el estado del builder
// ---------------------------------------------------------------------------

type BuilderState = {
  subjectKind: SubjectKind;
  etfTicker: Ticker;
  portfolio: 'A' | 'B';
  yieldKey: YieldKey;
  measureKind: MeasureKind;
  filterKind: FilterKind;
  // Valores (interpretación depende del subject):
  //   Return: valor en % decimal (ej. -20 significa -20%)
  //   Yield change: valor en pbs (ej. 100 significa +100pbs)
  minVal: string; // string para permitir empty (null)
  maxVal: string;
  lowerP: number;
  upperP: number;
  horizonMonths: number;
  persistentMonths: number; // solo para measureKind = 'persistent'
};

const DEFAULT_BUILDER: BuilderState = {
  subjectKind: 'etfReturn',
  etfTicker: 'SPY',
  portfolio: 'A',
  yieldKey: 'TNX',
  measureKind: 'cumulative',
  filterKind: 'absolute',
  minVal: '-20',
  maxVal: '-10',
  lowerP: 20,
  upperP: 40,
  horizonMonths: 12,
  persistentMonths: 3,
};

// ---------------------------------------------------------------------------
// Fase C.2b UI — estado del builder compuesto (2-4 componentes + AND/OR)
// Fase C.4 UI — modo sincronizado coexiste en el mismo tab, con subState propio.
// ---------------------------------------------------------------------------

type CombinatorMode = 'and' | 'or' | 'synchronized';

/**
 * Estado de un componente del builder sincronizado. Más simple que
 * `BuilderState` — no hay medida/filtro/horizonte porque la condición es
 * direccional mes a mes y la ventana es común al view.
 */
type SyncComponentBuilderState = {
  subjectKind: SubjectKind;
  etfTicker: Ticker;
  portfolio: 'A' | 'B';
  yieldKey: YieldKey;
  direction: SyncDirection;
  /** Threshold opcional. Empty = 0. Interpretación: % para returns, pbs para yields. */
  thresholdStr: string;
};

type CompositeBuilderState = {
  combinator: CombinatorMode;
  /** Componentes para modo AND/OR. Cada uno es un builder single completo. */
  components: BuilderState[];
  /** Componentes para modo synchronized. Cada uno es direccional. */
  syncComponents: SyncComponentBuilderState[];
  /** Ventana común del view sincronizado (en meses desde mes 1). */
  syncWindowMonths: number;
  /** Mínimo de meses sincronizados requeridos. */
  syncMinMonths: number;
};

const MAX_COMPOSITE_COMPONENTS = 4;
const MIN_COMPOSITE_COMPONENTS = 2;

const DEFAULT_SYNC_COMPONENT_1: SyncComponentBuilderState = {
  subjectKind: 'portfolioReturn',
  etfTicker: 'SPY',
  portfolio: 'A',
  yieldKey: 'TNX',
  direction: 'negative',
  thresholdStr: '',
};
const DEFAULT_SYNC_COMPONENT_2: SyncComponentBuilderState = {
  subjectKind: 'yield',
  etfTicker: 'SPY',
  portfolio: 'A',
  yieldKey: 'TNX',
  direction: 'positive',
  thresholdStr: '',
};

/**
 * Default pedagógico: equity shock + yield spike AND-combinados (estanflación
 * incipiente). El usuario puede ajustar ambos componentes libremente.
 *
 * Para el modo synchronized, el default es equivalente conceptualmente pero
 * con co-movimiento mes a mes: SPY↓ Y TNX↑ en el MISMO mes, ≥3m en 12m.
 */
const DEFAULT_COMPOSITE_BUILDER: CompositeBuilderState = {
  combinator: 'and',
  components: [
    { ...DEFAULT_BUILDER },
    {
      ...DEFAULT_BUILDER,
      subjectKind: 'yield',
      yieldKey: 'TNX',
      measureKind: 'peakChange',
      filterKind: 'absolute',
      minVal: '100',
      maxVal: '',
    },
  ],
  syncComponents: [DEFAULT_SYNC_COMPONENT_1, DEFAULT_SYNC_COMPONENT_2],
  syncWindowMonths: 12,
  syncMinMonths: 3,
};

function buildSubject(state: BuilderState): ViewSubject {
  if (state.subjectKind === 'etfReturn') {
    return { kind: 'etfReturn', ticker: state.etfTicker };
  }
  if (state.subjectKind === 'portfolioReturn') {
    return { kind: 'portfolioReturn', portfolio: state.portfolio };
  }
  return { kind: 'yield', key: state.yieldKey };
}

function parseOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '' || t === '-' || t === '+') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function buildMode(state: BuilderState): PredicateMode {
  const isReturnSubject =
    state.subjectKind === 'etfReturn' || state.subjectKind === 'portfolioReturn';

  if (state.filterKind === 'percentile') {
    // Solo válido sobre cumulative (endpoint) de return subject. Las validaciones
    // en computePercentileThresholds ya rechazan yield o peak/trough modes.
    return { kind: 'percentileBandReturn', lowerP: state.lowerP, upperP: state.upperP };
  }

  // filterKind === 'absolute'
  const minRaw = parseOrNull(state.minVal);
  const maxRaw = parseOrNull(state.maxVal);

  if (isReturnSubject) {
    // Valores en %, convertir a decimal
    const min = minRaw !== null ? minRaw / 100 : null;
    const max = maxRaw !== null ? maxRaw / 100 : null;
    if (state.measureKind === 'peakCumulative') {
      return { kind: 'peakCumulativeReturnRange', minReturn: min, maxReturn: max };
    }
    if (state.measureKind === 'troughCumulative') {
      return { kind: 'troughCumulativeReturnRange', minReturn: min, maxReturn: max };
    }
    // cumulative (endpoint)
    return { kind: 'cumulativeReturnRange', minReturn: min, maxReturn: max };
  }

  // Yield subject: valores en pbs, convertir a decimal (pbs/10000)
  const min = minRaw !== null ? minRaw / 10000 : null;
  const max = maxRaw !== null ? maxRaw / 10000 : null;
  if (state.measureKind === 'peakChange') {
    return {
      kind: 'peakChange',
      minDelta: min ?? -Infinity,
      maxDelta: max,
    };
  }
  if (state.measureKind === 'troughChange') {
    return {
      kind: 'troughChange',
      minDelta: min,
      maxDelta: max ?? Infinity,
    };
  }
  if (state.measureKind === 'persistent') {
    return {
      kind: 'persistentThreshold',
      minDelta: min ?? 0,
      minDurationMonths: state.persistentMonths,
    };
  }
  // endpointChange
  return { kind: 'endpointChange', minDelta: min, maxDelta: max };
}

function buildDescription(state: BuilderState): { label: string; description: string } {
  const yieldLabelMap: Record<YieldKey, string> = {
    IRX: 'Tasa 3 meses',
    FVX: 'Tasa 5 años',
    TNX: 'Tasa 10 años',
    TYX: 'Tasa 30 años',
  };
  const subjLabel =
    state.subjectKind === 'etfReturn'
      ? ETF_LABELS[state.etfTicker].short
      : state.subjectKind === 'portfolioReturn'
        ? `Portafolio ${state.portfolio}`
        : yieldLabelMap[state.yieldKey];
  const isReturn =
    state.subjectKind === 'etfReturn' || state.subjectKind === 'portfolioReturn';

  if (state.filterKind === 'percentile') {
    return {
      label: `${subjLabel} entre percentil ${state.lowerP} y ${state.upperP} (${state.horizonMonths}m)`,
      description: `El retorno acumulado de ${subjLabel} a ${state.horizonMonths} meses cae entre el percentil ${state.lowerP} y ${state.upperP} de todos los escenarios simulados.`,
    };
  }

  const min = state.minVal.trim();
  const max = state.maxVal.trim();
  const units = isReturn ? '%' : ' pbs';
  const rangeStr = `[${min || '−∞'}${units}, ${max || '+∞'}${units}]`;

  const measureStr =
    state.measureKind === 'cumulative' || state.measureKind === 'endpointChange'
      ? 'al cierre'
      : state.measureKind === 'peakCumulative' || state.measureKind === 'peakChange'
        ? 'en pico (en algún momento)'
        : state.measureKind === 'troughCumulative' || state.measureKind === 'troughChange'
          ? 'en piso (en algún momento)'
          : `persistente ≥ ${state.persistentMonths} meses`;

  return {
    label: `${subjLabel} ${rangeStr} ${measureStr} (${state.horizonMonths}m)`,
    description: `${isReturn ? 'El retorno acumulado de' : 'El cambio en el yield'} ${subjLabel} ${measureStr}, a lo largo de ${state.horizonMonths} meses, cae en ${rangeStr}.`,
  };
}

function buildDynamicView(state: BuilderState): View {
  const subject = buildSubject(state);
  const mode = buildMode(state);
  const { label, description } = buildDescription(state);
  const idParts = [
    'dyn',
    state.subjectKind,
    state.subjectKind === 'etfReturn'
      ? state.etfTicker
      : state.subjectKind === 'portfolioReturn'
        ? state.portfolio
        : state.yieldKey,
    state.measureKind,
    state.filterKind === 'percentile'
      ? `p${state.lowerP}-${state.upperP}`
      : `${state.minVal}-${state.maxVal}`,
    `${state.horizonMonths}m`,
    // Salt para forzar re-evaluación aún si los otros campos son idénticos
    Date.now().toString(36),
  ];
  return {
    id: idParts.join('-'),
    label,
    description,
    subject,
    mode,
    window: { startMonth: 1, endMonth: state.horizonMonths },
  };
}

/**
 * Fase C.2b UI — construye un `CompositeView` desde el estado del builder
 * compuesto. Reutiliza `buildDynamicView` para cada componente, calcula el
 * envelope de ventanas (min startMonth, max endMonth), y genera un
 * label/description legibles.
 *
 * El dominio ya soporta ventanas distintas por componente (Fase C.2b dominio,
 * 2026-04-20): `composite.window` es solo display envelope, cada componente
 * valida su propia ventana internamente vía `evaluateSingleView`.
 */
function buildDynamicComposite(composite: CompositeBuilderState): CompositeView {
  if (composite.components.length === 0) {
    throw new Error('buildDynamicComposite: se requiere al menos 1 componente');
  }
  if (composite.combinator !== 'and' && composite.combinator !== 'or') {
    throw new Error(
      `buildDynamicComposite: combinator "${composite.combinator}" no es and/or`,
    );
  }
  const components = composite.components.map(buildDynamicView);
  let startMonth = Infinity;
  let endMonth = -Infinity;
  for (const c of components) {
    if (c.window.startMonth < startMonth) startMonth = c.window.startMonth;
    if (c.window.endMonth > endMonth) endMonth = c.window.endMonth;
  }
  const sep = composite.combinator === 'and' ? ' Y ' : ' O ';
  const combLabel = composite.combinator === 'and' ? 'AND' : 'OR';
  const label = `Escenario combinado · ${composite.components.length} condiciones (${combLabel})`;
  const description = components.map((c) => c.description).join(sep);
  const idParts = [
    'dyn-composite',
    composite.combinator,
    `${composite.components.length}comp`,
    Date.now().toString(36),
  ];
  return {
    kind: 'composite',
    id: idParts.join('-'),
    label,
    description,
    combinator: composite.combinator,
    components,
    window: { startMonth, endMonth },
  };
}

// ---------------------------------------------------------------------------
// Fase C.4 UI — constructor de SynchronizedView dinámico
// ---------------------------------------------------------------------------

const SYNC_YIELD_LABEL_MAP: Record<YieldKey, string> = {
  IRX: 'Tasa 3 meses',
  FVX: 'Tasa 5 años',
  TNX: 'Tasa 10 años',
  TYX: 'Tasa 30 años',
};

function buildSyncSubject(state: SyncComponentBuilderState): ViewSubject {
  if (state.subjectKind === 'etfReturn') {
    return { kind: 'etfReturn', ticker: state.etfTicker };
  }
  if (state.subjectKind === 'portfolioReturn') {
    return { kind: 'portfolioReturn', portfolio: state.portfolio };
  }
  return { kind: 'yield', key: state.yieldKey };
}

function buildSyncComponent(state: SyncComponentBuilderState): SyncComponent {
  const subject = buildSyncSubject(state);
  const raw = state.thresholdStr.trim();
  let thresholdMagnitude: number | undefined;
  if (raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      // Returns: valor en % → decimal. Yields: valor en pbs → decimal.
      const isReturn =
        state.subjectKind === 'etfReturn' || state.subjectKind === 'portfolioReturn';
      thresholdMagnitude = isReturn ? n / 100 : n / 10000;
    }
  }
  const comp: SyncComponent = {
    subject,
    direction: state.direction,
  };
  if (thresholdMagnitude !== undefined) comp.thresholdMagnitude = thresholdMagnitude;
  return comp;
}

function syncComponentShortLabel(state: SyncComponentBuilderState): string {
  const dir = state.direction === 'positive' ? '↑' : '↓';
  if (state.subjectKind === 'etfReturn') return `${ETF_LABELS[state.etfTicker].short}${dir}`;
  if (state.subjectKind === 'portfolioReturn') return `Port ${state.portfolio}${dir}`;
  return `${SYNC_YIELD_LABEL_MAP[state.yieldKey]}${dir}`;
}

function buildDynamicSynchronized(composite: CompositeBuilderState): SynchronizedView {
  if (composite.syncComponents.length === 0) {
    throw new Error('buildDynamicSynchronized: se requiere al menos 1 componente');
  }
  const { syncMinMonths, syncWindowMonths } = composite;
  const components = composite.syncComponents.map(buildSyncComponent);
  const shortLabels = composite.syncComponents.map(syncComponentShortLabel);
  const label = `Sincronizado · ${shortLabels.join(' Y ')} (≥${syncMinMonths}m en ${syncWindowMonths}m)`;
  const description =
    `En al menos ${syncMinMonths} mes${syncMinMonths === 1 ? '' : 'es'} distinto${syncMinMonths === 1 ? '' : 's'} ` +
    `de la ventana de ${syncWindowMonths} meses, TODAS las condiciones se cumplen simultáneamente ` +
    `en el mismo mes: ${shortLabels.join(' Y ')}.`;
  const idParts = [
    'dyn-sync',
    `${composite.syncComponents.length}comp`,
    `${syncMinMonths}of${syncWindowMonths}`,
    Date.now().toString(36),
  ];
  return {
    kind: 'synchronized',
    id: idParts.join('-'),
    label,
    description,
    components,
    minMonths: syncMinMonths,
    window: { startMonth: 1, endMonth: syncWindowMonths },
  };
}

// ---------------------------------------------------------------------------
// Sub-componente: formulario builder single-predicado (4 pasos)
// ---------------------------------------------------------------------------

/**
 * Renderiza el builder single de 4 pasos (subject, medida, filtro, horizonte)
 * sin el botón "Evaluar" — ese vive en el parent. Se usa tanto para el tab
 * "Builder — single" como para cada componente del tab "Escenario combinado".
 *
 * Cuando `title` se provee, se muestra un encabezado con el título y (si
 * `onRemove` está presente) un botón "Eliminar" para sacar ese componente
 * del composite.
 */
function SingleViewBuilderForm({
  state,
  setState,
  hasEtfReturns,
  hasYieldPaths,
  title,
  onRemove,
}: {
  state: BuilderState;
  setState: Dispatch<SetStateAction<BuilderState>>;
  hasEtfReturns: boolean;
  hasYieldPaths: boolean;
  title?: string;
  onRemove?: () => void;
}) {
  const etfGroups = useMemo(() => tickersByGroup(), []);

  const update = useCallback(
    <K extends keyof BuilderState>(key: K, value: BuilderState[K]) =>
      setState((b) => ({ ...b, [key]: value })),
    [setState],
  );

  // Si cambia subjectKind, resetear measureKind a uno compatible.
  const handleSubjectKind = useCallback(
    (k: SubjectKind) => {
      setState((b) => {
        const isReturn = k === 'etfReturn' || k === 'portfolioReturn';
        const compatibleMeasure: MeasureKind = isReturn
          ? b.measureKind === 'cumulative' ||
            b.measureKind === 'peakCumulative' ||
            b.measureKind === 'troughCumulative'
            ? b.measureKind
            : 'cumulative'
          : b.measureKind === 'endpointChange' ||
              b.measureKind === 'peakChange' ||
              b.measureKind === 'troughChange' ||
              b.measureKind === 'persistent'
            ? b.measureKind
            : 'endpointChange';
        // Percentile filter solo aplica a cumulative endpoint; si el nuevo subject
        // es yield o el measureKind nuevo no es cumulative, forzar absolute.
        const compatibleFilter: FilterKind =
          b.filterKind === 'percentile' && isReturn && compatibleMeasure === 'cumulative'
            ? 'percentile'
            : 'absolute';
        return { ...b, subjectKind: k, measureKind: compatibleMeasure, filterKind: compatibleFilter };
      });
    },
    [setState],
  );

  const handleMeasureKind = useCallback(
    (m: MeasureKind) => {
      setState((b) => {
        // Percentile solo válido con cumulative (endpoint) de return. Si medida
        // cambia a algo incompatible, forzar absolute.
        const filterOk =
          b.filterKind === 'percentile' &&
          m === 'cumulative' &&
          (b.subjectKind === 'etfReturn' || b.subjectKind === 'portfolioReturn');
        return { ...b, measureKind: m, filterKind: filterOk ? 'percentile' : 'absolute' };
      });
    },
    [setState],
  );

  const canUsePercentile =
    (state.subjectKind === 'etfReturn' || state.subjectKind === 'portfolioReturn') &&
    state.measureKind === 'cumulative';

  const percentileAutoPct =
    state.filterKind === 'percentile' ? state.upperP - state.lowerP : null;

  const isReturnSubject =
    state.subjectKind === 'etfReturn' || state.subjectKind === 'portfolioReturn';
  const units = isReturnSubject ? '%' : 'pbs';

  return (
    <div
      className={
        title
          ? 'space-y-4 rounded-md border border-mercantil-line/60 dark:border-mercantil-dark-line/60 bg-mercantil-mist/30 dark:bg-mercantil-dark-bg/30 p-3'
          : 'space-y-4'
      }
    >
      {title && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-mercantil-navy dark:text-mercantil-dark-navy-text">
            {title}
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-[10px] px-2 py-0.5 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              Eliminar
            </button>
          )}
        </div>
      )}

      {/* Paso 1: Subject type */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold mb-1.5">
          1. Sobre qué condicionamos
        </div>
        <div className="flex gap-2 flex-wrap">
          {([
            ['etfReturn', 'ETF individual', !hasEtfReturns],
            ['portfolioReturn', 'Portafolio A/B', false],
            ['yield', 'Yield de Treasury', !hasYieldPaths],
          ] as [SubjectKind, string, boolean][]).map(([k, label, disabled]) => (
            <button
              key={k}
              type="button"
              onClick={() => handleSubjectKind(k)}
              disabled={disabled}
              title={disabled ? 'Tildá «Habilitar ETFs individuales para views» junto al botón Simular y volvé a correr Simular' : undefined}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                state.subjectKind === k
                  ? 'bg-mercantil-orange text-white border-mercantil-orange'
                  : disabled
                    ? 'bg-mercantil-line/50 text-mercantil-slate border-mercantil-line dark:bg-mercantil-dark-line/40 dark:text-mercantil-dark-slate dark:border-mercantil-dark-line cursor-not-allowed'
                    : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Selector específico según subject */}
        <div className="mt-2">
          {state.subjectKind === 'etfReturn' && (
            <select
              value={state.etfTicker}
              onChange={(e) => update('etfTicker', e.target.value as Ticker)}
              className="px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
            >
              {GROUP_ORDER.map((group: EtfGroup) => (
                <optgroup key={group} label={GROUP_LABELS[group]}>
                  {etfGroups[group].map((t) => (
                    <option key={t} value={t}>
                      {ETF_LABELS[t].short} ({t})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {state.subjectKind === 'portfolioReturn' && (
            <div className="flex gap-2">
              {(['A', 'B'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => update('portfolio', p)}
                  className={`text-xs px-3 py-1.5 rounded border ${
                    state.portfolio === p
                      ? 'bg-mercantil-navy text-white border-mercantil-navy dark:bg-mercantil-dark-navy-text dark:text-mercantil-dark-bg dark:border-mercantil-dark-navy-text'
                      : 'bg-white text-mercantil-navy border-mercantil-line dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line'
                  }`}
                >
                  Portafolio {p}
                </button>
              ))}
            </div>
          )}
          {state.subjectKind === 'yield' && (
            <select
              value={state.yieldKey}
              onChange={(e) => update('yieldKey', e.target.value as YieldKey)}
              className="px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
            >
              {YIELD_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Paso 2: Measure */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold mb-1.5">
          2. Qué medimos
        </div>
        <div className="flex gap-2 flex-wrap">
          {isReturnSubject
            ? ([
                ['cumulative', 'Retorno acumulado al cierre'],
                ['peakCumulative', 'Pico acumulado (en algún momento)'],
                ['troughCumulative', 'Piso acumulado (en algún momento)'],
              ] as [MeasureKind, string][]).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMeasureKind(m)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    state.measureKind === m
                      ? 'bg-mercantil-orange text-white border-mercantil-orange'
                      : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                  }`}
                >
                  {label}
                </button>
              ))
            : ([
                ['endpointChange', 'Cambio pbs al cierre'],
                ['peakChange', 'Pico pbs (en algún momento)'],
                ['troughChange', 'Piso pbs (en algún momento)'],
                ['persistent', 'Persistente ≥ N meses'],
              ] as [MeasureKind, string][]).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleMeasureKind(m)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    state.measureKind === m
                      ? 'bg-mercantil-orange text-white border-mercantil-orange'
                      : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                  }`}
                >
                  {label}
                </button>
              ))}
        </div>
      </div>

      {/* Paso 3: Filter */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold mb-1.5">
          3. Cómo filtramos los paths
        </div>
        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={() => update('filterKind', 'absolute')}
            className={`text-xs px-3 py-1.5 rounded border ${
              state.filterKind === 'absolute'
                ? 'bg-mercantil-navy text-white border-mercantil-navy dark:bg-mercantil-dark-navy-text dark:text-mercantil-dark-bg dark:border-mercantil-dark-navy-text'
                : 'bg-white text-mercantil-navy border-mercantil-line dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line'
            }`}
          >
            Rango absoluto
          </button>
          <button
            type="button"
            onClick={() => update('filterKind', 'percentile')}
            disabled={!canUsePercentile}
            title={!canUsePercentile ? 'Percentilar solo aplica a retorno acumulado al cierre de ETF o Portafolio' : undefined}
            className={`text-xs px-3 py-1.5 rounded border ${
              state.filterKind === 'percentile'
                ? 'bg-mercantil-navy text-white border-mercantil-navy dark:bg-mercantil-dark-navy-text dark:text-mercantil-dark-bg dark:border-mercantil-dark-navy-text'
                : !canUsePercentile
                  ? 'bg-mercantil-line/50 text-mercantil-slate border-mercantil-line dark:bg-mercantil-dark-line/40 dark:text-mercantil-dark-slate dark:border-mercantil-dark-line cursor-not-allowed'
                  : 'bg-white text-mercantil-navy border-mercantil-line dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line'
            }`}
          >
            Rango percentilar
          </button>
        </div>

        {state.filterKind === 'absolute' ? (
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                Min ({units})
              </span>
              <input
                type="text"
                value={state.minVal}
                onChange={(e) => update('minVal', e.target.value)}
                placeholder="sin cota"
                className="w-24 px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                Max ({units})
              </span>
              <input
                type="text"
                value={state.maxVal}
                onChange={(e) => update('maxVal', e.target.value)}
                placeholder="sin cota"
                className="w-24 px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
              />
            </label>
            <p className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate italic">
              Dejá vacío para "sin cota" en ese extremo.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                Percentil inferior
              </span>
              <input
                type="number"
                value={state.lowerP}
                onChange={(e) => update('lowerP', Number(e.target.value))}
                min={0}
                max={100}
                className="w-20 px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                Percentil superior
              </span>
              <input
                type="number"
                value={state.upperP}
                onChange={(e) => update('upperP', Number(e.target.value))}
                min={0}
                max={100}
                className="w-20 px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
              />
            </label>
            {percentileAutoPct !== null && (
              <div className="text-[11px] px-2.5 py-1.5 rounded bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <strong>Probabilidad auto: {percentileAutoPct.toFixed(0)}%</strong> (por construcción)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Paso 4: Horizon + persistent months */}
      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
            4. Horizonte
          </span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={state.horizonMonths}
              onChange={(e) => update('horizonMonths', Number(e.target.value))}
              min={1}
              max={360}
              className="w-20 px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
            />
            <span className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate">meses</span>
          </div>
        </label>
        {state.measureKind === 'persistent' && (
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
              Meses consecutivos ≥ threshold
            </span>
            <input
              type="number"
              value={state.persistentMonths}
              onChange={(e) => update('persistentMonths', Number(e.target.value))}
              min={1}
              max={360}
              className="w-20 px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
            />
          </label>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: formulario de un componente sincronizado (Fase C.4)
// ---------------------------------------------------------------------------

/**
 * Formulario simplificado para un componente de un SynchronizedView.
 * A diferencia de `SingleViewBuilderForm`, no hay medida/filtro/horizonte —
 * solo subject + direction + threshold opcional. La ventana es común al
 * view y vive en el parent.
 */
function SyncComponentForm({
  state,
  setState,
  hasEtfReturns,
  hasYieldPaths,
  title,
  onRemove,
}: {
  state: SyncComponentBuilderState;
  setState: Dispatch<SetStateAction<SyncComponentBuilderState>>;
  hasEtfReturns: boolean;
  hasYieldPaths: boolean;
  title?: string;
  onRemove?: () => void;
}) {
  const etfGroups = useMemo(() => tickersByGroup(), []);

  const update = useCallback(
    <K extends keyof SyncComponentBuilderState>(
      key: K,
      value: SyncComponentBuilderState[K],
    ) => setState((s) => ({ ...s, [key]: value })),
    [setState],
  );

  const isReturn =
    state.subjectKind === 'etfReturn' || state.subjectKind === 'portfolioReturn';
  const units = isReturn ? '%' : 'pbs';

  return (
    <div className="space-y-3 rounded-md border border-mercantil-line/60 dark:border-mercantil-dark-line/60 bg-mercantil-mist/30 dark:bg-mercantil-dark-bg/30 p-3">
      {title && (
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-mercantil-navy dark:text-mercantil-dark-navy-text">
            {title}
          </span>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="text-[10px] px-2 py-0.5 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40"
            >
              Eliminar
            </button>
          )}
        </div>
      )}

      {/* Subject type */}
      <div>
        <div className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold mb-1.5">
          Sobre qué
        </div>
        <div className="flex gap-2 flex-wrap">
          {(
            [
              ['etfReturn', 'ETF individual', !hasEtfReturns],
              ['portfolioReturn', 'Portafolio A/B', false],
              ['yield', 'Yield de Treasury', !hasYieldPaths],
            ] as [SubjectKind, string, boolean][]
          ).map(([k, label, disabled]) => (
            <button
              key={k}
              type="button"
              onClick={() => update('subjectKind', k)}
              disabled={disabled}
              title={
                disabled
                  ? 'Tildá «Habilitar ETFs/yields» junto al botón Simular y volvé a correr Simular'
                  : undefined
              }
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                state.subjectKind === k
                  ? 'bg-mercantil-orange text-white border-mercantil-orange'
                  : disabled
                    ? 'bg-mercantil-line/50 text-mercantil-slate border-mercantil-line dark:bg-mercantil-dark-line/40 dark:text-mercantil-dark-slate dark:border-mercantil-dark-line cursor-not-allowed'
                    : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2">
          {state.subjectKind === 'etfReturn' && (
            <select
              value={state.etfTicker}
              onChange={(e) => update('etfTicker', e.target.value as Ticker)}
              className="px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
            >
              {GROUP_ORDER.map((group: EtfGroup) => (
                <optgroup key={group} label={GROUP_LABELS[group]}>
                  {etfGroups[group].map((t) => (
                    <option key={t} value={t}>
                      {ETF_LABELS[t].short} ({t})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {state.subjectKind === 'portfolioReturn' && (
            <div className="flex gap-2">
              {(['A', 'B'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => update('portfolio', p)}
                  className={`text-xs px-3 py-1.5 rounded border ${
                    state.portfolio === p
                      ? 'bg-mercantil-navy text-white border-mercantil-navy dark:bg-mercantil-dark-navy-text dark:text-mercantil-dark-bg dark:border-mercantil-dark-navy-text'
                      : 'bg-white text-mercantil-navy border-mercantil-line dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line'
                  }`}
                >
                  Portafolio {p}
                </button>
              ))}
            </div>
          )}
          {state.subjectKind === 'yield' && (
            <select
              value={state.yieldKey}
              onChange={(e) => update('yieldKey', e.target.value as YieldKey)}
              className="px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
            >
              {YIELD_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Direction + threshold */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold mb-1.5">
            Dirección (por mes)
          </div>
          <div className="flex gap-2">
            {(
              [
                ['positive', isReturn ? 'Positivo (retorno > 0)' : 'Sube (Δy > 0)'],
                ['negative', isReturn ? 'Negativo (retorno < 0)' : 'Baja (Δy < 0)'],
              ] as [SyncDirection, string][]
            ).map(([d, label]) => (
              <button
                key={d}
                type="button"
                onClick={() => update('direction', d)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  state.direction === d
                    ? 'bg-mercantil-orange text-white border-mercantil-orange'
                    : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
            Magnitud mínima ({units}) — opcional
          </span>
          <input
            type="text"
            value={state.thresholdStr}
            onChange={(e) => update('thresholdStr', e.target.value)}
            placeholder="0"
            className="w-24 px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
          />
        </label>
        <p className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate italic max-w-xs">
          {isReturn
            ? 'Retorno del mes con la dirección y magnitud indicadas.'
            : 'Cambio mensual del yield (yield[t] − yield[t−1]) con la dirección y magnitud indicadas.'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: tabla asimétrica de métricas A o B
// ---------------------------------------------------------------------------

function AsymmetricTable({ analysis, portfolioLabel, accentClass }: {
  analysis: AsymmetricAnalysis;
  portfolioLabel: string;
  accentClass: 'A' | 'B';
}) {
  const { base, matched, unmatched } = analysis;
  const labelColor = accentClass === 'A'
    ? 'text-mercantil-navy dark:text-mercantil-dark-navy-text'
    : 'text-mercantil-orange';

  const rows = [
    { key: 'twr', label: 'TWR anualizado', get: (m: typeof base) => m.twrAnnualized.p50, fmt: fmtPct },
    { key: 'final', label: 'Valor final', get: (m: typeof base) => m.finalValue.p50, fmt: fmtUsd },
    { key: 'mdd', label: 'Max DD', get: (m: typeof base) => m.maxDrawdown.p50, fmt: fmtPct },
  ];

  const deltaFmt = (v: number | null, fmtFn: typeof fmtPct | typeof fmtUsd) => {
    if (v == null || !Number.isFinite(v)) return '—';
    if (fmtFn === fmtUsd) return `${v >= 0 ? '+' : ''}${fmtUsd(v)}`;
    return fmtPct(v, 2, true);
  };

  const deltaClass = (d: number | null) => {
    if (d == null || !Number.isFinite(d) || d === 0) return 'text-mercantil-slate dark:text-mercantil-dark-slate';
    return d > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
  };

  return (
    <div className="overflow-x-auto">
      <div className={`text-xs uppercase tracking-wider font-semibold mb-1 ${labelColor}`}>{portfolioLabel}</div>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate border-b border-mercantil-line dark:border-mercantil-dark-line">
            <th className="text-left py-1.5 pr-2 font-semibold">Métrica</th>
            <th className="text-right py-1.5 px-2 font-semibold">Base</th>
            <th className="text-right py-1.5 px-2 font-semibold">Si ocurre</th>
            <th className="text-right py-1.5 px-2 font-semibold">Si NO ocurre</th>
            <th className="text-right py-1.5 pl-2 font-semibold">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const bv = r.get(base);
            const mv = matched ? r.get(matched) : null;
            const uv = unmatched ? r.get(unmatched) : null;
            const delta = mv != null && bv != null && Number.isFinite(mv) && Number.isFinite(bv) ? mv - bv : null;
            return (
              <tr key={r.key} className="border-b border-mercantil-line dark:border-mercantil-dark-line/60 last:border-none">
                <td className="py-1.5 pr-2 text-mercantil-ink dark:text-mercantil-dark-ink">{r.label}</td>
                <td className="py-1.5 px-2 text-right text-mercantil-ink dark:text-mercantil-dark-ink">{r.fmt(bv)}</td>
                <td className="py-1.5 px-2 text-right text-mercantil-ink dark:text-mercantil-dark-ink">{r.fmt(mv)}</td>
                <td className="py-1.5 px-2 text-right text-mercantil-ink dark:text-mercantil-dark-ink">{r.fmt(uv)}</td>
                <td className={`py-1.5 pl-2 text-right font-semibold ${deltaClass(delta)}`}>{deltaFmt(delta, r.fmt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

type ActiveTab = 'builder' | 'composite' | 'preset';

export default function ViewsPanel() {
  const {
    activeView,
    probability,
    standardError,
    nMatched,
    nTotal,
    analysisA,
    analysisB,
    error,
    isSimulationReady,
    hasYieldPaths,
    hasEtfReturns,
    setActiveView,
    clearView,
    setCustomView,
  } = useViews();

  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('builder');
  const [builder, setBuilder] = useState<BuilderState>(DEFAULT_BUILDER);
  const [compBuilder, setCompBuilder] = useState<CompositeBuilderState>(
    DEFAULT_COMPOSITE_BUILDER,
  );

  const runBuilder = useCallback(() => {
    const view = buildDynamicView(builder);
    setCustomView(view);
  }, [builder, setCustomView]);

  const runComposite = useCallback(() => {
    const view =
      compBuilder.combinator === 'synchronized'
        ? buildDynamicSynchronized(compBuilder)
        : buildDynamicComposite(compBuilder);
    setCustomView(view);
  }, [compBuilder, setCustomView]);

  const addComponent = useCallback(() => {
    setCompBuilder((c) =>
      c.components.length >= MAX_COMPOSITE_COMPONENTS
        ? c
        : { ...c, components: [...c.components, { ...DEFAULT_BUILDER }] },
    );
  }, []);

  const removeComponent = useCallback((idx: number) => {
    setCompBuilder((c) =>
      c.components.length <= MIN_COMPOSITE_COMPONENTS
        ? c
        : { ...c, components: c.components.filter((_, i) => i !== idx) },
    );
  }, []);

  const makeComponentSetState = useCallback(
    (idx: number): Dispatch<SetStateAction<BuilderState>> =>
      (updater) =>
        setCompBuilder((c) => ({
          ...c,
          components: c.components.map((comp, i) => {
            if (i !== idx) return comp;
            return typeof updater === 'function'
              ? (updater as (s: BuilderState) => BuilderState)(comp)
              : updater;
          }),
        })),
    [],
  );

  // Handlers para el modo sincronizado
  const addSyncComponent = useCallback(() => {
    setCompBuilder((c) =>
      c.syncComponents.length >= MAX_COMPOSITE_COMPONENTS
        ? c
        : {
            ...c,
            syncComponents: [...c.syncComponents, { ...DEFAULT_SYNC_COMPONENT_1 }],
          },
    );
  }, []);

  const removeSyncComponent = useCallback((idx: number) => {
    setCompBuilder((c) =>
      c.syncComponents.length <= MIN_COMPOSITE_COMPONENTS
        ? c
        : {
            ...c,
            syncComponents: c.syncComponents.filter((_, i) => i !== idx),
          },
    );
  }, []);

  const makeSyncComponentSetState = useCallback(
    (idx: number): Dispatch<SetStateAction<SyncComponentBuilderState>> =>
      (updater) =>
        setCompBuilder((c) => ({
          ...c,
          syncComponents: c.syncComponents.map((comp, i) => {
            if (i !== idx) return comp;
            return typeof updater === 'function'
              ? (updater as (s: SyncComponentBuilderState) => SyncComponentBuilderState)(comp)
              : updater;
          }),
        })),
    [],
  );

  const syncMinMonthsValid =
    compBuilder.syncMinMonths >= 1 &&
    compBuilder.syncMinMonths <= compBuilder.syncWindowMonths;

  const badge = confidenceBadge(nMatched);

  return (
    <div className="mp-card p-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button type="button" onClick={() => setExpanded((e) => !e)} className="flex items-center gap-2 text-left">
          <svg className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} viewBox="0 0 20 20" fill="currentColor">
            <path d="M7 5l6 5-6 5V5z" />
          </svg>
          <h2 className="text-base">Views — análisis condicional</h2>
        </button>
        {activeView && (
          <button type="button" onClick={clearView} className="text-xs px-3 py-1.5 rounded-full border border-mercantil-line dark:border-mercantil-dark-line hover:bg-mercantil-line/40 dark:hover:bg-mercantil-dark-line/60 text-mercantil-ink dark:text-mercantil-dark-ink">
            Limpiar view
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {!isSimulationReady ? (
            <div className="rounded-lg border border-dashed border-mercantil-line dark:border-mercantil-dark-line p-6 text-center text-sm text-mercantil-slate dark:text-mercantil-dark-slate">
              Corré una simulación para habilitar el análisis de views.
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex gap-2 flex-wrap">
                {([
                  ['builder', 'Builder — single'],
                  ['composite', 'Escenario combinado'],
                  ['preset', 'Presets (14)'],
                ] as [ActiveTab, string][]).map(([t, label]) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setActiveTab(t)}
                    className={`text-xs px-4 py-2 rounded-lg border transition-colors ${
                      activeTab === t
                        ? 'bg-mercantil-navy text-white border-mercantil-navy dark:bg-mercantil-dark-navy-text dark:text-mercantil-dark-bg dark:border-mercantil-dark-navy-text'
                        : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* ========== BUILDER SINGLE ========== */}
              {activeTab === 'builder' && (
                <div className="rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-4 space-y-4">
                  <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                    Armá un view paso a paso: sobre qué, qué medir, cómo filtrar, y a cuántos meses.
                  </p>
                  <SingleViewBuilderForm
                    state={builder}
                    setState={setBuilder}
                    hasEtfReturns={hasEtfReturns}
                    hasYieldPaths={hasYieldPaths}
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={runBuilder}
                      className="mp-btn-primary bg-mercantil-orange hover:bg-mercantil-orange-deep text-xs px-5 py-2"
                    >
                      Evaluar
                    </button>
                  </div>
                </div>
              )}

              {/* ========== BUILDER COMPUESTO (Fase C.2b UI + Fase C.4 sync) ========== */}
              {activeTab === 'composite' && (
                <div className="rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-4 space-y-4">
                  <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                    Combiná {MIN_COMPOSITE_COMPONENTS}–{MAX_COMPOSITE_COMPONENTS} condiciones con AND (todas se cumplen a la vez, ventana-agregadas), OR (al menos una), o SINCRONIZADO (co-movimiento mes a mes dentro de la ventana).
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                      Combinator:
                    </span>
                    {(
                      [
                        ['and', 'AND (todas)'],
                        ['or', 'OR (al menos una)'],
                        ['synchronized', 'Sincronizado (mes a mes)'],
                      ] as [CombinatorMode, string][]
                    ).map(([combo, label]) => (
                      <button
                        key={combo}
                        type="button"
                        onClick={() =>
                          setCompBuilder((c) => ({ ...c, combinator: combo }))
                        }
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          compBuilder.combinator === combo
                            ? 'bg-mercantil-orange text-white border-mercantil-orange'
                            : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {/* ---------- AND/OR ---------- */}
                  {(compBuilder.combinator === 'and' || compBuilder.combinator === 'or') && (
                    <>
                      <p className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate italic">
                        Cada condición puede tener su propia ventana temporal — útil para cruzar shocks en horizontes distintos
                        (ej: "rally S&P 6m AND rally Eurozona 12m").
                      </p>
                      <div className="space-y-3">
                        {compBuilder.components.map((comp, idx) => (
                          <SingleViewBuilderForm
                            key={idx}
                            state={comp}
                            setState={makeComponentSetState(idx)}
                            hasEtfReturns={hasEtfReturns}
                            hasYieldPaths={hasYieldPaths}
                            title={`Condición ${idx + 1}`}
                            onRemove={
                              compBuilder.components.length > MIN_COMPOSITE_COMPONENTS
                                ? () => removeComponent(idx)
                                : undefined
                            }
                          />
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-3 items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={addComponent}
                          disabled={compBuilder.components.length >= MAX_COMPOSITE_COMPONENTS}
                          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                            compBuilder.components.length >= MAX_COMPOSITE_COMPONENTS
                              ? 'bg-mercantil-line/50 text-mercantil-slate border-mercantil-line dark:bg-mercantil-dark-line/40 dark:text-mercantil-dark-slate dark:border-mercantil-dark-line cursor-not-allowed'
                              : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                          }`}
                        >
                          + Agregar condición ({compBuilder.components.length}/{MAX_COMPOSITE_COMPONENTS})
                        </button>
                        <button
                          type="button"
                          onClick={runComposite}
                          className="mp-btn-primary bg-mercantil-orange hover:bg-mercantil-orange-deep text-xs px-5 py-2"
                        >
                          Evaluar combinado
                        </button>
                      </div>
                    </>
                  )}

                  {/* ---------- SINCRONIZADO (Fase C.4) ---------- */}
                  {compBuilder.combinator === 'synchronized' && (
                    <>
                      <p className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate italic">
                        Se cuentan los meses dentro de la ventana donde TODAS las condiciones se cumplen en el mismo mes.
                        Matchea si el conteo ≥ "Meses mínimos". Útil para patrones como estanflación real
                        (equity ↓ Y tasas ↑ en el mismo mes).
                      </p>

                      <div className="flex flex-wrap gap-4 items-end">
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                            Ventana (meses desde mes 1)
                          </span>
                          <input
                            type="number"
                            value={compBuilder.syncWindowMonths}
                            onChange={(e) =>
                              setCompBuilder((c) => ({
                                ...c,
                                syncWindowMonths: Number(e.target.value),
                              }))
                            }
                            min={1}
                            max={360}
                            className="w-24 px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
                          />
                        </label>
                        <label className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                            Meses mínimos sincronizados
                          </span>
                          <input
                            type="number"
                            value={compBuilder.syncMinMonths}
                            onChange={(e) =>
                              setCompBuilder((c) => ({
                                ...c,
                                syncMinMonths: Number(e.target.value),
                              }))
                            }
                            min={1}
                            max={360}
                            className="w-24 px-2 py-1.5 text-xs rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums focus:ring-1 focus:ring-mercantil-orange focus:outline-none"
                          />
                        </label>
                        {!syncMinMonthsValid && (
                          <span className="text-[10px] text-rose-700 dark:text-rose-400">
                            Meses mínimos debe estar entre 1 y la ventana.
                          </span>
                        )}
                      </div>

                      <div className="space-y-3">
                        {compBuilder.syncComponents.map((comp, idx) => (
                          <SyncComponentForm
                            key={idx}
                            state={comp}
                            setState={makeSyncComponentSetState(idx)}
                            hasEtfReturns={hasEtfReturns}
                            hasYieldPaths={hasYieldPaths}
                            title={`Condición ${idx + 1}`}
                            onRemove={
                              compBuilder.syncComponents.length > MIN_COMPOSITE_COMPONENTS
                                ? () => removeSyncComponent(idx)
                                : undefined
                            }
                          />
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-3 items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={addSyncComponent}
                          disabled={compBuilder.syncComponents.length >= MAX_COMPOSITE_COMPONENTS}
                          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                            compBuilder.syncComponents.length >= MAX_COMPOSITE_COMPONENTS
                              ? 'bg-mercantil-line/50 text-mercantil-slate border-mercantil-line dark:bg-mercantil-dark-line/40 dark:text-mercantil-dark-slate dark:border-mercantil-dark-line cursor-not-allowed'
                              : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                          }`}
                        >
                          + Agregar condición ({compBuilder.syncComponents.length}/{MAX_COMPOSITE_COMPONENTS})
                        </button>
                        <button
                          type="button"
                          onClick={runComposite}
                          disabled={!syncMinMonthsValid}
                          className={`mp-btn-primary text-xs px-5 py-2 ${
                            syncMinMonthsValid
                              ? 'bg-mercantil-orange hover:bg-mercantil-orange-deep'
                              : 'bg-mercantil-line/60 cursor-not-allowed'
                          }`}
                        >
                          Evaluar sincronizado
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ========== PRESETS (9 single + 4 composite) ========== */}
              {activeTab === 'preset' && (
                <div className="rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-4 space-y-4">
                  <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                    Escenarios pre-definidos. Click para activar, click de nuevo para desactivar.
                  </p>

                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                      Single-predicado
                    </span>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {BUILT_IN_VIEWS.map((v) => {
                        const disabled = viewRequiresYieldPaths(v) && !hasYieldPaths;
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => activeView?.id === v.id ? clearView() : setActiveView(v.id)}
                            disabled={disabled}
                            title={v.description + (disabled ? ' (requiere yields)' : '')}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              activeView?.id === v.id
                                ? 'bg-mercantil-orange text-white border-mercantil-orange'
                                : disabled
                                  ? 'bg-mercantil-line/50 text-mercantil-slate border-mercantil-line dark:bg-mercantil-dark-line/40 dark:text-mercantil-dark-slate dark:border-mercantil-dark-line cursor-not-allowed'
                                  : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                            }`}
                          >
                            {v.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                      Compuestos (multi-predicado)
                    </span>
                    <p className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate mt-0.5 italic">
                      Combinan tasas + equity en el mismo escenario — útiles para narrativas como estanflación o goldilocks.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {BUILT_IN_COMPOSITE_VIEWS.map((v) => {
                        const disabled =
                          (viewRequiresYieldPaths(v) && !hasYieldPaths) ||
                          (viewRequiresEtfReturns(v) && !hasEtfReturns);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => activeView?.id === v.id ? clearView() : setActiveView(v.id)}
                            disabled={disabled}
                            title={v.description + (disabled ? ' (requiere yields/ETFs)' : '')}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              activeView?.id === v.id
                                ? 'bg-mercantil-orange text-white border-mercantil-orange'
                                : disabled
                                  ? 'bg-mercantil-line/50 text-mercantil-slate border-mercantil-line dark:bg-mercantil-dark-line/40 dark:text-mercantil-dark-slate dark:border-mercantil-dark-line cursor-not-allowed'
                                  : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                            }`}
                          >
                            {v.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">
                      Sincronizados (co-movimiento mes a mes)
                    </span>
                    <p className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate mt-0.5 italic">
                      Más estrictos que los composite AND — exigen que las condiciones ocurran en los mismos meses, no solo dentro de la misma ventana.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-1.5">
                      {BUILT_IN_SYNCHRONIZED_VIEWS.map((v) => {
                        const disabled =
                          (viewRequiresYieldPaths(v) && !hasYieldPaths) ||
                          (viewRequiresEtfReturns(v) && !hasEtfReturns);
                        return (
                          <button
                            key={v.id}
                            type="button"
                            onClick={() => activeView?.id === v.id ? clearView() : setActiveView(v.id)}
                            disabled={disabled}
                            title={v.description + (disabled ? ' (requiere yields/ETFs)' : '')}
                            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                              activeView?.id === v.id
                                ? 'bg-mercantil-orange text-white border-mercantil-orange'
                                : disabled
                                  ? 'bg-mercantil-line/50 text-mercantil-slate border-mercantil-line dark:bg-mercantil-dark-line/40 dark:text-mercantil-dark-slate dark:border-mercantil-dark-line cursor-not-allowed'
                                  : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                            }`}
                          >
                            {v.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ========== RESULTADOS ========== */}
              {error && (
                <div className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-sm text-rose-800 dark:text-rose-200">
                  <strong className="font-semibold">Error: </strong>{error}
                </div>
              )}

              {activeView && !error && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-mercantil-line dark:border-mercantil-dark-line bg-mercantil-mist/40 dark:bg-mercantil-dark-panel/60 p-4">
                    <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-1">{activeView.description}</div>
                    <div className="flex items-end gap-4 flex-wrap mt-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold">Probabilidad empírica</div>
                        <div className="text-3xl font-semibold text-mercantil-orange tabular-nums mt-0.5">
                          {probability != null ? `${(probability * 100).toFixed(1)}%` : '—'}
                        </div>
                        {standardError != null && (
                          <div className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate mt-0.5">
                            ±{(standardError * 100).toFixed(2)} pp (error estándar)
                          </div>
                        )}
                      </div>
                      {badge.label && <div className={`text-[11px] px-2.5 py-1 rounded-full ${badge.cssClass}`}>{badge.label}</div>}
                      {nTotal != null && <div className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate ml-auto">Sobre {nTotal.toLocaleString()} paths</div>}
                    </div>
                  </div>

                  {analysisA && <AsymmetricTable analysis={analysisA} portfolioLabel="Portafolio A" accentClass="A" />}
                  {analysisB && <AsymmetricTable analysis={analysisB} portfolioLabel="Portafolio B" accentClass="B" />}

                  {nMatched === 0 && (
                    <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate italic">
                      Este view no se materializa en ninguno de los escenarios simulados — probabilidad 0%.
                      Interpretación: la hipótesis está fuera del rango de lo esperable según la historia 2006-2026.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
