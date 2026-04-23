/**
 * FlowEditor — edita las reglas de flujo del plan.
 *
 * Layout del §7:
 *   - 3 chips de preset en la parte de arriba (Ahorro, Jubilación, Herencia).
 *   - Lista editable de reglas debajo (agregar / eliminar / editar en línea).
 *   - Inputs controlados para initialCapital, horizonMonths, mode, inflationPct.
 */

import { useMemo } from 'react';
import { PRESET_IDS, PRESET_META } from '../domain/presets';
import type { FlowFrequency, FlowRule, PlanMode } from '../domain/types';
import { usePlannerStore } from '../state/store';

const FREQUENCIES: FlowFrequency[] = ['monthly', 'quarterly', 'semiannual', 'annual'];

const FREQ_LABELS: Record<FlowFrequency, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  semiannual: 'Semestral',
  annual: 'Anual',
};

function newRuleId(): string {
  return `rule-${Math.random().toString(36).slice(2, 9)}`;
}

function emptyRule(): FlowRule {
  return {
    id: newRuleId(),
    label: 'Nueva regla',
    sign: 'deposit',
    amount: 1000,
    frequency: 'monthly',
    startMonth: 1,
    endMonth: null,
    growthPct: 0,
  };
}

export default function FlowEditor() {
  const plan = usePlannerStore((s) => s.plan);
  const applyPreset = usePlannerStore((s) => s.applyPreset);
  const addRule = usePlannerStore((s) => s.addRule);
  const updateRule = usePlannerStore((s) => s.updateRule);
  const removeRule = usePlannerStore((s) => s.removeRule);
  const setInitialCapital = usePlannerStore((s) => s.setInitialCapital);
  const setHorizonMonths = usePlannerStore((s) => s.setHorizonMonths);
  const setMode = usePlannerStore((s) => s.setMode);
  const setInflationPct = usePlannerStore((s) => s.setInflationPct);

  const horizonYears = useMemo(() => plan.horizonMonths / 12, [plan.horizonMonths]);

  return (
    <div className="mp-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base">Flujos y parámetros del plan</h2>
        <div className="flex gap-2">
          {PRESET_IDS.map((id) => (
            <button
              key={id}
              onClick={() => applyPreset(id)}
              className="mp-chip hover:border-mercantil-orange"
              title={PRESET_META[id].description}
            >
              {PRESET_META[id].label}
            </button>
          ))}
        </div>
      </div>

      {/* Parámetros globales del plan */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="Capital inicial (USD)">
          <input
            type="number"
            min={0}
            step={1000}
            value={plan.initialCapital}
            onChange={(e) => setInitialCapital(Math.max(0, Number(e.target.value)))}
            className="input-mp"
          />
        </Field>
        <Field label="Horizonte (meses)" hint={`${horizonYears.toFixed(1)} años`}>
          <input
            type="number"
            min={1}
            max={360}
            value={plan.horizonMonths}
            onChange={(e) => setHorizonMonths(Number(e.target.value))}
            className="input-mp"
          />
        </Field>
        <Field label="Modo">
          <select
            value={plan.mode}
            onChange={(e) => setMode(e.target.value as PlanMode)}
            className="input-mp"
          >
            <option value="nominal">Nominal</option>
            <option value="real">Real (ajustado por inflación)</option>
          </select>
        </Field>
        <Field label="Inflación anual (%)" hint={plan.mode === 'nominal' ? 'no se aplica' : 'aplicada'}>
          <input
            type="number"
            min={0}
            max={20}
            step={0.1}
            value={plan.inflationPct}
            onChange={(e) => setInflationPct(Number(e.target.value))}
            disabled={plan.mode === 'nominal'}
            className="input-mp disabled:opacity-60"
          />
        </Field>
      </div>

      {/* Reglas */}
      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate">
          Reglas de flujo ({plan.rules.length})
        </h3>
        <button
          onClick={() => addRule(emptyRule())}
          className="mp-chip hover:border-mercantil-navy text-mercantil-navy dark:text-mercantil-dark-navy-text"
        >
          + Agregar regla
        </button>
      </div>

      {plan.rules.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-mercantil-line dark:border-mercantil-dark-line p-6 text-center text-sm text-mercantil-slate dark:text-mercantil-dark-slate">
          Sin reglas de flujo. Agregá una manualmente o aplicá un preset.
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {plan.rules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              horizonMonths={plan.horizonMonths}
              onChange={(patch) => updateRule(rule.id, patch)}
              onRemove={() => removeRule(rule.id)}
            />
          ))}
        </div>
      )}

      {/* Estilos inline de helper */}
      <style>{`
        .input-mp {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid #E5E7EF;
          background: white;
          font-size: 0.875rem;
          color: #0B1020;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .input-mp:focus {
          outline: none;
          border-color: #E97031;
          box-shadow: 0 0 0 3px rgba(233, 112, 49, 0.15);
        }
        html.dark .input-mp {
          background: #141D3C;
          border-color: #27325A;
          color: #E8ECF5;
        }
        html.dark .input-mp:focus {
          border-color: #E97031;
          box-shadow: 0 0 0 3px rgba(233, 112, 49, 0.25);
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate">
          {label}
        </span>
        {hint && <span className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate/70">{hint}</span>}
      </div>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function RuleRow({
  rule,
  horizonMonths,
  onChange,
  onRemove,
}: {
  rule: FlowRule;
  horizonMonths: number;
  onChange: (patch: Partial<FlowRule>) => void;
  onRemove: () => void;
}) {
  const isDeposit = rule.sign === 'deposit';
  return (
    <div
      className={`rounded-lg border p-3 flex flex-wrap items-center gap-3 text-xs ${
        isDeposit ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'
      }`}
    >
      <input
        type="text"
        value={rule.label}
        onChange={(e) => onChange({ label: e.target.value })}
        className="input-mp flex-1 min-w-[120px] !text-xs !py-1 !px-2"
        placeholder="Etiqueta"
      />
      <select
        value={rule.sign}
        onChange={(e) => onChange({ sign: e.target.value as FlowRule['sign'] })}
        className="input-mp !text-xs !py-1 !px-2 w-28"
      >
        <option value="deposit">Aporte</option>
        <option value="withdraw">Retiro</option>
      </select>
      <div className="flex items-center gap-1">
        <span className="text-mercantil-slate dark:text-mercantil-dark-slate">$</span>
        <input
          type="number"
          min={0}
          step={50}
          value={rule.amount}
          onChange={(e) => onChange({ amount: Math.max(0, Number(e.target.value)) })}
          className="input-mp !text-xs !py-1 !px-2 w-24"
        />
      </div>
      <select
        value={rule.frequency}
        onChange={(e) => onChange({ frequency: e.target.value as FlowFrequency })}
        className="input-mp !text-xs !py-1 !px-2 w-28"
      >
        {FREQUENCIES.map((f) => (
          <option key={f} value={f}>
            {FREQ_LABELS[f]}
          </option>
        ))}
      </select>
      <div className="flex items-center gap-1">
        <span className="text-mercantil-slate dark:text-mercantil-dark-slate">mes</span>
        <input
          type="number"
          min={1}
          max={horizonMonths}
          value={rule.startMonth}
          onChange={(e) => onChange({ startMonth: Math.max(1, Number(e.target.value)) })}
          className="input-mp !text-xs !py-1 !px-2 w-16"
        />
        <span className="text-mercantil-slate dark:text-mercantil-dark-slate">→</span>
        <input
          type="number"
          min={rule.startMonth}
          max={horizonMonths}
          value={rule.endMonth ?? horizonMonths}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ endMonth: v >= horizonMonths ? null : v });
          }}
          className="input-mp !text-xs !py-1 !px-2 w-16"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-mercantil-slate dark:text-mercantil-dark-slate">g</span>
        <input
          type="number"
          min={-20}
          max={20}
          step={0.5}
          value={rule.growthPct}
          onChange={(e) => onChange({ growthPct: Number(e.target.value) })}
          className="input-mp !text-xs !py-1 !px-2 w-16"
        />
        <span className="text-mercantil-slate dark:text-mercantil-dark-slate">%</span>
      </div>
      <button
        onClick={onRemove}
        className="ml-auto text-rose-600 hover:text-rose-800 text-[11px] font-semibold"
      >
        Eliminar
      </button>
    </div>
  );
}
