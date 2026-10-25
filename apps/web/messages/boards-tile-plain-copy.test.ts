import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Boards tile editor speaks plain words', () => {
  it('English calls the funnel tile and its steps the customer path', () => {
    expect(en.Boards.tileType.funnel).toBe('Customer path');
    expect(en.Boards.funnelStepsLabel).not.toMatch(/funnel/i);
  });

  it('Hebrew avoids the funnel word in the tile type and steps label', () => {
    expect(he.Boards.tileType.funnel).not.toMatch(/משפך/);
    expect(he.Boards.funnelStepsLabel).not.toMatch(/משפך/);
  });
});
