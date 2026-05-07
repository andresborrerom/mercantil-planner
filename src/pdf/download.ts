import { pdf } from '@react-pdf/renderer';

import { createMercantilPdfDocument } from './MercantilPdf';
import { embedStateInPdf } from './state/metadata';
import type { PdfSimulationData } from './projections/types';
import type { PdfStateContainer } from './state/types';
import i18n from '../i18n';

export type GenerateOptions = {
  filename: string;
};

/**
 * Renderiza el PDF, embebe el state JSON en metadata, y dispara la descarga.
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
  const element = createMercantilPdfDocument(state, { simulationData });
  const baseBlob = await pdf(element).toBlob();
  const baseBytes = new Uint8Array(await baseBlob.arrayBuffer());
  const enriched = await embedStateInPdf(baseBytes, state);
  const finalBlob = new Blob([new Uint8Array(enriched)], { type: 'application/pdf' });
  triggerDownload(finalBlob, opts.filename);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
