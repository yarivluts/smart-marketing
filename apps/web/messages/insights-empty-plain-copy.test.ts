import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// The empty Alerts and wins page must not send a newcomer to "register schemas".
describe('Insights empty-state next step is plain', () => {
  const enI = en.Insights as unknown as Record<string, string>;
  const heI = he.Insights as unknown as Record<string, string>;

  it('avoids jargon and says to connect data first', () => {
    expect(enI.emptyNextStep).not.toMatch(/schema|register|metrics/i);
    expect(enI.emptyNextStep).toMatch(/Connect your website/);
  });

  it('is Hebrew without Latin letters or the old word for schemas', () => {
    expect(heI.emptyNextStep).toBeTruthy();
    expect(heI.emptyNextStep).not.toMatch(/[A-Za-z]/);
    expect(heI.emptyNextStep).not.toMatch(/סכמות/);
  });
});
