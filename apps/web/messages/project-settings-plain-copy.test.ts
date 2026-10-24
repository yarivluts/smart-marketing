import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'intro',
  'verticalLabel',
  'verticalHelp',
  'currencyHelp',
  'timezoneHelp',
  'invalidCurrencyError',
  'invalidTimezoneError',
] as const;

describe('project settings copy', () => {
  it('has no standards names or "vertical" in either language', () => {
    for (const key of KEYS) {
      expect(en.ProjectSettings[key], key).not.toMatch(/ISO|IANA|vertical|declared|denominated/i);
      expect(he.ProjectSettings[key], key).not.toMatch(/ISO|IANA|תחום|נקובים/);
    }
  });

  it('calls the field "business type", matching the new-project page', () => {
    expect(en.ProjectSettings.verticalLabel).toBe('Business type');
    expect(he.ProjectSettings.verticalLabel).toBe('סוג העסק');
  });

  it('still shows an example for the time zone and currency', () => {
    expect(en.ProjectSettings.timezoneHelp).toMatch(/Asia\/Jerusalem/);
    expect(he.ProjectSettings.timezoneHelp).toMatch(/Asia\/Jerusalem/);
    expect(en.ProjectSettings.currencyHelp).toMatch(/USD/);
    expect(he.ProjectSettings.currencyHelp).toMatch(/USD/);
  });
});
