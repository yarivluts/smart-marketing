import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import he from '../../messages/he.json';
import { DEVELOPER_GUIDES, adjacentGuides, developerGuideHref } from './guides';
import { NODE_SDK_VERSION } from './context';

const REQUIRED_PER_GUIDE = ['title', 'intro'] as const;

describe('developer guides', () => {
  it('has a title, intro and nav label for every guide, in both languages', () => {
    for (const messages of [en, he]) {
      const developers = messages.Developers as unknown as Record<string, Record<string, unknown>>;
      for (const guide of DEVELOPER_GUIDES) {
        for (const field of REQUIRED_PER_GUIDE) expect(developers[guide.key]?.[field], `${guide.key}.${field}`).toEqual(expect.any(String));
        expect(developers.nav[guide.key], `nav.${guide.key}`).toEqual(expect.any(String));
        if (guide.key !== 'overview') {
          expect((developers.overview.cards as Record<string, string>)[guide.key], `overview.cards.${guide.key}`).toEqual(expect.any(String));
        }
      }
    }
  });

  it('keeps the same Developers keys in English and Hebrew', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      typeof value === 'object' && value !== null
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix.slice(0, -1)];
    expect(keys(he.Developers).sort()).toEqual(keys(en.Developers).sort());
  });

  it('links guides in reading order, with no previous before the first or next after the last', () => {
    expect(developerGuideHref(DEVELOPER_GUIDES[0])).toBe('/developers');
    expect(developerGuideHref(DEVELOPER_GUIDES[1])).toBe('/developers/quick-start');
    expect(adjacentGuides('overview')).toEqual({ previous: undefined, next: DEVELOPER_GUIDES[1] });
    expect(adjacentGuides('testing').next).toBeUndefined();
    expect(adjacentGuides('api')).toEqual({ previous: DEVELOPER_GUIDES[3], next: DEVELOPER_GUIDES[5] });
  });

  it('pins the Node SDK version the install command names to the package actually served', () => {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../../../packages/sdk-node/package.json'), 'utf8')) as {
      version: string;
    };
    expect(NODE_SDK_VERSION).toBe(pkg.version);
  });
});
