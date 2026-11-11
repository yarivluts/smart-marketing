import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

// "Try more versions" is explained without the word "variant" or the company name "Meta".
describe('Ad Studio extra versions copy', () => {
  const enPub = (en.AdStudio as any).publish;
  const hePub = (he.AdStudio as any).publish;

  it('english hint and result avoid "variant" and "(Meta)"', () => {
    expect(enPub.variantsHint).not.toMatch(/Meta/);
    expect(enPub.doneVariants).not.toMatch(/variant/i);
    expect(enPub.doneVariants).toMatch(/extra ads? could not be created/);
  });

  it('hebrew hint names the platforms in Hebrew only', () => {
    expect(hePub.variantsHint).not.toMatch(/Meta/);
  });
});
