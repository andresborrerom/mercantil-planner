/**
 * Motor de flujos determinístico — aplica aportes/retiros a las trayectorias
 * patrimoniales generadas por el motor de bootstrap.
 *
 * Corre en main thread (es barato — O(nPaths × horizonMonths)). No usa RNG,
 * no depende del worker, no toca el DOM.
 *
 * Convención de índices:
 *   - El horizonte son H meses. Eventos en el tiempo t ∈ {0, 1, ..., H}.
 *   - `values` tiene tamaño (H + 1): values[0] = initialCapital, values[H] = valor al final.
 *   - `portfolioReturns` tiene tamaño H: retorno del mes t (t=1..H) está en el índice t-1.
 *   - `flowSchedule[i]` corresponde al flujo del mes (i+1). startMonth = 1 significa que
 *     la regla dispara primero en el mes 1 de la simulación.
 *
 * Recurrencia (§5):
 *   V[t] = V[t-1] · (1 + r_port[t]) + flow[t]
 *
 * Regla de ruina (§5):
 *   Si el flujo del mes t es un retiro (negativo) Y el saldo post-flujo llega
 *   a 0 o menos, el path se marca como ruinado desde ese mes en adelante.
 *   V[t..H] = 0. No se procesan más flujos para ese path.
 *
 * Modo real (§5):
 *   En `mode === 'real'`, los amounts de cada regla se interpretan como USD
 *   de hoy y se inflan a nominal con `(1 + inflationPct)^(t/12)` antes de aplicar.
 *
 * Growth anual (§5):
 *   `growthPct` compondea anualmente (NO mensualmente): el monto efectivo en
 *   el mes t de una regla con `startMonth = s` es
 *     amount · (1 + growthPct)^floor((t − s) / 12)
 */

import type { FlowFrequency, FlowRule, PlanSpec } from './types';

// ---------------------------------------------------------------------------
// Helpers puros
// ---------------------------------------------------------------------------

function frequencyToMonths(f: FlowFrequency): number {
  switch (f) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'semiannual':
      return 6;
    case 'annual':
      return 12;
  }
}

/**
 * Devuelve el factor de inflación para convertir un monto en "USD de hoy"
 * al equivalente nominal en el mes `t` (1-indexado).
 * Si `inflationPct = 0`, retorna 1 exacto.
 */
function inflationFactor(inflationPct: number, t: number): number {
  if (inflationPct === 0) return 1;
  return Math.pow(1 + inflationPct / 100, t / 12);
}

// ---------------------------------------------------------------------------
// Pre-cómputo del calendario de flujos (determinístico, independiente del path)
// ---------------------------------------------------------------------------

export type FlowScheduleBreakdown = {
  /** Flujo NETO por mes, en USD nominales. Size = horizonMonths. Índice i = mes (i+1). */
  schedule: Float32Array;
  /** Aportes brutos por mes (positivos). Size = horizonMonths. Útil para análisis. */
  deposits: Float32Array;
  /** Retiros brutos por mes (positivos, sin signo). Size = horizonMonths. */
  withdrawals: Float32Array;
};

/**
 * Construye el calendario de flujos para un plan dado. Puro, determinístico.
 * Las reglas se expanden individualmente y se suman en el arreglo final.
 */
export function buildFlowSchedule(plan: PlanSpec): FlowScheduleBreakdown {
  const H = plan.horizonMonths;
  const schedule = new Float32Array(H);
  const deposits = new Float32Array(H);
  const withdrawals = new Float32Array(H);
  const isReal = plan.mode === 'real';

  for (const rule of plan.rules) {
    expandRuleInto(rule, plan.inflationPct, isReal, H, schedule, deposits, withdrawals);
  }

  return { schedule, deposits, withdrawals };
}

function expandRuleInto(
  rule: FlowRule,
  inflationPct: number,
  isReal: boolean,
  horizonMonths: number,
  schedule: Float32Array,
  deposits: Float32Array,
  withdrawals: Float32Array,
): void {
  if (!Number.isFinite(rule.amount) || rule.amount === 0) return;

  const period = frequencyToMonths(rule.frequency);
  const sign = rule.sign === 'deposit' ? 1 : -1;
  const growth = rule.growthPct / 100;

  const start = Math.max(1, Math.floor(rule.startMonth));
  if (start > horizonMonths) return;

  const rawEnd = rule.endMonth ?? horizonMonths;
  const end = Math.min(rawEnd, horizonMonths);
  if (end < start) return;

  for (let t = start; t <= end; t += period) {
    // Años completos desde el startMonth (compounding anual, no mensual).
    const yearsSince = Math.floor((t - start) / 12);
    let amt = rule.amount;
    if (growth !== 0) amt *= Math.pow(1 + growth, yearsSince);
    if (isReal) amt *= inflationFactor(inflationPct, t);

    const idx = t - 1;
    const signed = sign * amt;
    schedule[idx] += signed;
    if (sign > 0) {
      deposits[idx] += amt;
    } else {
      withdrawals[idx] += amt;
    }
  }
}

// ---------------------------------------------------------------------------
// Aplicación path-por-path
// ---------------------------------------------------------------------------

export type FlowsInput = {
  plan: PlanSpec;
  /** Row-major [nPaths × horizonMonths]. */
  portfolioReturns: Float32Array;
  nPaths: number;
};

export type FlowsOutput = {
  /** Row-major [nPaths × (horizonMonths + 1)]. values[0] = initialCapital. */
  values: Float32Array;
  /** 1 si el path se ruinó antes o durante el horizonte. */
  ruined: Uint8Array;
  /** Determinístico: capital aportado neto por mes (incluye initialCapital). Size = H+1. */
  netContributions: Float32Array;
  /** Calendario de flujos mensuales usado para la simulación (útil para debug/UI). */
  flowSchedule: Float32Array;
};

/**
 * Corre la recurrencia `V[t] = V[t-1]·(1+r[t]) + flow[t]` path por path,
 * aplicando la regla de ruina del §5.
 *
 * Precisión: el estado interno `v` es Float64 para evitar acumular error
 * de Float32 a lo largo del horizonte. La escritura al output sí downcastea
 * a Float32 (consistente con el resto del data model).
 */
export function applyFlows(input: FlowsInput): FlowsOutput {
  const { plan, portfolioReturns, nPaths } = input;
  const H = plan.horizonMonths;

  if (nPaths < 1) {
    throw new Error(`applyFlows: nPaths debe ser ≥ 1, recibido ${nPaths}`);
  }
  if (portfolioReturns.length !== nPaths * H) {
    throw new Error(
      `applyFlows: portfolioReturns length ${portfolioReturns.length} ≠ nPaths·H ${nPaths * H}`,
    );
  }
  if (!Number.isFinite(plan.initialCapital)) {
    throw new Error(`applyFlows: initialCapital no es finito (${plan.initialCapital})`);
  }

  const { schedule: flowSchedule } = buildFlowSchedule(plan);

  // Capital aportado neto determinístico (igual para todos los paths).
  const netContributions = new Float32Array(H + 1);
  {
    let running = plan.initialCapital;
    netContributions[0] = running;
    for (let i = 0; i < H; i++) {
      running += flowSchedule[i];
      netContributions[i + 1] = running;
    }
  }

  const values = new Float32Array(nPaths * (H + 1));
  const ruined = new Uint8Array(nPaths);

  for (let p = 0; p < nPaths; p++) {
    const valOff = p * (H + 1);
    const retOff = p * H;
    let v = plan.initialCapital; // Float64 interno
    values[valOff] = v;
    let isRuined = false;

    for (let i = 0; i < H; i++) {
      if (isRuined) {
        values[valOff + i + 1] = 0;
        continue;
      }

      const r = portfolioReturns[retOff + i];
      const grown = v * (1 + r);
      const flow = flowSchedule[i];
      const tentative = grown + flow;

      // Clamp unificado: INVARIANTE V[t] ≥ 0 sin importar el signo del flujo.
      //
      // Ramas consideradas:
      //   (a) retiro (flow < 0) que lleva el saldo a 0 o menos → ruina por retiro.
      //   (b) sin retiro (flow ≥ 0) pero retorno catastrófico (r ≤ −1) o roundoff
      //       Float64 que deja `tentative` en un residuo negativo chiquito →
      //       igual marcamos ruina para mantener el invariante.
      //   (c) caso normal → V[t] = tentative (≥ 0).
      //
      // Mes 2026-04-17 (Bug 1): antes había 2 ramas separadas (`flow < 0 && ...`
      // y `tentative < 0`). Se unificaron a una sola condición `tentative <= 0`
      // para asegurar que NINGÚN valor negativo pueda filtrarse a la salida,
      // incluyendo residuos Float64 del orden de −1e-15 por roundoff.
      if (tentative <= 0) {
        v = 0;
        values[valOff + i + 1] = 0;
        ruined[p] = 1;
        isRuined = true;
      } else {
        v = tentative;
        values[valOff + i + 1] = v;
      }
    }
  }

  return { values, ruined, netContributions, flowSchedule };
}
