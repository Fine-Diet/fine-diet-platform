export const ONBOARDING_NAVIGATION_TIMEOUT_MS = 10_000;

const NAVIGATION_FAILURE_MESSAGE =
  'Your setup was saved, but we could not open the app. Please try again.';

/**
 * Wait for a client-side route transition and turn cancellations or hangs into
 * a recoverable failure for the onboarding UI.
 */
export async function replaceOnboardingRoute(
  replace: (destination: string) => Promise<boolean>,
  destination: string,
  timeoutMs = ONBOARDING_NAVIGATION_TIMEOUT_MS,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const navigated = await Promise.race([
      replace(destination),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);

    if (!navigated) throw new Error(NAVIGATION_FAILURE_MESSAGE);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
