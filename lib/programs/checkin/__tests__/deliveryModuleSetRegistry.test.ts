import { getCodeDeliveryModuleSet } from '../../deliveryModuleSetRegistry';

describe('code delivery-module set registry', () => {
  test('Baseline keeps its baseline_code source, prep-then-week order, and ids', () => {
    const set = getCodeDeliveryModuleSet('baseline', 'baseline-v1');
    expect(set).not.toBeNull();
    expect(set?.source).toBe('baseline_code');

    const ids = set!.modules.map((m) => m.id);
    expect(ids).toContain('baseline-prep-overview');
    expect(ids).toContain('baseline-week-1-focus');
    // prep/roadmap modules precede week modules
    expect(ids.indexOf('baseline-prep-overview')).toBeLessThan(
      ids.indexOf('baseline-week-1-focus'),
    );
    expect(set!.modules.every((m) => m.programSlug === 'baseline')).toBe(true);
  });

  test('is case-insensitive on slug', () => {
    expect(getCodeDeliveryModuleSet('BASELINE', 'baseline-v1')?.source).toBe('baseline_code');
  });

  test('returns null for programs without a registered code set', () => {
    expect(getCodeDeliveryModuleSet('digestive-foundations', 'baseline-v1')).toBeNull();
    expect(getCodeDeliveryModuleSet('', 'baseline-v1')).toBeNull();
  });

  test('does not serve Baseline content to unregistered or newer versions', () => {
    expect(getCodeDeliveryModuleSet('baseline', 'baseline-v2')).toBeNull();
  });
});
