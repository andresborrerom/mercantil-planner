import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TAIL_ANCHORS_MONTHS,
  buildProjectionsData,
  deflateSeries,
  deflateValues,
  selectAnchors,
} from './buildProjectionsData';
import type { PdfSimulationData } from './types';

describe('selectAnchors', () => {
  it('default 30 años incluye los 4 anchors estándar', () => {
    expect(selectAnchors(360)).toEqual([60, 120, 240, 360]);
  });

  it('20 años deja [60, 120, 240] (240 ya es el horizonte, no se duplica)', () => {
    expect(selectAnchors(240)).toEqual([60, 120, 240]);
  });

  it('horizonte intermedio agrega el final del plan como último anchor', () => {
    expect(selectAnchors(300)).toEqual([60, 120, 240, 300]);
  });

  it('horizonte corto retiene solo el cierre del plan si nada del default cabe', () => {
    expect(selectAnchors(48)).toEqual([48]);
  });

  it('horizonte corto que cruza un default retiene el default + el cierre del plan', () => {
    expect(selectAnchors(72)).toEqual([60, 72]);
  });

  it('lanza si horizonMonths < 1', () => {
    expect(() => selectAnchors(0)).toThrow();
    expect(() => selectAnchors(-1)).toThrow();
  });

  it('respeta defaults custom', () => {
    expect(selectAnchors(120, [12, 60])).toEqual([12, 60, 120]);
  });

  it('DEFAULT_TAIL_ANCHORS_MONTHS son 5/10/20/30 años', () => {
    expect(DEFAULT_TAIL_ANCHORS_MONTHS).toEqual([60, 120, 240, 360]);
  });
});

describe('deflateValues', () => {
  it('inflación 0 es identidad', () => {
    const v = new Float32Array([100, 200, 300, 400]);
    const out = deflateValues(v, 1, 3, 0);
    expect(Array.from(out)).toEqual([100, 200, 300, 400]);
  });

  it('inflación 2.5% mes 12 deflacta por factor 1.025', () => {
    const H = 12;
    const v = new Float32Array(H + 1);
    for (let t = 0; t <= H; t++) v[t] = 1000;
    const out = deflateValues(v, 1, H, 2.5);
    // Mes 0: factor 1, valor 1000.
    expect(out[0]).toBeCloseTo(1000, 4);
    // Mes 12: factor 1.025, valor 1000/1.025.
    expect(out[12]).toBeCloseTo(1000 / 1.025, 4);
  });

  it('respeta layout row-major con nPaths > 1', () => {
    const H = 6;
    const nPaths = 3;
    const v = new Float32Array(nPaths * (H + 1));
    // path p, mes t → valor 1000 + 10*p + t (test simple).
    for (let p = 0; p < nPaths; p++) {
      for (let t = 0; t <= H; t++) v[p * (H + 1) + t] = 1000 + 10 * p + t;
    }
    const out = deflateValues(v, nPaths, H, 12);
    // Para path 1, mes 6: factor (1.12)^(6/12) = sqrt(1.12).
    const factorMid = Math.pow(1.12, 6 / 12);
    expect(out[1 * (H + 1) + 6]).toBeCloseTo((1000 + 10 + 6) / factorMid, 4);
  });
});

describe('deflateSeries', () => {
  it('inflación 0 es identidad', () => {
    const s = new Float32Array([1, 2, 3]);
    expect(Array.from(deflateSeries(s, 2, 0))).toEqual([1, 2, 3]);
  });

  it('aplica el mismo factor temporal que deflateValues', () => {
    const H = 24;
    const s = new Float32Array(H + 1);
    for (let t = 0; t <= H; t++) s[t] = 1000;
    const out = deflateSeries(s, H, 3);
    // Mes 24: factor (1.03)^2.
    expect(out[24]).toBeCloseTo(1000 / Math.pow(1.03, 2), 3);
  });
});

describe('buildProjectionsData', () => {
  function makeSim(overrides: Partial<PdfSimulationData> = {}): PdfSimulationData {
    const nPaths = 100;
    const horizonMonths = 240;
    const nCols = horizonMonths + 1;
    const valuesA = new Float32Array(nPaths * nCols);
    // Trayectoria sintética: cada path crece linealmente, dispersión cross-sectional.
    // path p, mes t → 250000 + 1000*t + (p - 50) * 200 * (t/12)
    for (let p = 0; p < nPaths; p++) {
      for (let t = 0; t < nCols; t++) {
        valuesA[p * nCols + t] = 250000 + 1000 * t + (p - 50) * 200 * (t / 12);
      }
    }
    const netContributionsA = new Float32Array(nCols);
    for (let t = 0; t < nCols; t++) netContributionsA[t] = 250000 + 500 * t;

    return {
      valuesA,
      netContributionsA,
      nPaths,
      horizonMonths,
      mode: 'nominal',
      inflationPct: 2.5,
      ...overrides,
    };
  }

  it('produce bandas con los 7 percentiles definidos en cada mes del horizonte', () => {
    const data = buildProjectionsData(makeSim());
    expect(data.bands.p5.length).toBe(241);
    expect(data.bands.p50.length).toBe(241);
    expect(data.bands.p95.length).toBe(241);
    // Monotonía cross-sectional: p5 ≤ p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 ≤ p95.
    for (let t = 0; t < 241; t += 30) {
      expect(data.bands.p5[t]).toBeLessThanOrEqual(data.bands.p10[t]);
      expect(data.bands.p10[t]).toBeLessThanOrEqual(data.bands.p25[t]);
      expect(data.bands.p25[t]).toBeLessThanOrEqual(data.bands.p50[t]);
      expect(data.bands.p50[t]).toBeLessThanOrEqual(data.bands.p75[t]);
      expect(data.bands.p75[t]).toBeLessThanOrEqual(data.bands.p90[t]);
      expect(data.bands.p90[t]).toBeLessThanOrEqual(data.bands.p95[t]);
    }
  });

  it('tailRisk a 240m incluye anchors 60/120/240 (último = horizonte)', () => {
    const data = buildProjectionsData(makeSim());
    expect(data.tailRisk.map((t) => t.monthIdx)).toEqual([60, 120, 240]);
    // CVaR_5 ≤ P5 ≤ P95 ≤ CVaR_95 (invariante de cola).
    for (const tr of data.tailRisk) {
      expect(tr.cvar5).toBeLessThanOrEqual(tr.p5);
      expect(tr.p5).toBeLessThanOrEqual(tr.p95);
      expect(tr.p95).toBeLessThanOrEqual(tr.cvar95);
    }
  });

  it('tailRisk a 360m incluye los 4 anchors estándar', () => {
    const sim = makeSim({
      horizonMonths: 360,
      valuesA: new Float32Array(100 * 361).fill(500_000),
      netContributionsA: new Float32Array(361).fill(250_000),
    });
    const data = buildProjectionsData(sim);
    expect(data.tailRisk.map((t) => t.monthIdx)).toEqual([60, 120, 240, 360]);
  });

  it('tailRisk a 84m (7 años) deja anchor 60 + horizonte 84', () => {
    const sim = makeSim({
      horizonMonths: 84,
      valuesA: new Float32Array(100 * 85).fill(300_000),
      netContributionsA: new Float32Array(85).fill(250_000),
    });
    const data = buildProjectionsData(sim);
    expect(data.tailRisk.map((t) => t.monthIdx)).toEqual([60, 84]);
  });

  it('narrative usa el último anchor (cierre del plan)', () => {
    const data = buildProjectionsData(makeSim());
    expect(data.narrative.monthIdx).toBe(240);
    expect(data.narrative.years).toBe(20);
    expect(data.narrative.p50).toBeCloseTo(data.bands.p50[240], 4);
    // cvar5 ≤ p50 esperado en distribución dispersa → delta negativo.
    expect(data.narrative.cvar5DeltaVsMedian).toBeLessThan(0);
  });

  it('mode=real deflacta values y contributions consistentemente', () => {
    const sim = makeSim({ mode: 'real', inflationPct: 3 });
    const dataReal = buildProjectionsData(sim);
    const dataNominal = buildProjectionsData(makeSim());
    // El último mes en real debe ser menor que en nominal (deflactado).
    const factor = Math.pow(1.03, 240 / 12);
    expect(dataReal.bands.p50[240]).toBeCloseTo(dataNominal.bands.p50[240] / factor, 0);
    expect(dataReal.netContributions[240]).toBeCloseTo(
      dataNominal.netContributions[240] / factor,
      0,
    );
  });

  it('lanza si valuesA tiene shape inconsistente', () => {
    expect(() =>
      buildProjectionsData({
        valuesA: new Float32Array(10),
        netContributionsA: new Float32Array(241),
        nPaths: 100,
        horizonMonths: 240,
        mode: 'nominal',
        inflationPct: 0,
      }),
    ).toThrow(/valuesA.length/);
  });

  it('lanza si netContributionsA tiene length distinto de H+1', () => {
    expect(() =>
      buildProjectionsData({
        valuesA: new Float32Array(100 * 241),
        netContributionsA: new Float32Array(100),
        nPaths: 100,
        horizonMonths: 240,
        mode: 'nominal',
        inflationPct: 0,
      }),
    ).toThrow(/netContributionsA.length/);
  });
});
