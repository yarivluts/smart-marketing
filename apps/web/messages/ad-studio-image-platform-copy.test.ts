import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// The image step names the ad platform the way a newcomer knows it, not by the company name "Meta".
describe('Ad Studio image step says Facebook and Instagram', () => {
  const enStudio = en.AdStudio as unknown as Record<string, any>;
  const heStudio = he.AdStudio as unknown as Record<string, any>;

  it('english destination label and size hint avoid the bare company name', () => {
    expect(enStudio.images.destination.meta).toBe('Facebook & Instagram');
    expect(JSON.stringify(enStudio)).not.toMatch(/Meta's/);
  });

  it('hebrew destination label and size hint name them in Hebrew', () => {
    expect(heStudio.images.destination.meta).toBe('פייסבוק ואינסטגרם');
    expect(JSON.stringify(heStudio)).not.toMatch(/של Meta/);
  });
});
