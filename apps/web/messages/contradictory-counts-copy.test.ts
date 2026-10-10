import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import he from './he.json';

/**
 * Numbers on a page must agree with each other. These render the real messages through next-intl
 * (both locales) for the four labels that used to contradict the numbers beside them.
 */
const LOCALES = [
  ['en', en],
  ['he', he],
] as const;

describe('dashboard setup-health KPI names the environment it averages', () => {
  for (const [locale, messages] of LOCALES) {
    const t = createTranslator({ locale, messages, namespace: 'DashboardPage' });
    const tEnv = createTranslator({ locale, messages, namespace: 'EnvBadge' });

    it(`${locale}: the KPI and the per-environment breakdown render without falling back to the key`, () => {
      const lines = [t('kpiAverageHealth'), t('kpiAverageHealthEmpty'), t('kpiAverageHealthSubtext', { count: 1 }), t('kpiAverageHealthSubtext', { count: 3 })];
      expect(lines.every((line) => !line.includes('DashboardPage.'))).toBe(true);
      const list = `${tEnv('prod')} 0% · ${tEnv('dev')} 83%`;
      expect(t('cardEnvironments', { list })).toContain(list);
    });
  }

  it('en: says the average is production', () => {
    expect(en.DashboardPage.kpiAverageHealth).toMatch(/prod/i);
    expect(en.DashboardPage.kpiAverageHealthSubtext).toMatch(/production/i);
  });
});

describe('plugins "ready to install" KPI counts plugins, and says packs separately', () => {
  for (const [locale, messages] of LOCALES) {
    const t = createTranslator({ locale, messages, namespace: 'ProjectPlugins' });
    it(`${locale}: renders 0, 1 and many built-in packs distinctly`, () => {
      const rendered = [0, 1, 8].map((count) => t('kpiAvailablePacks', { count }));
      expect(rendered.every((line) => !line.includes('ProjectPlugins.'))).toBe(true);
      expect(new Set(rendered).size).toBe(3);
    });
  }

  it('en: the KPI title says plugins, matching the install card', () => {
    expect(en.ProjectPlugins.kpiAvailable).toMatch(/plugins/i);
    expect(en.ProjectPlugins.kpiAvailablePacks).toMatch(/built-in pack/i);
  });
});

describe('metric types breakdown is over active metrics, and the derived-metrics bar is labelled', () => {
  it('en + he: the donut copy says active, and the progress bar has a label', () => {
    expect(en.MetricRegistry.typesCenter).toMatch(/active/i);
    expect(en.MetricRegistry.typesDescription).toMatch(/active metrics only/i);
    expect(en.MetricRegistry.kpiFormulaShareHint).toMatch(/active metrics/i);
    expect(he.MetricRegistry.kpiFormulaShareHint.length).toBeGreaterThan(0);
    expect(he.MetricRegistry.typesCenter).not.toBe(en.MetricRegistry.typesCenter);
  });
});

describe('schema-defs: never-received schemas are "not connected yet", and are not promised an alert', () => {
  for (const [locale, messages] of LOCALES) {
    const t = createTranslator({ locale, messages, namespace: 'SchemaRegistry' });
    it(`${locale}: the not-connected note renders for 1 and many`, () => {
      const rendered = [1, 4].map((count) => t('trackingAlertsNotConnectedNote', { count }));
      expect(rendered.every((line) => !line.includes('SchemaRegistry.'))).toBe(true);
      expect(new Set(rendered).size).toBe(2);
    });
  }

  it('en: says never-received schemas are not alerted, and alerts are for schemas that stopped', () => {
    expect(en.SchemaRegistry.eventNeverSeen).toMatch(/not connected yet/i);
    expect(en.SchemaRegistry.eventVolumeDescription).toMatch(/not alerted/i);
    expect(en.SchemaRegistry.eventVolumeDescription).toMatch(/was receiving records/i);
    // The old copy promised an alert for any silent schema, which the alert service never raises
    // for a schema that never landed a record.
    expect(en.SchemaRegistry.eventVolumeDescription).not.toMatch(/A schema silent for over an hour raises/);
    expect(en.SchemaRegistry.kpiSilentSchemas).not.toMatch(/silent/i);
    expect(en.SchemaRegistry.trackingAlertsNotConnectedNote).toMatch(/do not raise tracking alerts/);
  });
});
