/**
 * Configuración del motor RF yield-path (Fase 2).
 *
 * Parámetros calibrados empíricamente via `scripts/rf-analysis.ts` sobre el
 * dataset 2006-01 → 2026-04. Aprobados por Head of Quant Research (POCHO).
 *
 * Modelo por ticker:
 *   - carry-only:  r = y_proxy / 12                                          (BIL — price return ≈ ruido)
 *   - treasury:    r = y_proxy / 12 − D · Δy + ½ · C · (Δy)²                  (Treasuries puros)
 *   - hybrid:      r = y_proxy / 12 − D · Δy + ½ · C · (Δy)² + residual      (credit/otros)
 *
 * El residual es bootstrapeado del mismo bloque histórico → preserva
 * correlación rate-spread y cross-asset.
 *
 * Damping del yield path:
 *   - Por cada yield (IRX/FVX/TNX/TYX) calculamos piso y techo:
 *       y_floor   = y_min_hist − FLOOR_ADJUSTMENT
 *       y_ceiling = y_max_hist × CEILING_MULTIPLIER
 *   - Dentro del rango histórico: dinámica completa (scale = 1).
 *   - Fuera del rango: scale(x) = max(0, 1 − x^DAMPING_EXPONENT) donde
 *     x es la fracción normalizada dentro del buffer.
 *
 * Si se agregan meses nuevos al dataset con valores extremos (ej. yields
 * sobre el max histórico actual), re-correr `npm run analyze:rf` y revisar
 * estos parámetros antes de publicar.
 */

import type { RfTicker } from '../data/market.generated';

export type YieldKey = 'IRX' | 'FVX' | 'TNX' | 'TYX';

export type RfModelKind = 'carry-only' | 'treasury' | 'hybrid';

/** Pesos para proxy yield sintético (ej. SPTS ~ 2y interpolado entre IRX 3mo y FVX 5yr). */
export type SyntheticYieldWeights = Readonly<Record<YieldKey, number>>;

export interface RfTickerConfig {
  /** Tipo de modelo de reconstrucción. */
  readonly model: RfModelKind;
  /** Yield proxy principal. Si hay `syntheticProxy`, se usa esa combinación. */
  readonly proxyYield: YieldKey;
  /** Pesos de proxy sintético (opcional). Presente solo en SPTS. */
  readonly syntheticProxy?: SyntheticYieldWeights;
  /** Duración efectiva (años). Estimada por OLS sobre RF_DECOMP.price ~ Δy + Δy². */
  readonly duration: number;
  /** Convexidad (años²). 0 donde el término cuadrático es overfitting a spread noise. */
  readonly convexity: number;
}

/**
 * Calibraciones aprobadas (ver reporte de `npm run analyze:rf`).
 *
 * R² de referencia del Punto 3 del análisis:
 *   - Treasuries largos (IEI/IEF/SPTL): 0.94–0.97 — estructural domina.
 *   - SPTS / AGG: 0.32 / 0.69 — modelo útil.
 *   - BIL: 0.08 — price return es ruido, usamos carry-only.
 *   - LQD / IGOV / EMB / CEMB: 0.08–0.40 — rate es minoritario, residual domina.
 *   - GHYG: 0.03 — rate casi nulo, pero modelo híbrido mantiene consistencia.
 *
 * Convexity: preservada solo donde es físicamente significativa (IEI, IEF, SPTL).
 * En credit/hybrid se fija a 0 para evitar que el término Δy² capture variación
 * de spread (ej. GHYG la regresión estimaba C = -981 años², sin sentido físico).
 */
export const RF_CONFIG: Readonly<Record<RfTicker, RfTickerConfig>> = {
  // Treasuries puros
  BIL: {
    model: 'carry-only',
    proxyYield: 'IRX',
    duration: 0,
    convexity: 0,
  },
  SPTS: {
    model: 'treasury',
    proxyYield: 'FVX', // valor nominal; syntheticProxy tiene prioridad
    syntheticProxy: { IRX: 0.63, FVX: 0.37, TNX: 0, TYX: 0 },
    duration: 2.38,
    convexity: 0,
  },
  IEI: {
    model: 'treasury',
    proxyYield: 'FVX',
    duration: 4.39,
    convexity: -24.59,
  },
  IEF: {
    model: 'treasury',
    proxyYield: 'TNX',
    duration: 7.55,
    convexity: -5.95,
  },
  SPTL: {
    model: 'treasury',
    proxyYield: 'TYX',
    duration: 15.09,
    convexity: 265.95,
  },
  // Credit / otros — C=0 (overfitting control)
  IGOV: {
    model: 'hybrid',
    proxyYield: 'TNX',
    duration: 5.43,
    convexity: 0,
  },
  AGG: {
    model: 'hybrid',
    proxyYield: 'FVX',
    duration: 4.34,
    convexity: 0,
  },
  LQD: {
    model: 'hybrid',
    proxyYield: 'TNX',
    duration: 6.06,
    convexity: 0,
  },
  GHYG: {
    model: 'hybrid',
    proxyYield: 'FVX',
    duration: 0.53,
    convexity: 0,
  },
  EMB: {
    model: 'hybrid',
    proxyYield: 'TNX',
    duration: 5.51,
    convexity: 0,
  },
  CEMB: {
    model: 'hybrid',
    proxyYield: 'FVX',
    duration: 2.92,
    convexity: 0,
  },
};

/** Exponente del damping de velocidad. scale(x) = max(0, 1 − x^n). */
export const DAMPING_EXPONENT = 2;

/** Ajuste absoluto al piso: y_floor = y_min_hist − FLOOR_ADJUSTMENT. */
export const FLOOR_ADJUSTMENT = 0.005; // 0.5% absoluto

/** Multiplicador del techo: y_ceiling = y_max_hist × CEILING_MULTIPLIER. */
export const CEILING_MULTIPLIER = 1.5;

/** Orden canónico de las 4 yield series. Define el `proxyIdx` interno del bootstrap. */
export const YIELD_KEYS_ORDERED: readonly YieldKey[] = ['IRX', 'FVX', 'TNX', 'TYX'] as const;
