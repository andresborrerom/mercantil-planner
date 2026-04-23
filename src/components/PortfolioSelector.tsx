/**
 * PortfolioSelector — 3 modos en tabs (§7):
 *   1. Signature: Conservador / Balanceado / Crecimiento (chips).
 *   2. AMC individual: dropdown con los 10 AMCs disponibles.
 *   3. Custom mix: sliders sobre los 10 AMCs con suma verificada + botón normalizar.
 *
 * Debajo del selector, muestra:
 *   - Look-through colapsable a ETFs (donut textual con top 5 + resto).
 *   - %FIXED calculado.
 *   - Total weight (debe ser ~100%).
 */

import { useMemo, useState } from 'react';
import {
  AMC_IDS,
  AMC_LABELS,
  AMC_TIER,
  SIGNATURE_IDS,
  expandPortfolio,
  fixedPercent,
  etfWeightTable,
  normalizeWeights,
  sumWeights,
} from '../domain/amc-definitions';
import { usePlannerStore } from '../state/store';
import type { AmcId, PortfolioSpec } from '../domain/types';

type Props = {
  label: string;
  accentClass: 'A' | 'B';
  value: PortfolioSpec;
  onChange: (spec: PortfolioSpec) => void;
};

type Tab = 'signature' | 'amc' | 'custom';

const accentMap: Record<'A' | 'B', { border: string; chip: string; dot: string }> = {
  A: {
    border: 'border-mercantil-navy',
    chip: 'bg-mercantil-navy/5 text-mercantil-navy dark:text-mercantil-dark-navy-text',
    dot: 'bg-mercantil-navy',
  },
  B: {
    border: 'border-mercantil-orange',
    chip: 'bg-mercantil-orange/10 text-mercantil-orange',
    dot: 'bg-mercantil-orange',
  },
};

export default function PortfolioSelector({ label, accentClass, value, onChange }: Props) {
  const [tab, setTab] = useState<Tab>(value.kind);
  const [customWeights, setCustomWeights] = useState<Partial<Record<AmcId, number>>>(() =>
    value.kind === 'custom' ? value.weights : { GlFI: 40, 'USA.Eq': 30, 'GlSec.Eq': 30 },
  );
  const customLabel = value.kind === 'custom' ? value.label : 'Mezcla custom';

  const accent = accentMap[accentClass];
  const showProposedAmcs = usePlannerStore((s) => s.showProposedAmcs);
  const visibleAmcIds = useMemo(
    () =>
      showProposedAmcs
        ? AMC_IDS
        : AMC_IDS.filter((id) => AMC_TIER[id] === 'existing'),
    [showProposedAmcs],
  );

  // Expansión en vivo para el detalle
  const expanded = useMemo(() => {
    try {
      return expandPortfolio(value);
    } catch (err) {
      console.error('expandPortfolio falló', err);
      return null;
    }
  }, [value]);

  const etfTable = expanded ? etfWeightTable(expanded) : [];
  const fixedPct = expanded ? fixedPercent(expanded) : 0;
  const totalW = expanded ? expanded.totalWeight : 0;

  // Handlers
  const selectSignature = (id: (typeof SIGNATURE_IDS)[number]): void => {
    onChange({ kind: 'signature', id });
  };

  const selectAmc = (id: AmcId): void => {
    onChange({ kind: 'amc', id });
  };

  const updateCustomWeight = (id: AmcId, w: number): void => {
    const next = { ...customWeights, [id]: w };
    setCustomWeights(next);
    onChange({ kind: 'custom', label: customLabel, weights: next });
  };

  const normalizeCustom = (): void => {
    const normalized = normalizeWeights<AmcId>(customWeights, 100);
    setCustomWeights(normalized);
    onChange({ kind: 'custom', label: customLabel, weights: normalized });
  };

  const customSum = sumWeights(customWeights);

  const switchTab = (t: Tab): void => {
    setTab(t);
    if (t === 'signature' && value.kind !== 'signature') {
      selectSignature('Balanceado');
    } else if (t === 'amc' && value.kind !== 'amc') {
      selectAmc('GlFI');
    } else if (t === 'custom' && value.kind !== 'custom') {
      onChange({ kind: 'custom', label: customLabel, weights: customWeights });
    }
  };

  return (
    <div className={`mp-card p-5 border-t-4 ${accent.border}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${accent.dot}`} />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate">
            {label}
          </h3>
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${accent.chip}`}>
          {value.kind === 'signature'
            ? value.id
            : value.kind === 'amc'
              ? AMC_LABELS[value.id]
              : customLabel}
        </span>
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 border-b border-mercantil-line dark:border-mercantil-dark-line">
        {(['signature', 'amc', 'custom'] as const).map((t) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`px-3 py-2 text-xs font-semibold transition relative ${
              tab === t
                ? 'text-mercantil-navy dark:text-mercantil-dark-navy-text'
                : 'text-mercantil-slate dark:text-mercantil-dark-slate hover:text-mercantil-navy dark:text-mercantil-dark-navy-text'
            }`}
          >
            {t === 'signature' ? 'Signature' : t === 'amc' ? 'AMC' : 'Custom'}
            {tab === t && (
              <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-mercantil-orange rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4 min-h-[120px]">
        {tab === 'signature' && (
          <div className="flex flex-wrap gap-2">
            {SIGNATURE_IDS.map((id) => {
              const active = value.kind === 'signature' && value.id === id;
              return (
                <button
                  key={id}
                  onClick={() => selectSignature(id)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                    active
                      ? 'bg-mercantil-navy text-white border-mercantil-navy'
                      : 'bg-white dark:bg-mercantil-dark-panel text-mercantil-slate dark:text-mercantil-dark-slate border-mercantil-line dark:border-mercantil-dark-line hover:border-mercantil-navy hover:text-mercantil-navy dark:text-mercantil-dark-navy-text'
                  }`}
                >
                  {id}
                </button>
              );
            })}
          </div>
        )}

        {tab === 'amc' && (
          <select
            value={value.kind === 'amc' ? value.id : 'GlFI'}
            onChange={(e) => selectAmc(e.target.value as AmcId)}
            className="w-full rounded-lg border border-mercantil-line dark:border-mercantil-dark-line px-3 py-2 text-sm text-mercantil-ink dark:text-mercantil-dark-ink bg-white dark:bg-mercantil-dark-panel focus:outline-none focus:ring-2 focus:ring-mercantil-orange"
          >
            <optgroup label="Existentes">
              {AMC_IDS.filter((id) => AMC_TIER[id] === 'existing').map((id) => (
                <option key={id} value={id}>
                  {AMC_LABELS[id]} ({id})
                </option>
              ))}
            </optgroup>
            {showProposedAmcs && (
              <optgroup label="Propuestos">
                {AMC_IDS.filter((id) => AMC_TIER[id] === 'proposed').map((id) => (
                  <option key={id} value={id}>
                    {AMC_LABELS[id]} ({id})
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        )}

        {tab === 'custom' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-mercantil-slate dark:text-mercantil-dark-slate">Total:</span>
              <span
                className={`font-semibold ${
                  Math.abs(customSum - 100) < 0.01
                    ? 'text-emerald-700'
                    : 'text-amber-700'
                }`}
              >
                {customSum.toFixed(1)}%
              </span>
              <button
                onClick={normalizeCustom}
                className="ml-auto text-xs text-mercantil-orange hover:text-mercantil-orange-deep font-semibold"
              >
                Normalizar a 100%
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto space-y-2 pr-2">
              {visibleAmcIds.map((id) => {
                const w = customWeights[id] ?? 0;
                return (
                  <div key={id} className="flex items-center gap-3">
                    <label className="text-xs w-28 text-mercantil-slate dark:text-mercantil-dark-slate truncate" title={AMC_LABELS[id]}>
                      {id}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={0.5}
                      value={w}
                      onChange={(e) => updateCustomWeight(id, Number(e.target.value))}
                      className="flex-1 accent-mercantil-navy"
                    />
                    <span className="text-xs font-semibold text-mercantil-ink dark:text-mercantil-dark-ink w-12 text-right">
                      {w.toFixed(1)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Look-through detail */}
      <div className="mt-4 pt-4 border-t border-mercantil-line dark:border-mercantil-dark-line">
        <div className="flex items-center justify-between text-xs">
          <span className="text-mercantil-slate dark:text-mercantil-dark-slate">Total expandido:</span>
          <span className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">{totalW.toFixed(1)}%</span>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-mercantil-slate dark:text-mercantil-dark-slate">% FIXED:</span>
          <span className="font-semibold text-mercantil-navy dark:text-mercantil-dark-navy-text">{fixedPct.toFixed(1)}%</span>
        </div>
        {etfTable.length > 0 && (
          <details className="mt-2">
            <summary className="text-xs text-mercantil-orange cursor-pointer hover:text-mercantil-orange-deep font-semibold">
              Look-through a ETFs ({etfTable.length})
            </summary>
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-2">
              {etfTable.map(({ ticker, weight }) => (
                <div
                  key={ticker}
                  className="flex items-center justify-between text-[11px] font-mono"
                >
                  <span className="text-mercantil-slate dark:text-mercantil-dark-slate">{ticker}</span>
                  <span className="text-mercantil-ink dark:text-mercantil-dark-ink">{weight.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
