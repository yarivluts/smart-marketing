import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Next serves app/icon.svg as the site icon and links it from every page; without one, every page
// load asked for /favicon.ico and got a 404.
describe('site icon', () => {
  it('is a square SVG with its own background, so it reads on light and dark browser tabs', () => {
    const svg = readFileSync(join(__dirname, 'icon.svg'), 'utf8');
    expect(svg).toMatch(/^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toMatch(/<rect width="32" height="32"/);
  });
});
