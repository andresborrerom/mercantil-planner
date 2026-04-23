/**
 * Definiciones hardcoded de AMCs, Signatures y mapeo BuildingBlock → ETF
 * según INSTRUCCIONES-PLANNER.md §8.
 *
 * IMPORTANTE: este archivo es la fuente de verdad de la composición de los
 * portafolios. NO leer el .py del otro proyecto — replicar acá, a mano.
 *
 * Regla de dilución: usamos composición **no diluida** (como están hoy).
 * La dilución por AUM inflows es responsabilidad del otro proyecto.
 */

import type { Ticker } from '../data/market.generated';
import {
  AMC_IDS,
  SIGNATURE_IDS,
  type AmcComposition,
  type AmcId,
  type BuildingBlockId,
  type EtfBlockId,
  type ExpandedPortfolio,
  type FixedBlockId,
  type PortfolioSpec,
  type SignatureComposition,
  type SignatureId,
} from './types';

// ---------------------------------------------------------------------------
// Mapeo BuildingBlock (ETF) → Ticker
// ---------------------------------------------------------------------------

/**
 * Tickers ETF correspondientes a cada building block que NO es FIXED.
 * FIXED6 y FIXED9 se manejan aparte en el worker (retornos determinísticos).
 */
export const BLOCK_TO_TICKER: Record<EtfBlockId, Ticker> = {
  MM: 'BIL',
  UST13: 'SPTS',
  UST37: 'IEI',
  UST710: 'IEF',
  UST10P: 'SPTL',
  DMG7: 'IGOV',
  IG: 'LQD',
  HY: 'GHYG',
  EMDBT: 'EMB',
  EMCRP: 'CEMB',
  AGG: 'AGG',
  EQGLB: 'ACWI',
  EQUS: 'SPY',
  EQEU: 'EZU',
  EQJP: 'EWJ',
  EQDM: 'URTH',
  EQEM: 'EEM',
  EQXUS: 'ACWX',
  SMCAP: 'IJR',
  VAL: 'IWD',
  GRW: 'IWF',
  STECH: 'IXN',
  SFIN: 'IXG',
  SDISC: 'RXI',
  SINDU: 'EXI',
  SHLT: 'IXJ',
  SCOMM: 'IXP',
  SSTAP: 'KXI',
  SMAT: 'MXI',
  SENR: 'IXC',
  SRLE: 'RWO',
  SUTIL: 'JXI',
};

// ---------------------------------------------------------------------------
// Composiciones de AMCs (pesos en % sobre building blocks)
// ---------------------------------------------------------------------------

/**
 * AMCs existentes — con FIXED embebido. Cada fila suma 100.
 * Fuente: tabla del §8 de INSTRUCCIONES-PLANNER.md.
 */
const AMC_COMPOSITIONS_EXISTING: Record<
  'GlFI' | 'RF.Lat' | 'ST.Cr.Opps' | 'HY.Cr.Opps' | 'USA.Eq' | 'GlExUS' | 'GlSec.Eq',
  AmcComposition
> = {
  GlFI: { UST13: 10, DMG7: 25, IG: 35, HY: 10, FIXED6: 20 },
  'RF.Lat': { HY: 60, EMDBT: 20, FIXED9: 20 },
  'ST.Cr.Opps': { HY: 30, EMDBT: 20, FIXED9: 50 },
  'HY.Cr.Opps': { HY: 40, FIXED9: 60 },
  'USA.Eq': { EQUS: 100 },
  GlExUS: { EQXUS: 100 },
  'GlSec.Eq': { EQGLB: 100 },
};

/**
 * AMCs propuestos. Los tres primeros son sin FIXED; CDT-Proxy lleva FIXED6 de
 * forma explícita para replicar el comportamiento de un CDT a 1 año renovado.
 */
const AMC_COMPOSITIONS_PROPOSED: Record<
  'CashST' | 'USGrTech' | 'USTDur' | 'CDT-Proxy',
  AmcComposition
> = {
  CashST: { MM: 60, UST13: 40 },
  USGrTech: { GRW: 60, STECH: 40 },
  USTDur: { UST37: 50, UST710: 50 },
  // CDT-Proxy = 50% CashST + 50% FIXED6 expandido.
  //   50% CashST  →  50% × (60% MM + 40% UST13)  =  30% MM + 20% UST13
  //   50% FIXED6
  // Pensado para representar el cliente típico que renueva un CDT a 1 año:
  // la mitad comportándose como cash (corto plazo, tasa de money market) y
  // la mitad como el CDT propiamente (FIXED determinístico al 6% nominal
  // anual). Volatilidad esperada < 2% anual, retorno esperado ~5,5% nominal.
  'CDT-Proxy': { MM: 30, UST13: 20, FIXED6: 50 },
};

export const AMC_COMPOSITIONS: Record<AmcId, AmcComposition> = {
  ...AMC_COMPOSITIONS_EXISTING,
  ...AMC_COMPOSITIONS_PROPOSED,
};

// ---------------------------------------------------------------------------
// Signatures (pesos en % sobre AMCs)
// ---------------------------------------------------------------------------

export const SIGNATURE_COMPOSITIONS: Record<SignatureId, SignatureComposition> = {
  Conservador: {
    GlFI: 55,
    'RF.Lat': 37,
    'GlSec.Eq': 8,
  },
  Balanceado: {
    GlFI: 25,
    'RF.Lat': 25,
    'USA.Eq': 10,
    GlExUS: 10,
    'GlSec.Eq': 25,
    'HY.Cr.Opps': 5,
  },
  Crecimiento: {
    GlFI: 5,
    'RF.Lat': 5,
    'USA.Eq': 15,
    GlExUS: 15,
    'GlSec.Eq': 55,
    'HY.Cr.Opps': 5,
  },
};

// ---------------------------------------------------------------------------
// Metadata de presentación (para la UI)
// ---------------------------------------------------------------------------

export const AMC_LABELS: Record<AmcId, string> = {
  GlFI: 'Global Fixed Income',
  'RF.Lat': 'Renta Fija Latam',
  'ST.Cr.Opps': 'Short-Term Credit Opportunities',
  'HY.Cr.Opps': 'High Yield Credit Opportunities',
  'USA.Eq': 'USA Equity',
  GlExUS: 'Global ex-US Equity',
  'GlSec.Eq': 'Global Sector Equity',
  CashST: 'Cash & Short-Term Treasuries',
  USGrTech: 'US Growth & Tech',
  USTDur: 'US Treasuries Medium Duration',
  'CDT-Proxy': 'CDT Proxy (Cash + FIXED 6%)',
};

export const AMC_TIER: Record<AmcId, 'existing' | 'proposed'> = {
  GlFI: 'existing',
  'RF.Lat': 'existing',
  'ST.Cr.Opps': 'existing',
  'HY.Cr.Opps': 'existing',
  'USA.Eq': 'existing',
  GlExUS: 'existing',
  'GlSec.Eq': 'existing',
  CashST: 'proposed',
  USGrTech: 'proposed',
  USTDur: 'proposed',
  'CDT-Proxy': 'proposed',
};

export const SIGNATURE_LABELS: Record<SignatureId, string> = {
  Conservador: 'Conservador',
  Balanceado: 'Balanceado',
  Crecimiento: 'Crecimiento',
};

// ---------------------------------------------------------------------------
// Validaciones de consistencia (se corren en tests — NO en runtime por costo)
// ---------------------------------------------------------------------------

const SUM_TOLERANCE = 1e-9;

/**
 * Verifica que un Partial<Record<K, number>> suma (aprox) al target.
 * Retorna la suma efectiva.
 */
export function sumWeights<K extends string>(
  weights: Partial<Record<K, number>>,
): number {
  let total = 0;
  for (const k of Object.keys(weights) as K[]) {
    const w = weights[k];
    if (typeof w === 'number' && Number.isFinite(w)) total += w;
  }
  return total;
}

/**
 * Normaliza un Partial<Record<K, number>> a que sume `target` (default 100).
 * Si la suma actual es 0 o NaN, retorna un Record vacío (no divide por cero).
 */
export function normalizeWeights<K extends string>(
  weights: Partial<Record<K, number>>,
  target = 100,
): Partial<Record<K, number>> {
  const current = sumWeights(weights);
  if (!Number.isFinite(current) || current === 0) return {};
  const factor = target / current;
  const out: Partial<Record<K, number>> = {};
  for (const k of Object.keys(weights) as K[]) {
    const w = weights[k];
    if (typeof w === 'number' && Number.isFinite(w)) {
      out[k] = w * factor;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Look-through: PortfolioSpec → pesos finales en ETFs + FIXED
// ---------------------------------------------------------------------------

/**
 * Expande pesos a nivel AMC (lo que hay dentro de una signature o un custom mix)
 * a pesos a nivel ETF + FIXED. Maneja la recursión: cada AMC se expande a
 * building blocks, que a su vez son ETFs o FIXED.
 */
function expandAmcWeights(amcWeights: Partial<Record<AmcId, number>>): ExpandedPortfolio {
  const etfs: Partial<Record<Ticker, number>> = {};
  const fixed: Record<FixedBlockId, number> = { FIXED6: 0, FIXED9: 0 };
  let totalWeight = 0;

  for (const amcId of Object.keys(amcWeights) as AmcId[]) {
    const amcWeight = amcWeights[amcId];
    if (typeof amcWeight !== 'number' || !Number.isFinite(amcWeight) || amcWeight === 0) {
      continue;
    }

    const comp = AMC_COMPOSITIONS[amcId];
    // Los building blocks del AMC suman 100; amcWeight es el peso del AMC dentro
    // del portafolio (también en escala 0..100). El peso efectivo del building
    // block en el portafolio es (amcWeight/100) * (blockWeight). No dividimos
    // por 100 al final — mantenemos todo en escala 0..100 hasta cerrar.
    for (const blockId of Object.keys(comp) as BuildingBlockId[]) {
      const blockWeight = comp[blockId];
      if (typeof blockWeight !== 'number' || blockWeight === 0) continue;

      const effective = (amcWeight * blockWeight) / 100;
      totalWeight += effective;

      if (blockId === 'FIXED6' || blockId === 'FIXED9') {
        fixed[blockId] += effective;
      } else {
        const ticker = BLOCK_TO_TICKER[blockId as EtfBlockId];
        etfs[ticker] = (etfs[ticker] ?? 0) + effective;
      }
    }
  }

  return { etfs, fixed, totalWeight };
}

/**
 * Expande un PortfolioSpec a su look-through final en ETFs + FIXED.
 *
 * Precondiciones:
 *   - Para 'signature' y 'amc', el spec se asume válido (el ID existe).
 *   - Para 'custom', los pesos NO necesitan sumar 100: la función expande
 *     tal cual viene. Si necesitas normalizar, llama `normalizeWeights` antes.
 *
 * Postcondiciones:
 *   - totalWeight ≈ suma de pesos del input. Para AMCs individuales y
 *     signatures bien definidas, totalWeight ≈ 100 ± 1e-9.
 */
export function expandPortfolio(spec: PortfolioSpec): ExpandedPortfolio {
  switch (spec.kind) {
    case 'signature': {
      const sig = SIGNATURE_COMPOSITIONS[spec.id];
      return expandAmcWeights(sig);
    }
    case 'amc': {
      return expandAmcWeights({ [spec.id]: 100 } as Partial<Record<AmcId, number>>);
    }
    case 'custom': {
      return expandAmcWeights(spec.weights);
    }
  }
}

/**
 * Porcentaje total de FIXED (FIXED6 + FIXED9) en un portafolio expandido.
 * Útil para la UI (spec §7: "donut colapsable + %FIXED calculado").
 */
export function fixedPercent(expanded: ExpandedPortfolio): number {
  return expanded.fixed.FIXED6 + expanded.fixed.FIXED9;
}

/**
 * Lista ordenada de (ticker, peso) para presentar en un donut o tabla.
 * Pesos en % (0..100). No incluye FIXED — esos se muestran aparte.
 */
export function etfWeightTable(expanded: ExpandedPortfolio): ReadonlyArray<{
  ticker: Ticker;
  weight: number;
}> {
  return Object.entries(expanded.etfs)
    .filter(([, w]) => typeof w === 'number' && w > 0)
    .map(([ticker, weight]) => ({ ticker: ticker as Ticker, weight: weight as number }))
    .sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------------------
// Helpers de validación internos (usados en tests)
// ---------------------------------------------------------------------------

/** True si un AMC individual suma 100 ± tol. */
export function isAmcValid(amcId: AmcId, tol = SUM_TOLERANCE): boolean {
  return Math.abs(sumWeights(AMC_COMPOSITIONS[amcId]) - 100) < tol;
}

/** True si una signature suma 100 ± tol. */
export function isSignatureValid(sigId: SignatureId, tol = SUM_TOLERANCE): boolean {
  return Math.abs(sumWeights(SIGNATURE_COMPOSITIONS[sigId]) - 100) < tol;
}

/** Re-exporta listas para consumo externo. */
export { AMC_IDS, SIGNATURE_IDS };
