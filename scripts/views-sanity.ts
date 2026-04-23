/**
 * views-sanity.ts — verificación end-to-end del módulo de views.
 *
 * Corre una simulación realista (5000 paths × 60 meses, Balanceado vs
 * Crecimiento), evalúa los 9 presets single-predicado y los 4 presets
 * compuestos built-in sobre ella, y reporta la probabilidad empírica + el
 * impacto condicional de cada uno.
 *
 * El objetivo de este script NO es un test determinístico estricto (los
 * números dependen del seed y del modelo) sino un smoke test que:
 *   1. Confirma que el pipeline bootstrap → views → conditionalMetrics corre
 *      sin errores sobre datos reales.
 *   2. Reporta números lo suficientemente legibles para que el Head of Quant
 *      pueda validar que las probabilidades y los impactos condicionales son
 *      coherentes con su intuición del mercado.
 *
 * Uso: `npm run sanity:views`
 */

import { runBootstrap, getYieldBounds } from '../src/domain/bootstrap';
import { expandPortfolio } from '../src/domain/amc-definitions';
import { applyFlows } from '../src/domain/flows';
import { computeMetrics } from '../src/domain/metrics';
import type { Window } from '../src/domain/metrics';
import {
  BUILT_IN_COMPOSITE_VIEWS,
  BUILT_IN_VIEWS,
  evaluateView,
  computeConditionalMetrics,
  type AnyView,
  type ViewDataset,
} from '../src/domain/views';
import type { YieldKey } from '../src/domain/rf-config';

const N_PATHS = 5000;
const HORIZON = 60; // 5 años — suficiente para views a 12 y 24 meses
const SEED = 42;
const INITIAL_CAPITAL = 500_000;

console.log('='.repeat(72));
console.log(' views-sanity.ts — evaluación end-to-end de los 13 presets (9 single + 4 compuestos)');
console.log('='.repeat(72));

// ---------------------------------------------------------------------------
// 1. Bootstrap con outputYieldPaths activo
// ---------------------------------------------------------------------------

console.log(`\n[1/3] Bootstrap: ${N_PATHS} paths × ${HORIZON} meses, seed=${SEED}`);
console.log('      Portafolio A: Signature Balanceado');
console.log('      Portafolio B: Signature Crecimiento');

const t0 = performance.now();
const boot = runBootstrap({
  portfolios: {
    A: expandPortfolio({ kind: 'signature', id: 'Balanceado' }),
    B: expandPortfolio({ kind: 'signature', id: 'Crecimiento' }),
  },
  horizonMonths: HORIZON,
  config: {
    seed: SEED,
    nPaths: N_PATHS,
    blockSize: 12,
    fixed6Annual: 0.06,
    fixed9Annual: 0.09,
  },
  outputYieldPaths: true,
  outputEtfReturns: true,
});
const elapsedBoot = performance.now() - t0;
console.log(`      ✓ ok, ${elapsedBoot.toFixed(1)} ms`);
console.log(`      yieldPaths emitidos: IRX=${boot.yieldPaths!.IRX.length}, TNX=${boot.yieldPaths!.TNX.length}`);

// ---------------------------------------------------------------------------
// 2. Flows + dataset para views
// ---------------------------------------------------------------------------

console.log(`\n[2/3] Aplicando flujos determinísticos (capital inicial USD ${INITIAL_CAPITAL.toLocaleString('en-US')}, sin aportes/retiros)`);

const simA = applyFlows({
  plan: {
    initialCapital: INITIAL_CAPITAL,
    horizonMonths: HORIZON,
    mode: 'nominal',
    inflationPct: 0,
    rules: [],
  },
  portfolioReturns: boot.portfolioReturnsA,
  nPaths: N_PATHS,
});

const yieldInitial: Record<YieldKey, number> = {
  IRX: getYieldBounds('IRX').initial,
  FVX: getYieldBounds('FVX').initial,
  TNX: getYieldBounds('TNX').initial,
  TYX: getYieldBounds('TYX').initial,
};

console.log(`      yieldInitial (últimos niveles observados):`);
console.log(`        IRX=${(yieldInitial.IRX * 100).toFixed(2)}%  FVX=${(yieldInitial.FVX * 100).toFixed(2)}%  TNX=${(yieldInitial.TNX * 100).toFixed(2)}%  TYX=${(yieldInitial.TYX * 100).toFixed(2)}%`);

const dataset: ViewDataset = {
  portfolioReturnsA: boot.portfolioReturnsA,
  portfolioReturnsB: boot.portfolioReturnsB,
  yieldPaths: boot.yieldPaths!,
  etfReturns: boot.etfReturns ?? null,
  yieldInitial,
  nPaths: N_PATHS,
  horizonMonths: HORIZON,
};

// Métricas base (sin condicionar) para referenciar deltas
const baseWindow: Window = { startMonth: 1, endMonth: HORIZON };
const baseMetrics = computeMetrics({
  simulation: simA,
  portfolioReturns: boot.portfolioReturnsA,
  nPaths: N_PATHS,
  horizonMonths: HORIZON,
  window: baseWindow,
});

console.log(`\n      Base case (portfolio A, ventana completa 60m):`);
console.log(`        TWR mediano:         ${(baseMetrics.twrAnnualized.p50 * 100).toFixed(2)}% anual`);
console.log(`        Valor final mediano: USD ${Math.round(baseMetrics.finalValue.p50).toLocaleString('en-US')}`);
console.log(`        Max DD mediano:      ${(baseMetrics.maxDrawdown.p50 * 100).toFixed(2)}%`);

// ---------------------------------------------------------------------------
// 3. Evaluar los 13 presets (9 single + 4 compuestos)
// ---------------------------------------------------------------------------

console.log(`\n[3/3] Evaluando 9 single-predicado + 4 compuestos`);
console.log('');

type Row = {
  id: string;
  label: string;
  probability: string;
  nMatched: number;
  deltaTwr: string;
  deltaFinal: string;
  deltaMdd: string;
  kind: 'single' | 'composite';
};

const rows: Row[] = [];

const allViews: AnyView[] = [...BUILT_IN_VIEWS, ...BUILT_IN_COMPOSITE_VIEWS];

for (const view of allViews) {
  const t1 = performance.now();
  const ev = evaluateView(view, dataset);

  // Metrics condicionales sobre la ventana del view (para que los números
  // sean directamente comparables al predicado)
  const windowForMetrics = view.window;
  const baseForWindow = computeMetrics({
    simulation: simA,
    portfolioReturns: boot.portfolioReturnsA,
    nPaths: N_PATHS,
    horizonMonths: HORIZON,
    window: windowForMetrics,
  });
  const condMetrics = computeConditionalMetrics(
    ev.matchedIndices,
    simA,
    boot.portfolioReturnsA,
    N_PATHS,
    HORIZON,
    windowForMetrics,
  );
  const elapsedV = performance.now() - t1;

  const probPct = (ev.probability * 100).toFixed(1);
  const sePct = (ev.standardError * 100).toFixed(2);

  const viewKind: 'single' | 'composite' = view.id.startsWith('composite-') ? 'composite' : 'single';

  if (condMetrics) {
    const dTwr = (condMetrics.twrAnnualized.p50 - baseForWindow.twrAnnualized.p50) * 100;
    const dFinal = condMetrics.finalValue.p50 - baseForWindow.finalValue.p50;
    const dMdd = (condMetrics.maxDrawdown.p50 - baseForWindow.maxDrawdown.p50) * 100;
    rows.push({
      id: view.id,
      label: view.label,
      probability: `${probPct}% (±${sePct} pp)`,
      nMatched: ev.nMatched,
      deltaTwr: `${dTwr >= 0 ? '+' : ''}${dTwr.toFixed(2)} pp`,
      deltaFinal: `${dFinal >= 0 ? '+' : ''}USD ${Math.round(dFinal).toLocaleString('en-US')}`,
      deltaMdd: `${dMdd >= 0 ? '+' : ''}${dMdd.toFixed(2)} pp`,
      kind: viewKind,
    });
  } else {
    rows.push({
      id: view.id,
      label: view.label,
      probability: `${probPct}% (sin match)`,
      nMatched: 0,
      deltaTwr: '—',
      deltaFinal: '—',
      deltaMdd: '—',
      kind: viewKind,
    });
  }
  console.log(`   ✓ ${view.id.padEnd(36)} ${probPct.padStart(5)}%  (eval ${elapsedV.toFixed(0)} ms)`);
}

// Reporte tabular
console.log('\n');
console.log('='.repeat(72));
console.log(' Resumen: probabilidad empírica + deltas condicionales vs base');
console.log('='.repeat(72));
console.log('');
console.log(
  `${'View'.padEnd(40)}  ${'P(view)'.padStart(18)}  ${'ΔTWR'.padStart(10)}  ${'ΔFinal'.padStart(18)}  ${'ΔMDD'.padStart(10)}`,
);
console.log('-'.repeat(102));
console.log('[SINGLE-PREDICADO]');
for (const r of rows.filter((x) => x.kind === 'single')) {
  console.log(
    `${r.label.padEnd(40)}  ${r.probability.padStart(18)}  ${r.deltaTwr.padStart(10)}  ${r.deltaFinal.padStart(18)}  ${r.deltaMdd.padStart(10)}`,
  );
}
console.log('');
console.log('[COMPUESTOS — multi-predicado con AND]');
for (const r of rows.filter((x) => x.kind === 'composite')) {
  console.log(
    `${r.label.padEnd(40)}  ${r.probability.padStart(18)}  ${r.deltaTwr.padStart(10)}  ${r.deltaFinal.padStart(18)}  ${r.deltaMdd.padStart(10)}`,
  );
}
console.log('');
console.log('Notas:');
console.log('  - ΔTWR: diferencia en puntos porcentuales del TWR mediano condicional vs base.');
console.log('  - ΔFinal: diferencia en USD del valor final mediano del portafolio A condicional vs base,');
console.log(`    con capital inicial USD ${INITIAL_CAPITAL.toLocaleString('en-US')}, ventana del propio view.`);
console.log('  - ΔMDD: diferencia en puntos porcentuales del max drawdown mediano condicional vs base.');
console.log('  - Views con nMatched < 50 tienen intervalo de confianza amplio y deben leerse con cautela.');
console.log('');

// Sanity checks básicos
const allEvaluated = rows.length === allViews.length;
const atLeastOneHasMatches = rows.some((r) => r.nMatched > 0);
const atLeastOneCompositeEvaluated = rows.some((r) => r.kind === 'composite');

// ---------------------------------------------------------------------------
// Smoke test: 2 views dinámicos sobre ETFs individuales (Fase C.2)
// ---------------------------------------------------------------------------

console.log('');
console.log('='.repeat(72));
console.log(' Smoke test Fase C.2 — views dinámicos sobre ETFs individuales');
console.log('='.repeat(72));

const etfSmokeTests: { id: string; label: string; view: Parameters<typeof evaluateView>[0] }[] = [
  {
    id: 'sptl-percentile-20-40-12m',
    label: 'Tesoros 20+y: percentil 20-40 de retornos a 12m',
    view: {
      id: 'sptl-pct',
      label: 'sptl-pct',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'SPTL' },
      mode: { kind: 'percentileBandReturn', lowerP: 20, upperP: 40 },
      window: { startMonth: 1, endMonth: 12 },
    },
  },
  {
    id: 'acwi-rally-peak-25-24m',
    label: 'ACWI: pico acumulado ≥ +25% en algún momento antes de 24 meses',
    view: {
      id: 'acwi-peak',
      label: 'acwi-peak',
      description: '',
      subject: { kind: 'etfReturn', ticker: 'ACWI' },
      mode: { kind: 'peakCumulativeReturnRange', minReturn: 0.25, maxReturn: null },
      window: { startMonth: 1, endMonth: 24 },
    },
  },
];

// Fase C.2b — composite con ventanas distintas por componente.
// Ejemplo cableado del usuario: "rally S&P 6m AND rally Eurozona 12m".
etfSmokeTests.push({
  id: 'rally-spy-6m-AND-ezu-12m',
  label: 'Rally S&P +20% en 6m AND rally Eurozona +20% en 12m (composite C.2b)',
  view: {
    kind: 'composite',
    id: 'rally-multi-window',
    label: 'rally multi-window',
    description: '',
    combinator: 'and',
    window: { startMonth: 1, endMonth: 12 },
    components: [
      {
        id: 'spy-rally-6m',
        label: 's',
        description: '',
        subject: { kind: 'etfReturn', ticker: 'SPY' },
        mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
        window: { startMonth: 1, endMonth: 6 },
      },
      {
        id: 'ezu-rally-12m',
        label: 'e',
        description: '',
        subject: { kind: 'etfReturn', ticker: 'EZU' },
        mode: { kind: 'cumulativeReturnRange', minReturn: 0.2, maxReturn: null },
        window: { startMonth: 1, endMonth: 12 },
      },
    ],
  },
});

let etfSmokeOk = true;
for (const test of etfSmokeTests) {
  try {
    const ev = evaluateView(test.view, dataset);
    const pct = (ev.probability * 100).toFixed(1);
    const se = (ev.standardError * 100).toFixed(2);
    console.log(`   ✓ ${test.label.padEnd(60)} ${pct}% (±${se}pp) · n=${ev.nMatched}`);
  } catch (err) {
    console.log(`   ✗ ${test.label}: ${err instanceof Error ? err.message : String(err)}`);
    etfSmokeOk = false;
  }
}

console.log('');
console.log('='.repeat(72));
if (!etfSmokeOk) {
  console.log(' ✗ views-sanity FAILED — alguno de los ETF smoke tests falló');
  process.exit(1);
}
if (allEvaluated && atLeastOneHasMatches && atLeastOneCompositeEvaluated) {
  const nSingle = rows.filter((r) => r.kind === 'single').length;
  const nComposite = rows.filter((r) => r.kind === 'composite').length;
  console.log(` ✓ views-sanity OK — ${nSingle} single + ${nComposite} compuestos evaluados sin errores`);
  console.log(`   y al menos uno tiene matches (max n=${Math.max(...rows.map((r) => r.nMatched))}).`);
  process.exit(0);
} else {
  console.log(' ✗ views-sanity FAILED');
  if (!allEvaluated) console.log(`   - Sólo ${rows.length} de ${allViews.length} presets se evaluaron`);
  if (!atLeastOneHasMatches) console.log('   - Ningún preset tiene matches (indica bug en predicados o dataset)');
  if (!atLeastOneCompositeEvaluated) console.log('   - Ningún composite se evaluó');
  process.exit(1);
}
