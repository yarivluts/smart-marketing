import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Section = Record<string, unknown>;
const text = (m: Section) =>
  [m.noEventSchemas, m.filterOperatorLabel, ...Object.values(m.winTypeHint as Record<string, string>)].join(' ');

describe('Win rules: plain words', () => {
  it('en: no schema / churn / CSAT / operator jargon', () => {
    expect(text((en as unknown as Record<string, Section>).WinRules)).not.toMatch(/schema|churn|csat|operator|register/i);
  });

  it('he: no סכימה / CSAT / אופרטור jargon', () => {
    expect(text((he as unknown as Record<string, Section>).WinRules)).not.toMatch(/סכימ|csat|אופרטור|לרשום/i);
  });

  it('the empty state says what to do next', () => {
    expect((en as unknown as Record<string, Section>).WinRules.noEventSchemas).toMatch(/Connect your website/);
  });

  it('the filter field example says what the technical name means, in en and he', () => {
    const en_ = (en as unknown as Record<string, Section>).WinRules.filterFieldPlaceholder as string;
    const he_ = (he as unknown as Record<string, Section>).WinRules.filterFieldPlaceholder as string;
    expect(en_).toMatch(/properties\.amount \(the order amount\)/);
    expect(he_).toMatch(/properties\.amount \(.+\)/);
  });
});
