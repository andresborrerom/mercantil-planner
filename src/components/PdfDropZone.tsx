/**
 * PdfDropZone — rehidratación de la sesión arrastrando un PDF generado
 * previamente con "Generar plan personal de inversión".
 *
 * El PDF lleva el estado completo del planner embebido en su Info dictionary
 * (ver `src/pdf/state/metadata.ts`). Al arrastrar el PDF al window, se extrae
 * el state y se aplica al store: portafolios A y B, plan, bootstrap, ventana.
 * Después el asesor presiona Simular para re-correr y ver la proyección
 * actual con los parámetros del cliente.
 *
 * Si el PDF no fue generado por la herramienta (sin metadata Mercantil) o
 * está corrupto, se muestra un toast de error y el state actual no se toca.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { AMC_TIER } from '../domain/amc-definitions';
import type { AmcId, PortfolioSpec } from '../domain/types';
import { extractStateFromPdf } from '../pdf/state/metadata';
import type { PdfStateContainer } from '../pdf/state/types';
import { usePlannerStore } from '../state/store';

type Feedback =
  | { kind: 'ok'; message: string }
  | { kind: 'error'; message: string };

const FEEDBACK_TTL_MS = 6000;

/**
 * Aplica un PdfStateContainer al store. Exportado para tests; el componente lo
 * llama internamente. Idempotente — se puede llamar varias veces con el mismo
 * state.
 *
 * Side effects:
 *   - Si algún portafolio usa AMCs `proposed`, activa el toggle
 *     `showProposedAmcs` para que el asesor los vea en el selector. Sin este
 *     paso, el siguiente interaction del PortfolioSelector dispararía el
 *     autofallback y borraría los pesos rehidratados.
 *   - Limpia la simulación previa (`resetSimulation`). El asesor presiona
 *     Simular después para re-correr con los parámetros del PDF.
 */
export function applyPdfStateToStore(state: PdfStateContainer): void {
  const store = usePlannerStore.getState();
  const { portfolioA, portfolioB, plan, bootstrap, window: pdfWindow } = state.planner;

  if (specUsesProposedAmcs(portfolioA) || specUsesProposedAmcs(portfolioB)) {
    store.setShowProposedAmcs(true);
  }

  store.setPortfolioA(portfolioA);
  store.setPortfolioB(portfolioB);
  usePlannerStore.setState({
    plan,
    bootstrap,
    window: pdfWindow,
  });
  store.resetSimulation();
}

function specUsesProposedAmcs(spec: PortfolioSpec): boolean {
  if (spec.kind === 'amc') return AMC_TIER[spec.id] === 'proposed';
  if (spec.kind === 'custom') {
    return Object.entries(spec.weights).some(
      ([id, w]) => AMC_TIER[id as AmcId] === 'proposed' && (w ?? 0) > 0,
    );
  }
  return false;
}

function formatGeneratedAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es', { year: 'numeric', month: 'short', day: '2-digit' });
  } catch {
    return iso;
  }
}

export default function PdfDropZone(): JSX.Element {
  const [dragOver, setDragOver] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const dragCounterRef = useRef(0);

  const handleFile = useCallback(async (file: File) => {
    const isPdf =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setFeedback({ kind: 'error', message: 'El archivo no es un PDF.' });
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      const state = await extractStateFromPdf(new Uint8Array(buffer));
      if (!state) {
        setFeedback({
          kind: 'error',
          message: 'PDF sin metadata Mercantil — no se puede rehidratar.',
        });
        return;
      }
      applyPdfStateToStore(state);
      setFeedback({
        kind: 'ok',
        message:
          `Sesión rehidratada — cliente ${state.client.name} (${state.client.bucket}). ` +
          `PDF del ${formatGeneratedAt(state.generatedAt)}. Presioná Simular para correr la proyección.`,
      });
    } catch (err) {
      console.error('[PdfDropZone] error leyendo PDF', err);
      setFeedback({
        kind: 'error',
        message: 'Error leyendo el PDF — ¿está corrupto?',
      });
    }
  }, []);

  useEffect(() => {
    function hasFiles(e: DragEvent): boolean {
      return Array.from(e.dataTransfer?.types ?? []).includes('Files');
    }
    function onDragEnter(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      if (dragCounterRef.current === 1) setDragOver(true);
    }
    function onDragLeave(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setDragOver(false);
    }
    function onDragOver(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    }
    function onDrop(e: DragEvent) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounterRef.current = 0;
      setDragOver(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      void handleFile(file);
    }
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFile]);

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(null), FEEDBACK_TTL_MS);
    return () => window.clearTimeout(t);
  }, [feedback]);

  return (
    <>
      {dragOver && (
        <div
          data-testid="pdf-drop-overlay"
          className="fixed inset-0 z-50 bg-mercantil-navy/85 flex items-center justify-center pointer-events-none"
        >
          <div className="bg-white rounded-2xl px-12 py-10 shadow-2xl border-4 border-dashed border-mercantil-orange max-w-lg mx-6">
            <p className="text-center text-2xl font-semibold text-mercantil-navy">
              📄 Soltá el PDF para rehidratar la sesión
            </p>
            <p className="mt-3 text-center text-sm text-mercantil-slate">
              Portafolios, plan, ventana y bootstrap se restauran automáticamente.
              Después presioná <strong>Simular</strong> para re-correr la proyección.
            </p>
          </div>
        </div>
      )}
      {feedback && (
        <div
          role="status"
          aria-live="polite"
          data-testid={feedback.kind === 'ok' ? 'pdf-drop-toast-ok' : 'pdf-drop-toast-error'}
          className={`fixed top-20 right-4 z-40 max-w-md rounded-lg shadow-lg px-4 py-3 text-sm ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border border-rose-200 text-rose-900'
          }`}
        >
          <span className="font-semibold mr-1">
            {feedback.kind === 'ok' ? '✓' : '⚠'}
          </span>
          {feedback.message}
        </div>
      )}
    </>
  );
}
