import { describe, expect, it } from 'vitest';
import { applyFlows } from './flows';
import {
  VOL_PROFILE_LABELS,
  VOL_THRESHOLDS,
  classifyVolProfile,
  computePortfolioHistoricalVol,
  computeSinglePathMetrics,
} from './profile';
import type { PlanSpec } from './types';

function makeConstantReturns(nPaths: number, H: number, r: number): Float32Array {
  const arr = new Float32Array(nPaths * H);
  arr.fill(r);
  return arr;
}

function plan(overrides: Partial<PlanSpec> = {}): PlanSpec {
  return {
    initialCapital: 10_000,
    horizonMonths: 120,
    mode: 'nominal',
    inflationPct: 0,
    rules: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyVolProfile
// ---------------------------------------------------------------------------

describe('classifyVolProfile', () => {
  it('clasifica valores debajo del corte baja como baja', () => {
    expect(classifyVolProfile(0.0)).toBe('baja');
    expect(classifyVolProfile(0.03)).toBe('baja');
    expect(classifyVolProfile(0.0599)).toBe('baja');
  });

  it('clasifica valores entre baja y media como media (inclusivo en baja)', () => {
    expect(classifyVolProfile(VOL_THRESHOLDS.baja)).toBe('media');
    expect(classifyVolProfile(0.08)).toBe('media');
    expect(classifyVolProfile(0.1199)).toBe('media');
  });

  it('clasifica valores ≥ media como alta', () => {
    expect(classifyVolProfile(VOL_THRESHOLDS.media)).toBe('alta');
    expect(classifyVolProfile(0.15)).toBe('alta');
    expect(classifyVolProfile(0.25)).toBe('alta');
  });

  it('NaN → alta (safe fallback)', () => {
    expect(classifyVolProfile(NaN)).toBe('alta');
  });

  it('los 3 labels están definidos', () => {
    expect(VOL_PROFILE_LABELS.baja).toContain('Baja');
    expect(VOL_PROFILE_LABELS.media).toContain('Media');
    expect(VOL_PROFILE_LABELS.alta).toContain('Alta');
  });
});

// ---------------------------------------------------------------------------
// computePortfolioHistoricalVol
// ---------------------------------------------------------------------------

describe('computePortfolioHistoricalVol', () => {
  it('100% SPY: vol anualizada en rango histórico esperado (10-25%)', () => {
    const vol = computePortfolioHistoricalVol({ kind: 'amc', id: 'USA.Eq' });
    expect(vol).toBeGreaterThan(0.1);
    expect(vol).toBeLessThan(0.25);
  });

  it('Portafolio vacío → NaN (no divide por cero)', () => {
    const vol = computePortfolioHistoricalVol({
      kind: 'custom',
      label: 'empty',
      weights: {},
    });
    expect(Number.isNaN(vol)).toBe(true);
  });

  it('Conservador < Balanceado < Crecimiento (ordering por riesgo)', () => {
    const volCons = computePortfolioHistoricalVol({ kind: 'signature', id: 'Conservador' });
    const volBal = computePortfolioHistoricalVol({ kind: 'signature', id: 'Balanceado' });
    const volCrec = computePortfolioHistoricalVol({ kind: 'signature', id: 'Crecimiento' });
    expect(volCons).toBeLessThan(volBal);
    expect(volBal).toBeLessThan(volCrec);
  });

  it('Conservador debería caer en Baja o Media (con 55% GlFI y 37% RF.Lat el FIXED diluye mucho)', () => {
    const vol = computePortfolioHistoricalVol({ kind: 'signature', id: 'Conservador' });
    const profile = classifyVolProfile(vol);
    expect(['baja', 'media']).toContain(profile);
  });

  it('Crecimiento debería caer en Media o Alta', () => {
    const vol = computePortfolioHistoricalVol({ kind: 'signature', id: 'Crecimiento' });
    const profile = classifyVolProfile(vol);
    expect(['media', 'alta']).toContain(profile);
  });
});

// ---------------------------------------------------------------------------
// computeSinglePathMetrics
// ---------------------------------------------------------------------------

describe('computeSinglePathMetrics', () => {
  it('retornos constantes positivos: 0% neg meses, MDD=0, TWR exacto', () => {
    const H = 24;
    const r = 0.01;
    const returns = makeConstantReturns(1, H, r);
    const sim = applyFlows({
      plan: plan({ horizonMonths: H }),
      portfolioReturns: returns,
      nPaths: 1,
    });
    const stats = computeSinglePathMetrics(sim.values, returns, 0, H, 1, H);
    expect(stats.pctNegMonths).toBe(0);
    expect(stats.maxDrawdown).toBe(0);
    expect(stats.twrAnnualized).toBeCloseTo(Math.pow(1.01, 12) - 1, 8);
  });

  it('retornos alternando +1% / -1%: 50% meses negativos', () => {
    const H = 12;
    const returns = new Float32Array(H);
    for (let i = 0; i < H; i++) returns[i] = i % 2 === 0 ? 0.01 : -0.01;
    const sim = applyFlows({
      plan: plan({ horizonMonths: H }),
      portfolioReturns: returns,
      nPaths: 1,
    });
    const stats = computeSinglePathMetrics(sim.values, returns, 0, H, 1, H);
    expect(stats.pctNegMonths).toBeCloseTo(0.5, 5);
  });

  it('drawdown conocido: +10%, -20%, 0% → MDD = -20%', () => {
    const H = 3;
    const returns = new Float32Array([0.1, -0.2, 0.0]);
    const sim = applyFlows({
      plan: plan({ horizonMonths: H, initialCapital: 100 }),
      portfolioReturns: returns,
      nPaths: 1,
    });
    const stats = computeSinglePathMetrics(sim.values, returns, 0, H, 1, H);
    expect(stats.maxDrawdown).toBeCloseTo(-0.2, 5);
  });

  it('ventana parcial: aplica métricas solo dentro del rango', () => {
    const H = 12;
    // Meses 1..6: +1%, meses 7..12: -1%
    const returns = new Float32Array(H);
    for (let i = 0; i < H; i++) returns[i] = i < 6 ? 0.01 : -0.01;
    const sim = applyFlows({
      plan: plan({ horizonMonths: H }),
      portfolioReturns: returns,
      nPaths: 1,
    });

    // Ventana 1..6: 0% negativos
    const statsStart = computeSinglePathMetrics(sim.values, returns, 0, H, 1, 6);
    expect(statsStart.pctNegMonths).toBe(0);

    // Ventana 7..12: 100% negativos
    const statsEnd = computeSinglePathMetrics(sim.values, returns, 0, H, 7, 12);
    expect(statsEnd.pctNegMonths).toBe(1);
  });

  it('saldo final corresponde a values[endMonth]', () => {
    const H = 6;
    const K = 1000;
    const r = 0.02;
    const returns = makeConstantReturns(1, H, r);
    const sim = applyFlows({
      plan: plan({ horizonMonths: H, initialCapital: K }),
      portfolioReturns: returns,
      nPaths: 1,
    });
    const stats = computeSinglePathMetrics(sim.values, returns, 0, H, 1, H);
    expect(stats.finalValue).toBeCloseTo(K * Math.pow(1 + r, H), 1);
  });

  it('throws si la ventana es inválida', () => {
    const H = 12;
    const returns = makeConstantReturns(1, H, 0);
    const sim = applyFlows({
      plan: plan({ horizonMonths: H }),
      portfolioReturns: returns,
      nPaths: 1,
    });
    expect(() =>
      computeSinglePathMetrics(sim.values, returns, 0, H, 5, 3),
    ).toThrow(/ventana inválida/);
    expect(() =>
      computeSinglePathMetrics(sim.values, returns, 0, H, 1, 99),
    ).toThrow(/ventana inválida/);
  });
});
