// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { cachedAddressCheck, decideDemoRequest, isDeniedElement, isSameSite, registrableDomain } from './demo-policy';

describe('isDeniedElement', () => {
  it.each([
    'Delete project',
    'Remove member',
    'Log out',
    'Logout',
    'Sign out',
    'Cancel subscription',
    'Billing',
    'Payment methods',
    'Pay now',
    'Buy credits',
    'Upgrade plan',
    'Invite teammates',
    'Send',
    'Publish',
    'Archive',
    'Reset password',
    'Save changes',
  ])('never clicks "%s"', (name) => {
    expect(isDeniedElement({ name })).toBe(true);
  });

  it('reads link addresses too', () => {
    expect(isDeniedElement({ name: 'Account', href: '/account/billing' })).toBe(true);
    expect(isDeniedElement({ name: '', href: '/users/sign_out' })).toBe(true);
    expect(isDeniedElement({ name: 'Me', href: '/auth/logout?next=/' })).toBe(true);
  });

  it('denies the Hebrew words as well', () => {
    // "delete", "log out", "payment", "upgrade the plan", with the attached "and" prefix.
    for (const name of ['מחק', 'התנתקות', 'תשלום', 'ושדרג']) {
      expect(isDeniedElement({ name })).toBe(true);
    }
  });

  it('allows ordinary navigation', () => {
    for (const name of ['Dashboard', 'Reports', 'Contacts', 'Analytics', 'Documents', 'Templates']) expect(isDeniedElement({ name, href: `/${name.toLowerCase()}` })).toBe(false);
    // "Reports" in Hebrew.
    expect(isDeniedElement({ name: 'דוחות' })).toBe(false);
  });
});

describe('same site', () => {
  it('compares registrable domains', () => {
    expect(registrableDomain('app.example.com')).toBe('example.com');
    expect(registrableDomain('app.easysign.co.il')).toBe('easysign.co.il');
    expect(registrableDomain('127.0.0.1')).toBe('127.0.0.1');
    const sites = new Set(['example.com']);
    expect(isSameSite('https://auth.example.com/x', sites)).toBe(true);
    expect(isSameSite('https://evil.com/?example.com', sites)).toBe(false);
    expect(isSameSite('not a url', sites)).toBe(false);
  });
});

describe('decideDemoRequest', () => {
  const sites = new Set(['example.com']);
  const allowAll = async () => true;

  it('lets the sign-in flow go wherever the address guard allows', async () => {
    expect(await decideDemoRequest({ url: 'https://login.provider.net/authorize', method: 'POST', isNavigation: true }, { loggedIn: false, sites }, allowAll)).toBe('allow');
  });

  it('after sign-in keeps top-level navigation on the site and never submits a form', async () => {
    const state = { loggedIn: true, sites };
    expect(await decideDemoRequest({ url: 'https://app.example.com/reports', method: 'GET', isNavigation: true }, state, allowAll)).toBe('allow');
    expect(await decideDemoRequest({ url: 'https://other.com/', method: 'GET', isNavigation: true }, state, allowAll)).toBe('block');
    expect(await decideDemoRequest({ url: 'https://app.example.com/settings', method: 'POST', isNavigation: true }, state, allowAll)).toBe('block');
    // Images and scripts from a CDN are fine, as long as the address is public.
    expect(await decideDemoRequest({ url: 'https://cdn.other.com/app.js', method: 'GET', isNavigation: false }, state, allowAll)).toBe('allow');
  });

  it('blocks any request to an address the guard refuses, and passes local data', async () => {
    const refuse = async () => false;
    expect(await decideDemoRequest({ url: 'https://app.example.com/', method: 'GET', isNavigation: false }, { loggedIn: true, sites }, refuse)).toBe('block');
    expect(await decideDemoRequest({ url: 'data:image/png;base64,AA', method: 'GET', isNavigation: false }, { loggedIn: true, sites }, refuse)).toBe('allow');
    expect(await decideDemoRequest({ url: '::bad', method: 'GET', isNavigation: false }, { loggedIn: true, sites }, allowAll)).toBe('block');
  });

  it('checks each origin once', async () => {
    const check = vi.fn(async (url: string) => {
      if (url.includes('10.0.0.1')) throw new Error('private');
    });
    const allowed = cachedAddressCheck(check);
    expect(await allowed('https://a.example.com/1')).toBe(true);
    expect(await allowed('https://a.example.com/2')).toBe(true);
    expect(await allowed('https://10.0.0.1/')).toBe(false);
    expect(check).toHaveBeenCalledTimes(2);
  });
});
