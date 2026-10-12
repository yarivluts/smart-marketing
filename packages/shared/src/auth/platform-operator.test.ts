import { describe, expect, it } from 'vitest';
import { isPlatformOperator, platformOperatorEmails } from './platform-operator';

describe('platform operators (KAN-363)', () => {
  it('is nobody when the allowlist is unset or empty', () => {
    expect(isPlatformOperator('owner@example.com', {})).toBe(false);
    expect(isPlatformOperator('owner@example.com', { GROWTHOS_PLATFORM_OPERATORS: '' })).toBe(false);
    expect(platformOperatorEmails({ GROWTHOS_PLATFORM_OPERATORS: ' , ,' }).size).toBe(0);
  });

  it('matches listed emails, ignoring case and spaces', () => {
    const env = { GROWTHOS_PLATFORM_OPERATORS: ' Ops@GrowthOS.dev , second@example.com' };
    expect(isPlatformOperator('ops@growthos.dev', env)).toBe(true);
    expect(isPlatformOperator(' SECOND@example.com ', env)).toBe(true);
    expect(isPlatformOperator('customer@example.com', env)).toBe(false);
  });

  it('never matches a missing email or a non-email entry', () => {
    const env = { GROWTHOS_PLATFORM_OPERATORS: 'not-an-email,ops@growthos.dev' };
    expect(isPlatformOperator(null, env)).toBe(false);
    expect(isPlatformOperator(undefined, env)).toBe(false);
    expect(isPlatformOperator('not-an-email', env)).toBe(false);
  });
});
