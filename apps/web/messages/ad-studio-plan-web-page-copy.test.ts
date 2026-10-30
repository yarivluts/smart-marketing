import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Plan = {
  description: string;
  runningHint: string;
  source: { landing_page: string };
  landingPageSummary: string;
  pagesChartTitle: string;
  reasons: { results: { no_traffic: string } };
};
const plan = (m: unknown) => (m as { AdStudio: { plan: Plan } }).AdStudio.plan;

const texts = (p: Plan) => [
  p.description,
  p.runningHint,
  p.source.landing_page,
  p.landingPageSummary,
  p.pagesChartTitle,
  p.reasons.results.no_traffic,
];

describe('Ad Studio plan step speaks of the web page', () => {
  it('en says web page, not landing page', () => {
    for (const t of texts(plan(en))) expect(t).not.toMatch(/landing page/i);
    expect(plan(en).source.landing_page).toBe('Web page');
    expect(plan(en).description).toContain('web page');
  });
  it('he uses the same word as the rest of the app', () => {
    for (const t of texts(plan(he))) expect(t).not.toMatch(/דף הנחיתה|דפי נחיתה|דף נחיתה/);
    expect(plan(he).description).toContain('דף האינטרנט');
  });
});
