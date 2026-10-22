import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const pick = (m: typeof en | typeof he) => [
  m.AdStudio.video.notConfigured,
  m.AdStudio.images.notConfigured,
  m.AdStudio.references.unavailable.illustration,
  m.AdStudio.references.errors.illustration_not_configured,
  m.AdStudio.clipFailure.not_configured,
  m.AdStudio.imageFailure.not_configured,
  m.AdStudio.autopilot.reason.not_configured,
  m.AdStudio.providerErrors.provider_billing,
];

describe('Ad Studio "not available" messages are in plain words', () => {
  it('en: no deployment/model/provider talk, and a next step where it matters', () => {
    for (const text of pick(en)) expect(text).not.toMatch(/deployment|configured|provider|model/i);
    expect(en.AdStudio.video.notConfigured).toMatch(/AI helper|admin/);
    expect(en.AdStudio.providerErrors.provider_billing).toMatch(/admin/);
  });

  it('he: no "environment"/"model" talk', () => {
    for (const text of pick(he)) expect(text).not.toMatch(/בסביבה|מודל|ספק|הוגדר/);
    expect(he.AdStudio.video.notConfigured).toMatch(/מנהל החשבון/);
    expect(he.AdStudio.providerErrors.provider_billing).toMatch(/מנהל החשבון/);
  });
});
