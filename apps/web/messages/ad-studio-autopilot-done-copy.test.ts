import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('the autopilot "all done" line points at the Publish step, not a removed "export"', () => {
  for (const [name, lang] of [
    ['en', en],
    ['he', he],
  ] as const) {
    const a = lang.AdStudio as unknown as { autopilot: { doneHint: string }; stepper: { publish: { label: string } } };

    it(`names publishing and says ads start paused (${name})`, () => {
      expect(a.autopilot.doneHint).not.toMatch(name === 'en' ? /export/i : /ייצא/);
      expect(a.autopilot.doneHint).toMatch(name === 'en' ? /Publish/ : /לפרסום/);
      expect(a.autopilot.doneHint).toMatch(name === 'en' ? /paused/ : /מושהות/);
    });
  }
});
