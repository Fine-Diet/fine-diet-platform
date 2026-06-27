import { isProgramRuntimeEnabled } from '../programRuntimeRegistry';

describe('programRuntimeRegistry', () => {
  it('keeps baseline runtime-enabled', () => {
    expect(isProgramRuntimeEnabled('baseline')).toBe(true);
  });

  it('enables digestive-foundations for runtime', () => {
    expect(isProgramRuntimeEnabled('digestive-foundations')).toBe(true);
  });

  it('normalizes case and whitespace', () => {
    expect(isProgramRuntimeEnabled('  Digestive-Foundations  ')).toBe(true);
    expect(isProgramRuntimeEnabled('BASELINE')).toBe(true);
  });

  it('does not runtime-enable unregistered or empty slugs', () => {
    expect(isProgramRuntimeEnabled('gut-check')).toBe(false);
    expect(isProgramRuntimeEnabled('')).toBe(false);
    expect(isProgramRuntimeEnabled(null)).toBe(false);
    expect(isProgramRuntimeEnabled(undefined)).toBe(false);
  });
});
