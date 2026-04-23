/**
 * FanChart — gráfico principal del planner.
 *
 * Dibuja dos bandas superpuestas (A navy, B naranja) con percentiles P10/P90
 * como "area" y mediana como línea. Overlay: capital aportado neto como línea
 * determinística gris. Slider horizontal + chips para controlar la ventana.
 *
 * Implementación:
 *   - Recharts ComposedChart con dos Area stackId y dos Line.
 *   - Datos: por mes, [net, A_p10, A_p50, A_p90, B_p10, B_p50, B_p90].
 *   - El slider vive afuera del chart para que tenga control fino y el update
 *     de métricas sea por callback directo al store.
 */

import { useMemo, useState } from 'react';
import {
  Area,
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
import { useViews } from '../hooks/useViews';
import RangeSlider from './RangeSlider';
import SimulateButton from './SimulateButton';

type Point = {
  month: number;
  year: number;
  net: number;
  aP10: number;
  aP50: number;
  aP90: number;
  bP10: number;
  bP50: number;
  bP90: number;
  // Recharts stacked areas: we feed (p10, p90) per portfolio para bandas base
  aBand: [number, number];
  bBand: [number, number];
  // Fase C.2c v2 — bandas condicionales (opcional, si hay view activo con nMatched>0)
  condAP10?: number;
  condAP50?: number;
  condAP90?: number;
  condBP10?: number;
  condBP50?: number;
  condBP90?: number;
  condABand?: [number, number];
  condBBand?: [number, number];
};

type DisplayMode = 'overlay' | 'toggle';
type ToggleShown = 'base' | 'cond';

function formatUsd(v: number): string {
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export default function FanChart() {
  const bandsA = usePlannerStore((s) => s.bandsA);
  const bandsB = usePlannerStore((s) => s.bandsB);
  const condBandsA = usePlannerStore((s) => s.condBandsA);
  const condBandsB = usePlannerStore((s) => s.condBandsB);
  const simA = usePlannerStore((s) => s.simA);
  const horizon = usePlannerStore((s) => s.plan.horizonMonths);
  const window = usePlannerStore((s) => s.window);
  const setWindow = usePlannerStore((s) => s.setWindow);
  const { theme } = useTheme();
  const chart = getChartTheme(theme);
  const hasCond = condBandsA !== null && condBandsB !== null;

  // Fase C.2c v2 — estado local del modo de visualización del condicional.
  // Default: 'overlay' (ambos visibles con jerarquía). 'toggle' deja ver uno
  // a la vez con sub-toggle base↔cond. Sin persistencia — reset a overlay
  // cada vez que el componente se monta.
  const [displayMode, setDisplayMode] = useState<DisplayMode>('overlay');
  const [toggleShown, setToggleShown] = useState<ToggleShown>('cond');

  // Derivaciones de render:
  //   overlay → base (bandas sólidas 20% fill + medianas sólidas, estilo normal)
  //             + cond sobre encima como 6 líneas dashed (P10/P50/P90 A y B)
  //   toggle base → solo base 20% fill + medianas sólidas (estilo normal)
  //   toggle cond → solo cond 20% fill + medianas sólidas (mismo estilo que base,
  //                 pero con los datos condicionales)
  const showBase =
    !hasCond || displayMode === 'overlay' || (displayMode === 'toggle' && toggleShown === 'base');
  const showCond =
    hasCond && (displayMode === 'overlay' || (displayMode === 'toggle' && toggleShown === 'cond'));

  /**
   * Datos SIN clipping: array completo para todo el horizonte. Lo necesitamos
   * para poder hacer zoom sin tener que regenerar. El slicing se hace después.
   */
  const fullData = useMemo<Point[]>(() => {
    if (!bandsA || !bandsB || !simA) return [];
    const n = bandsA.monthIdx.length;
    const net = simA.netContributions;
    const out: Point[] = new Array(n);
    for (let t = 0; t < n; t++) {
      const point: Point = {
        month: t,
        year: t / 12,
        net: net[t],
        aP10: bandsA.p10[t],
        aP50: bandsA.p50[t],
        aP90: bandsA.p90[t],
        bP10: bandsB.p10[t],
        bP50: bandsB.p50[t],
        bP90: bandsB.p90[t],
        aBand: [bandsA.p10[t], bandsA.p90[t]],
        bBand: [bandsB.p10[t], bandsB.p90[t]],
      };
      if (condBandsA && condBandsB) {
        point.condAP10 = condBandsA.p10[t];
        point.condAP50 = condBandsA.p50[t];
        point.condAP90 = condBandsA.p90[t];
        point.condBP10 = condBandsB.p10[t];
        point.condBP50 = condBandsB.p50[t];
        point.condBP90 = condBandsB.p90[t];
        point.condABand = [condBandsA.p10[t], condBandsA.p90[t]];
        point.condBBand = [condBandsB.p10[t], condBandsB.p90[t]];
      }
      out[t] = point;
    }
    return out;
  }, [bandsA, bandsB, condBandsA, condBandsB, simA]);

  /**
   * Datos clippeados a la ventana activa. Incluye el punto anterior al inicio
   * (V[startMonth − 1]) como ancla visual, y el punto final (V[endMonth]).
   * Recharts auto-escala el eje Y a partir de estos datos, que es el efecto
   * zoom que queremos.
   */
  const data = useMemo<Point[]>(() => {
    if (fullData.length === 0) return [];
    const from = Math.max(0, window.startMonth - 1);
    const to = Math.min(fullData.length, window.endMonth + 1);
    return fullData.slice(from, to);
  }, [fullData, window.startMonth, window.endMonth]);

  const hasData = data.length > 0;

  /**
   * Dominio Y calculado sobre el UNION de bandas base + condicionales (si
   * existen). Así el eje Y permanece estático cuando el usuario alterna entre
   * modo overlay / toggle-base / toggle-cond — cualquier combinación fitea
   * dentro del mismo rango. El Y solo cambia con:
   *   - slider de ventana (data cambia)
   *   - nueva simulación (bands cambian)
   *   - activación/desactivación del view (entra/sale componente cond en el union)
   *
   * Fase C.2c v2 (2026-04-21): ajustado para incluir cond en el union, por
   * request explícito del usuario después de que el eje fijo solo-base
   * clippeaba los percentiles bajos de cond cuando el view concentraba pérdidas.
   */
  const yDomain = useMemo<[number, number]>(() => {
    if (data.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const p of data) {
      if (p.aP10 < min) min = p.aP10;
      if (p.bP10 < min) min = p.bP10;
      if (p.net < min) min = p.net;
      if (p.aP90 > max) max = p.aP90;
      if (p.bP90 > max) max = p.bP90;
      if (p.net > max) max = p.net;
      if (p.condAP10 != null && p.condAP10 < min) min = p.condAP10;
      if (p.condBP10 != null && p.condBP10 < min) min = p.condBP10;
      if (p.condAP90 != null && p.condAP90 > max) max = p.condAP90;
      if (p.condBP90 != null && p.condBP90 > max) max = p.condBP90;
    }
    const range = max - min;
    const pad = range > 0 ? range * 0.05 : Math.abs(max) * 0.05 || 1;
    return [Math.max(0, min - pad), max + pad];
  }, [data]);

  // Formatter de ticks del eje X adaptativo al largo de la ventana.
  // Ventanas cortas muestran meses, ventanas largas muestran años.
  const windowLengthMonths = window.endMonth - window.startMonth + 1;
  const xTickFormatter = useMemo(() => {
    if (windowLengthMonths <= 24) {
      return (v: number) => `m${Math.round(v)}`;
    }
    if (windowLengthMonths <= 72) {
      return (v: number) => {
        const years = v / 12;
        return Number.isInteger(years) ? `${years}a` : `${years.toFixed(1)}a`;
      };
    }
    return (v: number) => `${Math.round(v / 12)}a`;
  }, [windowLengthMonths]);

  // Chips de ventana
  const windowChips: Array<{ label: string; months: number }> = [
    { label: '1a', months: 12 },
    { label: '3a', months: 36 },
    { label: '5a', months: 60 },
    { label: '10a', months: 120 },
    { label: 'Total', months: horizon },
  ];

  return (
    <div className="mp-card p-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-base">Proyección patrimonial</h2>
          <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mt-0.5">
            Bandas P10–P90 con mediana. El chart hace zoom automático a la ventana seleccionada.
          </p>
          <div className="mt-2 flex items-center gap-4 text-xs flex-wrap">
            {showBase && (
              <>
                <LegendDot color={chart.portfolioA} label="Portafolio A" />
                <LegendDot color={chart.portfolioB} label="Portafolio B" />
              </>
            )}
            {showCond && displayMode === 'overlay' && (
              <>
                <LegendLine color={chart.portfolioA} label="A (cond.)" dashed />
                <LegendLine color={chart.portfolioB} label="B (cond.)" dashed />
              </>
            )}
            {showCond && displayMode === 'toggle' && (
              <>
                <LegendDot color={chart.portfolioA} label="Portafolio A (cond.)" />
                <LegendDot color={chart.portfolioB} label="Portafolio B (cond.)" />
              </>
            )}
            <LegendDot color={chart.net} label="Capital aportado neto" />
          </div>
          {hasCond && (
            <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
              <span className="text-mercantil-slate dark:text-mercantil-dark-slate font-semibold uppercase tracking-wider">
                Ver:
              </span>
              <SegmentedControl
                value={displayMode}
                onChange={setDisplayMode}
                options={[
                  { value: 'overlay', label: 'Overlay (ambos)' },
                  { value: 'toggle', label: 'Toggle (uno a la vez)' },
                ]}
              />
              {displayMode === 'toggle' && (
                <>
                  <span className="text-mercantil-slate dark:text-mercantil-dark-slate">·</span>
                  <SegmentedControl
                    value={toggleShown}
                    onChange={setToggleShown}
                    options={[
                      { value: 'base', label: 'Base' },
                      { value: 'cond', label: 'Condicional' },
                    ]}
                  />
                </>
              )}
            </div>
          )}
          <ActiveViewBanner />
        </div>
        <SimulateButton />
      </div>

      {!hasData ? (
        <div className="mt-4 h-[360px] flex items-center justify-center rounded-lg border border-dashed border-mercantil-line dark:border-mercantil-dark-line bg-mercantil-mist dark:bg-mercantil-dark-bg/50 text-sm text-mercantil-slate dark:text-mercantil-dark-slate">
          Presioná <strong className="mx-1">Simular</strong> para ver la proyección.
        </div>
      ) : (
        <>
          <div className="mt-4 h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} />
                <XAxis
                  dataKey="month"
                  type="number"
                  domain={[Math.max(0, window.startMonth - 1), window.endMonth]}
                  allowDataOverflow
                  tickFormatter={xTickFormatter}
                  stroke={chart.axis}
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={formatUsd}
                  stroke={chart.axis}
                  fontSize={11}
                  width={70}
                  domain={yDomain}
                  allowDataOverflow
                />
                <Tooltip
                  content={
                    <FanTooltip
                      chart={chart}
                      showBase={showBase}
                      showCond={showCond}
                    />
                  }
                  cursor={{ stroke: chart.portfolioB, strokeDasharray: '3 3' }}
                />
                <Legend wrapperStyle={{ display: 'none' }} />

                {/* Bandas base (A y B) — siempre bandas sólidas 20% fill + medianas sólidas */}
                {showBase && (
                  <>
                    <Area
                      type="monotone"
                      dataKey="aBand"
                      stroke="none"
                      fill={chart.portfolioA}
                      fillOpacity={0.2}
                      name="A"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="bBand"
                      stroke="none"
                      fill={chart.portfolioB}
                      fillOpacity={0.2}
                      name="B"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="aP50"
                      stroke={chart.portfolioA}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      name="A mediana"
                    />
                    <Line
                      type="monotone"
                      dataKey="bP50"
                      stroke={chart.portfolioB}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      name="B mediana"
                    />
                  </>
                )}

                {/*
                  Bandas condicionales — render según modo:
                  - Overlay: base solid 20% fill (arriba) + cond como 6 dashed
                    lines encima (P10/P50/P90 A y B, sin fill). Estilo v1.
                  - Toggle/cond: solo cond con bandas sólidas 20% fill + medianas
                    sólidas — mismo look que base pero con datos condicionales.
                */}
                {showCond && displayMode === 'overlay' && (
                  <>
                    <Line type="monotone" dataKey="condAP10" stroke={chart.portfolioA} strokeWidth={1.25} strokeDasharray="5 3" dot={false} isAnimationActive={false} name="A P10 cond" />
                    <Line type="monotone" dataKey="condAP50" stroke={chart.portfolioA} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} name="A mediana cond" />
                    <Line type="monotone" dataKey="condAP90" stroke={chart.portfolioA} strokeWidth={1.25} strokeDasharray="5 3" dot={false} isAnimationActive={false} name="A P90 cond" />
                    <Line type="monotone" dataKey="condBP10" stroke={chart.portfolioB} strokeWidth={1.25} strokeDasharray="5 3" dot={false} isAnimationActive={false} name="B P10 cond" />
                    <Line type="monotone" dataKey="condBP50" stroke={chart.portfolioB} strokeWidth={2} strokeDasharray="5 3" dot={false} isAnimationActive={false} name="B mediana cond" />
                    <Line type="monotone" dataKey="condBP90" stroke={chart.portfolioB} strokeWidth={1.25} strokeDasharray="5 3" dot={false} isAnimationActive={false} name="B P90 cond" />
                  </>
                )}
                {showCond && displayMode === 'toggle' && (
                  <>
                    <Area
                      type="monotone"
                      dataKey="condABand"
                      stroke="none"
                      fill={chart.portfolioA}
                      fillOpacity={0.2}
                      name="A cond"
                      isAnimationActive={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="condBBand"
                      stroke="none"
                      fill={chart.portfolioB}
                      fillOpacity={0.2}
                      name="B cond"
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="condAP50"
                      stroke={chart.portfolioA}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      name="A mediana cond"
                    />
                    <Line
                      type="monotone"
                      dataKey="condBP50"
                      stroke={chart.portfolioB}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                      name="B mediana cond"
                    />
                  </>
                )}

                {/* Capital aportado neto (siempre visible) */}
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke={chart.net}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                  name="Neto aportado"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Controles de ventana — RangeSlider dual-thumb + chips */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate">
                Ventana:
              </span>
              {windowChips.map((c) => {
                const active = window.startMonth === 1 && window.endMonth === Math.min(c.months, horizon);
                return (
                  <button
                    key={c.label}
                    onClick={() =>
                      setWindow({ startMonth: 1, endMonth: Math.min(c.months, horizon) })
                    }
                    className={`mp-chip ${active ? 'mp-chip-active' : ''}`}
                  >
                    {c.label}
                  </button>
                );
              })}
              <span className="ml-auto text-xs text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums">
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
              ariaLabelStart="Inicio de la ventana"
              ariaLabelEnd="Fin de la ventana"
            />
          </div>
        </>
      )}
    </div>
  );
}

/** Formatea un mes 1..N como label legible: "m6", "1a 6m", "10a". */
function formatMonthLabel(month: number): string {
  if (month <= 24) return `m${month}`;
  const years = Math.floor(month / 12);
  const rem = month - years * 12;
  if (rem === 0) return `${years}a`;
  return `${years}a ${rem}m`;
}

function LegendDot({ color, label, fade = false }: { color: string; label: string; fade?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" style={{ opacity: fade ? 0.55 : 1 }}>
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      <span className="text-mercantil-slate dark:text-mercantil-dark-slate">{label}</span>
    </span>
  );
}

/**
 * Legend de línea (sólida o dashed). Usado en modo Toggle/Cond para
 * representar las líneas punteadas del condicional sin crear confusión con
 * los dots que representan bandas con fill.
 */
function LegendLine({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
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

/**
 * Segmented control compacto — dos o más opciones, una activa. Usado para
 * seleccionar el modo de visualización del condicional (overlay vs toggle)
 * y dentro de toggle, qué conjunto mostrar (base vs cond).
 */
function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-mercantil-line dark:border-mercantil-dark-line overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2.5 py-1 text-[11px] transition-colors ${
            value === o.value
              ? 'bg-mercantil-navy text-white dark:bg-mercantil-dark-navy-text dark:text-mercantil-dark-bg'
              : 'bg-white text-mercantil-ink hover:bg-mercantil-line/40 dark:bg-mercantil-dark-panel dark:text-mercantil-dark-ink dark:hover:bg-mercantil-dark-line/60'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Banner compacto visible cuando hay un view activo. Muestra el label del
 * preset + la probabilidad empírica. Sirve de recordatorio visual aunque el
 * ViewsPanel esté colapsado, para que el asesor siempre sepa qué filtro está
 * aplicado cuando interpreta las métricas condicionales.
 */
function ActiveViewBanner() {
  const { activeView, probability, nMatched, error } = useViews();
  if (!activeView || error) return null;
  const probStr = probability != null ? `${(probability * 100).toFixed(1)}%` : '—';
  const matchStr = nMatched != null ? `${nMatched.toLocaleString()} paths` : '';
  return (
    <div className="mt-2 inline-flex items-center gap-2 text-[11px] px-2.5 py-1 rounded-full bg-mercantil-orange/10 border border-mercantil-orange/30 text-mercantil-orange-deep dark:bg-mercantil-orange/15 dark:text-mercantil-orange dark:border-mercantil-orange/40">
      <span className="font-semibold uppercase tracking-wider">View activo:</span>
      <span>{activeView.label}</span>
      <span className="text-mercantil-slate dark:text-mercantil-dark-slate">·</span>
      <span>P = <strong className="tabular-nums">{probStr}</strong></span>
      {matchStr && (
        <>
          <span className="text-mercantil-slate dark:text-mercantil-dark-slate">·</span>
          <span className="text-mercantil-slate dark:text-mercantil-dark-slate">{matchStr}</span>
        </>
      )}
    </div>
  );
}

type TooltipPayload = {
  payload?: Point;
};

type TooltipProps = {
  active?: boolean;
  payload?: TooltipPayload[];
  chart?: ChartTheme;
  showBase?: boolean;
  showCond?: boolean;
};

function FanTooltip({ active, payload, chart, showBase = true, showCond = false }: TooltipProps) {
  if (!active || !payload || payload.length === 0 || !chart) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const dataHasCond = p.condAP50 != null;
  const renderCond = showCond && dataHasCond;
  return (
    <div className="rounded-lg border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel px-3 py-2 text-xs shadow-card">
      <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink mb-1.5">
        Mes {p.month} ({p.year.toFixed(1)} años)
      </div>
      {showBase && (
        <>
          <TooltipRow label="A P10" value={formatUsd(p.aP10)} color={chart.portfolioA} />
          <TooltipRow label="A mediana" value={formatUsd(p.aP50)} color={chart.portfolioA} bold />
          <TooltipRow label="A P90" value={formatUsd(p.aP90)} color={chart.portfolioA} />
          {!renderCond && <div className="h-1" />}
        </>
      )}
      {renderCond && (
        <>
          <TooltipRow label="A P10 (cond.)" value={formatUsd(p.condAP10!)} color={chart.portfolioA} />
          <TooltipRow label="A mediana (cond.)" value={formatUsd(p.condAP50!)} color={chart.portfolioA} bold />
          <TooltipRow label="A P90 (cond.)" value={formatUsd(p.condAP90!)} color={chart.portfolioA} />
          <div className="h-1" />
        </>
      )}
      {showBase && (
        <>
          <TooltipRow label="B P10" value={formatUsd(p.bP10)} color={chart.portfolioB} />
          <TooltipRow label="B mediana" value={formatUsd(p.bP50)} color={chart.portfolioB} bold />
          <TooltipRow label="B P90" value={formatUsd(p.bP90)} color={chart.portfolioB} />
        </>
      )}
      {renderCond && (
        <>
          <TooltipRow label="B P10 (cond.)" value={formatUsd(p.condBP10!)} color={chart.portfolioB} />
          <TooltipRow label="B mediana (cond.)" value={formatUsd(p.condBP50!)} color={chart.portfolioB} bold />
          <TooltipRow label="B P90 (cond.)" value={formatUsd(p.condBP90!)} color={chart.portfolioB} />
        </>
      )}
      <div className="h-1" />
      <TooltipRow label="Neto aportado" value={formatUsd(p.net)} color={chart.net} />
    </div>
  );
}

function TooltipRow({
  label,
  value,
  color,
  bold = false,
  fade = false,
}: {
  label: string;
  value: string;
  color: string;
  bold?: boolean;
  fade?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-6" style={{ opacity: fade ? 0.55 : 1 }}>
      <span className="flex items-center gap-1.5 text-mercantil-slate dark:text-mercantil-dark-slate">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        {label}
      </span>
      <span className={`tabular-nums ${bold ? 'font-semibold text-mercantil-ink dark:text-mercantil-dark-ink' : ''}`}>
        {value}
      </span>
    </div>
  );
}
