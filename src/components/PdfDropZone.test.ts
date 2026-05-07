/**
 * Tests del helper `applyPdfStateToStore`. Cubre:
 *   - Round-trip end-to-end: embedStateInPdf → extractStateFromPdf → apply.
 *   - Preserva portafolios, plan, bootstrap, ventana.
 *   - Activa showProposedAmcs si A o B usan AMCs propuestos.
 *   - Reset de simulación previa.
 *
 * El componente PdfDropZone en sí (event listeners + UI) se valida manualmente
 * vía Playwright en `scripts/capture-gifs.ts` cuando capturamos el GIF de la
 * Parte 4b. Aquí cubrimos la lógica de aplicación de state al store.
 */
import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it } from 'vitest';

import { embedStateInPdf } from '../pdf/state/metadata';
import { extractStateFromPdf } from '../pdf/state/metadata';
import type { PdfStateContainer } from '../pdf/state/types';
import { usePlannerStore } from '../state/store';

import { applyPdfStateToStore } from './PdfDropZone';

async function buildEmptyPdfBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 300]);
  return doc.save();
}

function makeStateContainer(overrides: Partial<PdfStateContainer> = {}): PdfStateContainer {
  return {
    schemaVersion: 1,
    generatedAt: '2026-05-07T15:00:00.000Z',
    sessionId: 'mawm-test-longevity-20260507-1500-abcd',
    client: { name: 'Pablo Test', bucket: 'longevity' },
    advisor: { name: 'Asesor Test' },
    locale: 'es',
    version: 'completa',
    modules: { stressTests: false, sensitivities: false, methodology: false },
    planner: {
      portfolioA: { kind: 'signature', id: 'Balanceado' },
      portfolioB: { kind: 'signature', id: 'Crecimiento' },
      plan: {
        initialCapital: 100_000,
        horizonMonths: 300,
        mode: 'real',
        inflationPct: 2.5,
        rules: [
          {
            id: 'r1',
            label: 'Aporte mensual',
            sign: 'deposit',
            amount: 2000,
            frequency: 'monthly',
            startMonth: 1,
            endMonth: 300,
            growthPct: 3,
          },
        ],
      },
      bootstrap: {
        seed: 99,
        nPaths: 5000,
        blockSize: 12,
        fixed6Annual: 0.06,
        fixed9Annual: 0.09,
      },
      window: { startMonth: 12, endMonth: 240 },
    },
    ...overrides,
  };
}

beforeEach(() => {
  // Reset de campos relevantes del store entre tests. Zustand no tiene un reset
  // automático, así que volvemos a setear los defaults manualmente para los
  // campos que mutan los tests.
  usePlannerStore.setState({
    portfolioA: { kind: 'signature', id: 'Conservador' },
    portfolioB: { kind: 'signature', id: 'Balanceado' },
    plan: {
      initialCapital: 250_000,
      horizonMonths: 240,
      mode: 'nominal',
      inflationPct: 2.5,
      rules: [],
    },
    window: { startMonth: 1, endMonth: 240 },
    showProposedAmcs: false,
  });
});

describe('applyPdfStateToStore', () => {
  it('aplica portafolios, plan, bootstrap y ventana al store', () => {
    const state = makeStateContainer();
    applyPdfStateToStore(state);
    const s = usePlannerStore.getState();
    expect(s.portfolioA).toEqual({ kind: 'signature', id: 'Balanceado' });
    expect(s.portfolioB).toEqual({ kind: 'signature', id: 'Crecimiento' });
    expect(s.plan.initialCapital).toBe(100_000);
    expect(s.plan.horizonMonths).toBe(300);
    expect(s.plan.mode).toBe('real');
    expect(s.plan.rules).toHaveLength(1);
    expect(s.plan.rules[0].amount).toBe(2000);
    expect(s.bootstrap.seed).toBe(99);
    expect(s.window).toEqual({ startMonth: 12, endMonth: 240 });
  });

  it('limpia la simulación previa al rehidratar', () => {
    // Pretender que hay una sim previa.
    usePlannerStore.setState({
      simA: { values: new Float32Array([1, 2, 3]) } as never,
      simB: { values: new Float32Array([4, 5, 6]) } as never,
      status: 'done',
    });
    const state = makeStateContainer();
    applyPdfStateToStore(state);
    const s = usePlannerStore.getState();
    expect(s.simA).toBeNull();
    expect(s.simB).toBeNull();
    expect(s.status).toBe('idle');
  });

  it('activa showProposedAmcs si el portafolio A usa un AMC propuesto', () => {
    const state = makeStateContainer({
      planner: {
        ...makeStateContainer().planner,
        portfolioA: { kind: 'amc', id: 'CashST' },
      },
    });
    applyPdfStateToStore(state);
    expect(usePlannerStore.getState().showProposedAmcs).toBe(true);
    expect(usePlannerStore.getState().portfolioA).toEqual({ kind: 'amc', id: 'CashST' });
  });

  it('activa showProposedAmcs si un portafolio custom incluye AMCs propuestos', () => {
    const state = makeStateContainer({
      planner: {
        ...makeStateContainer().planner,
        portfolioA: {
          kind: 'custom',
          label: 'CashST + GlFI',
          weights: { CashST: 30, GlFI: 70 },
        },
      },
    });
    applyPdfStateToStore(state);
    expect(usePlannerStore.getState().showProposedAmcs).toBe(true);
    expect(usePlannerStore.getState().portfolioA).toEqual({
      kind: 'custom',
      label: 'CashST + GlFI',
      weights: { CashST: 30, GlFI: 70 },
    });
  });

  it('no toca showProposedAmcs si el portafolio no usa propuestos', () => {
    usePlannerStore.setState({ showProposedAmcs: false });
    const state = makeStateContainer(); // signatures, no propuestos
    applyPdfStateToStore(state);
    expect(usePlannerStore.getState().showProposedAmcs).toBe(false);
  });
});

describe('round-trip PDF: embed → extract → apply', () => {
  it('preserva el state container completo del planner', async () => {
    const original = makeStateContainer();
    const emptyBytes = await buildEmptyPdfBytes();
    const withState = await embedStateInPdf(emptyBytes, original);

    const extracted = await extractStateFromPdf(withState);
    expect(extracted).not.toBeNull();
    expect(extracted!.schemaVersion).toBe(1);
    expect(extracted!.client).toEqual(original.client);
    expect(extracted!.planner.plan.initialCapital).toBe(100_000);

    applyPdfStateToStore(extracted!);
    const s = usePlannerStore.getState();
    expect(s.portfolioA).toEqual(original.planner.portfolioA);
    expect(s.portfolioB).toEqual(original.planner.portfolioB);
    expect(s.plan).toEqual(original.planner.plan);
    expect(s.bootstrap).toEqual(original.planner.bootstrap);
    expect(s.window).toEqual(original.planner.window);
  });

  it('extractStateFromPdf devuelve null si el PDF no tiene metadata Mercantil', async () => {
    const emptyBytes = await buildEmptyPdfBytes();
    const extracted = await extractStateFromPdf(emptyBytes);
    expect(extracted).toBeNull();
  });
});
