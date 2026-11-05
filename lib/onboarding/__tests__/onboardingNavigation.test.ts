import { replaceOnboardingRoute } from '@/lib/onboarding/onboardingNavigation';

describe('replaceOnboardingRoute', () => {
  afterEach(() => jest.useRealTimers());

  it('resolves after the router confirms navigation', async () => {
    const replace = jest.fn().mockResolvedValue(true);

    await expect(replaceOnboardingRoute(replace, '/app/log')).resolves.toBeUndefined();
    expect(replace).toHaveBeenCalledWith('/app/log');
  });

  it('rejects when Next reports that navigation did not complete', async () => {
    const replace = jest.fn().mockResolvedValue(false);

    await expect(replaceOnboardingRoute(replace, '/app/log')).rejects.toThrow(
      'Your setup was saved, but we could not open the app. Please try again.',
    );
  });

  it('rejects when navigation never settles', async () => {
    jest.useFakeTimers();
    const replace = jest.fn(() => new Promise<boolean>(() => {}));
    const navigation = replaceOnboardingRoute(replace, '/app/log', 20);
    const rejection = expect(navigation).rejects.toThrow(
      'Your setup was saved, but we could not open the app. Please try again.',
    );

    await jest.advanceTimersByTimeAsync(20);
    await rejection;
  });
});
