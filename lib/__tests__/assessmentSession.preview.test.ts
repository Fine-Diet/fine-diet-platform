/**
 * Tests for the runtime-preview session helpers in lib/assessmentSession.ts.
 *
 * Preview runs must use an isolated, prefixed session id so they never collide
 * with or pollute a user's real assessment session.
 */

type Store = Record<string, string>;

function makeLocalStorage(initial: Store = {}): Storage {
  const store: Store = { ...initial };
  const ls: Storage = {
    get length() {
      return Object.keys(store).length;
    },
    clear() {
      Object.keys(store).forEach((k) => delete store[k]);
    },
    getItem(key: string) {
      return key in store ? store[key] : null;
    },
    key(i: number) {
      return Object.keys(store)[i] ?? null;
    },
    removeItem(key: string) {
      delete store[key];
    },
    setItem(key: string, value: string) {
      store[key] = String(value);
    },
  };
  return ls;
}

describe('assessmentSession preview isolation', () => {
  const REAL_KEY = 'fd_assessment_session_id';
  const PREVIEW_KEY = 'fd_assessment_preview_session_id';

  let originalLocalStorage: typeof globalThis.localStorage | undefined;
  let originalWindow: typeof globalThis.window | undefined;

  beforeEach(() => {
    originalLocalStorage = (globalThis as any).localStorage;
    originalWindow = (globalThis as any).window;
    (globalThis as any).localStorage = makeLocalStorage();
    // The helpers use localStorage only when `typeof window !== 'undefined'`.
    // Provide a truthy stub so they take the browser branch in node env.
    (globalThis as any).window = {};
  });

  afterEach(() => {
    if (originalLocalStorage === undefined) {
      delete (globalThis as any).localStorage;
    } else {
      (globalThis as any).localStorage = originalLocalStorage;
    }
    if (originalWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = originalWindow;
    }
  });

  it('getOrCreatePreviewSessionId writes to a dedicated key with a prefix', async () => {
    const { getOrCreatePreviewSessionId } = await import('@/lib/assessmentSession');
    const id = getOrCreatePreviewSessionId();

    expect(typeof id).toBe('string');
    expect(id.startsWith('fd-preview-')).toBe(true);
    expect((globalThis as any).localStorage.getItem(PREVIEW_KEY)).toBe(id);
    // Real session key is untouched.
    expect((globalThis as any).localStorage.getItem(REAL_KEY)).toBeNull();
  });

  it('preview and real session ids are isolated and stable per key', async () => {
    const {
      getOrCreateSessionId,
      getOrCreatePreviewSessionId,
    } = await import('@/lib/assessmentSession');

    const real1 = getOrCreateSessionId();
    const real2 = getOrCreateSessionId();
    const preview1 = getOrCreatePreviewSessionId();
    const preview2 = getOrCreatePreviewSessionId();

    expect(real1).toBe(real2);
    expect(preview1).toBe(preview2);
    expect(real1).not.toBe(preview1);
    expect(preview1.startsWith('fd-preview-')).toBe(true);
    expect(real1.startsWith('fd-preview-')).toBe(false);
  });

  it('isPreviewSessionId recognizes prefixed ids only', async () => {
    const { getOrCreatePreviewSessionId, isPreviewSessionId } = await import('@/lib/assessmentSession');
    const previewId = getOrCreatePreviewSessionId();

    expect(isPreviewSessionId(previewId)).toBe(true);
    expect(isPreviewSessionId('fd-1234-abcd')).toBe(false);
    expect(isPreviewSessionId(null)).toBe(false);
    expect(isPreviewSessionId(undefined)).toBe(false);
  });
});
