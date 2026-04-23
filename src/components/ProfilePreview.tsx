/**
 * ProfilePreview — perfil de volatilidad + escenario posible.
 *
 * Dos bloques en el card:
 *   1. Profile badges (A y B) prominentes — muestran la vol histórica
 *      determinística del portafolio y el perfil clasificado (Baja/Media/Alta)
 *      con color. Disponibles SIEMPRE, incluso antes de correr la simulación.
 *   2. Sample path preview — un mini chart con un path random de cada
 *      portafolio (pareados por el bootstrap) + 4 KPIs por portafolio
 *      (%meses neg, MDD, TWR anual, saldo final). Click en el chart = otro
 *      path random.
 *
 * El sample path y las métricas siguen la ventana seleccionada en el FanChart
 * (decisión del usuario el 2026-04-15).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  VOL_PROFILE_DESCRIPTION,
  VOL_PROFILE_LABELS,
  classifyVolProfile,
  computePortfolioHistoricalVol,
  computeSinglePathMetrics,
  type SinglePathStats,
  type VolProfile,
} from '../domain/profile';
import { usePlannerStore } from '../state/store';
import { getChartTheme, useTheme } from '../hooks/useTheme';
import RangeSlider from './RangeSlider';

/** Formatea un mes 1..N como label legible (igual que FanChart). */
function formatMonthLabel(month: number): string {
  if (month <= 24) return `m${month}`;
  const years = Math.floor(month / 12);
  const rem = month - years * 12;
  if (rem === 0) return `${years}a`;
  return `${years}a ${rem}m`;
}

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

function formatPct(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
}

function formatPctSigned(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}${(v * 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// Paleta por perfil
// ---------------------------------------------------------------------------

const profilePalette: Record<
  VolProfile,
  { bg: string; text: string; border: string; dot: string; iconBg: string }
> = {
  baja: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/40',
    text: 'text-emerald-900 dark:text-emerald-200',
    border: 'border-emerald-300 dark:border-emerald-600',
    dot: 'bg-emerald-500',
    iconBg: 'bg-emerald-500',
  },
  media: {
    bg: 'bg-amber-50 dark:bg-amber-950/40',
    text: 'text-amber-900 dark:text-amber-200',
    border: 'border-amber-300 dark:border-amber-600',
    dot: 'bg-amber-500',
    iconBg: 'bg-amber-500',
  },
  alta: {
    bg: 'bg-rose-50 dark:bg-rose-950/40',
    text: 'text-rose-900 dark:text-rose-200',
    border: 'border-rose-400 dark:border-rose-600',
    dot: 'bg-rose-500',
    iconBg: 'bg-rose-500',
  },
};

const accentBorderByLetter: Record<'A' | 'B', string> = {
  A: 'border-l-mercantil-navy',
  B: 'border-l-mercantil-orange',
};

const accentColorByLetter: Record<'A' | 'B', string> = {
  A: '#213A7D',
  B: '#E97031',
};

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function ProfilePreview() {
  const portfolioA = usePlannerStore((s) => s.portfolioA);
  const portfolioB = usePlannerStore((s) => s.portfolioB);
  const simA = usePlannerStore((s) => s.simA);
  const simB = usePlannerStore((s) => s.simB);
  const rawA = usePlannerStore((s) => s.rawReturnsA);
  const rawB = usePlannerStore((s) => s.rawReturnsB);
  const horizon = usePlannerStore((s) => s.plan.horizonMonths);
  const window = usePlannerStore((s) => s.window);
  const setWindow = usePlannerStore((s) => s.setWindow);
  const { theme } = useTheme();
  const chart = getChartTheme(theme);

  // Vol histórica — determinística, disponible siempre
  const volA = useMemo(() => computePortfolioHistoricalVol(portfolioA), [portfolioA]);
  const volB = useMemo(() => computePortfolioHistoricalVol(portfolioB), [portfolioB]);
  const profA = useMemo(() => classifyVolProfile(volA), [volA]);
  const profB = useMemo(() => classifyVolProfile(volB), [volB]);

  // Número de paths disponibles en la simulación vigente
  const nPaths = simA ? simA.values.length / (horizon + 1) : 0;

  // Índice del path actualmente visualizado. Se re-rollea cuando llega una
  // simulación nueva (cambia la referencia de simA) o cuando el usuario hace
  // click en el chart.
  const [pathIdx, setPathIdx] = useState(0);

  useEffect(() => {
    if (nPaths > 0) {
      setPathIdx(Math.floor(Math.random() * nPaths));
    }
  }, [simA, nPaths]);

  const handleResample = useCallback(() => {
    if (nPaths > 0) {
      setPathIdx(Math.floor(Math.random() * nPaths));
    }
  }, [nPaths]);

  // Datos del chart mini para el path actual, clippeados a la ventana
  const pathData = useMemo(() => {
    if (!simA || !simB || nPaths === 0) return [];
    const valOff = pathIdx * (horizon + 1);
    const from = Math.max(0, window.startMonth - 1);
    const to = Math.min(horizon + 1, window.endMonth + 1);
    const points: Array<{ month: number; a: number; b: number }> = [];
    for (let t = from; t < to; t++) {
      points.push({
        month: t,
        a: simA.values[valOff + t],
        b: simB.values[valOff + t],
      });
    }
    return points;
  }, [simA, simB, pathIdx, horizon, nPaths, window.startMonth, window.endMonth]);

  // KPIs per-portfolio para el path seleccionado
  const statsA: SinglePathStats | null = useMemo(() => {
    if (!simA || !rawA || nPaths === 0) return null;
    return computeSinglePathMetrics(
      simA.values,
      rawA,
      pathIdx,
      horizon,
      window.startMonth,
      window.endMonth,
    );
  }, [simA, rawA, pathIdx, horizon, nPaths, window.startMonth, window.endMonth]);

  const statsB: SinglePathStats | null = useMemo(() => {
    if (!simB || !rawB || nPaths === 0) return null;
    return computeSinglePathMetrics(
      simB.values,
      rawB,
      pathIdx,
      horizon,
      window.startMonth,
      window.endMonth,
    );
  }, [simB, rawB, pathIdx, horizon, nPaths, window.startMonth, window.endMonth]);

  const hasSim = nPaths > 0;
  const windowLength = window.endMonth - window.startMonth + 1;

  // Tick formatter adaptativo al largo de la ventana (misma lógica que FanChart)
  const xTickFormatter = useMemo(() => {
    if (windowLength <= 24) return (v: number) => `m${Math.round(v)}`;
    if (windowLength <= 72)
      return (v: number) => {
        const y = v / 12;
        return Number.isInteger(y) ? `${y}a` : `${y.toFixed(1)}a`;
      };
    return (v: number) => `${Math.round(v / 12)}a`;
  }, [windowLength]);

  return (
    <div className="mp-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base">Perfil del cliente y escenario posible</h2>
          <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mt-0.5">
            Clasificación por volatilidad histórica 2006–2026. El escenario del
            gráfico es un path del bootstrap — click para muestrear otro.
          </p>
        </div>
      </div>

      {/* Profile badges prominentes */}
      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProfileBadge label="Portafolio A" accent="A" vol={volA} profile={profA} />
        <ProfileBadge label="Portafolio B" accent="B" vol={volB} profile={profB} />
      </div>

      {/* Sample path preview */}
      {!hasSim ? (
        <div className="mt-5 rounded-lg border border-dashed border-mercantil-line dark:border-mercantil-dark-line p-6 text-center text-sm text-mercantil-slate dark:text-mercantil-dark-slate">
          Corré una simulación para ver un escenario de ejemplo con las métricas
          de ese path.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Chart (3/5) */}
          <div
            className="lg:col-span-3 rounded-lg border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel p-3 cursor-pointer hover:border-mercantil-orange hover:shadow-card transition select-none"
            onClick={handleResample}
            title="Click para muestrear otro escenario"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate">
                Escenario #{pathIdx + 1} de {nPaths.toLocaleString()}
              </span>
              <span className="text-[11px] text-mercantil-orange font-semibold inline-flex items-center gap-1">
                <span>⟲</span>
                <span>Click = otro escenario</span>
              </span>
            </div>
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pathData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                  <XAxis
                    dataKey="month"
                    type="number"
                    domain={[Math.max(0, window.startMonth - 1), window.endMonth]}
                    allowDataOverflow
                    tickFormatter={xTickFormatter}
                    stroke={chart.axis}
                    fontSize={10}
                  />
                  <YAxis
                    tickFormatter={formatUsd}
                    stroke={chart.axis}
                    fontSize={10}
                    width={60}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip content={<PathTooltip chart={chart} />} />
                  <Line
                    type="monotone"
                    dataKey="a"
                    name="Portafolio A"
                    stroke={chart.portfolioA}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="b"
                    name="Portafolio B"
                    stroke={chart.portfolioB}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* KPIs (2/5) */}
          <div className="lg:col-span-2 space-y-3">
            <SinglePathKpis label="Portafolio A" accent="A" stats={statsA} />
            <SinglePathKpis label="Portafolio B" accent="B" stats={statsB} />
          </div>

          {/* Slider de ventana sincronizado con el FanChart */}
          <div className="lg:col-span-5 mt-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate">
                Ventana (sincronizada con el fan chart)
              </span>
              <span className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums">
                Meses {window.startMonth}–{window.endMonth} ·{' '}
                {((window.endMonth - window.startMonth + 1) / 12).toFixed(1)} años
              </span>
            </div>
            <RangeSlider
              min={1}
              max={horizon}
              start={window.startMonth}
              end={window.endMonth}
              onChange={(s, e) => setWindow({ startMonth: s, endMonth: e })}
              formatValue={formatMonthLabel}
              ariaLabelStart="Inicio de la ventana (profile preview)"
              ariaLabelEnd="Fin de la ventana (profile preview)"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function ProfileBadge({
  label,
  accent,
  vol,
  profile,
}: {
  label: string;
  accent: 'A' | 'B';
  vol: number;
  profile: VolProfile;
}) {
  const palette = profilePalette[profile];
  return (
    <div
      className={`rounded-lg border-l-4 ${accentBorderByLetter[accent]} ${palette.bg} ${palette.border} border p-4 shadow-sm transition hover:shadow-card`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate">
          {label}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate/80">
          vol histórica 2006–2026
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border-2 ${palette.border} ${palette.text} bg-white dark:bg-mercantil-dark-panel text-sm font-bold uppercase tracking-wide`}
        >
          <span className={`h-2 w-2 rounded-full ${palette.dot}`} />
          {VOL_PROFILE_LABELS[profile]}
        </span>
        <div className="text-right">
          <div className="text-3xl font-bold tabular-nums text-mercantil-ink dark:text-mercantil-dark-ink leading-none">
            {Number.isFinite(vol) ? `${(vol * 100).toFixed(1)}` : '—'}
            <span className="text-lg">%</span>
          </div>
        </div>
      </div>
      <p className={`mt-2 text-[11px] ${palette.text} opacity-80`}>
        {VOL_PROFILE_DESCRIPTION[profile]}
      </p>
    </div>
  );
}

function SinglePathKpis({
  label,
  accent,
  stats,
}: {
  label: string;
  accent: 'A' | 'B';
  stats: SinglePathStats | null;
}) {
  const color = accentColorByLetter[accent];
  return (
    <div className="rounded-lg border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel p-3">
      <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-mercantil-line dark:border-mercantil-dark-line/60">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: color }}
        />
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {label}
        </span>
      </div>
      {!stats ? (
        <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate py-2">Sin datos</div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Meses neg." value={formatPct(stats.pctNegMonths)} />
          <Kpi label="Max DD" value={formatPct(stats.maxDrawdown)} negative />
          <Kpi
            label="TWR anual"
            value={formatPctSigned(stats.twrAnnualized)}
            negative={stats.twrAnnualized < 0}
          />
          <Kpi label="Saldo final" value={formatUsd(stats.finalValue)} />
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  negative = false,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate">
        {label}
      </div>
      <div
        className={`tabular-nums text-sm font-bold ${
          negative ? 'text-rose-700' : 'text-mercantil-ink dark:text-mercantil-dark-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tooltip del mini chart
// ---------------------------------------------------------------------------

type PathTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: { month: number; a: number; b: number } }>;
  chart?: { portfolioA: string; portfolioB: string };
};

function PathTooltip({ active, payload, chart }: PathTooltipProps) {
  if (!active || !payload || payload.length === 0 || !chart) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel px-3 py-2 text-xs shadow-card">
      <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink mb-1">
        Mes {p.month} ({(p.month / 12).toFixed(1)} años)
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-mercantil-slate dark:text-mercantil-dark-slate">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: chart.portfolioA }}
          />
          A
        </span>
        <span className="tabular-nums font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">
          {formatUsd(p.a)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-mercantil-slate dark:text-mercantil-dark-slate">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: chart.portfolioB }}
          />
          B
        </span>
        <span className="tabular-nums font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">
          {formatUsd(p.b)}
        </span>
      </div>
    </div>
  );
}
