import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import en from './en.json';
import he from './he.json';

const render = (locale: 'en' | 'he', message: string, reason: string): string =>
  createTranslator({ locale, messages: { m: message } })('m', { reason });

describe('refund reason line speaks plain words', () => {
  it.each(['requested_by_customer', 'duplicate', 'fraudulent'])('English hides the Stripe code %s', (code) => {
    const text = render('en', en.BillingOpsFeed.refundReasonLine, code);
    expect(text).not.toContain('_');
    expect(text).not.toBe(`Reason: ${code}`);
  });

  it('English keeps an unknown reason as written', () => {
    expect(render('en', en.BillingOpsFeed.refundReasonLine, 'Shipping delay')).toBe('Reason: Shipping delay');
  });

  it.each(['requested_by_customer', 'duplicate', 'fraudulent'])('Hebrew explains %s in Hebrew', (code) => {
    const text = render('he', he.BillingOpsFeed.refundReasonLine, code);
    expect(text).toMatch(/[֐-׿]/);
    expect(text).not.toContain(code);
  });
});
