import { getCodeDeliveryModuleSet } from '../../deliveryModuleSetRegistry';

describe('code delivery-module set registry', () => {
  test('Baseline keeps its baseline_code source, prep-then-week order, and ids', () => {
    const set = getCodeDeliveryModuleSet('baseline');
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
    expect(getCodeDeliveryModuleSet('BASELINE')?.source).toBe('baseline_code');
  });

  test('returns null for programs without a registered code set', () => {
    expect(getCodeDeliveryModuleSet('digestive-foundations')).toBeNull();
    expect(getCodeDeliveryModuleSet('')).toBeNull();
  });
});
