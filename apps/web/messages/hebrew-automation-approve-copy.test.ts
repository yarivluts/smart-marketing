import { describe, expect, it } from 'vitest';
import he from './he.json';

// The automation list's approve/reject buttons use the same words as the Growth Pilot approval cards,
// not a bare singular command. Written as escapes: Hebrew stays out of code files.
describe('Hebrew automation approve and reject buttons', () => {
  it('match the Growth Pilot approval card wording', () => {
    expect(he.Automation.approveButton).toBe('אישור');
    expect(he.Automation.rejectButton).toBe('דחייה');
    expect(he.Automation.approveButton).toBe(he.GrowthPilot.waiting.approve);
    expect(he.Automation.rejectButton).toBe(he.GrowthPilot.waiting.reject);
  });
});
