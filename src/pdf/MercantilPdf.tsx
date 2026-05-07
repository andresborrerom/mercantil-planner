import { Document, Page, StyleSheet } from '@react-pdf/renderer';

import { CoverSection } from './sections/A_Cover';
import { ExecutiveSummarySection } from './sections/B_ExecutiveSummary';
import { ProjectionsSection } from './sections/E_Projections';
import { PdfFooter } from './components/PdfFooter';
import { buildProjectionsData } from './projections/buildProjectionsData';
import { colors } from './theme/colors';
import type { PdfSimulationData } from './projections/types';
import type { PdfStateContainer } from './state/types';

// IMPORTANTE: el caller debe asegurar `await i18n.changeLanguage(state.locale)`
// ANTES de invocar pdf(<MercantilPdf>) — los hooks `useTranslation` consumen
// el singleton de i18n (registrado por initReactI18next) sin provider explícito.
// Mantener un provider haría que el root JSX no sea <Document> y rompería el
// tipo que `pdf()` exige.

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.pageBg,
  },
});

export type MercantilPdfPlaceholders = {
  objective?: string;
  confidenceAge?: number;
  nextReviewDate?: string;
};

export type MercantilPdfOptions = {
  /**
   * Datos de simulación cruda. Si están presentes se renderiza la sección E
   * (Proyecciones). Si no, se omite — útil para previews del skeleton sin
   * necesidad de correr el motor.
   */
  simulationData?: PdfSimulationData;
  placeholders?: MercantilPdfPlaceholders;
};

/**
 * Factory que retorna directamente un <Document> de @react-pdf/renderer.
 * Llamarla en lugar de usarla como componente: `pdf()` exige un
 * `ReactElement<DocumentProps>`, y un wrapper componente lo rompería.
 */
export function createMercantilPdfDocument(
  state: PdfStateContainer,
  options: MercantilPdfOptions = {},
) {
  const { simulationData, placeholders } = options;
  const docTitle = `${state.client.name} — Mercantil AWM (${state.client.bucket})`;
  const projections = simulationData ? buildProjectionsData(simulationData) : null;

  return (
    <Document
      title={docTitle}
      author="Mercantil AWM"
      creator="Mercantil AWM Planner"
      producer="Mercantil AWM Planner"
      subject={`Plan personal de inversión — ${state.client.bucket}`}
      keywords={`mercantil-awm,planner,${state.locale},${state.client.bucket}`}
    >
      <Page size="A4" style={styles.page}>
        <CoverSection state={state} />
        <PdfFooter sessionId={state.sessionId} />
      </Page>
      <Page size="A4" style={styles.page}>
        <ExecutiveSummarySection state={state} placeholders={placeholders} />
        <PdfFooter sessionId={state.sessionId} />
      </Page>
      {projections ? (
        <Page size="A4" style={styles.page}>
          <ProjectionsSection state={state} data={projections} />
          <PdfFooter sessionId={state.sessionId} />
        </Page>
      ) : null}
    </Document>
  );
}
