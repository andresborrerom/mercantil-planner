/**
 * StatsPanel — tabla de métricas A vs B con delta.
 *
 * Cada fila es una métrica del §6. Tres columnas: A, B, Δ (B−A) con color.
 * Las métricas agregadas se muestran como "mediana (P10–P90)". Los escalares
 * (ruina, shortfall) como número simple.
 */

import type { Band, WindowMetrics } from '../domain/metrics';
import { usePlannerStore } from '../state/store';
import { useViews } from '../hooks/useViews';

type FormatKind = 'pct' | 'pct-signed' | 'usd' | 'num';

type MetricRow = {
  key: string;
  label: string;
  hint?: string;
  kind: 'band' | 'scalar';
  getBand?: (m: WindowMetrics) => Band | null;
  getScalar?: (m: WindowMetrics) => number;
  format: FormatKind;
  /** Si deltaPositiveIs === 'bad', valores B > A son rojos. Para risk metrics. */
  deltaPositiveIs: 'good' | 'bad';
};

const ROWS: MetricRow[] = [
  {
    key: 'twr',
    label: 'TWR anualizado',
    hint: 'Time-weighted, ignora flujos',
    kind: 'band',
    getBand: (m) => m.twrAnnualized,
    format: 'pct',
    deltaPositiveIs: 'good',
  },
  {
    key: 'xirr',
    label: 'XIRR (money-weighted)',
    hint: 'TIR anual sobre cashflows del cliente',
    kind: 'band',
    getBand: (m) => m.xirrAnnualized,
    format: 'pct',
    deltaPositiveIs: 'good',
  },
  {
    key: 'mdd',
    label: 'Max Drawdown',
    hint: 'Caída máxima del portafolio, independiente de aportes/retiros del cliente',
    kind: 'band',
    getBand: (m) => m.maxDrawdown,
    format: 'pct',
    deltaPositiveIs: 'good', // menos drawdown (más cercano a 0) es mejor
  },
  {
    key: 'neg',
    label: 'Meses neg. / año',
    kind: 'band',
    getBand: (m) => m.negMonthsPerYear,
    format: 'num',
    deltaPositiveIs: 'bad',
  },
  {
    key: 'vol',
    label: 'Volatilidad anualizada',
    kind: 'band',
    getBand: (m) => m.volatilityAnnualized,
    format: 'pct',
    deltaPositiveIs: 'bad',
  },
  {
    key: 'worst12',
    label: 'Peor rolling 12m',
    hint: 'Ventana ≥ 12 meses',
    kind: 'band',
    getBand: (m) => m.worstRolling12m,
    format: 'pct',
    deltaPositiveIs: 'good',
  },
  {
    key: 'final',
    label: 'Valor final',
    hint: 'Al cierre de la ventana',
    kind: 'band',
    getBand: (m) => m.finalValue,
    format: 'usd',
    deltaPositiveIs: 'good',
  },
  {
    key: 'short',
    label: 'Prob. shortfall',
    hint: 'P(V < capital aportado neto) al cierre de la ventana',
    kind: 'scalar',
    getScalar: (m) => m.shortfallProbability,
    format: 'pct',
    deltaPositiveIs: 'bad',
  },
  {
    key: 'ruin',
    label: 'Prob. ruina',
    hint: 'Sobre horizonte total (no depende de la ventana)',
    kind: 'scalar',
    getScalar: (m) => m.ruinProbability,
    format: 'pct',
    deltaPositiveIs: 'bad',
  },
];

function fmt(v: number | null | undefined, kind: FormatKind): string {
  if (v == null || !Number.isFinite(v)) return '—';
  switch (kind) {
    case 'pct':
      return `${(v * 100).toFixed(2)}%`;
    case 'pct-signed':
      return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`;
    case 'usd': {
      const abs = Math.abs(v);
      if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
      if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
      return `$${v.toFixed(0)}`;
    }
    case 'num':
      return v.toFixed(2);
  }
}

function fmtBand(b: Band | null, kind: FormatKind): string {
  if (!b) return '—';
  return `${fmt(b.p50, kind)}  (${fmt(b.p10, kind)}–${fmt(b.p90, kind)})`;
}

function deltaClass(delta: number, direction: 'good' | 'bad'): string {
  if (!Number.isFinite(delta) || delta === 0) return 'text-mercantil-slate dark:text-mercantil-dark-slate';
  const isPositive = delta > 0;
  const isGood = (direction === 'good' && isPositive) || (direction === 'bad' && !isPositive);
  return isGood ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400';
}

/**
 * Renderiza la tabla de 9 métricas dadas metricsA/metricsB. Reutilizado por
 * la sección base y la sección condicional al view.
 */
function StatsTable({ metricsA, metricsB }: { metricsA: WindowMetrics; metricsB: WindowMetrics }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate border-b border-mercantil-line dark:border-mercantil-dark-line">
            <th className="text-left py-2 pr-2 font-semibold">Métrica</th>
            <th className="text-right py-2 px-2 font-semibold text-mercantil-navy dark:text-mercantil-dark-navy-text">A</th>
            <th className="text-right py-2 px-2 font-semibold text-mercantil-orange">B</th>
            <th className="text-right py-2 pl-2 font-semibold">Δ (B − A)</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => {
            const isBand = row.kind === 'band';
            if (isBand && row.getBand) {
              const bA = row.getBand(metricsA);
              const bB = row.getBand(metricsB);
              const delta =
                bA && bB && Number.isFinite(bA.p50) && Number.isFinite(bB.p50)
                  ? bB.p50 - bA.p50
                  : NaN;
              return (
                <tr key={row.key} className="border-b border-mercantil-line dark:border-mercantil-dark-line/60 last:border-none">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-mercantil-ink dark:text-mercantil-dark-ink">{row.label}</div>
                    {row.hint && (
                      <div className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate/80">{row.hint}</div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right text-mercantil-ink dark:text-mercantil-dark-ink">
                    {fmtBand(bA, row.format)}
                  </td>
                  <td className="py-2 px-2 text-right text-mercantil-ink dark:text-mercantil-dark-ink">
                    {fmtBand(bB, row.format)}
                  </td>
                  <td
                    className={`py-2 pl-2 text-right font-semibold ${deltaClass(delta, row.deltaPositiveIs)}`}
                  >
                    {Number.isFinite(delta) ? fmt(delta, row.format === 'usd' ? 'usd' : row.format === 'num' ? 'num' : 'pct-signed') : '—'}
                  </td>
                </tr>
              );
            }
            if (row.getScalar) {
              const sA = row.getScalar(metricsA);
              const sB = row.getScalar(metricsB);
              const delta = sB - sA;
              return (
                <tr key={row.key} className="border-b border-mercantil-line dark:border-mercantil-dark-line/60 last:border-none">
                  <td className="py-2 pr-2">
                    <div className="font-medium text-mercantil-ink dark:text-mercantil-dark-ink">{row.label}</div>
                    {row.hint && (
                      <div className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate/80">{row.hint}</div>
                    )}
                  </td>
                  <td className="py-2 px-2 text-right text-mercantil-ink dark:text-mercantil-dark-ink">
                    {fmt(sA, row.format)}
                  </td>
                  <td className="py-2 px-2 text-right text-mercantil-ink dark:text-mercantil-dark-ink">
                    {fmt(sB, row.format)}
                  </td>
                  <td
                    className={`py-2 pl-2 text-right font-semibold ${deltaClass(delta, row.deltaPositiveIs)}`}
                  >
                    {Number.isFinite(delta) ? fmt(delta, 'pct-signed') : '—'}
                  </td>
                </tr>
              );
            }
            return null;
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function StatsPanel() {
  const metricsA = usePlannerStore((s) => s.metricsA);
  const metricsB = usePlannerStore((s) => s.metricsB);
  const window = usePlannerStore((s) => s.window);
  const { activeView, analysisA, analysisB, nMatched, probability } = useViews();

  const hasData = metricsA && metricsB;
  // Condicional visible si hay view activo con matched paths en ambos portafolios.
  const condMetricsA = analysisA?.matched ?? null;
  const condMetricsB = analysisB?.matched ?? null;
  const hasCondData = activeView !== null && condMetricsA !== null && condMetricsB !== null;
  const viewHasZeroMatches = activeView !== null && nMatched === 0;

  return (
    <div className="mp-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base">Estadísticas A vs B</h2>
          <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mt-0.5">
            Mediana con banda P10–P90. Ventana: mes {window.startMonth} → {window.endMonth}
          </p>
        </div>
        {metricsA && (
          <span className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate">
            nPaths = {metricsA.nPaths} · XIRR válidos A: {metricsA.nValidXirr}
            {metricsB ? ` · B: ${metricsB.nValidXirr}` : ''}
          </span>
        )}
      </div>

      {!hasData ? (
        <div className="mt-4 rounded-lg border border-dashed border-mercantil-line dark:border-mercantil-dark-line p-8 text-center text-sm text-mercantil-slate dark:text-mercantil-dark-slate">
          Corré una simulación para ver las estadísticas.
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {/* Sección base (todos los paths) */}
          <div>
            <div className="text-[11px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-semibold mb-2">
              Base — todos los {metricsA.nPaths.toLocaleString()} paths
            </div>
            <StatsTable metricsA={metricsA} metricsB={metricsB} />
          </div>

          {/* Sección condicional (solo si hay view activo) */}
          {hasCondData && (
            <div>
              <div className="text-[11px] uppercase tracking-wider text-mercantil-orange font-semibold mb-2 flex items-center flex-wrap gap-2">
                <span>
                  Condicional al view: «{activeView!.label}»
                </span>
                <span className="text-mercantil-slate dark:text-mercantil-dark-slate font-normal">
                  P ={' '}
                  <strong className="tabular-nums text-mercantil-orange">
                    {probability != null ? `${(probability * 100).toFixed(1)}%` : '—'}
                  </strong>{' '}
                  · {nMatched?.toLocaleString() ?? '—'} paths
                </span>
              </div>
              <StatsTable metricsA={condMetricsA!} metricsB={condMetricsB!} />
            </div>
          )}

          {viewHasZeroMatches && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
              <strong className="font-semibold">Sin datos condicionales: </strong>
              el view «{activeView!.label}» tiene probabilidad 0% — ningún path lo materializa.
              Las estadísticas condicionales no son computables.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
