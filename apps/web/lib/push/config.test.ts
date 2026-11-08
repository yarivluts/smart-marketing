import { describe, expect, it } from 'vitest';
import { publicWebPushConfig, resolveWebPushConfig } from './config';

describe('web push config', () => {
  it('is not set up without both VAPID keys', () => {
    expect(resolveWebPushConfig({})).toBeNull();
    expect(resolveWebPushConfig({ WEB_PUSH_VAPID_PUBLIC_KEY: 'pub' })).toBeNull();
    expect(resolveWebPushConfig({ WEB_PUSH_VAPID_PUBLIC_KEY: ' ', WEB_PUSH_VAPID_PRIVATE_KEY: 'priv' })).toBeNull();
    expect(publicWebPushConfig({})).toEqual({ configured: false, publicKey: null });
  });

  it('gives the browser only the public key', () => {
    const env = { WEB_PUSH_VAPID_PUBLIC_KEY: 'pub', WEB_PUSH_VAPID_PRIVATE_KEY: 'priv' };
    expect(publicWebPushConfig(env)).toEqual({ configured: true, publicKey: 'pub' });
    expect(JSON.stringify(publicWebPushConfig(env))).not.toContain('priv');
  });

  it('names the sender by explicit subject, else the https site, else a mailbox', () => {
    const keys = { WEB_PUSH_VAPID_PUBLIC_KEY: 'pub', WEB_PUSH_VAPID_PRIVATE_KEY: 'priv' };
    expect(resolveWebPushConfig({ ...keys, WEB_PUSH_VAPID_SUBJECT: 'mailto:ops@example.com' })?.subject).toBe('mailto:ops@example.com');
    expect(resolveWebPushConfig({ ...keys, GROWTHOS_PUBLIC_WEB_URL: 'https://app.example.com/' })?.subject).toBe('https://app.example.com');
    expect(resolveWebPushConfig({ ...keys, GROWTHOS_PUBLIC_WEB_URL: 'http://localhost:3000' })?.subject).toMatch(/^mailto:/);
  });
});
