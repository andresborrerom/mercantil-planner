/**
 * Tipos núcleo del dominio — Mercantil Planner.
 *
 * Convenciones:
 *   - Pesos en porcentaje (0..100), no fracción. Normalización en helpers.
 *   - "Ticker" viene del archivo generado src/data/market.generated.ts.
 *   - BuildingBlock son las piezas atómicas con las que se componen los AMCs
 *     (un subset del universo de ETFs + dos retornos determinísticos FIXED).
 *   - AMC = Asset Management Category. Un AMC se expande a pesos de
 *     BuildingBlock. Hay 10 AMCs: 7 existentes (con FIXED embebido) + 3
 *     propuestos (sin FIXED).
 *   - Signature = mezcla predefinida de AMCs (Conservador / Balanceado / Crecimiento).
 *   - Custom = mezcla arbitraria de AMCs definida por el asesor.
 *
 * Referencias: INSTRUCCIONES-PLANNER.md §8 (AMCs), §5 (flows), §6 (métricas).
 */

import type { Ticker } from '../data/market.generated';

// ---------------------------------------------------------------------------
// BuildingBlocks (piezas atómicas de composición)
// ---------------------------------------------------------------------------

/**
 * IDs de building blocks. Son los que aparecen en la tabla del §8 y en los
 * AMCs propuestos. Algunos se mapean a un ETF real; FIXED6/FIXED9 son
 * retornos determinísticos y NO son ETFs.
 */
export const BUILDING_BLOCK_IDS = [
  // Cash / Treasuries
  'MM',
  'UST13',
  'UST37',
  'UST710',
  'UST10P',
  // Renta fija desarrollada / IG / HY
  'DMG7',
  'IG',
  'HY',
  'AGG',
  // Renta fija emergente
  'EMDBT',
  'EMCRP',
  // Equity global agregado
  'EQGLB',
  'EQUS',
  'EQEU',
  'EQJP',
  'EQDM',
  'EQEM',
  'EQXUS',
  // Estilo / factor
  'SMCAP',
  'VAL',
  'GRW',
  'STECH',
  // Sectores globales
  'SFIN',
  'SDISC',
  'SINDU',
  'SHLT',
  'SCOMM',
  'SSTAP',
  'SMAT',
  'SENR',
  'SRLE',
  'SUTIL',
  // Retornos determinísticos (NO son ETFs)
  'FIXED6',
  'FIXED9',
] as const;

export type BuildingBlockId = (typeof BUILDING_BLOCK_IDS)[number];

/** Subconjunto de building blocks que NO son ETFs (retornos determinísticos). */
export const FIXED_BLOCK_IDS = ['FIXED6', 'FIXED9'] as const;
export type FixedBlockId = (typeof FIXED_BLOCK_IDS)[number];

/** Subconjunto de building blocks que sí mapean a un ETF real. */
export type EtfBlockId = Exclude<BuildingBlockId, FixedBlockId>;

// ---------------------------------------------------------------------------
// AMCs
// ---------------------------------------------------------------------------

/** Los 10 AMCs disponibles para construir portafolios (7 existentes + 3 propuestos). */
export const AMC_IDS = [
  // Existentes (con FIXED embebido)
  'GlFI',
  'RF.Lat',
  'ST.Cr.Opps',
  'HY.Cr.Opps',
  'USA.Eq',
  'GlExUS',
  'GlSec.Eq',
  // Propuestos (sin FIXED)
  'CashST',
  'USGrTech',
  'USTDur',
  'CDT-Proxy',
] as const;

export type AmcId = (typeof AMC_IDS)[number];

/** Composición de un AMC: pesos por building block, deben sumar 100. */
export type AmcComposition = Partial<Record<BuildingBlockId, number>>;

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export const SIGNATURE_IDS = ['Conservador', 'Balanceado', 'Crecimiento'] as const;
export type SignatureId = (typeof SIGNATURE_IDS)[number];

/** Composición de una signature: pesos por AMC, deben sumar 100. */
export type SignatureComposition = Partial<Record<AmcId, number>>;

// ---------------------------------------------------------------------------
// PortfolioSpec (lo que el usuario configura en la UI)
// ---------------------------------------------------------------------------

export type PortfolioSpec =
  | { kind: 'signature'; id: SignatureId }
  | { kind: 'amc'; id: AmcId }
  | { kind: 'custom'; label: string; weights: Partial<Record<AmcId, number>> };

/**
 * Resultado de expandir un PortfolioSpec a lo que realmente vive en los
 * Float32Array del worker:
 *   - etfs: pesos por ticker real (0..100). La suma puede ser < 100 si hay FIXED.
 *   - fixed: pesos de FIXED6 y FIXED9 (0..100). Siempre presentes aunque sean 0.
 *   - totalWeight: debe ser ~100 tras expandir correctamente.
 */
export type ExpandedPortfolio = {
  etfs: Partial<Record<Ticker, number>>;
  fixed: Record<FixedBlockId, number>;
  totalWeight: number;
};

// ---------------------------------------------------------------------------
// Flujos (§5)
// ---------------------------------------------------------------------------

export type FlowSign = 'deposit' | 'withdraw';
export type FlowFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export type FlowRule = {
  id: string;
  label: string;
  sign: FlowSign;
  amount: number; // USD, nominal o real según PlanSpec.mode
  frequency: FlowFrequency;
  startMonth: number; // 1-indexed dentro del horizonte
  endMonth: number | null; // null = hasta el final del horizonte
  growthPct: number; // crecimiento anual del monto (0 = fijo)
};

export type PlanMode = 'nominal' | 'real';

export type PlanSpec = {
  initialCapital: number;
  horizonMonths: number; // 1..360
  mode: PlanMode;
  inflationPct: number; // default 2.5
  rules: FlowRule[];
};

// ---------------------------------------------------------------------------
// Configuración del motor de bootstrap (§4)
// ---------------------------------------------------------------------------

export type BootstrapConfig = {
  seed: number; // default 42
  nPaths: number; // default 5000, max 10000
  blockSize: number; // default 12
  fixed6Annual: number; // default 0.06
  fixed9Annual: number; // default 0.09
};

// ---------------------------------------------------------------------------
// SimulationResult (lo que devuelve el worker + postproceso de flujos)
// ---------------------------------------------------------------------------

/**
 * Resultado de una simulación para UN portafolio sobre N paths × H meses.
 *
 * - portfolioReturns: retornos mensuales del portafolio (ya look-through-eado
 *   a ETFs y ponderado), flat row-major [nPaths × horizonMonths].
 * - values: trayectoria patrimonial aplicando flujos y ruina, flat row-major
 *   [nPaths × (horizonMonths + 1)] (incluye V[0] = capital inicial).
 * - ruined: Uint8Array de nPaths elementos (1 = path ruinó antes del final).
 * - netContributions: aportes menos retiros acumulados por mes (determinístico),
 *   length = horizonMonths + 1.
 */
export type SimulationResult = {
  nPaths: number;
  horizonMonths: number;
  portfolioReturns: Float32Array;
  values: Float32Array;
  ruined: Uint8Array;
  netContributions: Float32Array;
};
