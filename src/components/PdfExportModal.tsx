import { useEffect, useState } from 'react';

import { usePlannerStore } from '../state/store';
import {
  buildPdfStateContainer,
  clientSlug,
  pdfFileName,
  type PdfFormInputs,
} from '../pdf/state/serialize';
import type { PdfSimulationData } from '../pdf/projections/types';
import type { PdfLocale, PdfVersion, WealthBucket } from '../pdf/state/types';

type Props = {
  open: boolean;
  onClose: () => void;
};

const BUCKETS: { value: WealthBucket; label: string; helper: string }[] = [
  { value: 'liquidity', label: 'Liquidez', helper: 'Necesidades 0-5 años' },
  { value: 'longevity', label: 'Longevidad', helper: 'Sostenibilidad de largo plazo' },
  { value: 'legacy', label: 'Legado', helper: 'Multi-generacional' },
];

const VERSIONS: { value: PdfVersion; label: string; helper: string }[] = [
  { value: 'completa', label: 'Completa', helper: '18-25 pp · seguimiento detallado' },
  { value: 'ejecutiva', label: 'Ejecutiva', helper: '6-8 pp · entrega al cliente' },
];

const LOCALES: { value: PdfLocale; label: string; draft?: boolean }[] = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français', draft: true },
  { value: 'de', label: 'Deutsch', draft: true },
];

const DEFAULT_FORM: PdfFormInputs = {
  clientName: '',
  advisorName: '',
  bucket: 'longevity',
  version: 'completa',
  locale: 'es',
  modules: { stressTests: true, sensitivities: true, methodology: true },
};

export default function PdfExportModal({ open, onClose }: Props) {
  const snapshot = usePlannerStore();
  const [form, setForm] = useState<PdfFormInputs>(DEFAULT_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advisorNote, setAdvisorNote] = useState('');

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !busy) onClose();
    }
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open, busy, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // Pre-abrir la pestaña de visualización dentro del user gesture; sino el
    // pop-up blocker mata el window.open al ejecutarse después de los await.
    // Si el blocker la rechaza igual, viewerWindow queda null y seguimos con
    // solo descarga (sin error).
    const viewerWindow = window.open('', '_blank');
    try {
      const formWithNote: PdfFormInputs = {
        ...form,
        advisorNote: advisorNote.trim() || undefined,
      };
      const state = buildPdfStateContainer(snapshot, formWithNote);
      const filename = pdfFileName(
        clientSlug(state.client.name),
        state.client.bucket,
        state.version,
      );
      const sim = snapshot.simA;
      if (!sim || !sim.values || !sim.netContributions) {
        throw new Error(
          'No hay simulación disponible. Ejecute Simular antes de generar el PDF.',
        );
      }
      const nPaths = sim.values.length / (snapshot.plan.horizonMonths + 1);
      const simulationData: PdfSimulationData = {
        valuesA: sim.values,
        netContributionsA: sim.netContributions,
        nPaths,
        horizonMonths: snapshot.plan.horizonMonths,
        mode: snapshot.plan.mode,
        inflationPct: snapshot.plan.inflationPct,
      };
      const { generateAndDownloadPdf } = await import('../pdf/download');
      await generateAndDownloadPdf(state, simulationData, { filename, viewerWindow });
      onClose();
    } catch (err) {
      if (viewerWindow && !viewerWindow.closed) viewerWindow.close();
      console.error('[PdfExportModal] generación falló', err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={() => !busy && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="mp-card w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold">Generar plan personal de inversión</h2>
            <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mt-1">
              Entregable de cierre — incluye estado completo embebido para retomar la próxima sesión.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-xl leading-none text-mercantil-slate hover:text-mercantil-ink dark:hover:text-mercantil-dark-ink disabled:opacity-50"
            aria-label="Cerrar"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
              Cliente
            </span>
            <input
              required
              type="text"
              value={form.clientName}
              onChange={(e) => setForm({ ...form, clientName: e.target.value })}
              placeholder="Ej. Pocho Borrero"
              className="w-full rounded-lg border border-mercantil-line dark:border-mercantil-dark-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mercantil-orange"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
              Asesor
            </span>
            <input
              required
              type="text"
              value={form.advisorName}
              onChange={(e) => setForm({ ...form, advisorName: e.target.value })}
              placeholder="Ej. Andrés Borrero"
              className="w-full rounded-lg border border-mercantil-line dark:border-mercantil-dark-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mercantil-orange"
            />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-2">
            Marco Wealth Way
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {BUCKETS.map((b) => (
              <button
                type="button"
                key={b.value}
                onClick={() => setForm({ ...form, bucket: b.value })}
                className={`text-left rounded-lg border px-3 py-2 transition ${
                  form.bucket === b.value
                    ? 'border-mercantil-orange bg-mercantil-orange/5'
                    : 'border-mercantil-line dark:border-mercantil-dark-line hover:border-mercantil-orange/60'
                }`}
              >
                <div className="text-sm font-semibold">{b.label}</div>
                <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">{b.helper}</div>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-2">
            Versión
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {VERSIONS.map((v) => (
              <button
                type="button"
                key={v.value}
                onClick={() => setForm({ ...form, version: v.value })}
                className={`text-left rounded-lg border px-3 py-2 transition ${
                  form.version === v.value
                    ? 'border-mercantil-orange bg-mercantil-orange/5'
                    : 'border-mercantil-line dark:border-mercantil-dark-line hover:border-mercantil-orange/60'
                }`}
              >
                <div className="text-sm font-semibold">{v.label}</div>
                <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">{v.helper}</div>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="mt-5">
          <legend className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-2">
            Idioma
          </legend>
          <div className="flex flex-wrap gap-2">
            {LOCALES.map((l) => (
              <button
                type="button"
                key={l.value}
                onClick={() => setForm({ ...form, locale: l.value })}
                className={`mp-chip ${form.locale === l.value ? 'mp-chip-active' : ''}`}
                title={l.draft ? 'Borrador — requiere revisión nativa' : ''}
              >
                {l.label}
                {l.draft ? ' ⚠' : ''}
              </button>
            ))}
          </div>
          {LOCALES.find((l) => l.value === form.locale)?.draft && (
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">
              ⚠ Esta traducción es borrador. El PDF mostrará un banner indicando que requiere revisión por hablante nativo antes de entrega al cliente final.
            </p>
          )}
        </fieldset>

        <fieldset className="mt-5">
          <legend className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-2">
            Secciones modulares
          </legend>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.modules.stressTests}
                onChange={(e) =>
                  setForm({
                    ...form,
                    modules: { ...form.modules, stressTests: e.target.checked },
                  })
                }
              />
              <span><strong>Sección F</strong> — Stress tests por régimen histórico (2008, COVID, estanflación)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.modules.sensitivities}
                onChange={(e) =>
                  setForm({
                    ...form,
                    modules: { ...form.modules, sensitivities: e.target.checked },
                  })
                }
              />
              <span><strong>Sección G</strong> — Vistas condicionales y sensibilidades</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.modules.methodology}
                onChange={(e) =>
                  setForm({
                    ...form,
                    modules: { ...form.modules, methodology: e.target.checked },
                  })
                }
              />
              <span><strong>Sección K</strong> — Metodología y reproducibilidad</span>
            </label>
          </div>
        </fieldset>

        <label className="block mt-5">
          <span className="block text-xs font-semibold uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
            Carta personalizada del asesor (opcional)
          </span>
          <textarea
            value={advisorNote}
            onChange={(e) => setAdvisorNote(e.target.value)}
            rows={3}
            maxLength={600}
            placeholder="Mensaje breve que aparecerá en la portada del documento."
            className="w-full rounded-lg border border-mercantil-line dark:border-mercantil-dark-line px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mercantil-orange"
          />
          <span className="block text-xs text-mercantil-slate mt-0.5">{advisorNote.length}/600</span>
        </label>

        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="mp-btn-outline text-xs disabled:opacity-50"
          >
            Cancelar
          </button>
          <button type="submit" disabled={busy} className="mp-btn-primary text-xs disabled:opacity-50">
            {busy ? '⏳ Generando…' : 'Generar PDF'}
          </button>
        </div>
      </form>
    </div>
  );
}
