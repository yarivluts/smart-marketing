import { afterEach, describe, expect, it } from 'vitest';
import { deviceFlags, deviceLabel, isIos, isPushSupported, notificationPermission, urlBase64ToUint8Array } from './client';

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe('push client helpers', () => {
  it('names a device from its user agent', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36')).toBe('Chrome · Android');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari · iPhone');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge · Windows');
    expect(deviceLabel('')).toBe('Browser');
  });

  it('recognises iPhone, iPad and iPadOS that reports itself as a Mac', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 14)', 5)).toBe(false);
  });

  it('decodes a base64url VAPID key', () => {
    expect([...urlBase64ToUint8Array('AQID_-8')]).toEqual([1, 2, 3, 255, 239]);
  });

  it('reports no push support in a browser without service workers', () => {
    expect(isPushSupported()).toBe(false);
    expect(notificationPermission()).toBe('unsupported');
  });

  it('remembers "off on this device" across visits and "not now" for the session', () => {
    expect(deviceFlags.isOff()).toBe(false);
    deviceFlags.setOff(true);
    expect(deviceFlags.isOff()).toBe(true);
    deviceFlags.setOff(false);
    expect(deviceFlags.isOff()).toBe(false);
    deviceFlags.dismissPrompt();
    expect(deviceFlags.isPromptDismissed()).toBe(true);
    expect(window.localStorage.length).toBe(0);
  });
});
