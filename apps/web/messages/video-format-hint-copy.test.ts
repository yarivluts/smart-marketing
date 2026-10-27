import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('Ad Studio wide-video format hint uses plain words', () => {
  it('does not use the ad-platform term "in-stream" in either language', () => {
    expect(en.AdStudio.formatHorizontalHint).not.toMatch(/in-stream/i);
    expect(he.AdStudio.formatHorizontalHint).not.toMatch(/in-stream/i);
  });

  it('says the format is a wide video, in both languages', () => {
    expect(en.AdStudio.formatHorizontalHint).toContain('wide');
    expect(he.AdStudio.formatHorizontalHint).toContain('לרוחב');
  });
});
