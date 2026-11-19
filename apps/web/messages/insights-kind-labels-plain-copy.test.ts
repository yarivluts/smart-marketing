import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// Alert kinds on the Alerts and wins page are named in everyday words, not "metric health".
describe('Insights kind labels and actions are plain', () => {
  const kinds = ['tracking_alert', 'win_event', 'metric_health'] as const;

  it('avoids marketing-analytics jargon in English', () => {
    for (const k of kinds) {
      expect(en.Insights.kindLabel[k]).not.toMatch(/tracking|metric|health/i);
      expect(en.Insights.kindAction[k]).not.toMatch(/metric|health/i);
    }
  });

  it('has Hebrew for every kind, without Latin letters', () => {
    for (const k of kinds) {
      expect(he.Insights.kindLabel[k]).toBeTruthy();
      expect(he.Insights.kindLabel[k]).not.toMatch(/[A-Za-z]/);
      expect(he.Insights.kindAction[k]).not.toMatch(/[A-Za-z]/);
    }
    expect(he.Insights.kindLabel.tracking_alert).not.toMatch(/מעקב/);
  });
});
