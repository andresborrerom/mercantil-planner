/**
 * Genera PDFs de muestra del módulo PDF de cierre, uno por locale,
 * en research/samples/. Para validación visual rápida.
 *
 * Corre una simulación block-bootstrap (nPaths=1000, suficiente para samples)
 * y la inyecta en el render para que la sección E (Proyecciones) se
 * renderice con datos reales.
 *
 * Uso:
 *   npx tsx --tsconfig tsconfig.app.json scripts/generate-pdf-samples.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToBuffer } from '@react-pdf/renderer';

import { createMercantilPdfDocument } from '../src/pdf/MercantilPdf';
import { embedStateInPdf } from '../src/pdf/state/metadata';
import {
  PDF_STATE_SCHEMA_VERSION,
  type PdfLocale,
  type PdfStateContainer,
} from '../src/pdf/state/types';
import type { PdfSimulationData } from '../src/pdf/projections/types';
import i18n, { SUPPORTED_LOCALES } from '../src/i18n';
import { expandPortfolio } from '../src/domain/amc-definitions';
import { runBootstrap } from '../src/domain/bootstrap';
import { applyFlows } from '../src/domain/flows';
import type { BootstrapConfig, PlanSpec, PortfolioSpec } from '../src/domain/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLES_DIR = resolve(__dirname, '..', 'research', 'samples');

const SAMPLE_PORTFOLIO_A: PortfolioSpec = { kind: 'signature', id: 'Balanceado' };
const SAMPLE_PORTFOLIO_B: PortfolioSpec = { kind: 'signature', id: 'Crecimiento' };
const SAMPLE_PLAN: PlanSpec = {
  initialCapital: 1_500_000,
  horizonMonths: 240,
  mode: 'real',
  inflationPct: 2.5,
  rules: [
    {
      id: 'r1',
      label: 'Aporte mensual',
      sign: 'deposit',
      amount: 5000,
      frequency: 'monthly',
      startMonth: 1,
      endMonth: null,
      growthPct: 3,
    },
  ],
};
const SAMPLE_BOOTSTRAP_CONFIG: BootstrapConfig = {
  seed: 42,
  nPaths: 1000,
  blockSize: 12,
  fixed6Annual: 0.06,
  fixed9Annual: 0.09,
};

function buildSampleState(locale: PdfLocale): PdfStateContainer {
  return {
    schemaVersion: PDF_STATE_SCHEMA_VERSION,
    generatedAt: '2026-05-06T18:00:00.000Z',
    sessionId: `mawm-2026-05-06-pocho-longevity-${locale}-001`,
    client: { name: 'Pocho Borrero', bucket: 'longevity' },
    advisor: { name: 'Andrés Borrero · Mercantil AWM' },
    locale,
    version: 'completa',
    modules: { stressTests: true, sensitivities: true, methodology: true },
    planner: {
      portfolioA: SAMPLE_PORTFOLIO_A,
      portfolioB: SAMPLE_PORTFOLIO_B,
      plan: SAMPLE_PLAN,
      bootstrap: SAMPLE_BOOTSTRAP_CONFIG,
      window: { startMonth: 1, endMonth: SAMPLE_PLAN.horizonMonths },
    },
  };
}

function runSampleSimulation(): PdfSimulationData {
  const expA = expandPortfolio(SAMPLE_PORTFOLIO_A);
  const expB = expandPortfolio(SAMPLE_PORTFOLIO_B);
  const out = runBootstrap({
    portfolios: { A: expA, B: expB },
    horizonMonths: SAMPLE_PLAN.horizonMonths,
    config: SAMPLE_BOOTSTRAP_CONFIG,
  });
  const flows = applyFlows({
    plan: SAMPLE_PLAN,
    portfolioReturns: out.portfolioReturnsA,
    nPaths: out.meta.nPaths,
  });
  return {
    valuesA: flows.values,
    netContributionsA: flows.netContributions,
    nPaths: out.meta.nPaths,
    horizonMonths: out.meta.horizonMonths,
    mode: SAMPLE_PLAN.mode,
    inflationPct: SAMPLE_PLAN.inflationPct,
  };
}

async function generateForLocale(
  locale: PdfLocale,
  simulationData: PdfSimulationData,
): Promise<void> {
  await i18n.changeLanguage(locale);
  const state = buildSampleState(locale);
  const element = createMercantilPdfDocument(state, { simulationData });
  const baseBytes = await renderToBuffer(element);
  const enriched = await embedStateInPdf(new Uint8Array(baseBytes), state);
  const filename = `pocho-longevity.${locale}.pdf`;
  const outPath = resolve(SAMPLES_DIR, filename);
  await writeFile(outPath, enriched);
  console.log(`✓ ${filename}  (${(enriched.byteLength / 1024).toFixed(1)} KB)`);
}

async function main(): Promise<void> {
  await mkdir(SAMPLES_DIR, { recursive: true });
  console.log(`Generando muestras en ${SAMPLES_DIR}\n`);
  console.log('Corriendo simulación de muestra (block bootstrap, 1000 paths)...');
  const t0 = Date.now();
  const simulationData = runSampleSimulation();
  console.log(`✓ Simulación lista — ${Date.now() - t0} ms\n`);
  for (const locale of SUPPORTED_LOCALES) {
    await generateForLocale(locale, simulationData);
  }
  console.log(`\nListo. Abrí los PDFs en research/samples/ para validación visual.`);
}

main().catch((err) => {
  console.error('Falló la generación de muestras:', err);
  process.exitCode = 1;
});
