import { describe, expect, it, vi } from 'vitest';
import { createInMemoryStorage, ensureStoredId, generateId, readStoredId, resolveStorage } from './storage';

describe('createInMemoryStorage', () => {
  it('round-trips values without touching any global storage', () => {
    const storage = createInMemoryStorage();
    expect(storage.getItem('k')).toBeNull();
    storage.setItem('k', 'v');
    expect(storage.getItem('k')).toBe('v');
  });
});

describe('resolveStorage', () => {
  it('returns the caller override untouched when one is provided', () => {
    const override = createInMemoryStorage();
    expect(resolveStorage(override)).toBe(override);
  });

  it('falls back to an in-memory store when window.localStorage throws (e.g. Safari private mode)', () => {
    const throwingLocalStorage = {
      getItem: vi.fn(),
      setItem: vi.fn(() => {
        throw new Error('SecurityError');
      }),
    };
    const original = window.localStorage;
    Object.defineProperty(window, 'localStorage', { value: throwingLocalStorage, configurable: true });
    try {
      const storage = resolveStorage();
      storage.setItem('a', '1');
      expect(storage.getItem('a')).toBe('1');
    } finally {
      Object.defineProperty(window, 'localStorage', { value: original, configurable: true });
    }
  });

  it('uses window.localStorage when it is actually writable', () => {
    window.localStorage.clear();
    const storage = resolveStorage();
    storage.setItem('growthos-test-key', 'value');
    expect(window.localStorage.getItem('growthos-test-key')).toBe('value');
  });
});

describe('ensureStoredId', () => {
  it('mints and persists a fresh id the first time, then returns the same id on every later call', () => {
    const storage = createInMemoryStorage();
    const first = ensureStoredId(storage, 'anon');
    expect(first.isNew).toBe(true);
    expect(first.id).toHaveLength(36);

    const second = ensureStoredId(storage, 'anon');
    expect(second.isNew).toBe(false);
    expect(second.id).toBe(first.id);
  });
});

describe('readStoredId', () => {
  it('returns null when nothing has been stored yet', () => {
    expect(readStoredId(createInMemoryStorage(), 'anon')).toBeNull();
  });
});

describe('generateId', () => {
  it('produces distinct v4-shaped ids', () => {
    const a = generateId();
    const b = generateId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
