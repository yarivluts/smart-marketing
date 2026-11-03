import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const strings = (m: unknown): string[] =>
  typeof m === 'string' ? [m] : m && typeof m === 'object' ? Object.values(m).flatMap(strings) : [];

describe('Feedback, Support and Churn empty states do not name raw event codes', () => {
  it('shows no survey_response, support_ticket_event or cancellation_reason in either language', () => {
    for (const messages of [en, he]) {
      const hits = strings(messages).filter((s) => /survey_response|support_ticket_event|cancellation_reason/.test(s));
      expect(hits).toEqual([]);
    }
  });
});
