/**
 * The QA relay aborts its upstream fetch at 12 seconds
 * (qa/payments-webhook-relay AbortSignal.timeout(12000)).
 * This attempt must finish, or release its lease and return, before that abort.
 * A later Stripe retry can then claim the event instead of receiving
 * "already being processed" while the first invocation is still hung.
 *
 * No Node-only module belongs here. Request cancellation is an AbortSignal
 * closed over by the webhook's own fetch, never a process-wide active request.
 */
export const WEBHOOK_ATTEMPT_BUDGET_MS = 6_000;
export const STRIPE_WEBHOOK_TIMEOUT_MS = 5_000;
/** Leave the release inside the relay's 12s abort after the attempt budget. */
export const WEBHOOK_RELEASE_BUDGET_MS = 2_000;
export const stripeWebhookRequestOptions = { timeout: STRIPE_WEBHOOK_TIMEOUT_MS } as const;

export class WebhookAttemptBudgetExceeded extends Error {
  constructor() {
    super('webhook attempt budget exceeded');
    this.name = 'WebhookAttemptBudgetExceeded';
  }
}

export function fetchWithSignal(signal: AbortSignal, fetchImpl: typeof fetch = fetch) {
  return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const caller = init?.signal;
    const combined = !caller || caller === signal ? signal : combineSignals([signal, caller]);
    return fetchImpl(input, { ...init, signal: combined });
  };
}

function combineSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const abortFrom = (signal: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason);
  };
  for (const signal of signals) {
    if (signal.aborted) abortFrom(signal);
    else signal.addEventListener('abort', () => abortFrom(signal), { once: true });
  }
  return controller.signal;
}

export function startWebhookAttemptBudget(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new WebhookAttemptBudgetExceeded()), WEBHOOK_ATTEMPT_BUDGET_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}
