import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// The export step names the ad platform the way a newcomer knows it, not by the company name "Meta".
describe('Ad Studio export step says Facebook and Instagram', () => {
  const enStudio = en.AdStudio as unknown as Record<string, any>;
  const heStudio = he.AdStudio as unknown as Record<string, any>;

  it('english description and verification failure avoid the bare company name', () => {
    expect(enStudio.exportDescription).toContain('Facebook and Instagram');
    expect(enStudio.exportDescription).not.toMatch(/Meta/);
    expect(enStudio.exportFailure.account_action_required).toMatch(/^Facebook and Instagram/);
    expect(enStudio.exportFailure.account_action_required).not.toMatch(/Meta/);
  });

  it('hebrew description names them in Hebrew', () => {
    expect(heStudio.exportDescription).toContain('פייסבוק ואינסטגרם');
    expect(heStudio.exportDescription).not.toMatch(/מטא|Meta/);
  });
});
