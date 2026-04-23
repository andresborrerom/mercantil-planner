import { describe, expect, it } from 'vitest';
import { applyFlows } from './flows';
import { computeFanChartBands, computeMetrics } from './metrics';
import { band, mean, median, percentile, stdSample } from './stats';
import type { FlowRule, PlanSpec } from './types';

// ---------------------------------------------------------------------------
// Helpers de construcción
// ---------------------------------------------------------------------------

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

function rule(overrides: Partial<FlowRule> = {}): FlowRule {
  return {
    id: 'r1',
    label: 'rule',
    sign: 'deposit',
    amount: 100,
    frequency: 'monthly',
    startMonth: 1,
    endMonth: null,
    growthPct: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// stats.ts
// ---------------------------------------------------------------------------

describe('stats: mean / median / percentile / stdSample / band', () => {
  it('mean ignora NaN', () => {
    expect(mean([1, 2, NaN, 3])).toBeCloseTo(2, 10);
  });

  it('median con número par de elementos', () => {
    expect(median([1, 2, 3, 4])).toBeCloseTo(2.5, 10);
  });

  it('percentile 0 y 1 dan min y max', () => {
    expect(percentile([1, 5, 10], 0)).toBe(1);
    expect(percentile([1, 5, 10], 1)).toBe(10);
  });

  it('percentile con interpolación lineal', () => {
    // 5 elementos: [0, 25, 50, 75, 100]. P10 = 0 + 0.1*4 = idx 0.4 → 0*0.6 + 25*0.4 = 10
    expect(percentile([0, 25, 50, 75, 100], 0.1)).toBeCloseTo(10, 10);
    expect(percentile([0, 25, 50, 75, 100], 0.9)).toBeCloseTo(90, 10);
  });

  it('stdSample matchea fórmula con Bessel', () => {
    // [1,2,3,4,5]: mean=3, ss=10, var=10/4=2.5, std=√2.5
    expect(stdSample([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2.5), 10);
  });

  it('band retorna p10/p50/p90 coherentes con llamadas separadas', () => {
    const vals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const b = band(vals);
    expect(b.p10).toBeCloseTo(percentile(vals, 0.1), 10);
    expect(b.p50).toBeCloseTo(percentile(vals, 0.5), 10);
    expect(b.p90).toBeCloseTo(percentile(vals, 0.9), 10);
  });

  it('band con input vacío retorna NaN×3', () => {
    const b = band([]);
    expect(Number.isNaN(b.p10)).toBe(true);
    expect(Number.isNaN(b.p50)).toBe(true);
    expect(Number.isNaN(b.p90)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Métrica 1: TWR anualizado
// ---------------------------------------------------------------------------

describe('computeMetrics — TWR anualizado', () => {
  it('retornos constantes 1%/mo sobre 120 meses → TWR = (1.01)^12 − 1 en todos los paths', () => {
    const H = 120;
    const r = 0.01;
    const returns = makeConstantReturns(50, H, r);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 50 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 50,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    const expected = Math.pow(1.01, 12) - 1;
    expect(m.twrAnnualized.p10).toBeCloseTo(expected, 8);
    expect(m.twrAnnualized.p50).toBeCloseTo(expected, 8);
    expect(m.twrAnnualized.p90).toBeCloseTo(expected, 8);
  });

  it('retornos 0 → TWR = 0', () => {
    const H = 60;
    const returns = makeConstantReturns(10, H, 0);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 10 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 10,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.twrAnnualized.p50).toBeCloseTo(0, 10);
  });
});

// ---------------------------------------------------------------------------
// Métrica 2: XIRR
// ---------------------------------------------------------------------------

describe('computeMetrics — XIRR (money-weighted)', () => {
  it('sin flujos con retornos constantes: XIRR = TWR', () => {
    const H = 60;
    const r = 0.005;
    const returns = makeConstantReturns(10, H, r);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 10 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 10,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    const expected = Math.pow(1.005, 12) - 1;
    expect(m.xirrAnnualized.p50).toBeCloseTo(expected, 6);
    expect(m.twrAnnualized.p50).toBeCloseTo(expected, 8);
    expect(m.nValidXirr).toBe(10);
  });

  it('aporte único al inicio, sin flujos intermedios → XIRR matchea CAGR', () => {
    // V[0]=1000, aporte 500 al mes 1, retorno 1%/mo, 12 meses
    const H = 12;
    const r = 0.01;
    const returns = makeConstantReturns(1, H, r);
    const p = plan({
      initialCapital: 1000,
      horizonMonths: H,
      rules: [rule({ amount: 500, startMonth: 1, endMonth: 1 })],
    });
    const sim = applyFlows({ plan: p, portfolioReturns: returns, nPaths: 1 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 1,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });

    // Verificación manual:
    // cf[0] = -1000, cf[1] = -500, cf[12] = V[12]
    // V[1] = 1000*1.01 + 500 = 1510
    // V[12] = 1510 * 1.01^11 ≈ 1684.3
    // XIRR resuelve: -1000 + -500/(1+r)^(1/12) + 1684.3/(1+r) = 0
    // Para retornos constantes del 1% mensual, la XIRR debe ser ≈ (1.01)^12 - 1 ≈ 12.68%
    expect(m.xirrAnnualized.p50).toBeCloseTo(Math.pow(1.01, 12) - 1, 4);
  });

  it('caso clásico de anualidad: CAGR ≈ XIRR cuando retornos son constantes', () => {
    // K=0, PMT=100/mes por 60 meses, r=0.5%/mo
    const H = 60;
    const r = 0.005;
    const returns = makeConstantReturns(1, H, r);
    const p = plan({
      initialCapital: 0,
      horizonMonths: H,
      rules: [rule({ amount: 100, sign: 'deposit', frequency: 'monthly' })],
    });
    const sim = applyFlows({ plan: p, portfolioReturns: returns, nPaths: 1 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 1,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    // La XIRR de una anualidad con retornos constantes r/mo debe ser (1+r)^12 - 1
    expect(m.xirrAnnualized.p50).toBeCloseTo(Math.pow(1.005, 12) - 1, 5);
  });
});

// ---------------------------------------------------------------------------
// Métrica 3: Max Drawdown (manager-level, sobre retornos puros)
// ---------------------------------------------------------------------------

describe('computeMetrics — Max Drawdown manager-level', () => {
  it('retornos monotónicamente positivos → MDD = 0', () => {
    const H = 60;
    const returns = makeConstantReturns(10, H, 0.01);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 10 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 10,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.maxDrawdown.p50).toBe(0);
  });

  it('un path con caída conocida produce MDD conocida', () => {
    // Retornos: [+10%, −20%, +0%] → curva de equidad manager-level:
    //   E[0] = 1
    //   E[1] = 1.10      (peak = 1.10)
    //   E[2] = 1.10 · 0.80 = 0.88   (dd = 0.88/1.10 − 1 = −0.20)
    //   E[3] = 0.88 · 1.00 = 0.88   (dd sigue −0.20)
    // MDD = -0.20
    const H = 3;
    const returns = new Float32Array([0.1, -0.2, 0.0]);
    const sim = applyFlows({ plan: plan({ horizonMonths: H, initialCapital: 100 }), portfolioReturns: returns, nPaths: 1 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 1,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.maxDrawdown.p50).toBeCloseTo(-0.2, 5);
  });

  it('Bug 2 regression: retiros que ruinan el path NO arrastran el MDD a −100%', () => {
    // Retornos del portafolio: mes 1 = −5%, luego todos positivos.
    // r_port = [-0.05, +0.03, +0.02, +0.02, +0.02, +0.02, ... ] x 12
    // E[1] = 0.95 (peak fue 1.00, dd = −0.05)
    // E[2+] sube, pero peak inicial 1.00 queda atrás de la curva (re-alcanzado
    // después de unos cuantos meses de +2/3%, irrelevante). MDD manager ≈ -5%.
    //
    // SIN EMBARGO, flujos de retiros agresivos vacían `values` al mes 6.
    // Bajo la definición VIEJA (pre-flow), ese path hubiera dado MDD ≈ -100%.
    // Bajo la nueva definición manager-level, MDD ≈ -5% — flujos irrelevantes.
    const H = 12;
    const returns = new Float32Array(H);
    returns[0] = -0.05;
    for (let i = 1; i < H; i++) returns[i] = i === 1 ? 0.03 : 0.02;

    const p = plan({
      initialCapital: 1000,
      horizonMonths: H,
      rules: [rule({ amount: 200, sign: 'withdraw', frequency: 'monthly' })],
    });
    const sim = applyFlows({ plan: p, portfolioReturns: returns, nPaths: 1 });
    // Sanity: el path se ruinó (para que el test tenga sentido).
    expect(sim.ruined[0]).toBe(1);

    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 1,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    // MDD driven by month-1 −5% only. NO −100%.
    expect(m.maxDrawdown.p50).toBeCloseTo(-0.05, 5);
    // Guardrail explícito: nunca cerca de -100%.
    expect(m.maxDrawdown.p50).toBeGreaterThan(-0.5);
  });

  it('MDD manager-level NO depende de aportes/retiros — dos planes con mismos retornos dan el mismo MDD', () => {
    const H = 6;
    const returns = new Float32Array([0.1, -0.2, 0.05, -0.1, 0.0, 0.05]);

    // Plan A: sin flujos.
    const simA = applyFlows({
      plan: plan({ initialCapital: 100, horizonMonths: H }),
      portfolioReturns: returns,
      nPaths: 1,
    });
    // Plan B: aportes agresivos que cambian `values` drásticamente.
    const simB = applyFlows({
      plan: plan({
        initialCapital: 100,
        horizonMonths: H,
        rules: [rule({ amount: 1000, sign: 'deposit', frequency: 'monthly' })],
      }),
      portfolioReturns: returns,
      nPaths: 1,
    });

    const mA = computeMetrics({
      simulation: simA,
      portfolioReturns: returns,
      nPaths: 1,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    const mB = computeMetrics({
      simulation: simB,
      portfolioReturns: returns,
      nPaths: 1,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });

    // Mismos retornos del portafolio → mismo MDD manager-level, pese a flujos distintos.
    expect(mA.maxDrawdown.p50).toBeCloseTo(mB.maxDrawdown.p50, 8);
  });
});

// ---------------------------------------------------------------------------
// Métrica 4: Meses negativos por año
// ---------------------------------------------------------------------------

describe('computeMetrics — Meses negativos por año', () => {
  it('retornos siempre positivos → 0 por año', () => {
    const returns = makeConstantReturns(5, 24, 0.01);
    const sim = applyFlows({ plan: plan({ horizonMonths: 24 }), portfolioReturns: returns, nPaths: 5 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 5,
      horizonMonths: 24,
      window: { startMonth: 1, endMonth: 24 },
    });
    expect(m.negMonthsPerYear.p50).toBe(0);
  });

  it('retornos alternando +/− → 6 por año (mitad negativos)', () => {
    const H = 24;
    const returns = new Float32Array(H);
    for (let i = 0; i < H; i++) returns[i] = i % 2 === 0 ? 0.01 : -0.01;
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 1 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 1,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.negMonthsPerYear.p50).toBeCloseTo(6, 5);
  });
});

// ---------------------------------------------------------------------------
// Métrica 5: Volatilidad anualizada
// ---------------------------------------------------------------------------

describe('computeMetrics — Volatilidad anualizada', () => {
  it('retornos constantes → vol = 0', () => {
    const H = 24;
    const returns = makeConstantReturns(5, H, 0.01);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 5 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 5,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.volatilityAnnualized.p50).toBeCloseTo(0, 10);
  });

  it('retornos con std mensual conocida → vol anual = std_mo * sqrt(12)', () => {
    // Serie [0.02, 0.00, 0.02, 0.00, 0.02, 0.00, ... x 24]
    // mean = 0.01, var (Bessel) ≈ 0.0001043..., std ≈ 0.01021, vol_ann ≈ 0.01021 * sqrt(12)
    const H = 24;
    const returns = new Float32Array(H);
    for (let i = 0; i < H; i++) returns[i] = i % 2 === 0 ? 0.02 : 0.0;
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 1 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 1,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });

    // std manual con Bessel sobre los 24 valores
    const expectedStd = stdSample(Array.from(returns));
    const expectedVolAnn = expectedStd * Math.sqrt(12);
    expect(m.volatilityAnnualized.p50).toBeCloseTo(expectedVolAnn, 6);
  });
});

// ---------------------------------------------------------------------------
// Métrica 6: Peor rolling 12m
// ---------------------------------------------------------------------------

describe('computeMetrics — Peor rolling 12m', () => {
  it('ventana < 12 meses → null', () => {
    const H = 10;
    const returns = makeConstantReturns(5, H, 0.01);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 5 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 5,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.worstRolling12m).toBeNull();
  });

  it('retornos constantes 1%/mo → worstRolling12m = (1.01)^12 − 1 ≈ 0.1268', () => {
    const H = 24;
    const returns = makeConstantReturns(5, H, 0.01);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 5 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 5,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.worstRolling12m).not.toBeNull();
    expect(m.worstRolling12m!.p50).toBeCloseTo(Math.pow(1.01, 12) - 1, 6);
  });
});

// ---------------------------------------------------------------------------
// Métrica 7: Probabilidad de ruina
// ---------------------------------------------------------------------------

describe('computeMetrics — Probabilidad de ruina', () => {
  it('sin retiros → ruinProbability = 0', () => {
    const H = 24;
    const returns = makeConstantReturns(10, H, 0);
    const sim = applyFlows({ plan: plan({ horizonMonths: H, initialCapital: 1000 }), portfolioReturns: returns, nPaths: 10 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 10,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.ruinProbability).toBe(0);
  });

  it('retiros agresivos → ruinProbability = 1', () => {
    const H = 12;
    const returns = makeConstantReturns(10, H, 0);
    const p = plan({
      initialCapital: 1000,
      horizonMonths: H,
      rules: [rule({ amount: 300, sign: 'withdraw', frequency: 'monthly' })],
    });
    const sim = applyFlows({ plan: p, portfolioReturns: returns, nPaths: 10 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 10,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.ruinProbability).toBe(1);
  });

  it('ruina NO depende de la ventana (siempre se evalúa sobre horizonte total)', () => {
    const H = 12;
    const returns = makeConstantReturns(5, H, 0);
    // Retiros que ruinan en mes 6
    const p = plan({
      initialCapital: 1000,
      horizonMonths: H,
      rules: [rule({ amount: 200, sign: 'withdraw', frequency: 'monthly' })],
    });
    const sim = applyFlows({ plan: p, portfolioReturns: returns, nPaths: 5 });
    const m1 = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 5,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: 3 }, // ventana antes de la ruina
    });
    const m2 = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 5,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H }, // ventana que incluye la ruina
    });
    expect(m1.ruinProbability).toBe(m2.ruinProbability);
    expect(m1.ruinProbability).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Métrica 8: Shortfall probability
// ---------------------------------------------------------------------------

describe('computeMetrics — Shortfall probability', () => {
  it('retornos positivos constantes sin flujos → shortfall = 0', () => {
    const H = 24;
    const returns = makeConstantReturns(10, H, 0.01);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 10 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 10,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.shortfallProbability).toBe(0);
  });

  it('retornos 0 y aportes → V = netContributions exacto, shortfall = 0', () => {
    // V[t] = K + Σ flow. netContributions[t] = K + Σ flow. Los dos son iguales,
    // NO es shortfall (strict less than).
    const H = 12;
    const returns = makeConstantReturns(5, H, 0);
    const p = plan({
      initialCapital: 1000,
      horizonMonths: H,
      rules: [rule({ amount: 100, sign: 'deposit', frequency: 'monthly' })],
    });
    const sim = applyFlows({ plan: p, portfolioReturns: returns, nPaths: 5 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 5,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.shortfallProbability).toBe(0);
  });

  it('retornos negativos con aportes → shortfall = 1', () => {
    const H = 12;
    const returns = makeConstantReturns(5, H, -0.01);
    const p = plan({
      initialCapital: 1000,
      horizonMonths: H,
      rules: [rule({ amount: 100, sign: 'deposit', frequency: 'monthly' })],
    });
    const sim = applyFlows({ plan: p, portfolioReturns: returns, nPaths: 5 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 5,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    expect(m.shortfallProbability).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Métrica 9: Valor final
// ---------------------------------------------------------------------------

describe('computeMetrics — Valor final', () => {
  it('retornos constantes → finalValue = K·(1+r)^n idéntico en todos los paths', () => {
    const H = 60;
    const K = 10_000;
    const r = 0.005;
    const returns = makeConstantReturns(20, H, r);
    const sim = applyFlows({ plan: plan({ initialCapital: K, horizonMonths: H }), portfolioReturns: returns, nPaths: 20 });
    const m = computeMetrics({
      simulation: sim,
      portfolioReturns: returns,
      nPaths: 20,
      horizonMonths: H,
      window: { startMonth: 1, endMonth: H },
    });
    const expected = K * Math.pow(1 + r, H);
    expect(m.finalValue.p10).toBeCloseTo(expected, 0);
    expect(m.finalValue.p50).toBeCloseTo(expected, 0);
    expect(m.finalValue.p90).toBeCloseTo(expected, 0);
  });
});

// ---------------------------------------------------------------------------
// Validación de ventana
// ---------------------------------------------------------------------------

describe('computeMetrics — validación de ventana', () => {
  it('throws si startMonth > endMonth', () => {
    const H = 12;
    const returns = makeConstantReturns(1, H, 0);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 1 });
    expect(() =>
      computeMetrics({
        simulation: sim,
        portfolioReturns: returns,
        nPaths: 1,
        horizonMonths: H,
        window: { startMonth: 10, endMonth: 5 },
      }),
    ).toThrow(/ventana inválida/);
  });

  it('throws si endMonth > horizon', () => {
    const H = 12;
    const returns = makeConstantReturns(1, H, 0);
    const sim = applyFlows({ plan: plan({ horizonMonths: H }), portfolioReturns: returns, nPaths: 1 });
    expect(() =>
      computeMetrics({
        simulation: sim,
        portfolioReturns: returns,
        nPaths: 1,
        horizonMonths: H,
        window: { startMonth: 1, endMonth: 24 },
      }),
    ).toThrow(/ventana inválida/);
  });
});

// ---------------------------------------------------------------------------
// Fan chart bands
// ---------------------------------------------------------------------------

describe('computeFanChartBands', () => {
  it('produce H+1 puntos con percentiles ordenados (p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90)', () => {
    const H = 12;
    const nPaths = 100;
    // Retornos variados por path: path p tiene r = 0.001 * (p - 50) — algunos + y otros −
    const returns = new Float32Array(nPaths * H);
    for (let p = 0; p < nPaths; p++) {
      for (let i = 0; i < H; i++) {
        returns[p * H + i] = 0.001 * (p - 50);
      }
    }
    const sim = applyFlows({ plan: plan({ horizonMonths: H, initialCapital: 1000 }), portfolioReturns: returns, nPaths });
    const bands = computeFanChartBands(sim.values, nPaths, H);

    expect(bands.monthIdx.length).toBe(H + 1);
    expect(bands.p50.length).toBe(H + 1);
    for (let t = 0; t < H + 1; t++) {
      expect(bands.p10[t]).toBeLessThanOrEqual(bands.p25[t]);
      expect(bands.p25[t]).toBeLessThanOrEqual(bands.p50[t]);
      expect(bands.p50[t]).toBeLessThanOrEqual(bands.p75[t]);
      expect(bands.p75[t]).toBeLessThanOrEqual(bands.p90[t]);
    }
    // En t=0 todos los paths comparten el initialCapital → todos los percentiles iguales
    expect(bands.p10[0]).toBeCloseTo(1000, 3);
    expect(bands.p90[0]).toBeCloseTo(1000, 3);
  });

  it('con indices (Fase C.2c) computa bandas solo sobre el subset especificado', () => {
    const H = 12;
    const nPaths = 100;
    // Paths 0..49: crash -1%/mo. Paths 50..99: growth +1%/mo.
    const returns = new Float32Array(nPaths * H);
    for (let p = 0; p < nPaths; p++) {
      for (let i = 0; i < H; i++) {
        returns[p * H + i] = p < 50 ? -0.01 : 0.01;
      }
    }
    const sim = applyFlows({ plan: plan({ horizonMonths: H, initialCapital: 1000 }), portfolioReturns: returns, nPaths });

    // Subset = solo los paths "crash" (0..49) → bandas finales cerca de 1000·(0.99)^12 ≈ 886
    const crashIndices = Uint32Array.from({ length: 50 }, (_, i) => i);
    const crashBands = computeFanChartBands(sim.values, nPaths, H, crashIndices);
    expect(crashBands.p50[H]).toBeCloseTo(1000 * Math.pow(0.99, 12), 0);

    // Subset = solo los paths "growth" (50..99) → bandas finales cerca de 1000·(1.01)^12 ≈ 1127
    const growthIndices = Uint32Array.from({ length: 50 }, (_, i) => i + 50);
    const growthBands = computeFanChartBands(sim.values, nPaths, H, growthIndices);
    expect(growthBands.p50[H]).toBeCloseTo(1000 * Math.pow(1.01, 12), 0);

    // Bandas base (todos) tienen P50 entre las dos.
    const baseBands = computeFanChartBands(sim.values, nPaths, H);
    expect(baseBands.p50[H]).toBeGreaterThan(crashBands.p50[H]);
    expect(baseBands.p50[H]).toBeLessThan(growthBands.p50[H]);
  });

  it('indices vacío lanza error (usar null para default)', () => {
    const H = 6;
    const nPaths = 10;
    const returns = new Float32Array(nPaths * H);
    const sim = applyFlows({ plan: plan({ horizonMonths: H, initialCapital: 1000 }), portfolioReturns: returns, nPaths });
    expect(() =>
      computeFanChartBands(sim.values, nPaths, H, new Uint32Array(0)),
    ).toThrow(/vacío/);
  });
});
