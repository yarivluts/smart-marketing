import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const pages = [
  ['Hooks', 'projectHooksLink'],
  ['SchemaRegistry', 'projectSchemaRegistryLink'],
  ['IngestHealth', 'projectIngestHealthLink'],
  ['CohortRetention', 'projectCohortsLink'],
] as const;

describe('page titles use the same plain names as the sidebar', () => {
  for (const [lang, msgs] of [['en', en], ['he', he]] as const) {
    for (const [ns, navKey] of pages) {
      it(`${lang}: ${ns} heading starts with its sidebar name`, () => {
        const page = (msgs as unknown as Record<string, Record<string, string>>)[ns];
        const nav = Object.values(msgs).map((v) => (v as Record<string, string>)?.[navKey]).find(Boolean);
        expect(nav).toBeTruthy();
        expect(page.metaTitle).toBe(nav);
        expect(page.title.startsWith(nav as string)).toBe(true);
        expect(page.title).toContain('{projectName}');
      });
    }
  }
});
