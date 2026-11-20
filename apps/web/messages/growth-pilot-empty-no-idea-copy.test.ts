import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Growth Pilot empty list when nothing is waiting for approval', () => {
  it('does not tell the person to approve a proposal that is not there', () => {
    const text = en.GrowthPilot.targets.emptyNoIdea;
    expect(text).toBe('Nothing is being grown yet. An idea you say yes to appears here.');
    expect(text).not.toMatch(/approve a proposal/i);
  });

  it('has a Hebrew line without Latin letters', () => {
    expect(he.GrowthPilot.targets.emptyNoIdea).not.toMatch(/[A-Za-z]/);
    expect(he.GrowthPilot.targets.emptyNoIdea.length).toBeGreaterThan(10);
  });
});
