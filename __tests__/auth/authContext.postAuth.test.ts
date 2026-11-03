import { describe, expect, it } from '@jest/globals';
import { DEFAULT_POST_AUTH_TARGET, resolvePostAuthTarget } from '@/lib/auth/authContext';

describe('post-auth destination defaults', () => {
  it('uses the protected app entry as the default after signup', () => {
    expect(DEFAULT_POST_AUTH_TARGET).toBe('/app');
    expect(resolvePostAuthTarget({ redirectTo: '' })).toBe('/app');
  });

  it('preserves explicit safe checkout-resume destinations', () => {
    const checkoutResume = '/checkout/resume?offer=journal-monthly&source=start';
    expect(resolvePostAuthTarget({ redirectTo: checkoutResume })).toBe(checkoutResume);
  });

  it('falls back to the protected app entry for an unsafe destination', () => {
    expect(resolvePostAuthTarget({ redirectTo: '//evil.example' })).toBe('/app');
  });
});
