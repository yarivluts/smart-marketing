import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['projectFieldMappingsLink', 'projectBillingOpsFeedLink', 'projectRecordFeedLink'] as const;
const JARGON = /\b(ops|feed|mappings?|schema)\b/i;

describe('project sidebar names for the data pages', () => {
  it.each(['en', 'he'] as const)('%s names are set and free of engineering jargon', (locale) => {
    const nav = (locale === 'en' ? en : he).OrgDetailPage as Record<string, string>;
    for (const key of KEYS) {
      expect(nav[key]).toBeTruthy();
      if (locale === 'en') expect(nav[key]).not.toMatch(JARGON);
    }
  });

  it('page titles match the sidebar names', () => {
    const e = en as unknown as Record<string, Record<string, string>>;
    expect(e.FieldMappings.metaTitle).toBe(e.OrgDetailPage.projectFieldMappingsLink);
    expect(e.BillingOpsFeed.metaTitle).toBe(e.OrgDetailPage.projectBillingOpsFeedLink);
    expect(e.RecordFeed.metaTitle).toBe(e.OrgDetailPage.projectRecordFeedLink);
  });

  it('no sidebar link name contains another one (e2e role lookups match by substring)', () => {
    const nav = en.OrgDetailPage as Record<string, string>;
    const names = KEYS.map((k) => nav[k].toLowerCase());
    for (const other of [nav.projectSchemaRegistryLink, nav.projectIngestHealthLink, nav.projectHooksLink]) {
      for (const name of names) expect(name).not.toContain(other.toLowerCase());
    }
  });
});
