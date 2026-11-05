import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio video style names', () => {
  it('describe the phone-filmed style in plain words, not the acronym UGC (en + he)', () => {
    for (const messages of [en, he]) {
      const label = messages.AdStudio.advanced.style.ugc_phone;
      expect(label).not.toMatch(/UGC/);
      expect(label.length).toBeGreaterThan(10);
    }
    expect(en.AdStudio.advanced.style.ugc_phone).toBe('Filmed on a phone, like a real customer');
  });
});
