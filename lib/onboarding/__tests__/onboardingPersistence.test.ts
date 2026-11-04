import { afterEach, describe, expect, it, jest } from '@jest/globals';
import {
  ONBOARDING_PERSIST_TIMEOUT_MS,
  ONBOARDING_PERSIST_UNCERTAIN_MESSAGE,
  OnboardingPersistenceCoordinator,
  persistOnboarding,
} from '@/lib/onboarding/onboardingPersistence';

describe('onboarding persistence reliability', () => {
  afterEach(() => jest.useRealTimers());

  it('aborts a hung save and reports an uncertain outcome', async () => {
    jest.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetcher = jest.fn((_url: string, init: RequestInit) => {
      requestSignal = init.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        requestSignal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });

    const save = persistOnboarding({ mode: 'skip' }, fetcher);
    const rejection = expect(save).rejects.toThrow(ONBOARDING_PERSIST_UNCERTAIN_MESSAGE);
    await jest.advanceTimersByTimeAsync(ONBOARDING_PERSIST_TIMEOUT_MS);
    await rejection;

    expect(requestSignal?.aborted).toBe(true);
  });

  it('cancels debounced progress when finalization begins', async () => {
    jest.useFakeTimers();
    const write = jest.fn(async () => {});
    const coordinator = new OnboardingPersistenceCoordinator(write, 400);
    coordinator.scheduleProgress({ draft: true }, 1);

    await coordinator.finalize({ mode: 'skip', answers: { draft: true } });
    await jest.advanceTimersByTimeAsync(400);

    expect(write.mock.calls.map(([payload]) => payload.mode)).toEqual(['skip']);
  });

  it('waits for an active progress write before finalization', async () => {
    jest.useFakeTimers();
    let finishProgress!: () => void;
    const writeOrder: string[] = [];
    const write = jest.fn(async (payload: { mode: string }) => {
      writeOrder.push(payload.mode);
      if (payload.mode === 'progress') {
        await new Promise<void>((resolve) => { finishProgress = resolve; });
      }
    });
    const coordinator = new OnboardingPersistenceCoordinator(write, 400);
    coordinator.scheduleProgress({ draft: true }, 1);

    await jest.advanceTimersByTimeAsync(400);
    await Promise.resolve();
    expect(writeOrder).toEqual(['progress']);

    const finalization = coordinator.finalize({ mode: 'complete', answers: { final: true } });
    await Promise.resolve();
    expect(writeOrder).toEqual(['progress']);

    finishProgress();
    await finalization;
    expect(writeOrder).toEqual(['progress', 'complete']);
  });

  it('does not schedule progress after finalization starts', async () => {
    jest.useFakeTimers();
    const write = jest.fn(async () => {});
    const coordinator = new OnboardingPersistenceCoordinator(write, 400);

    await coordinator.finalize({ mode: 'skip' });
    coordinator.scheduleProgress({ stale: true }, 0);
    await jest.advanceTimersByTimeAsync(400);

    expect(write.mock.calls.map(([payload]) => payload.mode)).toEqual(['skip']);
  });

  it('attaches the server-issued resume token to resumed progress writes', async () => {
    jest.useFakeTimers();
    const write = jest.fn(async () => {});
    const coordinator = new OnboardingPersistenceCoordinator(write, 400);
    coordinator.setResumeToken('server-issued-resume-token');
    coordinator.scheduleProgress({ retained: true }, 1);

    await jest.advanceTimersByTimeAsync(400);
    await Promise.resolve();

    expect(write).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'progress',
      resumeToken: 'server-issued-resume-token',
    }));
  });
});
