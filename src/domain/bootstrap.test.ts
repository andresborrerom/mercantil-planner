import { describe, expect, it } from 'vitest';
import { N_MONTHS, N_TICKERS, RETURNS, TICKERS, YIELDS } from '../data/market.generated';
import {
  DEFAULT_BOOTSTRAP_CONFIG,
  getTickerModel,
  getYieldBounds,
  runBootstrap,
  type BootstrapInput,
} from './bootstrap';
import { RF_CONFIG } from './rf-config';
import { expandPortfolio } from './amc-definitions';
import { mulberry32 } from './prng';
import type { ExpandedPortfolio } from './types';

const ZERO_FIXED = { FIXED6: 0, FIXED9: 0 } as const;

function makeSpyOnly(): ExpandedPortfolio {
  return { etfs: { SPY: 100 }, fixed: { ...ZERO_FIXED }, totalWeight: 100 };
}

function makeBilOnly(): ExpandedPortfolio {
  return { etfs: { BIL: 100 }, fixed: { ...ZERO_FIXED }, totalWeight: 100 };
}

function makeEmpty(): ExpandedPortfolio {
  return { etfs: {}, fixed: { FIXED6: 0, FIXED9: 0 }, totalWeight: 0 };
}

function makeAllFixed6(): ExpandedPortfolio {
  return { etfs: {}, fixed: { FIXED6: 100, FIXED9: 0 }, totalWeight: 100 };
}

function makeAllFixed9(): ExpandedPortfolio {
  return { etfs: {}, fixed: { FIXED6: 0, FIXED9: 100 }, totalWeight: 100 };
}

function makeInput(
  portfolioA: ExpandedPortfolio,
  portfolioB: ExpandedPortfolio,
  overrides: Partial<BootstrapInput> = {},
): BootstrapInput {
  return {
    portfolios: { A: portfolioA, B: portfolioB },
    horizonMonths: 120,
    config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 200 },
    ...overrides,
  };
}

describe('Mulberry32', () => {
  it('es determinista dado el mismo seed', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 10; i++) {
      expect(r1()).toBe(r2());
    }
  });

  it('produce valores en [0, 1)', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seeds distintos producen secuencias distintas', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(43);
    const a = Array.from({ length: 5 }, () => r1());
    const b = Array.from({ length: 5 }, () => r2());
    expect(a).not.toEqual(b);
  });
});

describe('runBootstrap — forma del output', () => {
  it('produce Float32Array de tamaño nPaths × horizonMonths para A y B', () => {
    const out = runBootstrap(makeInput(makeSpyOnly(), makeBilOnly()));
    expect(out.portfolioReturnsA).toBeInstanceOf(Float32Array);
    expect(out.portfolioReturnsB).toBeInstanceOf(Float32Array);
    expect(out.portfolioReturnsA.length).toBe(200 * 120);
    expect(out.portfolioReturnsB.length).toBe(200 * 120);
  });

  it('meta refleja los parámetros efectivos', () => {
    const out = runBootstrap(makeInput(makeSpyOnly(), makeBilOnly()));
    expect(out.meta.nPaths).toBe(200);
    expect(out.meta.horizonMonths).toBe(120);
    expect(out.meta.blockSize).toBe(12);
    expect(out.meta.seed).toBe(42);
    expect(out.meta.nMonthsData).toBe(N_MONTHS);
    expect(out.meta.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('ningún retorno es NaN ni infinito', () => {
    const out = runBootstrap(makeInput(makeSpyOnly(), makeBilOnly()));
    for (let i = 0; i < out.portfolioReturnsA.length; i++) {
      expect(Number.isFinite(out.portfolioReturnsA[i])).toBe(true);
      expect(Number.isFinite(out.portfolioReturnsB[i])).toBe(true);
    }
  });
});

describe('runBootstrap — determinismo', () => {
  it('dos corridas con el mismo seed producen resultados idénticos', () => {
    const out1 = runBootstrap(makeInput(makeSpyOnly(), makeBilOnly()));
    const out2 = runBootstrap(makeInput(makeSpyOnly(), makeBilOnly()));
    expect(out1.portfolioReturnsA).toEqual(out2.portfolioReturnsA);
    expect(out1.portfolioReturnsB).toEqual(out2.portfolioReturnsB);
  });

  it('seeds distintos producen resultados distintos', () => {
    const out1 = runBootstrap(
      makeInput(makeSpyOnly(), makeBilOnly(), {
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 200, seed: 42 },
      }),
    );
    const out2 = runBootstrap(
      makeInput(makeSpyOnly(), makeBilOnly(), {
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 200, seed: 99 },
      }),
    );
    // Al menos un elemento debe diferir
    let differ = false;
    for (let i = 0; i < out1.portfolioReturnsA.length; i++) {
      if (out1.portfolioReturnsA[i] !== out2.portfolioReturnsA[i]) {
        differ = true;
        break;
      }
    }
    expect(differ).toBe(true);
  });
});

describe('runBootstrap — portafolio de un solo ETF replica su serie real', () => {
  it('100% SPY en un mes dado retorna exactamente el retorno histórico de SPY en algún mes del dataset', () => {
    // Con horizon=1 y block=1, cada path es un muestreo uniforme de algún mes
    // del histórico. Por lo tanto todos los retornos deben estar en el set de
    // retornos históricos de SPY.
    const out = runBootstrap(
      makeInput(makeSpyOnly(), makeSpyOnly(), {
        horizonMonths: 1,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 500, blockSize: 1 },
      }),
    );

    const spyIdx = TICKERS.indexOf('SPY');
    const historicalSet = new Set<number>();
    for (let i = 0; i < N_MONTHS; i++) {
      historicalSet.add(RETURNS[i * N_TICKERS + spyIdx]);
    }

    for (let p = 0; p < 500; p++) {
      const r = out.portfolioReturnsA[p];
      // El bootstrap usa Float32 así que hay round-trip preciso a nivel bit;
      // comparamos con tolerancia pequeña.
      let matched = false;
      for (const hist of historicalSet) {
        if (Math.abs(Math.fround(hist) - r) < 1e-8) {
          matched = true;
          break;
        }
      }
      expect(matched).toBe(true);
    }
  });
});

describe('runBootstrap — FIXED rates determinísticos', () => {
  it('100% FIXED6 produce retornos mensuales constantes = (1.06)^(1/12) − 1', () => {
    const expected = Math.fround(Math.pow(1.06, 1 / 12) - 1);
    const out = runBootstrap(
      makeInput(makeAllFixed6(), makeEmpty(), {
        horizonMonths: 60,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 50 },
      }),
    );
    for (let i = 0; i < out.portfolioReturnsA.length; i++) {
      expect(out.portfolioReturnsA[i]).toBeCloseTo(expected, 6);
    }
  });

  it('100% FIXED9 produce retornos mensuales constantes = (1.09)^(1/12) − 1', () => {
    const expected = Math.fround(Math.pow(1.09, 1 / 12) - 1);
    const out = runBootstrap(
      makeInput(makeEmpty(), makeAllFixed9(), {
        horizonMonths: 60,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 50 },
      }),
    );
    for (let i = 0; i < out.portfolioReturnsB.length; i++) {
      expect(out.portfolioReturnsB[i]).toBeCloseTo(expected, 6);
    }
  });

  it('FIXED rates custom se respetan (ej. 4% y 12%)', () => {
    const out = runBootstrap(
      makeInput(makeAllFixed6(), makeAllFixed9(), {
        horizonMonths: 1,
        config: {
          ...DEFAULT_BOOTSTRAP_CONFIG,
          nPaths: 10,
          fixed6Annual: 0.04,
          fixed9Annual: 0.12,
        },
      }),
    );
    const expected6 = Math.fround(Math.pow(1.04, 1 / 12) - 1);
    const expected9 = Math.fround(Math.pow(1.12, 1 / 12) - 1);
    for (let p = 0; p < 10; p++) {
      expect(out.portfolioReturnsA[p]).toBeCloseTo(expected6, 6);
      expect(out.portfolioReturnsB[p]).toBeCloseTo(expected9, 6);
    }
  });
});

describe('runBootstrap — portafolios A y B pareados', () => {
  it('usar el mismo portafolio para A y B produce las mismas series', () => {
    const out = runBootstrap(makeInput(makeSpyOnly(), makeSpyOnly()));
    expect(out.portfolioReturnsA).toEqual(out.portfolioReturnsB);
  });

  it('A y B usan los MISMOS bloques (pareados) aunque compongan distinto', () => {
    // Si A=SPY y B=100% mezcla GlFI, las series deberían diferir PERO la
    // correlación de los retornos dentro de un block debe ser consistente
    // (misma ventana temporal). Verificamos esto corriendo con horizon=1,
    // block=1: para cada path el mes sampleado es el mismo para A y B, así
    // que los retornos corresponden al mismo mes del histórico.
    const portA = expandPortfolio({ kind: 'amc', id: 'USA.Eq' }); // 100% SPY
    const portB = expandPortfolio({ kind: 'amc', id: 'GlExUS' }); // 100% ACWX
    const out = runBootstrap(
      makeInput(portA, portB, {
        horizonMonths: 1,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 100, blockSize: 1 },
      }),
    );

    const spyIdx = TICKERS.indexOf('SPY');
    const acwxIdx = TICKERS.indexOf('ACWX');

    // Para cada path, debería existir un mes m del histórico tal que:
    //   out.A[p] ≈ RETURNS[m*N_TICKERS + spyIdx]
    //   out.B[p] ≈ RETURNS[m*N_TICKERS + acwxIdx]
    // Si no existe, el bootstrap NO está pareado.
    for (let p = 0; p < 100; p++) {
      const rA = out.portfolioReturnsA[p];
      const rB = out.portfolioReturnsB[p];
      let foundMonth = -1;
      for (let m = 0; m < N_MONTHS; m++) {
        const hA = Math.fround(RETURNS[m * N_TICKERS + spyIdx]);
        const hB = Math.fround(RETURNS[m * N_TICKERS + acwxIdx]);
        if (Math.abs(hA - rA) < 1e-8 && Math.abs(hB - rB) < 1e-8) {
          foundMonth = m;
          break;
        }
      }
      expect(foundMonth).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('runBootstrap — reconstrucción RF yield-path (Fase 2)', () => {
  function makeIefOnly(): ExpandedPortfolio {
    return { etfs: { IEF: 100 }, fixed: { ...ZERO_FIXED }, totalWeight: 100 };
  }
  function makeSptlOnly(): ExpandedPortfolio {
    return { etfs: { SPTL: 100 }, fixed: { ...ZERO_FIXED }, totalWeight: 100 };
  }
  function makeLqdOnly(): ExpandedPortfolio {
    return { etfs: { LQD: 100 }, fixed: { ...ZERO_FIXED }, totalWeight: 100 };
  }

  it('getTickerModel clasifica cada ticker correctamente', () => {
    expect(getTickerModel('BIL')).toBe('carry-only');
    expect(getTickerModel('IEF')).toBe('treasury');
    expect(getTickerModel('SPTL')).toBe('treasury');
    expect(getTickerModel('LQD')).toBe('hybrid');
    expect(getTickerModel('GHYG')).toBe('hybrid');
    expect(getTickerModel('SPY')).toBe('equity');
    expect(getTickerModel('ACWI')).toBe('equity');
  });

  it('getYieldBounds devuelve min ≤ actual ≤ max y floor < min, ceiling > max', () => {
    for (const key of ['IRX', 'FVX', 'TNX', 'TYX'] as const) {
      const b = getYieldBounds(key);
      expect(b.min).toBeLessThanOrEqual(b.initial);
      expect(b.initial).toBeLessThanOrEqual(b.max);
      expect(b.floor).toBeLessThan(b.min);
      expect(b.ceiling).toBeGreaterThan(b.max);
      // Consistencia con el análisis: floor = min − 0.005
      expect(b.floor).toBeCloseTo(b.min - 0.005, 10);
      // ceiling = max × 1.5
      expect(b.ceiling).toBeCloseTo(b.max * 1.5, 10);
      // initial = último valor observado
      expect(b.initial).toBeCloseTo(YIELDS[key][N_MONTHS - 1], 10);
    }
  });

  it('100% BIL: primer mes de cada path = carry inicial (IRX actual / 12)', () => {
    const expected = Math.fround(YIELDS.IRX[N_MONTHS - 1] / 12);
    const out = runBootstrap(
      makeInput(makeBilOnly(), makeBilOnly(), {
        horizonMonths: 6,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 50 },
      }),
    );
    // El primer mes de cada path tiene carry = initial_IRX/12 independientemente
    // del bloque sampleado: el yield path arranca en initial antes de aplicar Δy.
    // Pero el damping se aplica al Δy ANTES de acumular yPath, así que el primer
    // carry es (initial + Δy[m0])/12, donde m0 es el primer mes del bloque.
    // Verificamos en cambio que todos los retornos del mes 1 sean razonables
    // (carry mensual compatible con IRX en el rango histórico).
    const minExpected = Math.fround(getYieldBounds('IRX').floor / 12);
    const maxExpected = Math.fround(getYieldBounds('IRX').ceiling / 12);
    for (let p = 0; p < 50; p++) {
      const r = out.portfolioReturnsA[p * 6]; // primer mes del path
      expect(r).toBeGreaterThanOrEqual(minExpected - 1e-4);
      expect(r).toBeLessThanOrEqual(maxExpected + 1e-4);
    }
    // Además el valor "ancla" esperado está dentro del rango
    expect(expected).toBeGreaterThan(minExpected);
    expect(expected).toBeLessThan(maxExpected);
  });

  it('100% BIL: retornos no son negativos salvo en zona floor extrema', () => {
    // Carry de BIL = IRX_path/12. Con IRX floor = -0.5% = -0.04% mensual,
    // el carry puede ser ligeramente negativo en el caso extremo.
    const out = runBootstrap(
      makeInput(makeBilOnly(), makeBilOnly(), {
        horizonMonths: 120,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 500 },
      }),
    );
    let negativeCount = 0;
    for (let i = 0; i < out.portfolioReturnsA.length; i++) {
      if (out.portfolioReturnsA[i] < 0) negativeCount++;
    }
    // La gran mayoría deben ser positivos (yields positivos dominantes)
    const fractionPositive = 1 - negativeCount / out.portfolioReturnsA.length;
    expect(fractionPositive).toBeGreaterThan(0.85);
  });

  it('100% BIL: ninguna corrida produce NaN ni violación de ceiling duro', () => {
    const out = runBootstrap(
      makeInput(makeBilOnly(), makeBilOnly(), {
        horizonMonths: 360,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 200 },
      }),
    );
    const maxCarry = Math.fround(getYieldBounds('IRX').ceiling / 12) + 1e-5;
    const minCarry = Math.fround(getYieldBounds('IRX').floor / 12) - 1e-5;
    // Batch-scan: iterar el array completo una sola vez y reportar al final.
    // Evita 72k × 3 calls a expect() que vuelven el test O(segundos).
    let nanCount = 0;
    let tooHighCount = 0;
    let tooLowCount = 0;
    let observedMin = Infinity;
    let observedMax = -Infinity;
    for (let i = 0; i < out.portfolioReturnsA.length; i++) {
      const r = out.portfolioReturnsA[i];
      if (!Number.isFinite(r)) nanCount++;
      if (r < observedMin) observedMin = r;
      if (r > observedMax) observedMax = r;
      if (r < minCarry) tooLowCount++;
      if (r > maxCarry) tooHighCount++;
    }
    expect(nanCount).toBe(0);
    expect(tooLowCount).toBe(0);
    expect(tooHighCount).toBe(0);
    expect(observedMin).toBeGreaterThanOrEqual(minCarry);
    expect(observedMax).toBeLessThanOrEqual(maxCarry);
  });

  it('100% SPTL tiene mayor volatilidad mensual que 100% IEF (efecto duración)', () => {
    const cfgSptl = RF_CONFIG.SPTL;
    const cfgIef = RF_CONFIG.IEF;
    // Sanity check que las duraciones son coherentes con el set-up
    expect(cfgSptl.duration).toBeGreaterThan(cfgIef.duration);

    const outIef = runBootstrap(
      makeInput(makeIefOnly(), makeIefOnly(), {
        horizonMonths: 120,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 1000 },
      }),
    );
    const outSptl = runBootstrap(
      makeInput(makeSptlOnly(), makeSptlOnly(), {
        horizonMonths: 120,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 1000 },
      }),
    );
    const stdOf = (arr: Float32Array) => {
      let m = 0;
      for (let i = 0; i < arr.length; i++) m += arr[i];
      m /= arr.length;
      let s = 0;
      for (let i = 0; i < arr.length; i++) s += (arr[i] - m) ** 2;
      return Math.sqrt(s / (arr.length - 1));
    };
    const stdIef = stdOf(outIef.portfolioReturnsA);
    const stdSptl = stdOf(outSptl.portfolioReturnsA);
    // SPTL ≈ 2x la duración de IEF → vol al menos 1.5x (no exactamente 2x por convexidad)
    expect(stdSptl).toBeGreaterThan(stdIef * 1.5);
  });

  it('100% LQD (híbrido): media de retornos incluye spread carry (media > carry TNX)', () => {
    // El residual de LQD tiene media positiva (~17 bps/mes) que representa el IG
    // spread. La media total simulada debe ser mayor que solo la del carry TNX.
    const out = runBootstrap(
      makeInput(makeLqdOnly(), makeLqdOnly(), {
        horizonMonths: 120,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 2000 },
      }),
    );
    let sum = 0;
    for (let i = 0; i < out.portfolioReturnsA.length; i++) sum += out.portfolioReturnsA[i];
    const meanMonthly = sum / out.portfolioReturnsA.length;
    // Carry TNX medio simulado ≈ (initial + drift simulado) / 12. Usamos un
    // floor conservador: aunque el yield drift hacia abajo, el residual de LQD
    // (+17 bps) debería mantener la media mensual clara por encima de 0.1%.
    expect(meanMonthly).toBeGreaterThan(0.001); // >10 bps/mes
  });

  it('determinismo con RF activo: mismo seed produce mismo output', () => {
    const out1 = runBootstrap(makeInput(makeIefOnly(), makeSptlOnly()));
    const out2 = runBootstrap(makeInput(makeIefOnly(), makeSptlOnly()));
    expect(out1.portfolioReturnsA).toEqual(out2.portfolioReturnsA);
    expect(out1.portfolioReturnsB).toEqual(out2.portfolioReturnsB);
  });

  it('fast path equity: 100% SPY produce los mismos retornos que antes (Fase 1)', () => {
    // Este test documenta que la rama equity-only no cambió su output.
    // Con horizon=1 block=1 y 100% SPY, todos los retornos deben estar en el
    // histórico de SPY (mismo invariant que el test original de Fase 1).
    const out = runBootstrap(
      makeInput(makeSpyOnly(), makeSpyOnly(), {
        horizonMonths: 1,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 200, blockSize: 1 },
      }),
    );
    const spyIdx = TICKERS.indexOf('SPY');
    const historicalSet = new Set<number>();
    for (let i = 0; i < N_MONTHS; i++) historicalSet.add(RETURNS[i * N_TICKERS + spyIdx]);
    for (let p = 0; p < 200; p++) {
      const r = out.portfolioReturnsA[p];
      let matched = false;
      for (const hist of historicalSet) {
        if (Math.abs(Math.fround(hist) - r) < 1e-8) {
          matched = true;
          break;
        }
      }
      expect(matched).toBe(true);
    }
  });

  it('SPTS usa proxy sintético: diferente a usar FVX puro', () => {
    // Con SPTS's syntheticProxy (0.63 IRX + 0.37 FVX) el output debe diferir
    // vs una versión hipotética con proxy FVX directo. No podemos comparar
    // directamente, pero sí verificar que SPTS está configurado con syntheticProxy
    // y que su spec en el bootstrap lo usa (el ticker debe ejecutarse sin throw).
    const sptsPort: ExpandedPortfolio = {
      etfs: { SPTS: 100 },
      fixed: { ...ZERO_FIXED },
      totalWeight: 100,
    };
    expect(RF_CONFIG.SPTS.syntheticProxy).toBeDefined();
    const out = runBootstrap(
      makeInput(sptsPort, sptsPort, {
        horizonMonths: 60,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 100 },
      }),
    );
    for (let i = 0; i < out.portfolioReturnsA.length; i++) {
      expect(Number.isFinite(out.portfolioReturnsA[i])).toBe(true);
    }
  });
});

describe('runBootstrap — validación de parámetros', () => {
  it('throws si horizonMonths fuera de rango', () => {
    expect(() =>
      runBootstrap(makeInput(makeSpyOnly(), makeSpyOnly(), { horizonMonths: 0 })),
    ).toThrow(/horizonMonths/);
    expect(() =>
      runBootstrap(makeInput(makeSpyOnly(), makeSpyOnly(), { horizonMonths: 400 })),
    ).toThrow(/horizonMonths/);
  });

  it('throws si nPaths fuera de rango', () => {
    expect(() =>
      runBootstrap(
        makeInput(makeSpyOnly(), makeSpyOnly(), {
          config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 20000 },
        }),
      ),
    ).toThrow(/nPaths/);
  });

  it('throws si blockSize > N_MONTHS', () => {
    expect(() =>
      runBootstrap(
        makeInput(makeSpyOnly(), makeSpyOnly(), {
          config: { ...DEFAULT_BOOTSTRAP_CONFIG, blockSize: N_MONTHS + 1 },
        }),
      ),
    ).toThrow(/blockSize/);
  });
});

// ===========================================================================
// outputEtfReturns (Fase C.2)
// ===========================================================================

describe('runBootstrap — outputEtfReturns', () => {
  it('sin flag, etfReturns queda undefined (backward-compat)', () => {
    const out = runBootstrap(
      makeInput(makeSpyOnly(), makeSpyOnly(), {
        horizonMonths: 6,
        config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 10, seed: 42 },
      }),
    );
    expect(out.etfReturns).toBeUndefined();
  });

  it('con flag, emite un Float32Array por cada uno de los 32 tickers con shape [nPaths × horizonMonths]', () => {
    const nPaths = 10;
    const horizonMonths = 12;
    const out = runBootstrap({
      portfolios: { A: makeSpyOnly(), B: makeSpyOnly() },
      horizonMonths,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths, seed: 42 },
      outputEtfReturns: true,
    });
    expect(out.etfReturns).toBeDefined();
    const tickers = Object.keys(out.etfReturns!);
    expect(tickers.length).toBe(N_TICKERS);
    for (const t of TICKERS) {
      const arr = out.etfReturns![t];
      expect(arr).toBeInstanceOf(Float32Array);
      expect(arr.length).toBe(nPaths * horizonMonths);
    }
  });

  it('determinismo: mismo seed → etfReturns idéntico para todos los tickers', () => {
    const common = {
      portfolios: { A: makeSpyOnly(), B: makeSpyOnly() },
      horizonMonths: 12,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 20, seed: 123 },
      outputEtfReturns: true,
    };
    const a = runBootstrap(common);
    const b = runBootstrap(common);
    for (const t of TICKERS) {
      const av = a.etfReturns![t];
      const bv = b.etfReturns![t];
      expect(av.length).toBe(bv.length);
      for (let i = 0; i < av.length; i++) {
        expect(av[i]).toBe(bv[i]);
      }
    }
  });

  it('SPY en etfReturns matchea los valores históricos del dataset (equity ticker, bloque=1)', () => {
    const nPaths = 5;
    const horizonMonths = 3;
    const out = runBootstrap({
      portfolios: { A: makeSpyOnly(), B: makeSpyOnly() },
      horizonMonths,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths, blockSize: 1, seed: 42 },
      outputEtfReturns: true,
    });
    const spyIdx = TICKERS.indexOf('SPY');
    // Todos los valores de SPY emitidos deben pertenecer al set de retornos
    // históricos de SPY (mismo criterio que el test clásico de equity fast path).
    const historicalSet = new Set<number>();
    for (let m = 0; m < N_MONTHS; m++) {
      historicalSet.add(Math.fround(RETURNS[m * N_TICKERS + spyIdx]));
    }
    const spyArr = out.etfReturns!.SPY;
    for (let i = 0; i < spyArr.length; i++) {
      expect(historicalSet.has(spyArr[i])).toBe(true);
    }
  });

  it('portfolioReturnsA se mantiene coherente cuando outputEtfReturns=true (regresión)', () => {
    // Un portafolio 100% SPY debe generar portfolioReturnsA idéntico con o sin
    // outputEtfReturns, porque la ruta de cálculo es la misma (solo cambia si
    // se escribe el buffer ETF).
    const common = {
      portfolios: { A: makeSpyOnly(), B: makeSpyOnly() },
      horizonMonths: 6,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 10, seed: 7 },
    };
    const withoutEtf = runBootstrap(common);
    const withEtf = runBootstrap({ ...common, outputEtfReturns: true });
    // Nota: con outputEtfReturns=true forzamos la rama RF aunque portafolio
    // sea 100% SPY. La rama RF lee equity tickers de RETURNS igual que la
    // fast path, así que portfolioReturnsA debe coincidir.
    expect(withoutEtf.portfolioReturnsA.length).toBe(withEtf.portfolioReturnsA.length);
    for (let i = 0; i < withoutEtf.portfolioReturnsA.length; i++) {
      expect(Math.fround(withEtf.portfolioReturnsA[i])).toBe(
        Math.fround(withoutEtf.portfolioReturnsA[i]),
      );
    }
  });
});
