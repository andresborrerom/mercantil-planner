/**
 * RegimesPanel — Fase C.3.
 *
 * Replay determinístico de 3 regímenes históricos aplicados al portafolio
 * actual del usuario. A diferencia del FanChart (distribución probabilística
 * de miles de paths), acá mostramos UN camino fijo por portafolio+modo.
 *
 * Dos interpretaciones se visualizan simultáneamente (decisión usuario 2026-04-23):
 *
 *   'historical'   — tasas del período, replay 100% histórico.
 *   'currentRates' — mismo shock, arranque desde las tasas de HOY.
 *
 * Por diseño NO hay toggle: mostrar ambas a la vez hace visible el gap entre
 * las dos, que es exactamente el impacto del carry al arrancar desde las
 * tasas actuales. En portafolios equity-puros las dos líneas coinciden; en
 * portafolios RF-heavy el gap ilustra por qué el nivel de tasas de partida
 * importa tanto como el shock.
 */

import { useMemo } from 'react';
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePlannerStore } from '../state/store';
import { getChartTheme, useTheme, type ChartTheme } from '../hooks/useTheme';
import {
  REGIMES,
  computeRegimeReturns,
  computeRegimeStats,
  computeValuePath,
  findRegime,
  regimeWindow,
  type RegimeId,
  type RegimeStats,
} from '../domain/regimes';
import { useState } from 'react';

type SeriesKey = 'aHist' | 'aCurr' | 'bHist' | 'bCurr';

type ChartPoint = {
  month: number;
  aHist: number;
  aCurr: number;
  bHist: number;
  bCurr: number;
};

function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPct(v: number, decimals = 1, signed = false): string {
  if (!Number.isFinite(v)) return '—';
  const prefix = signed && v >= 0 ? '+' : '';
  return `${prefix}${(v * 100).toFixed(decimals)}%`;
}

export default function RegimesPanel() {
  const portfolioA = usePlannerStore((s) => s.portfolioA);
  const portfolioB = usePlannerStore((s) => s.portfolioB);
  const yieldInitial = usePlannerStore((s) => s.yieldInitial);
  const initialCapital = usePlannerStore((s) => s.plan.initialCapital);
  const { theme } = useTheme();
  const chart = getChartTheme(theme);

  const [regimeId, setRegimeId] = useState<RegimeId>('crisis2008');
  const [expanded, setExpanded] = useState(false);

  const regime = findRegime(regimeId);

  /**
   * Capital inicial para el replay. Usamos el `initialCapital` del plan del
   * usuario si es > 0; si no, default a $100,000 para que las cifras de la
   * tabla de stats sean legibles.
   */
  const V0 = initialCapital > 0 ? initialCapital : 100_000;

  // Series de retornos — 4 combinaciones portafolio × modo
  const { chartData, stats } = useMemo(() => {
    try {
      const rA_hist = computeRegimeReturns(portfolioA, regime, 'historical', yieldInitial);
      const rA_curr = computeRegimeReturns(portfolioA, regime, 'currentRates', yieldInitial);
      const rB_hist = computeRegimeReturns(portfolioB, regime, 'historical', yieldInitial);
      const rB_curr = computeRegimeReturns(portfolioB, regime, 'currentRates', yieldInitial);

      const pathA_hist = computeValuePath(V0, rA_hist);
      const pathA_curr = computeValuePath(V0, rA_curr);
      const pathB_hist = computeValuePath(V0, rB_hist);
      const pathB_curr = computeValuePath(V0, rB_curr);

      const { length } = regimeWindow(regime);
      const data: ChartPoint[] = [];
      for (let t = 0; t <= length; t++) {
        data.push({
          month: t,
          aHist: pathA_hist[t],
          aCurr: pathA_curr[t],
          bHist: pathB_hist[t],
          bCurr: pathB_curr[t],
        });
      }

      return {
        chartData: data,
        stats: {
          aHist: computeRegimeStats(pathA_hist),
          aCurr: computeRegimeStats(pathA_curr),
          bHist: computeRegimeStats(pathB_hist),
          bCurr: computeRegimeStats(pathB_curr),
        } as Record<SeriesKey, RegimeStats>,
      };
    } catch (err) {
      // Si algo falla (ej. portafolio vacío), renderizamos vacío — no crash.
      console.error('RegimesPanel: error computando regime', err);
      return { chartData: [] as ChartPoint[], stats: null };
    }
  }, [portfolioA, portfolioB, regime, yieldInitial, V0]);

  const xTickFormatter = (v: number) => (v === 0 ? 'inicio' : `m${Math.round(v)}`);

  return (
    <div className="mp-card p-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 text-left"
        >
          <svg
            className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path d="M7 5l6 5-6 5V5z" />
          </svg>
          <div>
            <h2 className="text-base">Regímenes históricos — replay determinístico</h2>
            <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mt-0.5">
              Aplica un período histórico concreto al portafolio actual. Dos interpretaciones
              simultáneas: shock con tasas del período vs. shock con tasas de hoy como arranque.
            </p>
          </div>
        </button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Selector de régimen */}
          <div className="flex gap-2 flex-wrap">
            {REGIMES.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRegimeId(r.id)}
                title={r.description}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                  regimeId === r.id
                    ? 'bg-mercantil-orange text-white border-mercantil-orange'
                    : 'bg-white text-mercantil-navy border-mercantil-line hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-navy-text dark:border-mercantil-dark-line dark:hover:bg-mercantil-dark-line/60'
                }`}
              >
                {r.short}
              </button>
            ))}
          </div>

          {/* Descripción del régimen activo */}
          <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate italic">
            <strong className="font-semibold not-italic text-mercantil-ink dark:text-mercantil-dark-ink">
              {regime.label}.
            </strong>{' '}
            {regime.description}
          </p>

          {/* Leyenda */}
          <div className="flex items-center gap-4 text-xs flex-wrap">
            <LegendLine color={chart.portfolioA} label="A · tasas actuales" dashed={false} />
            <LegendLine color={chart.portfolioA} label="A · tasas del período" dashed fade />
            <LegendLine color={chart.portfolioB} label="B · tasas actuales" dashed={false} />
            <LegendLine color={chart.portfolioB} label="B · tasas del período" dashed fade />
          </div>

          {/* Chart */}
          {chartData.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center rounded-lg border border-dashed border-mercantil-line dark:border-mercantil-dark-line text-sm text-mercantil-slate dark:text-mercantil-dark-slate">
              Definí un portafolio para ver el replay.
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis
                    dataKey="month"
                    type="number"
                    domain={[0, chartData[chartData.length - 1].month]}
                    tickFormatter={xTickFormatter}
                    stroke={chart.axis}
                    fontSize={11}
                  />
                  <YAxis
                    tickFormatter={formatUsd}
                    stroke={chart.axis}
                    fontSize={11}
                    width={70}
                  />
                  <Tooltip
                    content={<RegimeTooltip chart={chart} />}
                    cursor={{ stroke: chart.portfolioB, strokeDasharray: '3 3' }}
                  />
                  <Legend wrapperStyle={{ display: 'none' }} />
                  <Line
                    type="monotone"
                    dataKey="aCurr"
                    name="A · tasas actuales"
                    stroke={chart.portfolioA}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="aHist"
                    name="A · tasas del período"
                    stroke={chart.portfolioA}
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    strokeOpacity={0.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bCurr"
                    name="B · tasas actuales"
                    stroke={chart.portfolioB}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bHist"
                    name="B · tasas del período"
                    stroke={chart.portfolioB}
                    strokeWidth={1.5}
                    strokeDasharray="5 3"
                    strokeOpacity={0.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Tabla de stats */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <StatsSubtable
                title="Portafolio A"
                colorClass="text-mercantil-navy dark:text-mercantil-dark-navy-text"
                hist={stats.aHist}
                curr={stats.aCurr}
              />
              <StatsSubtable
                title="Portafolio B"
                colorClass="text-mercantil-orange"
                hist={stats.bHist}
                curr={stats.bCurr}
              />
            </div>
          )}

          <p className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate italic">
            Replay de un único camino histórico — N=1, sin probabilidad.
            Capital inicial: {formatUsd(V0)}
            {initialCapital > 0 ? ' (del plan)' : ' (default)'}. Sin aportes/retiros durante el
            período — muestra el comportamiento del portafolio desnudo bajo el shock.
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function LegendLine({
  color,
  label,
  dashed,
  fade = false,
}: {
  color: string;
  label: string;
  dashed: boolean;
  fade?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ opacity: fade ? 0.7 : 1 }}>
      <svg width={18} height={6} className="overflow-visible">
        <line
          x1={0}
          y1={3}
          x2={18}
          y2={3}
          stroke={color}
          strokeWidth={2}
          strokeDasharray={dashed ? '4 2' : undefined}
        />
      </svg>
      <span className="text-mercantil-slate dark:text-mercantil-dark-slate">{label}</span>
    </span>
  );
}

function StatsSubtable({
  title,
  colorClass,
  hist,
  curr,
}: {
  title: string;
  colorClass: string;
  hist: RegimeStats;
  curr: RegimeStats;
}) {
  return (
    <div className="overflow-x-auto">
      <div className={`text-xs uppercase tracking-wider font-semibold mb-1 ${colorClass}`}>
        {title}
      </div>
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate border-b border-mercantil-line dark:border-mercantil-dark-line">
            <th className="text-left py-1.5 pr-2 font-semibold">Métrica</th>
            <th className="text-right py-1.5 px-2 font-semibold">Tasas actuales</th>
            <th className="text-right py-1.5 pl-2 font-semibold">Tasas del período</th>
          </tr>
        </thead>
        <tbody>
          <StatsRow label="Retorno total" vCurr={formatPct(curr.totalReturn, 1, true)} vHist={formatPct(hist.totalReturn, 1, true)} />
          <StatsRow label="Max drawdown" vCurr={formatPct(curr.maxDrawdown, 1)} vHist={formatPct(hist.maxDrawdown, 1)} />
          <StatsRow label="Valor final" vCurr={formatUsd(curr.finalValue)} vHist={formatUsd(hist.finalValue)} />
        </tbody>
      </table>
    </div>
  );
}

function StatsRow({ label, vCurr, vHist }: { label: string; vCurr: string; vHist: string }) {
  return (
    <tr className="border-b border-mercantil-line dark:border-mercantil-dark-line/60 last:border-none">
      <td className="py-1.5 pr-2 text-mercantil-ink dark:text-mercantil-dark-ink">{label}</td>
      <td className="py-1.5 px-2 text-right text-mercantil-ink dark:text-mercantil-dark-ink font-semibold">{vCurr}</td>
      <td className="py-1.5 pl-2 text-right text-mercantil-slate dark:text-mercantil-dark-slate">{vHist}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

type TooltipPayload = {
  payload?: ChartPoint;
};

type TooltipProps = {
  active?: boolean;
  payload?: TooltipPayload[];
  chart?: ChartTheme;
};

function RegimeTooltip({ active, payload, chart }: TooltipProps) {
  if (!active || !payload || payload.length === 0 || !chart) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel px-3 py-2 text-xs shadow-card">
      <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink mb-1.5">
        {p.month === 0 ? 'Inicio' : `Mes ${p.month}`}
      </div>
      <TooltipRow color={chart.portfolioA} label="A · tasas actuales" value={formatUsd(p.aCurr)} bold />
      <TooltipRow color={chart.portfolioA} label="A · tasas del período" value={formatUsd(p.aHist)} dashed />
      <div className="h-1" />
      <TooltipRow color={chart.portfolioB} label="B · tasas actuales" value={formatUsd(p.bCurr)} bold />
      <TooltipRow color={chart.portfolioB} label="B · tasas del período" value={formatUsd(p.bHist)} dashed />
    </div>
  );
}

function TooltipRow({
  color,
  label,
  value,
  bold = false,
  dashed = false,
}: {
  color: string;
  label: string;
  value: string;
  bold?: boolean;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="flex items-center gap-1.5 text-mercantil-slate dark:text-mercantil-dark-slate">
        {dashed ? (
          <svg width={10} height={4}>
            <line x1={0} y1={2} x2={10} y2={2} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" />
          </svg>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        )}
        {label}
      </span>
      <span className={`tabular-nums ${bold ? 'font-semibold text-mercantil-ink dark:text-mercantil-dark-ink' : ''}`}>
        {value}
      </span>
    </div>
  );
}
