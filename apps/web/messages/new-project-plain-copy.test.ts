import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('new project page copy', () => {
  it('uses "business type" rather than "vertical" / תחום', () => {
    expect(en.NewProjectPage.formDescription).toMatch(/business type/);
    expect(en.NewProjectPage.formDescription).not.toMatch(/vertical/i);
    expect(he.NewProjectPage.formDescription).toMatch(/סוג עסק/);
    expect(he.NewProjectPage.formDescription).not.toMatch(/תחום/);
  });

  it('tells a newcomer they can let the AI do the setup guide, matching the guide button', () => {
    expect(en.NewProjectPage.nextDescription).toMatch(/AI do it/);
    expect(he.NewProjectPage.nextDescription).toMatch(/AI/);
    expect(he.NewProjectPage.nextDescription).not.toMatch(/הזן|בחר|לחץ/);
  });
});
