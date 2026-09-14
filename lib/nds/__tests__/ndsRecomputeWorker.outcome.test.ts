import { classifyNdsWorkerOutcome } from '../ndsWorkerOutcome';

describe('classifyNdsWorkerOutcome', () => {
  it('sends a previous-cache compute failure into backoff, not superseded', () => {
    expect(
      classifyNdsWorkerOutcome({
        publishReason: null,
        computed: null,
        state: { state: 'updating' },
        resolvedRevision: null,
        resolvedGeneration: null,
      }),
    ).toBe('failed');
  });

  it('classifies an unavailable compute as failed', () => {
    expect(
      classifyNdsWorkerOutcome({
        publishReason: null,
        computed: null,
        state: { state: 'unavailable' },
        resolvedRevision: null,
        resolvedGeneration: null,
      }),
    ).toBe('failed');
  });

  it('keeps a verified cache hit as already-current', () => {
    expect(
      classifyNdsWorkerOutcome({
        publishReason: null,
        computed: null,
        state: { state: 'fresh' },
        resolvedRevision: 3,
        resolvedGeneration: 1,
      }),
    ).toBe('already_current');
  });

  it('treats a computed result the day moved past as superseded', () => {
    expect(
      classifyNdsWorkerOutcome({
        publishReason: 'source_changed',
        computed: { score100: 70 },
        state: { state: 'updating' },
        resolvedRevision: 2,
        resolvedGeneration: 1,
      }),
    ).toBe('superseded');
  });
});
