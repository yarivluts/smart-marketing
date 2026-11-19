import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = [
  'orchestrationTriggerButton',
  'orchestrationTriggerError',
  'queuedMessagesHeading',
  'noQueuedMessages',
  'queuedMessageSummary',
  'sweepQueuedMessages',
  'sweepQueuedMessagesError',
  'flowTitle',
  'flowDescription',
] as const;

describe('the Data health page speaks plainly', () => {
  it('English avoids orchestration / sweep / pipeline / queue / API jargon', () => {
    for (const key of KEYS) {
      expect(en.IngestHealth[key]).not.toMatch(/orchestrat|sweep|pipeline|queue|\bAPI\b/i);
    }
  });

  it('Hebrew stays in Hebrew, without תזמור, צינור or Latin jargon', () => {
    for (const key of KEYS) {
      const text = he.IngestHealth[key].replace(/\{[^}]*\}/g, '');
      expect(text).toMatch(/[֐-׿]/);
      expect(text).not.toMatch(/[A-Za-z]|תזמור|צינור/);
    }
  });

  it('the refresh button says what it does', () => {
    expect(en.IngestHealth.orchestrationTriggerButton).toBe('Refresh now');
    expect(en.IngestHealth.orchestrationTriggerError).toMatch(/refresh your reports/i);
  });
});
