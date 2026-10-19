import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

const KEYS = ['existingEndpointsHeading', 'noEndpoints', 'createEndpointHeading', 'heroDescription'] as const;

describe('the incoming data links page speaks plainly', () => {
  it('English headings match the page title and avoid hook / webhook / payload / API jargon', () => {
    for (const key of KEYS) {
      expect(en.Hooks[key]).not.toMatch(/hook|payload|\bAPI\b|ingest|endpoint/i);
    }
    expect(en.Hooks.existingEndpointsHeading).toMatch(/incoming data link/i);
    expect(en.Hooks.createEndpointHeading).toMatch(/incoming data link/i);
  });

  it('the empty state says what to do next', () => {
    expect(en.Hooks.noEndpoints).toMatch(/Create one/);
    expect(he.Hooks.noEndpoints).toMatch(/צרו אחד/);
  });

  it('Hebrew stays in Hebrew, with no pointed webhook, English jargon or old technical names', () => {
    for (const key of KEYS) {
      expect(he.Hooks[key]).toMatch(/[֐-׿]/);
      expect(he.Hooks[key]).not.toMatch(/וֶבְּהוּק|webhook|API|מטען|נקודות? קצה|נקודות? קבלה/i);
    }
    expect(he.Hooks.existingEndpointsHeading).toMatch(/קישורי הנתונים הנכנסים/);
  });
});
