import { Svg, Polygon, Polyline, Line, Text as SvgText, G } from '@react-pdf/renderer';

import type { FanChartBands } from '../../domain/metrics';
import { colors } from '../theme/colors';
import { fonts, fontSize } from '../theme/typography';

const CHART_WIDTH = 482;
const CHART_HEIGHT = 220;
const PAD_LEFT = 52;
const PAD_RIGHT = 12;
const PAD_TOP = 10;
const PAD_BOTTOM = 26;

const innerW = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

const tickLabelStyle = {
  fontFamily: fonts.sans,
  fontSize: fontSize.micro,
} as const;

type Props = {
  bands: FanChartBands;
  netContributions: Float32Array;
  horizonMonths: number;
};

/**
 * Fan chart del Portafolio A para sección E del PDF, dibujado con primitivas
 * SVG nativas de @react-pdf/renderer (NO Recharts — Recharts es DOM only).
 *
 * Bandas (de fuera hacia dentro): P5-P95 → P10-P90 → P25-P75. Mediana sólida,
 * capital aportado neto dashed gris para anclar visualmente el cruce con $0
 * en escenarios de longevidad agresiva.
 */
export function SvgFanChart({ bands, netContributions, horizonMonths }: Props) {
  let yMax = 0;
  for (let t = 0; t <= horizonMonths; t++) {
    if (bands.p95[t] > yMax) yMax = bands.p95[t];
    if (netContributions[t] > yMax) yMax = netContributions[t];
  }
  yMax *= 1.08;
  if (yMax === 0) yMax = 1;

  const xScale = (t: number): number => PAD_LEFT + (t / horizonMonths) * innerW;
  const yScale = (v: number): number => PAD_TOP + innerH * (1 - v / yMax);

  const polyBand = (lo: Float32Array, hi: Float32Array): string => {
    const parts: string[] = [];
    for (let t = 0; t <= horizonMonths; t++) {
      parts.push(`${xScale(t).toFixed(2)},${yScale(hi[t]).toFixed(2)}`);
    }
    for (let t = horizonMonths; t >= 0; t--) {
      parts.push(`${xScale(t).toFixed(2)},${yScale(lo[t]).toFixed(2)}`);
    }
    return parts.join(' ');
  };

  const polyLine = (line: Float32Array): string => {
    const parts: string[] = [];
    for (let t = 0; t <= horizonMonths; t++) {
      parts.push(`${xScale(t).toFixed(2)},${yScale(line[t]).toFixed(2)}`);
    }
    return parts.join(' ');
  };

  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) yTicks.push((yMax * i) / 4);

  const yearsTotal = horizonMonths / 12;
  const tickEveryYears = yearsTotal <= 8 ? 1 : yearsTotal <= 16 ? 2 : yearsTotal <= 24 ? 5 : 10;
  const xTicks: number[] = [];
  for (let y = 0; y <= yearsTotal; y += tickEveryYears) xTicks.push(Math.round(y * 12));
  if (xTicks[xTicks.length - 1] !== horizonMonths) xTicks.push(horizonMonths);

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      <Polygon points={polyBand(bands.p5, bands.p95)} fill={colors.accent} fillOpacity={0.12} />
      <Polygon points={polyBand(bands.p10, bands.p90)} fill={colors.accent} fillOpacity={0.18} />
      <Polygon points={polyBand(bands.p25, bands.p75)} fill={colors.accent} fillOpacity={0.28} />

      <Polyline
        points={polyLine(bands.p50)}
        stroke={colors.accent}
        strokeWidth={1.4}
        fill="none"
      />

      <Polyline
        points={polyLine(netContributions)}
        stroke={colors.muted}
        strokeWidth={0.9}
        strokeDasharray="3 3"
        fill="none"
      />

      <Line
        x1={PAD_LEFT}
        y1={PAD_TOP}
        x2={PAD_LEFT}
        y2={CHART_HEIGHT - PAD_BOTTOM}
        stroke={colors.hairline}
        strokeWidth={0.5}
      />
      <Line
        x1={PAD_LEFT}
        y1={CHART_HEIGHT - PAD_BOTTOM}
        x2={CHART_WIDTH - PAD_RIGHT}
        y2={CHART_HEIGHT - PAD_BOTTOM}
        stroke={colors.hairline}
        strokeWidth={0.5}
      />

      {yTicks.map((v, i) => (
        <G key={`y${i}`}>
          <Line
            x1={PAD_LEFT - 3}
            y1={yScale(v)}
            x2={PAD_LEFT}
            y2={yScale(v)}
            stroke={colors.hairline}
            strokeWidth={0.5}
          />
          <SvgText
            x={PAD_LEFT - 5}
            y={yScale(v) + 2.5}
            textAnchor="end"
            fill={colors.muted}
            style={tickLabelStyle}
          >
            {formatCompactUsd(v)}
          </SvgText>
        </G>
      ))}

      {xTicks.map((m, i) => (
        <G key={`x${i}`}>
          <Line
            x1={xScale(m)}
            y1={CHART_HEIGHT - PAD_BOTTOM}
            x2={xScale(m)}
            y2={CHART_HEIGHT - PAD_BOTTOM + 3}
            stroke={colors.hairline}
            strokeWidth={0.5}
          />
          <SvgText
            x={xScale(m)}
            y={CHART_HEIGHT - PAD_BOTTOM + 12}
            textAnchor="middle"
            fill={colors.muted}
            style={tickLabelStyle}
          >
            {`${Math.round(m / 12)}a`}
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}

function formatCompactUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}
