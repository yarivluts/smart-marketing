import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Copy = Record<string, Record<string, string>>;

const KEYS = [
  'noManifestsToInstall',
  'builtinPacksIntro',
  'sourceRunCursorLine',
  'sourceRunCountsLine',
  'sourceRunCursorFromScratch',
  'sourceRunNoEnvironments',
];

describe('project ready-made connections page', () => {
  it.each([
    ['en', en],
    ['he', he],
  ] as const)(
    '%s: no developer words (manifest, cursor, quarantine, environment)',
    (_l, messages) => {
      const plugins = (messages as unknown as Copy).ProjectPlugins;
      for (const key of KEYS) {
        expect(plugins[key], key).toBeTruthy();
        expect(plugins[key].replace(/\{[^}]*\}/g, ''), key).not.toMatch(
          /manifest|cursor|quarantin|environment|מניפסט|סמן|סביב|הוסגרו/i,
        );
      }
    },
  );

  it('keeps the placeholders the page fills in', () => {
    for (const messages of [en, he]) {
      const p = (messages as unknown as Copy).ProjectPlugins;
      expect(p.sourceRunCursorLine).toContain('{before}');
      expect(p.sourceRunCursorLine).toContain('{after}');
      expect(p.sourceRunCountsLine).toContain('{quarantined}');
    }
  });
});
