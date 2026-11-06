import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the sidebar has one "Settings" and one "Advanced settings"', () => {
  it('the heading over the extra tools differs from the Settings link, in English and Hebrew', () => {
    expect(en.AppShell.settingsSection).not.toBe(en.AppShell.settings);
    expect(he.AppShell.settingsSection).not.toBe(he.AppShell.settings);
    expect(en.AppShell.settingsSection).toMatch(/advanced/i);
    expect(he.AppShell.settingsSection).toContain(he.AppShell.settings);
  });
});
