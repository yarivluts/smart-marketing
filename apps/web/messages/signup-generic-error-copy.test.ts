import { describe, expect, it } from 'vitest';
import en from './en.json';
import he from './he.json';

describe('sign-up failure wording', () => {
  it('en says the account could not be created and that nothing changed', () => {
    expect(en.Auth.signUpGenericError).toMatch(/create your account/i);
    expect(en.Auth.signUpGenericError).toMatch(/nothing was changed/i);
  });

  it('he has its own line, written in Hebrew', () => {
    expect(he.Auth.signUpGenericError).toMatch(/[֐-׿]/);
    expect(he.Auth.signUpGenericError).not.toBe(he.Auth.genericError);
  });
});
