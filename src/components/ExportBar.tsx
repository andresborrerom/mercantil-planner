/**
 * ExportBar — Exportar a Excel + Compartir config (§7 "no negociables").
 *
 * Excel (.xlsx) con SheetJS — incluye 4 hojas:
 *   1. Config: portafolios A/B expandidos, plan, bootstrap config, métricas A/B en la ventana.
 *   2. Reglas: todas las FlowRule del plan.
 *   3. Stats: resumen tabular igual al StatsPanel.
 *   4. Paths: primeras 500 trayectorias × horizonte (A y B lado a lado).
 *
 * `xlsx` se carga dinámicamente (`await import('xlsx')`) al presionar el botón
 * para sacarlo del bundle principal (~800 KB). La primera exportación descarga
 * el chunk; subsecuentes son instantáneas (el browser cachea el módulo).
 *
 * Compartir config: copia al clipboard un JSON con portafolios + plan + bootstrap.
 * Un input pega JSON y reconstruye el estado.
 */

import { useRef, useState } from 'react';
import type * as XLSXNamespace from 'xlsx';
import {
  AMC_LABELS,
  etfWeightTable,
  expandPortfolio,
} from '../domain/amc-definitions';
import type { Band, WindowMetrics } from '../domain/metrics';
import { usePlannerStore } from '../state/store';
import type {
  BootstrapConfig,
  FlowRule,
  PlanSpec,
  PortfolioSpec,
} from '../domain/types';

type XLSXModule = typeof XLSXNamespace;

type ShareConfig = {
  version: 1;
  portfolioA: PortfolioSpec;
  portfolioB: PortfolioSpec;
  plan: PlanSpec;
  bootstrap: BootstrapConfig;
};

const MAX_PATHS_EXPORT = 500;

export default function ExportBar() {
  const state = usePlannerStore();
  const [pasteValue, setPasteValue] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasSim = !!(state.simA && state.simB && state.rawReturnsA && state.rawReturnsB);

  const handleExportExcel = async (): Promise<void> => {
    if (!hasSim || !state.metricsA || !state.metricsB) return;
    setIsExporting(true);
    setPasteError(null);
    try {
      // Dynamic import: xlsx (~800 KB) vive en su propio chunk.
      // La primera corrida descarga el chunk; subsecuentes usan caché del browser.
      const XLSX = await import('xlsx');
      const wb = buildWorkbook(state, XLSX);
      const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      XLSX.writeFile(wb, `mercantil-planner-${ts}.xlsx`);
    } catch (err) {
      console.error('[ExportBar] Excel export falló', err);
      setPasteError('Error exportando Excel — ver consola');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyConfig = async (): Promise<void> => {
    const config: ShareConfig = {
      version: 1,
      portfolioA: state.portfolioA,
      portfolioB: state.portfolioB,
      plan: state.plan,
      bootstrap: state.bootstrap,
    };
    const json = JSON.stringify(config, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      setCopyNotice('Copiado ✓');
      setTimeout(() => setCopyNotice(null), 2000);
    } catch {
      // Fallback: mostrar en un textarea para copiar manual
      setPasteValue(json);
      setCopyNotice('Copia manual desde el textarea');
    }
  };

  const handleApplyPaste = (): void => {
    setPasteError(null);
    try {
      const parsed = JSON.parse(pasteValue) as ShareConfig;
      if (parsed.version !== 1) throw new Error('Versión de config no soportada');
      state.setPortfolioA(parsed.portfolioA);
      state.setPortfolioB(parsed.portfolioB);
      // Reemplaza plan entero
      usePlannerStore.setState({ plan: parsed.plan, bootstrap: parsed.bootstrap });
      state.clampWindowToHorizon();
      state.resetSimulation();
      setPasteValue('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setPasteError(`JSON inválido: ${msg}`);
    }
  };

  return (
    <div className="mp-card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base">Exportar y compartir</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleExportExcel}
            disabled={!hasSim || isExporting}
            className="mp-btn-outline text-xs disabled:opacity-50"
          >
            {isExporting ? '⏳ Generando…' : '📊 Excel (.xlsx)'}
          </button>
          <button onClick={handleCopyConfig} className="mp-btn-outline text-xs">
            📋 Copiar config
          </button>
          {copyNotice && (
            <span className="text-xs text-emerald-700 font-semibold self-center">{copyNotice}</span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate">
          Pegar config JSON para reconstruir
        </label>
        <div className="mt-1 flex gap-2">
          <textarea
            ref={fileInputRef as unknown as React.RefObject<HTMLTextAreaElement>}
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
            className="flex-1 rounded-lg border border-mercantil-line dark:border-mercantil-dark-line px-3 py-2 text-xs font-mono text-mercantil-ink dark:text-mercantil-dark-ink focus:outline-none focus:ring-2 focus:ring-mercantil-orange"
            rows={3}
            placeholder='{"version":1,"portfolioA":...}'
          />
          <button
            onClick={handleApplyPaste}
            disabled={!pasteValue.trim()}
            className="mp-btn-primary self-start disabled:opacity-50 text-xs"
          >
            Aplicar
          </button>
        </div>
        {pasteError && <p className="mt-1 text-xs text-rose-700">{pasteError}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Workbook construction
// ---------------------------------------------------------------------------

type StoreSnapshot = ReturnType<typeof usePlannerStore.getState>;

function buildWorkbook(state: StoreSnapshot, XLSX: XLSXModule): XLSXNamespace.WorkBook {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Config
  const expA = expandPortfolio(state.portfolioA);
  const expB = expandPortfolio(state.portfolioB);
  const configRows: (string | number)[][] = [
    ['Campo', 'Valor'],
    ['Portafolio A tipo', state.portfolioA.kind],
    ['Portafolio A label', describePortfolio(state.portfolioA)],
    ['Portafolio B tipo', state.portfolioB.kind],
    ['Portafolio B label', describePortfolio(state.portfolioB)],
    ['Capital inicial (USD)', state.plan.initialCapital],
    ['Horizonte (meses)', state.plan.horizonMonths],
    ['Modo', state.plan.mode],
    ['Inflación anual (%)', state.plan.inflationPct],
    ['Seed', state.bootstrap.seed],
    ['nPaths', state.bootstrap.nPaths],
    ['Block size', state.bootstrap.blockSize],
    ['FIXED6 anual', state.bootstrap.fixed6Annual],
    ['FIXED9 anual', state.bootstrap.fixed9Annual],
    ['Ventana inicio (mes)', state.window.startMonth],
    ['Ventana fin (mes)', state.window.endMonth],
    [],
    ['% FIXED A', expA.fixed.FIXED6 + expA.fixed.FIXED9],
    ['% FIXED B', expB.fixed.FIXED6 + expB.fixed.FIXED9],
    [],
    ['Look-through A — ETF', 'Peso %'],
    ...etfWeightTable(expA).map((r) => [r.ticker, r.weight]),
    [],
    ['Look-through B — ETF', 'Peso %'],
    ...etfWeightTable(expB).map((r) => [r.ticker, r.weight]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(configRows), 'Config');

  // Sheet 2: Reglas
  const ruleRows: (string | number | null)[][] = [
    ['ID', 'Label', 'Signo', 'Monto', 'Frecuencia', 'Start', 'End', 'Growth %'],
  ];
  for (const r of state.plan.rules as FlowRule[]) {
    ruleRows.push([r.id, r.label, r.sign, r.amount, r.frequency, r.startMonth, r.endMonth, r.growthPct]);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ruleRows), 'Reglas');

  // Sheet 3: Stats
  if (state.metricsA && state.metricsB) {
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(buildStatsAoa(state.metricsA, state.metricsB)),
      'Stats',
    );
  }

  // Sheet 4: Paths (primeras N × horizonte) — A y B concatenados horizontalmente
  if (state.simA && state.simB) {
    const H = state.plan.horizonMonths;
    const nPaths = state.simA.values.length / (H + 1);
    const nExport = Math.min(nPaths, MAX_PATHS_EXPORT);
    const header: string[] = ['Mes'];
    for (let p = 0; p < nExport; p++) header.push(`A_path${p + 1}`);
    for (let p = 0; p < nExport; p++) header.push(`B_path${p + 1}`);
    const rows: (string | number)[][] = [header];
    for (let t = 0; t <= H; t++) {
      const row: (string | number)[] = [t];
      for (let p = 0; p < nExport; p++) row.push(state.simA.values[p * (H + 1) + t]);
      for (let p = 0; p < nExport; p++) row.push(state.simB.values[p * (H + 1) + t]);
      rows.push(row);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Paths');
  }

  return wb;
}

function describePortfolio(spec: PortfolioSpec): string {
  switch (spec.kind) {
    case 'signature':
      return `Signature: ${spec.id}`;
    case 'amc':
      return `AMC: ${AMC_LABELS[spec.id]}`;
    case 'custom':
      return `Custom: ${spec.label}`;
  }
}

function bandStr(b: Band | null): string {
  if (!b) return '—';
  return `${(b.p50 * 100).toFixed(2)}% (P10 ${(b.p10 * 100).toFixed(2)}% / P90 ${(b.p90 * 100).toFixed(2)}%)`;
}

function buildStatsAoa(a: WindowMetrics, b: WindowMetrics): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['Métrica', 'A', 'B', 'Δ (B−A) mediana'],
  ];
  const pushBand = (label: string, bA: Band | null, bB: Band | null): void => {
    const delta =
      bA && bB && Number.isFinite(bA.p50) && Number.isFinite(bB.p50)
        ? bB.p50 - bA.p50
        : NaN;
    rows.push([
      label,
      bandStr(bA),
      bandStr(bB),
      Number.isFinite(delta) ? `${(delta * 100).toFixed(2)}pp` : '—',
    ]);
  };
  pushBand('TWR anualizado', a.twrAnnualized, b.twrAnnualized);
  pushBand('XIRR anualizado', a.xirrAnnualized, b.xirrAnnualized);
  pushBand('Max Drawdown', a.maxDrawdown, b.maxDrawdown);
  pushBand('Meses neg / año', a.negMonthsPerYear, b.negMonthsPerYear);
  pushBand('Volatilidad anualizada', a.volatilityAnnualized, b.volatilityAnnualized);
  pushBand('Peor rolling 12m', a.worstRolling12m, b.worstRolling12m);
  const finalA = a.finalValue;
  const finalB = b.finalValue;
  const deltaFinal = finalB.p50 - finalA.p50;
  rows.push([
    'Valor final',
    `$${finalA.p50.toFixed(0)} (P10 $${finalA.p10.toFixed(0)} / P90 $${finalA.p90.toFixed(0)})`,
    `$${finalB.p50.toFixed(0)} (P10 $${finalB.p10.toFixed(0)} / P90 $${finalB.p90.toFixed(0)})`,
    `$${deltaFinal.toFixed(0)}`,
  ]);
  rows.push([
    'Prob. shortfall',
    `${(a.shortfallProbability * 100).toFixed(2)}%`,
    `${(b.shortfallProbability * 100).toFixed(2)}%`,
    `${((b.shortfallProbability - a.shortfallProbability) * 100).toFixed(2)}pp`,
  ]);
  rows.push([
    'Prob. ruina',
    `${(a.ruinProbability * 100).toFixed(2)}%`,
    `${(b.ruinProbability * 100).toFixed(2)}%`,
    `${((b.ruinProbability - a.ruinProbability) * 100).toFixed(2)}pp`,
  ]);
  return rows;
}
