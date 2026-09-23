import { computeFactualAcquiredSubtotal } from '../estimate';
import { formatHaulCollectionSpend } from '@/components/food/hauls/presentation';

describe('Hauls collection spend', () => {
  it('returns null acquired subtotal when no priced acquisitions exist', () => {
    expect(computeFactualAcquiredSubtotal([
      { acquired_price_amount: null, acquired_quantity: 2 },
    ])).toBeNull();
  });

  it('sums persisted acquired price×quantity when present', () => {
    expect(computeFactualAcquiredSubtotal([
      { acquired_price_amount: 3, acquired_quantity: 2 },
      { acquired_price_amount: 1.5, acquired_quantity: 1 },
    ])).toBe(7.5);
  });

  it('labels collection spend as acquired or prep estimate without overclaiming', () => {
    expect(formatHaulCollectionSpend({
      estimated_total: 12,
      acquired_subtotal: 8,
      currency: 'USD',
    })).toEqual({ amount: '$8.00', qualifier: 'Acquired' });
    expect(formatHaulCollectionSpend({
      estimated_total: 12,
      acquired_subtotal: null,
      currency: 'USD',
    })).toEqual({ amount: '$12.00', qualifier: 'Prep estimate' });
  });
});
