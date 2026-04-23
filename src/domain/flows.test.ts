import { describe, expect, it } from 'vitest';
import { applyFlows, buildFlowSchedule } from './flows';
import type { FlowRule, PlanSpec } from './types';

// ---------------------------------------------------------------------------
// Helpers de construcción
// ---------------------------------------------------------------------------

function makeConstantReturns(nPaths: number, H: number, r: number): Float32Array {
  const arr = new Float32Array(nPaths * H);
  arr.fill(r);
  return arr;
}

function rule(overrides: Partial<FlowRule> = {}): FlowRule {
  return {
    id: 'r1',
    label: 'test rule',
    sign: 'deposit',
    amount: 100,
    frequency: 'monthly',
    startMonth: 1,
    endMonth: null,
    growthPct: 0,
    ...overrides,
  };
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

/** Compara dos Float32 con tolerancia relativa (útil para evitar falsos negativos por precisión Float32 en valores grandes). */
function closeRelative(actual: number, expected: number, relTol = 1e-5): boolean {
  if (expected === 0) return Math.abs(actual) < relTol;
  return Math.abs(actual - expected) / Math.abs(expected) < relTol;
}

// ---------------------------------------------------------------------------
// TEST #1 del §5: cashflow simple con retorno constante
// ---------------------------------------------------------------------------

describe('Test §5.1 — cashflow con retornos constantes', () => {
  it('FV = PV·(1+r)^n + PMT·annuity_factor a precisión de 6 dígitos relativos', () => {
    const K = 10_000;
    const r = 0.01;
    const n = 120;
    const PMT = 500;

    const p = plan({
      initialCapital: K,
      horizonMonths: n,
      rules: [rule({ amount: PMT, sign: 'deposit', frequency: 'monthly' })],
    });

    const out = applyFlows({
      plan: p,
      portfolioReturns: makeConstantReturns(1, n, r),
      nPaths: 1,
    });

    // FV con PMT al final del periodo (annuity-immediate):
    //   FV = K·(1+r)^n + PMT·((1+r)^n − 1) / r
    const growth = Math.pow(1 + r, n);
    const expectedFV = K * growth + PMT * (growth - 1) / r;

    const actualFV = out.values[n];
    expect(closeRelative(actualFV, expectedFV, 1e-5)).toBe(true);
  });

  it('sin flujos: FV = K·(1+r)^n puro', () => {
    const K = 50_000;
    const r = 0.005;
    const n = 60;

    const out = applyFlows({
      plan: plan({ initialCapital: K, horizonMonths: n }),
      portfolioReturns: makeConstantReturns(1, n, r),
      nPaths: 1,
    });

    const expected = K * Math.pow(1 + r, n);
    expect(closeRelative(out.values[n], expected, 1e-6)).toBe(true);
  });

  it('sin retornos y sin flujos: V es constante', () => {
    const K = 1_234;
    const out = applyFlows({
      plan: plan({ initialCapital: K, horizonMonths: 36 }),
      portfolioReturns: makeConstantReturns(1, 36, 0),
      nPaths: 1,
    });
    for (let i = 0; i <= 36; i++) {
      expect(out.values[i]).toBeCloseTo(K, 4);
    }
    expect(out.ruined[0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TEST #2 del §5: ruina forzada
// ---------------------------------------------------------------------------

describe('Test §5.2 — ruina forzada', () => {
  it('K=1000, retiro 200/mes, r=0 → V[5]=0 y ruined=true', () => {
    const p = plan({
      initialCapital: 1000,
      horizonMonths: 12,
      rules: [rule({ amount: 200, sign: 'withdraw', frequency: 'monthly' })],
    });

    const out = applyFlows({
      plan: p,
      portfolioReturns: makeConstantReturns(1, 12, 0),
      nPaths: 1,
    });

    expect(out.values[0]).toBe(1000);
    expect(out.values[1]).toBeCloseTo(800, 4);
    expect(out.values[2]).toBeCloseTo(600, 4);
    expect(out.values[3]).toBeCloseTo(400, 4);
    expect(out.values[4]).toBeCloseTo(200, 4);
    expect(out.values[5]).toBeCloseTo(0, 4);
    // A partir del mes 5 (inclusive) el path queda en 0
    for (let i = 5; i <= 12; i++) {
      expect(out.values[i]).toBe(0);
    }
    expect(out.ruined[0]).toBe(1);
  });

  it('retiros que NO llegan a ruina mantienen ruined=false', () => {
    const p = plan({
      initialCapital: 10_000,
      horizonMonths: 12,
      rules: [rule({ amount: 100, sign: 'withdraw', frequency: 'monthly' })],
    });
    const out = applyFlows({
      plan: p,
      portfolioReturns: makeConstantReturns(1, 12, 0),
      nPaths: 1,
    });
    // 10k − 12·100 = 8800
    expect(out.values[12]).toBeCloseTo(8800, 4);
    expect(out.ruined[0]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TEST #3 del §5: modo real con inflación
// ---------------------------------------------------------------------------

describe('Test §5.3 — modo real con inflación 2.5%', () => {
  it('aporte $1000 constante: monto nominal del mes 120 = 1000·1.025^10', () => {
    const p = plan({
      initialCapital: 0,
      horizonMonths: 120,
      mode: 'real',
      inflationPct: 2.5,
      rules: [
        rule({ amount: 1000, sign: 'deposit', frequency: 'monthly', growthPct: 0 }),
      ],
    });

    const { schedule } = buildFlowSchedule(p);

    // Mes 1 (índice 0): 1000 · 1.025^(1/12)
    const m1Expected = 1000 * Math.pow(1.025, 1 / 12);
    expect(closeRelative(schedule[0], m1Expected, 1e-6)).toBe(true);

    // Mes 12 (índice 11): 1000 · 1.025^1
    const m12Expected = 1000 * Math.pow(1.025, 1);
    expect(closeRelative(schedule[11], m12Expected, 1e-6)).toBe(true);

    // Mes 120 (índice 119): 1000 · 1.025^10  (este es el check del spec)
    const m120Expected = 1000 * Math.pow(1.025, 10);
    expect(closeRelative(schedule[119], m120Expected, 1e-6)).toBe(true);
  });

  it('modo nominal ignora inflationPct aunque esté seteado', () => {
    const p = plan({
      initialCapital: 0,
      horizonMonths: 12,
      mode: 'nominal',
      inflationPct: 2.5,
      rules: [rule({ amount: 1000, sign: 'deposit', frequency: 'monthly' })],
    });
    const { schedule } = buildFlowSchedule(p);
    for (let i = 0; i < 12; i++) {
      expect(schedule[i]).toBeCloseTo(1000, 3);
    }
  });
});

// ---------------------------------------------------------------------------
// TEST #4 del §5: growth anual, NO mensual
// ---------------------------------------------------------------------------

describe('Test §5.4 — growthPct compondea anual', () => {
  it('growthPct=5, base=1000: meses 1..12 = 1000, meses 13..24 = 1050, meses 25..36 = 1102.5', () => {
    const p = plan({
      initialCapital: 0,
      horizonMonths: 36,
      mode: 'nominal',
      rules: [rule({ amount: 1000, sign: 'deposit', frequency: 'monthly', growthPct: 5 })],
    });
    const { schedule } = buildFlowSchedule(p);

    for (let i = 0; i < 12; i++) expect(schedule[i]).toBeCloseTo(1000, 3);
    for (let i = 12; i < 24; i++) expect(schedule[i]).toBeCloseTo(1050, 3);
    for (let i = 24; i < 36; i++) expect(schedule[i]).toBeCloseTo(1102.5, 3);
  });

  it('un aporte mensual con growthPct=10 y startMonth=7 compondea el segundo año desde startMonth', () => {
    const p = plan({
      initialCapital: 0,
      horizonMonths: 36,
      rules: [
        rule({
          amount: 500,
          sign: 'deposit',
          frequency: 'monthly',
          startMonth: 7,
          growthPct: 10,
        }),
      ],
    });
    const { schedule } = buildFlowSchedule(p);

    // Antes del mes 7: 0
    for (let i = 0; i < 6; i++) expect(schedule[i]).toBe(0);
    // Mes 7..18 (año 0 desde start): 500
    for (let i = 6; i < 18; i++) expect(schedule[i]).toBeCloseTo(500, 3);
    // Mes 19..30 (año 1 desde start): 550
    for (let i = 18; i < 30; i++) expect(schedule[i]).toBeCloseTo(550, 3);
    // Mes 31..36 (año 2 desde start, parcial): 605
    for (let i = 30; i < 36; i++) expect(schedule[i]).toBeCloseTo(605, 3);
  });
});

// ---------------------------------------------------------------------------
// Tests complementarios de frequency
// ---------------------------------------------------------------------------

describe('buildFlowSchedule — frequencies no mensuales', () => {
  it('frequency=quarterly empieza en startMonth y cada 3 meses', () => {
    const p = plan({
      initialCapital: 0,
      horizonMonths: 12,
      rules: [rule({ amount: 300, frequency: 'quarterly', startMonth: 1 })],
    });
    const { schedule } = buildFlowSchedule(p);
    expect(schedule[0]).toBe(300); // mes 1
    expect(schedule[1]).toBe(0); // mes 2
    expect(schedule[2]).toBe(0); // mes 3
    expect(schedule[3]).toBe(300); // mes 4
    expect(schedule[6]).toBe(300); // mes 7
    expect(schedule[9]).toBe(300); // mes 10
  });

  it('frequency=annual con startMonth=3 dispara meses 3, 15, 27 ...', () => {
    const p = plan({
      initialCapital: 0,
      horizonMonths: 36,
      rules: [rule({ amount: 12_000, frequency: 'annual', startMonth: 3 })],
    });
    const { schedule } = buildFlowSchedule(p);
    expect(schedule[2]).toBe(12_000); // mes 3
    expect(schedule[14]).toBe(12_000); // mes 15
    expect(schedule[26]).toBe(12_000); // mes 27
    // Los meses en medio deben ser 0
    expect(schedule[5]).toBe(0);
    expect(schedule[10]).toBe(0);
  });

  it('endMonth limita la regla', () => {
    const p = plan({
      initialCapital: 0,
      horizonMonths: 24,
      rules: [
        rule({ amount: 100, frequency: 'monthly', startMonth: 1, endMonth: 6 }),
      ],
    });
    const { schedule } = buildFlowSchedule(p);
    for (let i = 0; i < 6; i++) expect(schedule[i]).toBe(100);
    for (let i = 6; i < 24; i++) expect(schedule[i]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Reglas combinadas (deposit + withdraw)
// ---------------------------------------------------------------------------

describe('applyFlows — reglas combinadas', () => {
  it('depósito 1000/mes + retiro 500/mes neto = +500/mes', () => {
    const p = plan({
      initialCapital: 0,
      horizonMonths: 24,
      rules: [
        rule({ id: 'd', amount: 1000, sign: 'deposit', frequency: 'monthly' }),
        rule({ id: 'w', amount: 500, sign: 'withdraw', frequency: 'monthly' }),
      ],
    });
    const out = applyFlows({
      plan: p,
      portfolioReturns: makeConstantReturns(1, 24, 0),
      nPaths: 1,
    });
    expect(out.values[24]).toBeCloseTo(24 * 500, 4);
  });

  it('netContributions refleja initialCapital + flujos acumulados', () => {
    const p = plan({
      initialCapital: 10_000,
      horizonMonths: 12,
      rules: [rule({ amount: 500, sign: 'deposit', frequency: 'monthly' })],
    });
    const out = applyFlows({
      plan: p,
      portfolioReturns: makeConstantReturns(1, 12, 0),
      nPaths: 1,
    });
    expect(out.netContributions[0]).toBe(10_000);
    expect(out.netContributions[6]).toBeCloseTo(10_000 + 6 * 500, 4);
    expect(out.netContributions[12]).toBeCloseTo(10_000 + 12 * 500, 4);
  });
});

// ---------------------------------------------------------------------------
// Multi-path
// ---------------------------------------------------------------------------

describe('applyFlows — multi-path', () => {
  it('paths independientes con returns distintos producen values distintos', () => {
    const H = 6;
    const nPaths = 3;
    const returns = new Float32Array(nPaths * H);
    for (let i = 0; i < H; i++) returns[0 * H + i] = 0.00; // path 0
    for (let i = 0; i < H; i++) returns[1 * H + i] = 0.01; // path 1
    for (let i = 0; i < H; i++) returns[2 * H + i] = -0.02; // path 2

    const out = applyFlows({
      plan: plan({ initialCapital: 1000, horizonMonths: H }),
      portfolioReturns: returns,
      nPaths,
    });

    expect(out.values[0 * (H + 1) + H]).toBeCloseTo(1000, 3);
    expect(out.values[1 * (H + 1) + H]).toBeCloseTo(1000 * Math.pow(1.01, 6), 3);
    expect(out.values[2 * (H + 1) + H]).toBeCloseTo(1000 * Math.pow(0.98, 6), 3);
  });
});

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Bug 1 regression — invariante V[t] ≥ 0 en todas las condiciones
// ---------------------------------------------------------------------------

describe('Bug 1 — invariante V[t] ≥ 0 siempre', () => {
  it('retornos catastróficos negativos sin flujos: path queda en 0, nunca negativo', () => {
    // r < −1 en teoría haría tentative negativo sin retiros. Forzamos el escenario.
    const H = 6;
    const returns = new Float32Array([-0.5, -0.5, -0.9, -0.99, -0.5, -0.5]);
    const out = applyFlows({
      plan: plan({ initialCapital: 100, horizonMonths: H, rules: [] }),
      portfolioReturns: returns,
      nPaths: 1,
    });
    // Todos los valores deben ser ≥ 0.
    for (let i = 0; i <= H; i++) {
      expect(out.values[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('capital pequeño + retornos extremos negativos + retiro pequeño: V siempre ≥ 0 y se ruina', () => {
    const H = 12;
    // Retornos muy negativos mes a mes.
    const returns = new Float32Array(H).fill(-0.5);
    const p = plan({
      initialCapital: 100,
      horizonMonths: H,
      rules: [rule({ amount: 10, sign: 'withdraw', frequency: 'monthly' })],
    });
    const out = applyFlows({ plan: p, portfolioReturns: returns, nPaths: 1 });
    for (let i = 0; i <= H; i++) {
      expect(out.values[i]).toBeGreaterThanOrEqual(0);
    }
    expect(out.ruined[0]).toBe(1);
  });

  it('path ruinado se mantiene en 0 incluso si hay aportes programados posteriores', () => {
    const H = 12;
    // Retornos constantes cero; retiros 200/mes iniciales; deposit 1000 desde mes 8.
    const returns = makeConstantReturns(1, H, 0);
    const p = plan({
      initialCapital: 500,
      horizonMonths: H,
      rules: [
        rule({ id: 'w', amount: 200, sign: 'withdraw', frequency: 'monthly', startMonth: 1, endMonth: 7 }),
        rule({ id: 'd', amount: 1000, sign: 'deposit', frequency: 'monthly', startMonth: 8 }),
      ],
    });
    const out = applyFlows({ plan: p, portfolioReturns: returns, nPaths: 1 });

    // 500 − 200 × 3 = −100 → ruina en mes 3 (tentative ≤ 0).
    expect(out.ruined[0]).toBe(1);
    // Desde mes 3 en adelante, todos los valores = 0, sin importar los deposits posteriores.
    for (let i = 3; i <= H; i++) {
      expect(out.values[i]).toBe(0);
    }
  });

  it('multipath estress: 500 paths con retornos aleatorios extremos, ningún valor < 0', () => {
    const H = 60;
    const nPaths = 500;
    const returns = new Float32Array(nPaths * H);
    // Mix agresivo: 50% meses muy negativos, 50% meses positivos.
    let seed = 0xC0FFEE;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return (seed & 0xffffffff) / 0xffffffff;
    };
    for (let i = 0; i < returns.length; i++) {
      returns[i] = rand() < 0.5 ? -0.3 - rand() * 0.4 : rand() * 0.2;
    }
    const p = plan({
      initialCapital: 1000,
      horizonMonths: H,
      rules: [rule({ amount: 50, sign: 'withdraw', frequency: 'monthly' })],
    });
    const out = applyFlows({ plan: p, portfolioReturns: returns, nPaths });
    // Scan completo: ningún valor debe ser negativo.
    let minV = Infinity;
    for (let i = 0; i < out.values.length; i++) {
      if (out.values[i] < minV) minV = out.values[i];
    }
    expect(minV).toBeGreaterThanOrEqual(0);
  });
});

describe('applyFlows — validación', () => {
  it('throws si portfolioReturns no cuadra con nPaths × H', () => {
    expect(() =>
      applyFlows({
        plan: plan({ horizonMonths: 12 }),
        portfolioReturns: new Float32Array(10),
        nPaths: 2,
      }),
    ).toThrow(/portfolioReturns/);
  });

  it('throws si nPaths < 1', () => {
    expect(() =>
      applyFlows({
        plan: plan({ horizonMonths: 12 }),
        portfolioReturns: new Float32Array(0),
        nPaths: 0,
      }),
    ).toThrow(/nPaths/);
  });

  it('throws si initialCapital no es finito', () => {
    expect(() =>
      applyFlows({
        plan: plan({ initialCapital: NaN, horizonMonths: 12 }),
        portfolioReturns: makeConstantReturns(1, 12, 0),
        nPaths: 1,
      }),
    ).toThrow(/initialCapital/);
  });
});
