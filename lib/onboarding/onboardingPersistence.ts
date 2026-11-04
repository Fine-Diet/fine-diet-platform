export type OnboardingFinalizationPayload = {
  mode: 'skip' | 'complete';
  answers?: unknown;
};

export type OnboardingPersistPayload = OnboardingFinalizationPayload | {
  mode: 'started' | 'progress';
  answers?: unknown;
  lastStep?: number;
};

export const ONBOARDING_PERSIST_TIMEOUT_MS = 15_000;
export const ONBOARDING_PROGRESS_DEBOUNCE_MS = 400;
export const ONBOARDING_PERSIST_UNCERTAIN_MESSAGE =
  'We could not confirm whether onboarding was saved. Check your connection and try again.';

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export async function persistOnboarding(
  body: OnboardingPersistPayload,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ONBOARDING_PERSIST_TIMEOUT_MS);

  try {
    let response: Response;
    try {
      response = await fetcher('/api/onboarding/persist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
        body: JSON.stringify(body),
      });
    } catch {
      throw new Error(ONBOARDING_PERSIST_UNCERTAIN_MESSAGE);
    }

    if (!response.ok) {
      if (response.status >= 500) {
        throw new Error(ONBOARDING_PERSIST_UNCERTAIN_MESSAGE);
      }
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? 'Could not save your onboarding.');
    }
  } finally {
    clearTimeout(timeout);
  }
}

/** Debounces draft writes and waits for active writes before finalization. */
export class OnboardingPersistenceCoordinator {
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private finalizing = false;

  constructor(
    private readonly write: (payload: OnboardingPersistPayload) => Promise<void>,
    private readonly debounceMs = ONBOARDING_PROGRESS_DEBOUNCE_MS,
  ) {}

  markStarted(): void {
    void this.enqueue({ mode: 'started' });
  }

  scheduleProgress(answers: unknown, lastStep: number): void {
    if (this.finalizing) return;
    this.cancelPendingProgress();
    this.progressTimer = setTimeout(() => {
      this.progressTimer = null;
      void this.enqueue({ mode: 'progress', answers, lastStep });
    }, this.debounceMs);
  }

  cancelPendingProgress(): void {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.progressTimer = null;
  }

  async finalize(payload: OnboardingFinalizationPayload): Promise<void> {
    this.finalizing = true;
    this.cancelPendingProgress();
    await this.writeQueue;
    await this.write(payload);
  }

  private enqueue(payload: OnboardingPersistPayload): Promise<void> {
    if (this.finalizing) return Promise.resolve();

    const operation = this.writeQueue.then(async () => {
      if (this.finalizing) return;
      await this.write(payload);
    });
    // Background writes are best-effort; finalization still proceeds after a
    // failed draft request, but it always waits for an in-flight request.
    this.writeQueue = operation.catch(() => {});
    return this.writeQueue;
  }
}
