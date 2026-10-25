import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'kpiProfile',
  'kpiProfileSubtext',
  'kpiEnvironments',
  'notDeclared',
  'environmentsTitle',
  'environmentsDescription',
  'environmentsNone',
] as const;

describe('project settings summary copy', () => {
  it('has no developer words in either language', () => {
    for (const key of KEYS) {
      expect(en.ProjectSettings[key], key).not.toMatch(/environment|completeness|declared/i);
      expect(he.ProjectSettings[key], key).not.toMatch(/סביבות|שלמות/);
    }
  });

  it('explains data spaces as live data kept apart from test data', () => {
    expect(en.ProjectSettings.environmentsDescription).toMatch(/live data.*test data/);
    expect(he.ProjectSettings.environmentsDescription).toMatch(/בדיקה/);
  });

  it('keeps the placeholders the page fills in', () => {
    expect(en.ProjectSettings.kpiProfileSubtext).toMatch(/\{filled\}.*\{total\}/);
    expect(he.ProjectSettings.kpiProfileSubtext).toMatch(/\{filled\}.*\{total\}/);
  });
});
