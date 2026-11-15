import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('AI helper page title', () => {
  it.each([
    ['en', en],
    ['he', he],
  ])('is named like its menu link (%s)', (_name, m) => {
    const menu = m.AppShell.aiCopilotAndAutomation;
    expect(m.Automation.hubTitle).toBe(menu);
    expect(m.Automation.metaTitle).toBe(menu);
  });
});
