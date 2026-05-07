import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';

import { colors } from '../theme/colors';
import { fonts, fontSize, lineHeight } from '../theme/typography';
import { pageMargin, spacing } from '../theme/spacing';
import { SvgFanChart } from '../projections/SvgFanChart';
import type { ProjectionsData } from '../projections/types';
import type { PdfStateContainer } from '../state/types';

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: pageMargin.horizontal,
    paddingTop: pageMargin.vertical,
    paddingBottom: pageMargin.vertical,
    backgroundColor: colors.pageBg,
    color: colors.body,
  },
  header: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h1,
    color: colors.ink,
    marginBottom: spacing.sm,
    lineHeight: lineHeight.tight,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.muted,
    marginBottom: spacing.md,
    lineHeight: lineHeight.normal,
  },
  modeNote: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.micro,
    color: colors.muted,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.xs,
    marginBottom: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendSwatchSolid: {
    width: 14,
    height: 4,
    backgroundColor: colors.accent,
    marginRight: spacing.xs,
  },
  legendSwatchBand: {
    width: 14,
    height: 8,
    backgroundColor: colors.accent,
    opacity: 0.28,
    marginRight: spacing.xs,
  },
  legendSwatchDashed: {
    width: 14,
    height: 1,
    borderTopWidth: 1,
    borderTopColor: colors.muted,
    borderTopStyle: 'dashed',
    marginRight: spacing.xs,
  },
  legendText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
  },
  sectionLabel: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.body,
    lineHeight: lineHeight.normal,
  },
  table: {
    marginTop: spacing.xs,
    borderTopWidth: 0.5,
    borderTopColor: colors.hairline,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.hairline,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.hairline,
  },
  tableRowLast: {
    flexDirection: 'row',
    paddingVertical: 5,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.hairline,
    backgroundColor: '#F8FAFC',
  },
  tableLabel: {
    width: 130,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.ink,
  },
  tableLabelMuted: {
    width: 130,
    fontFamily: fonts.sans,
    fontSize: fontSize.micro,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tableCell: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.body,
    textAlign: 'right',
    paddingRight: spacing.xs,
  },
  tableHeaderCell: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    textAlign: 'right',
    paddingRight: spacing.xs,
  },
  tableFootnote: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.micro,
    color: colors.muted,
    marginTop: spacing.xs,
    lineHeight: lineHeight.normal,
  },
  narrativeBox: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.accentSoft,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
  },
  narrativeText: {
    fontFamily: fonts.serif,
    fontSize: fontSize.body,
    color: colors.ink,
    lineHeight: lineHeight.normal,
  },
});

type Props = {
  state: PdfStateContainer;
  data: ProjectionsData;
};

export function ProjectionsSection({ state, data }: Props) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language === 'es' ? 'es-VE' : i18n.language;
  const formatUsd = (v: number): string =>
    new Intl.NumberFormat(lang, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(v);
  const formatPct = (v: number): string => `${(v * 100).toFixed(0)}%`;

  const horizonYears = Math.round(state.planner.plan.horizonMonths / 12);
  const inflationPct = state.planner.plan.inflationPct;

  const modeNote =
    data.mode === 'real'
      ? t('pdf.projections.modeNote.real', { inflation: inflationPct.toFixed(1) })
      : t('pdf.projections.modeNote.nominal');

  const tailRows: { labelKey: string; values: number[]; emphasized?: boolean }[] = [
    {
      labelKey: 'pdf.projections.tailRisk.row.p95',
      values: data.tailRisk.map((t) => t.p95),
    },
    {
      labelKey: 'pdf.projections.tailRisk.row.cvar95',
      values: data.tailRisk.map((t) => t.cvar95),
    },
    {
      labelKey: 'pdf.projections.tailRisk.row.median',
      values: data.tailRisk.map((tr) => data.bands.p50[tr.monthIdx]),
      emphasized: true,
    },
    {
      labelKey: 'pdf.projections.tailRisk.row.p5',
      values: data.tailRisk.map((t) => t.p5),
    },
    {
      labelKey: 'pdf.projections.tailRisk.row.cvar5',
      values: data.tailRisk.map((t) => t.cvar5),
    },
  ];

  return (
    <View style={styles.page}>
      <Text style={styles.header}>{state.client.name}</Text>
      <Text style={styles.title}>{t('pdf.projections.title')}</Text>
      <Text style={styles.subtitle}>
        {t('pdf.projections.subtitle', { years: horizonYears })}
      </Text>

      <SvgFanChart
        bands={data.bands}
        netContributions={data.netContributions}
        horizonMonths={data.horizonMonths}
      />

      <Text style={styles.modeNote}>{modeNote}</Text>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={styles.legendSwatchSolid} />
          <Text style={styles.legendText}>{t('pdf.projections.legend.median')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendSwatchBand} />
          <Text style={styles.legendText}>{t('pdf.projections.legend.bands')}</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendSwatchDashed} />
          <Text style={styles.legendText}>{t('pdf.projections.legend.contributions')}</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>{t('pdf.projections.howToRead.title')}</Text>
      <Text style={styles.body}>{t('pdf.projections.howToRead.body')}</Text>

      <Text style={styles.sectionLabel}>{t('pdf.projections.tailRisk.title')}</Text>
      <View style={styles.table}>
        <View style={styles.tableHeaderRow}>
          <Text style={styles.tableLabelMuted}>{t('pdf.projections.tailRisk.metric')}</Text>
          {data.tailRisk.map((tr, i) => (
            <Text key={`h${i}`} style={styles.tableHeaderCell}>
              {Math.round(tr.monthIdx / 12)} {t('pdf.projections.years')}
            </Text>
          ))}
        </View>
        {tailRows.map((row, ri) => {
          const isLast = ri === tailRows.length - 1;
          return (
            <View key={row.labelKey} style={isLast ? styles.tableRowLast : styles.tableRow}>
              <Text style={row.emphasized ? styles.tableLabel : styles.tableLabelMuted}>
                {t(row.labelKey)}
              </Text>
              {row.values.map((v, ci) => (
                <Text key={`v${ri}-${ci}`} style={styles.tableCell}>
                  {formatUsd(v)}
                </Text>
              ))}
            </View>
          );
        })}
      </View>
      <Text style={styles.tableFootnote}>{t('pdf.projections.tailRisk.footnote')}</Text>

      <View style={styles.narrativeBox}>
        <Text style={styles.narrativeText}>
          {t('pdf.projections.narrative', {
            yearsHorizon: data.narrative.years,
            lowBound: formatUsd(data.narrative.p5),
            highBound: formatUsd(data.narrative.p95),
            cvarLow: formatUsd(data.narrative.cvar5),
            deltaPct: formatPct(Math.abs(data.narrative.cvar5DeltaVsMedian)),
          })}
        </Text>
      </View>
    </View>
  );
}
