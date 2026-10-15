import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot talks about what to grow, not "targets"', () => {
  it('uses plain words for the start steps, the list and the new-idea button', () => {
    const p = en.GrowthPilot;
    for (const text of [p.start.steps.propose, p.header.newTarget, p.targets.title, p.targets.empty, p.targets.next]) {
      expect(text).not.toMatch(/target/i);
    }
    expect(p.start.steps.propose).toBe('Proposes what to grow');
  });

  it('keeps the Hebrew start step in step with the English one', () => {
    expect(he.GrowthPilot.start.steps.propose).toBe('מציע מה לקדם');
  });
});
