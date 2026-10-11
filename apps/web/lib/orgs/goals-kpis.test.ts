import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import enMessages from '@/messages/en.json';
import heMessages from '@/messages/he.json';
import { buildGoalsKpiValues, type GoalsKpiText } from './goals-kpis';

function textFor(locale: 'en' | 'he'): GoalsKpiText {
  const t = createTranslator({ locale, messages: locale === 'en' ? enMessages : heMessages, namespace: 'Goals' });
  const numberFormat = new Intl.NumberFormat(locale);
  return {
    formatNumber: (value) => numberFormat.format(value),
    ofMeasured: (count, total) => t('kpiOfMeasured', { count, total }),
    percent: (percent) => t('percentValue', { percent }),
    emptyValue: t('kpiEmptyValue'),
    avgProgressNone: t('kpiAvgProgressNone'),
  };
}

const NONE_MEASURED = { measuredGoalsCount: 0, onTrackCount: 0, atRiskCount: 0, offTrackCount: 0, averageProgressPct: null };

describe('buildGoalsKpiValues', () => {
  it('shows counts over existing-but-unmeasured goals as 0, never "No data"', () => {
    const kpis = buildGoalsKpiValues(NONE_MEASURED, textFor('en'));
    expect(kpis.onTrack).toBe('0');
    expect(kpis.needsAttention).toBe('0');
    expect(kpis.onTrack).not.toBe(enMessages.Goals.kpiNoValue);
    expect(kpis.needsAttention).not.toBe(enMessages.Goals.kpiNoValue);
  });

  it('shows an average with nothing to average as an empty value with a reason, not 0%', () => {
    const kpis = buildGoalsKpiValues(NONE_MEASURED, textFor('en'));
    expect(kpis.avgProgress).toBe('—');
    expect(kpis.avgProgress).not.toMatch(/%/);
    expect(kpis.avgProgressSubtext).toBe(enMessages.Goals.kpiAvgProgressNone);
    // No progress bar is drawn for an average that does not exist.
    expect(kpis.avgProgressBar).toBeUndefined();
  });

  it('shows measured counts and the measured average as numbers', () => {
    const kpis = buildGoalsKpiValues(
      { measuredGoalsCount: 4, onTrackCount: 1, atRiskCount: 2, offTrackCount: 1, averageProgressPct: 0 },
      textFor('en'),
    );
    expect(kpis.onTrack).toBe('1 of 4 measured');
    expect(kpis.needsAttention).toBe('3');
    // A measured average of 0% is a real result and is shown as one.
    expect(kpis.avgProgress).toBe('0%');
    expect(kpis.avgProgressSubtext).toBeUndefined();
    expect(kpis.avgProgressBar).toBe(0);
  });

  it('renders the Hebrew empty-average explanation from he.json', () => {
    const kpis = buildGoalsKpiValues(NONE_MEASURED, textFor('he'));
    expect(kpis.avgProgress).toBe('—');
    expect(kpis.avgProgressSubtext).toBe(heMessages.Goals.kpiAvgProgressNone);
  });
});
