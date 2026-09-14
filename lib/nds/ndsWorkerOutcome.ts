export type NdsWorkerItemClass =
  | 'publish'
  | 'already_current'
  | 'deployment_stale'
  | 'failed'
  | 'superseded';

/**
 * Classify one resolver outcome for the worker.
 *
 * A previous printable cache with a failed compute is `failed` (backoff), not
 * `superseded`. Superseded is reserved for a real computed result that the day
 * moved past. Cache hits with a verified identity are already-current.
 */
export function classifyNdsWorkerOutcome(outcome: {
  publishReason: string | null;
  computed: unknown;
  state: { state: string };
  resolvedRevision: number | null;
  resolvedGeneration: number | null;
}): NdsWorkerItemClass {
  const publishReason = outcome.publishReason;
  const verifiedIdentity =
    outcome.resolvedRevision !== null && outcome.resolvedGeneration !== null;
  const alreadyCurrent =
    (publishReason === 'newer_result_present' && verifiedIdentity) ||
    (publishReason === null &&
      verifiedIdentity &&
      outcome.state.state !== 'unavailable');

  if (publishReason === 'published') return 'publish';
  if (alreadyCurrent) return 'already_current';
  if (publishReason === 'stale_generation' || publishReason === 'stale_context') {
    return 'deployment_stale';
  }
  if (
    publishReason === 'publish_error' ||
    outcome.state.state === 'unavailable' ||
    outcome.computed == null
  ) {
    return 'failed';
  }
  return 'superseded';
}
