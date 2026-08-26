/**
 * The browser credential store (`token-store.web.ts`).
 *
 * This file exists because the pilot puts a real driver session in a browser,
 * so the two properties that make that acceptable have to be pinned: the
 * credential survives a reload, and it lives in `sessionStorage` — not
 * `localStorage`, which would keep a key to patient addresses across every
 * future visit to the origin.
 *
 * Imported by its explicit `.web` path: Metro picks it by platform, but Jest
 * runs the native preset and would otherwise resolve `token-store.ts` and its
 * `expo-secure-store` import.
 */
import {
  clearSession,
  loadSession,
  resetSessionCache,
  saveSession,
  type StoredSession,
} from '@/auth/token-store.web';

const SESSION: StoredSession = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: 1_800_000_000_000,
};

/** Stands in for the browser's; `jsdom` is not this project's environment. */
class MemoryStorage {
  private data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }

  get size(): number {
    return this.data.size;
  }
}

let sessionStorage: MemoryStorage;
let localStorage: MemoryStorage;

beforeEach(() => {
  sessionStorage = new MemoryStorage();
  localStorage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { sessionStorage, localStorage };
  resetSessionCache();
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

it('reads back a session written in an earlier page view', async () => {
  await saveSession(SESSION);
  // The reload: the module cache is gone, only storage survives.
  resetSessionCache();

  await expect(loadSession()).resolves.toEqual(SESSION);
});

it('never writes to localStorage', async () => {
  await saveSession(SESSION);

  expect(sessionStorage.size).toBe(1);
  expect(localStorage.size).toBe(0);
});

it('reports no session before one is stored', async () => {
  await expect(loadSession()).resolves.toBeNull();
});

it('clears storage on sign-out', async () => {
  await saveSession(SESSION);
  await clearSession();
  resetSessionCache();

  await expect(loadSession()).resolves.toBeNull();
  expect(sessionStorage.size).toBe(0);
});

it('treats a corrupt entry as no session rather than throwing', async () => {
  sessionStorage.setItem('driver.session.v1', '{not json');
  resetSessionCache();

  await expect(loadSession()).resolves.toBeNull();
});

it('keeps working when storage throws, as Safari private mode does', async () => {
  (globalThis as { window?: unknown }).window = {
    get sessionStorage(): never {
      throw new Error('SecurityError');
    },
  };

  await expect(saveSession(SESSION)).resolves.toBeUndefined();
  // Still readable in this page view — only surviving a reload is lost.
  await expect(loadSession()).resolves.toEqual(SESSION);
});

it('reports no session when there is no window at all', async () => {
  delete (globalThis as { window?: unknown }).window;

  await expect(loadSession()).resolves.toBeNull();
});
