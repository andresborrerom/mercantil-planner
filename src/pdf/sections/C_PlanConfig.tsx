/**
 * Sección C — Configuración del plan.
 *
 * Documenta de forma compacta lo que vio el cliente al cierre de la sesión:
 *   - Plan: capital, horizonte, modo, inflación.
 *   - Reglas de flujo activas (aportes/retiros).
 *   - Look-through ETF de portafolios A y B (tickers + pesos).
 *   - Bootstrap config (seed, nPaths, blockSize, tasas FIXED).
 *
 * Es la "huella técnica" que permite reproducir la simulación: junto con el
 * sessionId del footer, cualquier asesor puede regenerar exactamente las
 * mismas proyecciones que el cliente recibió.
 */
import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { useTranslation } from 'react-i18next';

import { AMC_LABELS, etfWeightTable, expandPortfolio } from '../../domain/amc-definitions';
import type { FlowRule, PortfolioSpec } from '../../domain/types';
import { colors } from '../theme/colors';
import { fonts, fontSize, lineHeight } from '../theme/typography';
import { pageMargin, spacing } from '../theme/spacing';
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
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.h1,
    color: colors.ink,
    marginBottom: spacing.lg,
    lineHeight: lineHeight.tight,
  },
  block: {
    marginBottom: spacing.lg,
  },
  blockLabel: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  kvRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  kvKey: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.muted,
    width: 130,
  },
  kvValue: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
    color: colors.ink,
    flex: 1,
  },
  ruleLine: {
    fontFamily: fonts.sans,
    fontSize: fontSize.body,
    color: colors.body,
    lineHeight: lineHeight.normal,
    marginBottom: spacing.xs,
  },
  ruleSign: {
    fontFamily: fonts.sansBold,
    color: colors.ink,
  },
  rulesEmpty: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.body,
    color: colors.muted,
  },
  portfoliosRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  portfolioCol: {
    flex: 1,
  },
  portfolioHead: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.body,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  portfolioSubhead: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.caption,
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: colors.hairline,
    paddingBottom: 2,
    marginTop: spacing.xs,
  },
  tableHeadCell: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flex: 1,
  },
  tableHeadCellRight: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.micro,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    textAlign: 'right',
    width: 50,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 1.5,
  },
  tableCell: {
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.body,
    flex: 1,
  },
  tableCellRight: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.caption,
    color: colors.ink,
    textAlign: 'right',
    width: 50,
  },
  fixedNote: {
    fontFamily: fonts.sansOblique,
    fontSize: fontSize.micro,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  bootstrapLine: {
    fontFamily: fonts.sans,
    fontSize: fontSize.caption,
    color: colors.body,
    lineHeight: lineHeight.normal,
  },
});

type Props = {
  state: PdfStateContainer;
};

export function PlanConfigSection({ state }: Props): JSX.Element {
  const { t } = useTranslation();
  const { plan, bootstrap, portfolioA, portfolioB } = state.planner;
  const horizonYears = (plan.horizonMonths / 12).toFixed(1);
  const modeText =
    plan.mode === 'real'
      ? t('pdf.planConfig.modeReal', { pct: plan.inflationPct.toFixed(1) })
      : t('pdf.planConfig.modeNominal');

  return (
    <View style={styles.page}>
      <Text style={styles.header}>{state.client.name}</Text>
      <Text style={styles.title}>{t('pdf.planConfig.title')}</Text>

      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('pdf.planConfig.plan')}</Text>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>{t('pdf.planConfig.initialCapital')}</Text>
          <Text style={styles.kvValue}>${plan.initialCapital.toLocaleString('en-US')}</Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>{t('pdf.planConfig.horizon')}</Text>
          <Text style={styles.kvValue}>
            {plan.horizonMonths} {t('pdf.planConfig.months')} ({horizonYears} {t('pdf.planConfig.years')})
          </Text>
        </View>
        <View style={styles.kvRow}>
          <Text style={styles.kvKey}>{t('pdf.planConfig.mode')}</Text>
          <Text style={styles.kvValue}>{modeText}</Text>
        </View>
      </View>

      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('pdf.planConfig.rules')}</Text>
        {plan.rules.length === 0 ? (
          <Text style={styles.rulesEmpty}>{t('pdf.planConfig.rulesEmpty')}</Text>
        ) : (
          plan.rules.map((r) => <RuleLine key={r.id} rule={r} horizonMonths={plan.horizonMonths} />)
        )}
      </View>

      <View style={styles.portfoliosRow}>
        <PortfolioColumn
          accent={t('pdf.planConfig.portfolioA')}
          spec={portfolioA}
        />
        <PortfolioColumn
          accent={t('pdf.planConfig.portfolioB')}
          spec={portfolioB}
        />
      </View>

      <View style={styles.block}>
        <Text style={styles.blockLabel}>{t('pdf.planConfig.bootstrap')}</Text>
        <Text style={styles.bootstrapLine}>
          {t('pdf.planConfig.seed')}: {bootstrap.seed}  ·  {t('pdf.planConfig.nPaths')}:{' '}
          {bootstrap.nPaths.toLocaleString('en-US')}  ·  {t('pdf.planConfig.blockSize')}:{' '}
          {bootstrap.blockSize} {t('pdf.planConfig.months')}  ·  FIXED6:{' '}
          {(bootstrap.fixed6Annual * 100).toFixed(2)}%  ·  FIXED9:{' '}
          {(bootstrap.fixed9Annual * 100).toFixed(2)}%
        </Text>
      </View>
    </View>
  );
}

function RuleLine({ rule, horizonMonths }: { rule: FlowRule; horizonMonths: number }): JSX.Element {
  const { t } = useTranslation();
  const signKey = rule.sign === 'deposit' ? 'pdf.planConfig.deposit' : 'pdf.planConfig.withdraw';
  const freqKey = `pdf.planConfig.freq.${rule.frequency}` as const;
  const startMonth = rule.startMonth;
  const endMonth = rule.endMonth ?? horizonMonths;
  const rangeText =
    startMonth === endMonth
      ? `${t('pdf.planConfig.month')} ${startMonth}`
      : `${t('pdf.planConfig.month')} ${startMonth}–${endMonth}`;
  const growthSuffix =
    rule.growthPct && rule.growthPct !== 0
      ? `, ${rule.growthPct > 0 ? '+' : ''}${rule.growthPct}% ${t('pdf.planConfig.annualGrowth')}`
      : '';
  return (
    <Text style={styles.ruleLine}>
      <Text style={styles.ruleSign}>{t(signKey)}</Text> ${rule.amount.toLocaleString('en-US')}{' '}
      {t(freqKey)} ({rangeText}
      {growthSuffix})
      {rule.label ? ` — ${rule.label}` : ''}
    </Text>
  );
}

function PortfolioColumn({
  accent,
  spec,
}: {
  accent: string;
  spec: PortfolioSpec;
}): JSX.Element {
  const { t } = useTranslation();
  const expanded = expandPortfolio(spec);
  const etfRows = etfWeightTable(expanded);
  const fixed6 = expanded.fixed.FIXED6 ?? 0;
  const fixed9 = expanded.fixed.FIXED9 ?? 0;
  const totalFixed = fixed6 + fixed9;

  return (
    <View style={styles.portfolioCol}>
      <Text style={styles.portfolioHead}>{accent}</Text>
      <Text style={styles.portfolioSubhead}>{describePortfolio(spec, t)}</Text>
      {totalFixed > 0 && (
        <Text style={styles.fixedNote}>
          FIXED6 {fixed6.toFixed(2)}% + FIXED9 {fixed9.toFixed(2)}% = {totalFixed.toFixed(2)}%{' '}
          {t('pdf.planConfig.fixedNote')}
        </Text>
      )}
      <View style={styles.tableHead}>
        <Text style={styles.tableHeadCell}>{t('pdf.planConfig.etf')}</Text>
        <Text style={styles.tableHeadCellRight}>{t('pdf.planConfig.weight')}</Text>
      </View>
      {etfRows.map((row) => (
        <View key={row.ticker} style={styles.tableRow}>
          <Text style={styles.tableCell}>{row.ticker}</Text>
          <Text style={styles.tableCellRight}>{row.weight.toFixed(2)}%</Text>
        </View>
      ))}
    </View>
  );
}

function describePortfolio(spec: PortfolioSpec, t: ReturnType<typeof useTranslation>['t']): string {
  switch (spec.kind) {
    case 'signature':
      return `${t('pdf.planConfig.signature')}: ${spec.id}`;
    case 'amc':
      return `${t('pdf.planConfig.amc')}: ${AMC_LABELS[spec.id]}`;
    case 'custom':
      return `${t('pdf.planConfig.custom')}: ${spec.label}`;
  }
}
