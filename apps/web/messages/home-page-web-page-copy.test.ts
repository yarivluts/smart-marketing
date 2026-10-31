import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Home = {
  metaDescription: string;
  subtitle: string;
  step2Body: string;
  [key: string]: unknown;
};
const home = (m: unknown) => (m as { HomePage: Home }).HomePage;

const flat = (o: unknown): string[] =>
  typeof o === 'string' ? [o] : o && typeof o === 'object' ? Object.values(o).flatMap(flat) : [];

describe('first page a newcomer sees speaks of web pages', () => {
  it('en does not use the marketing term "landing page"', () => {
    for (const t of flat(home(en))) expect(t).not.toMatch(/landing page/i);
    expect(home(en).subtitle).toContain('web pages');
    expect(home(en).step2Body).toContain('a web page');
  });
  it('he uses the same word as the rest of the app', () => {
    for (const t of flat(home(he))) expect(t).not.toMatch(/נחיתה/);
    expect(home(he).subtitle).toContain('דפי אינטרנט');
    expect(home(he).step2Body).toContain('דף אינטרנט');
  });
});
