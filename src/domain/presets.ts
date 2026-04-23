/**
 * Presets de flujos para el FlowEditor del §7 del spec.
 *
 * Cada preset es una factory que retorna un conjunto de `FlowRule`s con
 * defaults sensatos. La UI aplica un preset al hacer click en un chip y luego
 * el usuario puede editar cualquier regla individualmente.
 *
 * Los 3 presets del spec son:
 *   - Ahorro acumulación: aporte mensual con crecimiento salarial opcional.
 *   - Jubilación: retiro mensual constante durante la jubilación, con
 *     ajuste inflacionario implícito vía `mode='real'`.
 *   - Herencia: aporte sostenido durante la vida activa + retiro único parcial
 *     al final (hipotética transferencia o ajuste patrimonial).
 *
 * Todos los montos son placeholders editables.
 */

import type { FlowRule, PlanMode, PlanSpec } from './types';

export type PresetId = 'ahorroAcumulacion' | 'jubilacion' | 'herencia';

export type PresetMeta = {
  id: PresetId;
  label: string;
  description: string;
  /** Modo recomendado para este preset. La UI puede sobreescribir. */
  suggestedMode: PlanMode;
  /** Horizonte típico en meses. Placeholder — editable. */
  suggestedHorizonMonths: number;
};

export type PresetOverrides = {
  horizonMonths?: number;
};

export type PresetResult = {
  meta: PresetMeta;
  rules: FlowRule[];
  /** Modo sugerido (nominal / real) para aplicar al PlanSpec. */
  mode: PlanMode;
  /** Inflación sugerida cuando el modo es 'real'. */
  inflationPct: number;
};

// ---------------------------------------------------------------------------
// Metadata estática
// ---------------------------------------------------------------------------

export const PRESET_META: Record<PresetId, PresetMeta> = {
  ahorroAcumulacion: {
    id: 'ahorroAcumulacion',
    label: 'Ahorro / Acumulación',
    description:
      'Aporte mensual con crecimiento anual típico del 3%. Sin retiros durante el horizonte.',
    suggestedMode: 'nominal',
    suggestedHorizonMonths: 240,
  },
  jubilacion: {
    id: 'jubilacion',
    label: 'Jubilación',
    description:
      'Retiro mensual constante en USD de hoy (modo real 2.5%). Sin aportes.',
    suggestedMode: 'real',
    suggestedHorizonMonths: 300,
  },
  herencia: {
    id: 'herencia',
    label: 'Herencia',
    description:
      'Aporte mensual durante el horizonte + retiro único al cierre equivalente a la mitad del aporte acumulado.',
    suggestedMode: 'nominal',
    suggestedHorizonMonths: 240,
  },
};

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Ahorro acumulación: aporte mensual de USD 1,000 durante `horizonMonths`,
 * con crecimiento anual del 3% (aprox. ajuste salarial conservador).
 */
function ahorroAcumulacion(overrides: PresetOverrides): PresetResult {
  const meta = PRESET_META.ahorroAcumulacion;
  const horizon = overrides.horizonMonths ?? meta.suggestedHorizonMonths;
  const rules: FlowRule[] = [
    {
      id: 'ahorro-aporte',
      label: 'Aporte mensual',
      sign: 'deposit',
      amount: 1000,
      frequency: 'monthly',
      startMonth: 1,
      endMonth: horizon,
      growthPct: 3,
    },
  ];
  return {
    meta,
    rules,
    mode: 'nominal',
    inflationPct: 2.5,
  };
}

/**
 * Jubilación: retiro mensual de USD 3,500 (en USD de hoy) durante el horizonte.
 * Se recomienda correr este preset en `mode='real'` para que el monto se
 * inflacione mes a mes.
 */
function jubilacion(overrides: PresetOverrides): PresetResult {
  const meta = PRESET_META.jubilacion;
  const horizon = overrides.horizonMonths ?? meta.suggestedHorizonMonths;
  const rules: FlowRule[] = [
    {
      id: 'jub-retiro',
      label: 'Retiro mensual',
      sign: 'withdraw',
      amount: 3500,
      frequency: 'monthly',
      startMonth: 1,
      endMonth: horizon,
      growthPct: 0,
    },
  ];
  return {
    meta,
    rules,
    mode: 'real',
    inflationPct: 2.5,
  };
}

/**
 * Herencia: aporte mensual de USD 500 durante el horizonte + retiro único al
 * cierre equivalente a la mitad de lo aportado (hipotética transferencia
 * patrimonial o compra de activo no-líquido).
 */
function herencia(overrides: PresetOverrides): PresetResult {
  const meta = PRESET_META.herencia;
  const horizon = overrides.horizonMonths ?? meta.suggestedHorizonMonths;
  const monthlyContribution = 500;
  const totalContributed = monthlyContribution * horizon;
  const bequestWithdrawal = totalContributed / 2;

  const rules: FlowRule[] = [
    {
      id: 'herencia-aporte',
      label: 'Aporte mensual',
      sign: 'deposit',
      amount: monthlyContribution,
      frequency: 'monthly',
      startMonth: 1,
      endMonth: horizon,
      growthPct: 0,
    },
    {
      id: 'herencia-bequest',
      label: 'Transferencia al cierre',
      sign: 'withdraw',
      amount: bequestWithdrawal,
      frequency: 'monthly',
      startMonth: horizon,
      endMonth: horizon,
      growthPct: 0,
    },
  ];
  return {
    meta,
    rules,
    mode: 'nominal',
    inflationPct: 2.5,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export function buildPreset(id: PresetId, overrides: PresetOverrides = {}): PresetResult {
  switch (id) {
    case 'ahorroAcumulacion':
      return ahorroAcumulacion(overrides);
    case 'jubilacion':
      return jubilacion(overrides);
    case 'herencia':
      return herencia(overrides);
  }
}

/**
 * Aplica un preset a un PlanSpec base, reemplazando las reglas y los campos
 * `mode` / `inflationPct` / `horizonMonths` sugeridos. `initialCapital` se
 * preserva del basePlan — cada asesor la setea en la UI.
 */
export function applyPresetToPlan(basePlan: PlanSpec, id: PresetId): PlanSpec {
  const preset = buildPreset(id, { horizonMonths: basePlan.horizonMonths });
  return {
    ...basePlan,
    mode: preset.mode,
    inflationPct: preset.inflationPct,
    rules: preset.rules,
  };
}

export const PRESET_IDS: readonly PresetId[] = [
  'ahorroAcumulacion',
  'jubilacion',
  'herencia',
] as const;
