import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

type Section = Record<string, unknown>;
const reason = (m: unknown) =>
  ((m as Record<string, Section>).Connections.reasons as Record<string, string>).developer_token_not_approved;

describe('Ad connections: Google approval failure in plain words', () => {
  it('en: explains the state and the next step without "developer token"', () => {
    expect(reason(en)).not.toMatch(/developer token/i);
    expect(reason(en)).toMatch(/test mode/);
    expect(reason(en)).toMatch(/API Center/);
    expect(reason(en)).toMatch(/check again/);
  });

  it('he: explains the state and the next step without "Developer token"', () => {
    expect(reason(he)).not.toMatch(/developer token/i);
    expect(reason(he)).toMatch(/מצב ניסיון/);
    expect(reason(he)).toMatch(/API Center/);
    expect(reason(he)).toMatch(/בדקו שוב/);
  });
});
