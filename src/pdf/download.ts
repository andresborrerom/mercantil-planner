import { pdf } from '@react-pdf/renderer';

import { createMercantilPdfDocument } from './MercantilPdf';
import { embedStateInPdf } from './state/metadata';
import type { PdfSimulationData } from './projections/types';
import type { PdfStateContainer } from './state/types';
import i18n from '../i18n';

export type GenerateOptions = {
  filename: string;
  /**
   * Pestaña previamente abierta dentro del user-gesture del submit (vía
   * `window.open('', '_blank')`). Si está presente, el PDF generado se navega
   * a esa pestaña además de descargarse. Permite "abrir + guardar" sin pegarle
   * al pop-up blocker.
   */
  viewerWindow?: Window | null;
};

/**
 * Renderiza el PDF, embebe el state JSON en metadata, y dispara la descarga.
 * Si `opts.viewerWindow` está presente, también navega esa pestaña al PDF
 * recién generado para que el asesor lo vea sin abrir Downloads.
 * Toda la dependencia pesada (react-pdf, pdf-lib) vive en este módulo —
 * importarlo dinámicamente desde la UI mantiene el bundle inicial chico.
 *
 * `simulationData` es runtime, no se embebe en el state container — son MB
 * de Float32Array determinísticos dado seed + portfolio + plan, así que
 * se regeneran al rehidratar.
 */
export async function generateAndDownloadPdf(
  state: PdfStateContainer,
  simulationData: PdfSimulationData,
  opts: GenerateOptions,
): Promise<void> {
  if (i18n.language !== state.locale) {
    await i18n.changeLanguage(state.locale);
  }
  try {
    const element = createMercantilPdfDocument(state, { simulationData });
    const baseBlob = await pdf(element).toBlob();
    const baseBytes = new Uint8Array(await baseBlob.arrayBuffer());
    const enriched = await embedStateInPdf(baseBytes, state);
    const finalBlob = new Blob([new Uint8Array(enriched)], { type: 'application/pdf' });
    const url = URL.createObjectURL(finalBlob);
    triggerDownload(url, opts.filename);
    if (opts.viewerWindow && !opts.viewerWindow.closed) {
      opts.viewerWindow.location.replace(url);
    }
    // Espera que la pestaña termine de cargar el blob antes de revocar (60s holgados).
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    if (opts.viewerWindow && !opts.viewerWindow.closed) {
      opts.viewerWindow.close();
    }
    throw err;
  }
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
