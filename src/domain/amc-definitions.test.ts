import { describe, expect, it } from 'vitest';
import {
  AMC_COMPOSITIONS,
  AMC_IDS,
  BLOCK_TO_TICKER,
  SIGNATURE_COMPOSITIONS,
  SIGNATURE_IDS,
  etfWeightTable,
  expandPortfolio,
  fixedPercent,
  isAmcValid,
  isSignatureValid,
  normalizeWeights,
  sumWeights,
} from './amc-definitions';
import type { AmcId, PortfolioSpec } from './types';

const EPS = 1e-9;

describe('AMC_COMPOSITIONS — pesos internos', () => {
  it.each(AMC_IDS)('%s suma 100', (amcId) => {
    const sum = sumWeights(AMC_COMPOSITIONS[amcId]);
    expect(sum).toBeCloseTo(100, 9);
  });

  it('el validator isAmcValid acepta todos los AMCs del catálogo', () => {
    for (const id of AMC_IDS) {
      expect(isAmcValid(id)).toBe(true);
    }
  });

  it('GlFI tiene exactamente 20% FIXED6', () => {
    expect(AMC_COMPOSITIONS.GlFI.FIXED6).toBe(20);
  });

  it('USA.Eq es 100% EQUS', () => {
    expect(AMC_COMPOSITIONS['USA.Eq'].EQUS).toBe(100);
  });

  it('los 3 AMCs propuestos no tienen FIXED', () => {
    for (const id of ['CashST', 'USGrTech', 'USTDur'] as const) {
      const comp = AMC_COMPOSITIONS[id];
      expect(comp.FIXED6 ?? 0).toBe(0);
      expect(comp.FIXED9 ?? 0).toBe(0);
    }
  });
});

describe('SIGNATURE_COMPOSITIONS — pesos sobre AMCs', () => {
  it.each(SIGNATURE_IDS)('%s suma 100', (sigId) => {
    const sum = sumWeights(SIGNATURE_COMPOSITIONS[sigId]);
    expect(sum).toBeCloseTo(100, 9);
  });

  it('isSignatureValid acepta las 3 signatures', () => {
    for (const id of SIGNATURE_IDS) {
      expect(isSignatureValid(id)).toBe(true);
    }
  });

  it('Conservador es 55/37/8 entre GlFI, RF.Lat, GlSec.Eq', () => {
    expect(SIGNATURE_COMPOSITIONS.Conservador).toEqual({
      GlFI: 55,
      'RF.Lat': 37,
      'GlSec.Eq': 8,
    });
  });
});

describe('BLOCK_TO_TICKER — cobertura del mapeo', () => {
  it('mapea todos los building blocks no-FIXED usados en AMCs', () => {
    const usedBlocks = new Set<string>();
    for (const amcId of AMC_IDS) {
      for (const blockId of Object.keys(AMC_COMPOSITIONS[amcId])) {
        usedBlocks.add(blockId);
      }
    }
    usedBlocks.delete('FIXED6');
    usedBlocks.delete('FIXED9');

    for (const blockId of usedBlocks) {
      expect(BLOCK_TO_TICKER).toHaveProperty(blockId);
    }
  });

  it('ticker EQUS → SPY, MM → BIL, UST13 → SPTS (sanity)', () => {
    expect(BLOCK_TO_TICKER.EQUS).toBe('SPY');
    expect(BLOCK_TO_TICKER.MM).toBe('BIL');
    expect(BLOCK_TO_TICKER.UST13).toBe('SPTS');
  });
});

describe('expandPortfolio — AMC individual', () => {
  it('USA.Eq se expande a 100% SPY', () => {
    const spec: PortfolioSpec = { kind: 'amc', id: 'USA.Eq' };
    const exp = expandPortfolio(spec);
    expect(exp.etfs.SPY).toBeCloseTo(100, 9);
    expect(fixedPercent(exp)).toBe(0);
    expect(exp.totalWeight).toBeCloseTo(100, 9);
  });

  it('GlFI se expande con 20% FIXED6 y 80% en ETFs', () => {
    const exp = expandPortfolio({ kind: 'amc', id: 'GlFI' });
    expect(exp.fixed.FIXED6).toBeCloseTo(20, 9);
    expect(exp.fixed.FIXED9).toBe(0);

    // ETFs: UST13(SPTS)=10, DMG7(IGOV)=25, IG(LQD)=35, HY(GHYG)=10
    expect(exp.etfs.SPTS).toBeCloseTo(10, 9);
    expect(exp.etfs.IGOV).toBeCloseTo(25, 9);
    expect(exp.etfs.LQD).toBeCloseTo(35, 9);
    expect(exp.etfs.GHYG).toBeCloseTo(10, 9);

    // Total
    const etfSum = sumWeights(exp.etfs as Partial<Record<string, number>>);
    expect(etfSum).toBeCloseTo(80, 9);
    expect(exp.totalWeight).toBeCloseTo(100, 9);
  });

  it('CashST (propuesto) se expande a 60% BIL + 40% SPTS, sin FIXED', () => {
    const exp = expandPortfolio({ kind: 'amc', id: 'CashST' });
    expect(exp.etfs.BIL).toBeCloseTo(60, 9);
    expect(exp.etfs.SPTS).toBeCloseTo(40, 9);
    expect(fixedPercent(exp)).toBe(0);
    expect(exp.totalWeight).toBeCloseTo(100, 9);
  });

  it('CDT-Proxy (propuesto) se expande a 30% BIL + 20% SPTS + 50% FIXED6', () => {
    const exp = expandPortfolio({ kind: 'amc', id: 'CDT-Proxy' });
    expect(exp.etfs.BIL).toBeCloseTo(30, 9);
    expect(exp.etfs.SPTS).toBeCloseTo(20, 9);
    expect(exp.fixed.FIXED6).toBeCloseTo(50, 9);
    expect(exp.fixed.FIXED9).toBe(0);
    expect(fixedPercent(exp)).toBeCloseTo(50, 9);
    expect(exp.totalWeight).toBeCloseTo(100, 9);
  });

  it('CDT-Proxy tiene composición equivalente a Custom 50% CashST + 50% FIXED6 puro', () => {
    // Verifica la equivalencia matemática: 50% CashST expandido + 50% FIXED6
    // debe dar los mismos pesos finales que el AMC CDT-Proxy directamente.
    const viaAmc = expandPortfolio({ kind: 'amc', id: 'CDT-Proxy' });
    // Expresable como custom mix: 50% CashST (que aporta su expansión a ETFs)
    // + los 50% restantes no los podemos meter en FIXED6 vía Custom porque la
    // UI sólo acepta AMCs. Este test asegura que el shortcut AMC sí nos da
    // lo que un "CashST 50% + FIXED6 50% puro" daría si existiera tal AMC.
    expect(viaAmc.etfs.BIL).toBeCloseTo(30, 9); // 50% CashST × 60% BIL
    expect(viaAmc.etfs.SPTS).toBeCloseTo(20, 9); // 50% CashST × 40% SPTS
    expect(viaAmc.fixed.FIXED6).toBeCloseTo(50, 9); // 50% FIXED6 directo
  });

  it('HY.Cr.Opps tiene 60% FIXED9 y 40% GHYG', () => {
    const exp = expandPortfolio({ kind: 'amc', id: 'HY.Cr.Opps' });
    expect(exp.fixed.FIXED9).toBeCloseTo(60, 9);
    expect(exp.etfs.GHYG).toBeCloseTo(40, 9);
    expect(exp.totalWeight).toBeCloseTo(100, 9);
  });

  it('todos los AMCs del catálogo suman totalWeight ≈ 100 al expandir', () => {
    for (const id of AMC_IDS) {
      const exp = expandPortfolio({ kind: 'amc', id });
      expect(exp.totalWeight).toBeCloseTo(100, 9);
    }
  });
});

describe('expandPortfolio — Signatures', () => {
  it('Conservador: 55% GlFI contribuye 11% FIXED6, 8% GlSec.Eq contribuye 8% ACWI', () => {
    const exp = expandPortfolio({ kind: 'signature', id: 'Conservador' });

    // FIXED6 de GlFI: 55% * 20% = 11%
    expect(exp.fixed.FIXED6).toBeCloseTo(11, 9);

    // RF.Lat aporta FIXED9: 37% * 20% = 7.4%
    expect(exp.fixed.FIXED9).toBeCloseTo(7.4, 9);

    // GlSec.Eq es 100% EQGLB → ACWI. 8% AMC → 8% ACWI
    expect(exp.etfs.ACWI).toBeCloseTo(8, 9);

    expect(exp.totalWeight).toBeCloseTo(100, 9);
  });

  it('Balanceado totaliza 100 y tiene ambos FIXED presentes', () => {
    const exp = expandPortfolio({ kind: 'signature', id: 'Balanceado' });
    expect(exp.totalWeight).toBeCloseTo(100, 9);

    // FIXED6 viene solo de GlFI (25%): 25 * 20 / 100 = 5
    expect(exp.fixed.FIXED6).toBeCloseTo(5, 9);

    // FIXED9 viene de RF.Lat (25% * 20%) + HY.Cr.Opps (5% * 60%) = 5 + 3 = 8
    expect(exp.fixed.FIXED9).toBeCloseTo(8, 9);
  });

  it('Crecimiento totaliza 100 y es muy equity', () => {
    const exp = expandPortfolio({ kind: 'signature', id: 'Crecimiento' });
    expect(exp.totalWeight).toBeCloseTo(100, 9);

    // GlSec.Eq es 55% → todo va a ACWI
    expect(exp.etfs.ACWI).toBeCloseTo(55, 9);

    // USA.Eq 15% → SPY 15
    expect(exp.etfs.SPY).toBeCloseTo(15, 9);

    // GlExUS 15% → ACWX 15
    expect(exp.etfs.ACWX).toBeCloseTo(15, 9);

    // FIXED total pequeño: GlFI 5*20/100 + RF.Lat 5*20/100 + HY.Cr.Opps 5*60/100 = 1 + 1 + 3 = 5
    expect(fixedPercent(exp)).toBeCloseTo(5, 9);
  });
});

describe('expandPortfolio — Custom mix', () => {
  it('Custom con 50/50 GlFI + USA.Eq produce los pesos correctos', () => {
    const exp = expandPortfolio({
      kind: 'custom',
      label: 'Test 50/50',
      weights: { GlFI: 50, 'USA.Eq': 50 },
    });

    // GlFI 50% → FIXED6 50*20/100 = 10, SPTS 50*10/100 = 5, etc.
    expect(exp.fixed.FIXED6).toBeCloseTo(10, 9);
    expect(exp.etfs.SPTS).toBeCloseTo(5, 9);
    expect(exp.etfs.IGOV).toBeCloseTo(12.5, 9);
    expect(exp.etfs.LQD).toBeCloseTo(17.5, 9);
    expect(exp.etfs.GHYG).toBeCloseTo(5, 9);

    // USA.Eq 50% → SPY 50
    expect(exp.etfs.SPY).toBeCloseTo(50, 9);

    expect(exp.totalWeight).toBeCloseTo(100, 9);
  });

  it('Custom que no suma 100 produce totalWeight ≠ 100 (NO auto-normaliza)', () => {
    const exp = expandPortfolio({
      kind: 'custom',
      label: 'Unbalanced',
      weights: { 'USA.Eq': 70 }, // solo 70
    });
    expect(exp.etfs.SPY).toBeCloseTo(70, 9);
    expect(exp.totalWeight).toBeCloseTo(70, 9);
  });

  it('Custom vacío produce portfolio vacío', () => {
    const exp = expandPortfolio({ kind: 'custom', label: 'Empty', weights: {} });
    expect(exp.totalWeight).toBe(0);
    expect(exp.fixed.FIXED6).toBe(0);
    expect(exp.fixed.FIXED9).toBe(0);
  });
});

describe('normalizeWeights', () => {
  it('normaliza un Record arbitrario al target', () => {
    const normalized = normalizeWeights<AmcId>({ GlFI: 30, 'USA.Eq': 70 }, 100);
    expect(normalized.GlFI).toBeCloseTo(30, 9);
    expect(normalized['USA.Eq']).toBeCloseTo(70, 9);
  });

  it('reescala 60 al target 100', () => {
    const normalized = normalizeWeights<AmcId>({ GlFI: 30, 'USA.Eq': 30 }, 100);
    expect(normalized.GlFI).toBeCloseTo(50, 9);
    expect(normalized['USA.Eq']).toBeCloseTo(50, 9);
  });

  it('retorna vacío si la suma es 0 (no divide por cero)', () => {
    const normalized = normalizeWeights<AmcId>({}, 100);
    expect(normalized).toEqual({});
  });
});

describe('etfWeightTable', () => {
  it('ordena por peso descendente', () => {
    const exp = expandPortfolio({ kind: 'signature', id: 'Balanceado' });
    const table = etfWeightTable(exp);
    for (let i = 1; i < table.length; i++) {
      expect(table[i - 1].weight).toBeGreaterThanOrEqual(table[i].weight);
    }
  });

  it('no incluye tickers con peso 0', () => {
    const exp = expandPortfolio({ kind: 'amc', id: 'USA.Eq' });
    const table = etfWeightTable(exp);
    expect(table).toEqual([{ ticker: 'SPY', weight: 100 - EPS * 0 }]);
    expect(table.every((r) => r.weight > 0)).toBe(true);
  });
});
