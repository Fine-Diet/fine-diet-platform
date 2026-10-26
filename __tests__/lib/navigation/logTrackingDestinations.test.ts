import {
  getEffectiveEnabledLogTrackingKeys,
  getLogTrackingDestination,
  getLogTrackingHref,
  normalizeEnabledLogTrackingKeys,
} from '@/lib/navigation/logTrackingDestinations';

describe('Log tracking destinations', () => {
  it('normalizes legacy aliases, ignores unknown keys, and uses stable order', () => {
    expect(normalizeEnabledLogTrackingKeys([
      'weight', 'hydration', 'food', 'supplements', 'bp', 'bloodPressure', 'not-a-tracker', 2,
    ])).toEqual(['intake', 'water', 'supplement', 'blood_pressure', 'weight']);
  });

  it('keeps an explicit empty set empty for callers that must fail closed', () => {
    expect(normalizeEnabledLogTrackingKeys([])).toEqual([]);
    expect(getEffectiveEnabledLogTrackingKeys([])).toEqual([
      'intake', 'water', 'sleep', 'supplement', 'mood', 'bowel', 'cycle', 'movement',
    ]);
  });

  it('maps supported keys to their exact tabs and flags reserved add-ons without routes', () => {
    expect(getLogTrackingDestination('water')).toMatchObject({ key: 'water', label: 'Hydration', tab: 'water', captureSupported: true });
    expect(getLogTrackingHref(getLogTrackingDestination('supplement')!)).toContain('?tab=supplements');
    for (const key of ['glucose', 'temperature', 'weight']) {
      const destination = getLogTrackingDestination(key);
      expect(destination?.captureSupported).toBe(false);
      expect(destination && getLogTrackingHref(destination)).toBeNull();
    }
    expect(getLogTrackingDestination('future-key')).toBeNull();
  });
});
