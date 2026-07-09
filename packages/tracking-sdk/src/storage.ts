/** Minimal storage contract the tracker needs — satisfied by `window.localStorage`, a test double, or the in-memory fallback below. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** A same-session-only fallback for when `localStorage` is unavailable (SSR, a locked-down embed, or a browser actively blocking it) — the tracker still works, it just mints a fresh anon id every page load instead of persisting one, rather than throwing and breaking the host page. */
export function createInMemoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

/** Resolves the best available storage: the caller's own override, then `window.localStorage` if reachable and actually writable (some browsers expose it but throw on use, e.g. Safari private mode), then the in-memory fallback. */
export function resolveStorage(override?: KeyValueStorage): KeyValueStorage {
  if (override) return override;
  try {
    const globalLocalStorage = (globalThis as { localStorage?: KeyValueStorage }).localStorage;
    if (globalLocalStorage) {
      const probeKey = '__growthos_storage_probe__';
      globalLocalStorage.setItem(probeKey, '1');
      globalLocalStorage.getItem(probeKey);
      return globalLocalStorage;
    }
  } catch {
    // Falls through to the in-memory fallback below.
  }
  return createInMemoryStorage();
}

const ANON_ID_STORAGE_KEY = 'growthos_anon_id';
const CUSTOMER_ID_STORAGE_KEY = 'growthos_customer_id';

export function generateId(): string {
  const cryptoObj = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  // Fallback for environments without `crypto.randomUUID` (older browsers) — not
  // cryptographically strong, but this id only ever needs to be unique per
  // visitor, never secret.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export interface EnsureIdResult {
  id: string;
  isNew: boolean;
}

/** Reads a persisted id, or mints and persists a fresh one — shared by both the anon id and the (optional) identified customer id. */
export function ensureStoredId(storage: KeyValueStorage, key: string): EnsureIdResult {
  const existing = storage.getItem(key);
  if (existing) {
    return { id: existing, isNew: false };
  }
  const created = generateId();
  storage.setItem(key, created);
  return { id: created, isNew: true };
}

export function readStoredId(storage: KeyValueStorage, key: string): string | null {
  return storage.getItem(key);
}

export { ANON_ID_STORAGE_KEY, CUSTOMER_ID_STORAGE_KEY };
