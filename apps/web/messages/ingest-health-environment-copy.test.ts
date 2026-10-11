import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import he from './he.json';

/**
 * B16 (EasySign, 2026-09-25). With the environment picker on Dev, ingest health said
 * "77 records landed in the production environment": the copy hard-coded the environment,
 * so after KAN-196 scoped the read to the picked one, the sentence named the wrong one.
 * The environment is now an argument; this renders the real messages through next-intl
 * and checks each environment's own name appears, in both locales.
 */
describe('ingest-health warehouse freshness copy (B16)', () => {
  for (const [locale, messages] of [['en', en], ['he', he]] as const) {
    const t = createTranslator({ locale, messages, namespace: 'IngestHealth' });
    const tEnv = createTranslator({ locale, messages, namespace: 'EnvBadge' });

    it(`${locale}: names the environment the read was scoped to, not always production`, () => {
      for (const environment of ['dev', 'staging', 'prod'] as const) {
        const label = tEnv(environment);
        const line = t('warehouseFreshnessLine', { latestLandedAt: '2026-09-25 16:11:58', count: 77, environment: label });
        const empty = t('warehouseFreshnessEmpty', { environment: label });
        expect({ line: line.includes(label), empty: empty.includes(label) }).toEqual({ line: true, empty: true });
      }
    });
  }

  it('does not claim "production" in the scoped sentence any more', () => {
    expect(en.IngestHealth.warehouseFreshnessLine).not.toMatch(/production/i);
  });
});

/**
 * KAN-201 (EasySign): the arrival counts never change, so 47 probes dismissed long ago kept the
 * page reading as 47 open problems. The overall row now also says how many are still open.
 */
describe('ingest-health open-quarantine line (KAN-201)', () => {
  for (const [locale, messages] of [['en', en], ['he', he]] as const) {
    const t = createTranslator({ locale, messages, namespace: 'IngestHealth' });
    it(`${locale}: renders 0, 1 and many without falling back to the key`, () => {
      const rendered = [0, 1, 47].map((open) => t('openQuarantineLine', { open }));
      expect(rendered.every((line) => !line.includes('IngestHealth.'))).toBe(true);
      expect(new Set(rendered).size).toBe(3);
    });
  }

  it('en: calls the arrival count what it is', () => {
    expect(en.IngestHealth.countsLine).toContain('rejected on arrival');
    expect(en.IngestHealth.openQuarantineLine).toContain('still awaiting action');
  });
});
