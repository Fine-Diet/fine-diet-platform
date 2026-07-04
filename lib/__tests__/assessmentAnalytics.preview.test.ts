/**
 * Tests that preview-mode analytics events are tagged with is_preview: true
 * in their metadata, so analytics consumers can filter preview traffic out of
 * production metrics.
 */

interface FetchCall {
  url: string;
  init: { method?: string; body?: string };
}

describe('assessmentAnalytics preview tagging', () => {
  let fetchCalls: FetchCall[];
  let originalFetch: typeof globalThis.fetch;
  let originalLog: typeof console.log;

  beforeEach(() => {
    fetchCalls = [];
    originalFetch = globalThis.fetch;
    originalLog = console.log;
    console.log = () => undefined;
    (globalThis as any).fetch = (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init: { method: init?.method, body: init?.body } });
      return Promise.resolve({ ok: true } as Response);
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  });

  it('tags preview events with is_preview: true in the batched payload', async () => {
    const { trackAssessmentStarted } = await import('@/lib/assessmentAnalytics');

    // MAX_BATCH_SIZE is 10; emitting 10 forces an immediate synchronous flush.
    for (let i = 0; i < 10; i++) {
      trackAssessmentStarted('gut-check', 3, 'fd-preview-session-xyz', true);
    }

    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(fetchCalls[0].init.body as string);
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    for (const ev of body.events) {
      expect(ev.sessionId).toBe('fd-preview-session-xyz');
      expect(ev.metadata).toMatchObject({ is_preview: true });
    }
  });

  it('does NOT tag non-preview events with is_preview', async () => {
    const { trackAssessmentStarted } = await import('@/lib/assessmentAnalytics');

    for (let i = 0; i < 10; i++) {
      trackAssessmentStarted('gut-check', 3, 'fd-real-session-abc');
    }

    expect(fetchCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(fetchCalls[0].init.body as string);
    for (const ev of body.events) {
      expect(ev.metadata?.is_preview).toBeUndefined();
    }
  });
});
