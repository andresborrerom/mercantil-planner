import { describe, expect, it } from 'vitest';
import { applyFlows, buildFlowSchedule } from './flows';
import {
  PRESET_IDS,
  PRESET_META,
  applyPresetToPlan,
  buildPreset,
} from './presets';
import type { PlanSpec } from './types';

const basePlan: PlanSpec = {
  initialCapital: 100_000,
  horizonMonths: 240,
  mode: 'nominal',
  inflationPct: 2.5,
  rules: [],
};

describe('PRESET_META consistency', () => {
  it('hay exactamente 3 presets', () => {
    expect(PRESET_IDS).toHaveLength(3);
  });

  it('cada PRESET_IDS está en PRESET_META', () => {
    for (const id of PRESET_IDS) {
      expect(PRESET_META).toHaveProperty(id);
      expect(PRESET_META[id].id).toBe(id);
    }
  });
});

describe('buildPreset — shape y validación de reglas', () => {
  it.each(PRESET_IDS)('%s produce al menos una regla', (id) => {
    const result = buildPreset(id);
    expect(result.rules.length).toBeGreaterThan(0);
    for (const rule of result.rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.amount).toBeGreaterThan(0);
      expect(rule.startMonth).toBeGreaterThanOrEqual(1);
      expect(['deposit', 'withdraw']).toContain(rule.sign);
    }
  });

  it('ahorroAcumulacion tiene growth 3% anual y solo aportes', () => {
    const r = buildPreset('ahorroAcumulacion');
    expect(r.mode).toBe('nominal');
    expect(r.rules.every((rule) => rule.sign === 'deposit')).toBe(true);
    expect(r.rules[0].growthPct).toBe(3);
  });

  it('jubilacion es modo real y solo retiros', () => {
    const r = buildPreset('jubilacion');
    expect(r.mode).toBe('real');
    expect(r.rules.every((rule) => rule.sign === 'withdraw')).toBe(true);
  });

  it('herencia mezcla aporte constante + retiro único al cierre', () => {
    const r = buildPreset('herencia', { horizonMonths: 120 });
    expect(r.rules.length).toBe(2);
    const deposit = r.rules.find((x) => x.sign === 'deposit');
    const withdraw = r.rules.find((x) => x.sign === 'withdraw');
    expect(deposit).toBeDefined();
    expect(withdraw).toBeDefined();
    expect(withdraw!.startMonth).toBe(120);
    expect(withdraw!.endMonth).toBe(120);
    // El retiro debe ser la mitad del aporte total (500 * 120 / 2 = 30000)
    expect(withdraw!.amount).toBeCloseTo((500 * 120) / 2, 3);
  });

  it('respeta el horizonMonths del override', () => {
    const r = buildPreset('ahorroAcumulacion', { horizonMonths: 60 });
    expect(r.rules[0].endMonth).toBe(60);
  });
});

describe('applyPresetToPlan', () => {
  it('preserva initialCapital y horizonMonths del basePlan', () => {
    const newPlan = applyPresetToPlan(basePlan, 'ahorroAcumulacion');
    expect(newPlan.initialCapital).toBe(basePlan.initialCapital);
    expect(newPlan.horizonMonths).toBe(basePlan.horizonMonths);
  });

  it('reemplaza las reglas existentes', () => {
    const planWithRules: PlanSpec = {
      ...basePlan,
      rules: [
        {
          id: 'old',
          label: 'Old',
          sign: 'deposit',
          amount: 1,
          frequency: 'monthly',
          startMonth: 1,
          endMonth: null,
          growthPct: 0,
        },
      ],
    };
    const newPlan = applyPresetToPlan(planWithRules, 'jubilacion');
    expect(newPlan.rules.find((r) => r.id === 'old')).toBeUndefined();
    expect(newPlan.mode).toBe('real');
  });

  it('los presets aplicados producen schedules no vacíos', () => {
    for (const id of PRESET_IDS) {
      const p = applyPresetToPlan(basePlan, id);
      const { schedule } = buildFlowSchedule(p);
      // Debe haber al menos un flujo no-cero
      let anyNonZero = false;
      for (let i = 0; i < schedule.length; i++) {
        if (schedule[i] !== 0) {
          anyNonZero = true;
          break;
        }
      }
      expect(anyNonZero).toBe(true);
    }
  });

  it('ahorro aplicado + retornos 0 → V[H] = K + aportes totales con crecimiento', () => {
    // Con growth 3% anual, 240 meses = 20 años, el aporte nominal del año k es 1000·1.03^(k-1)
    // (del mes k*12-11 al mes k*12). Aporte total ≈ 1000·12·Σk=0..19(1.03^k)
    // = 12000 · (1.03^20 − 1) / 0.03
    const horizon = 240;
    const plan = applyPresetToPlan({ ...basePlan, initialCapital: 0, horizonMonths: horizon }, 'ahorroAcumulacion');
    const returns = new Float32Array(horizon);
    const sim = applyFlows({ plan, portfolioReturns: returns, nPaths: 1 });
    const expected = 12_000 * (Math.pow(1.03, 20) - 1) / 0.03;
    const actual = sim.values[horizon];
    expect(Math.abs(actual - expected) / expected).toBeLessThan(1e-5);
  });
});
