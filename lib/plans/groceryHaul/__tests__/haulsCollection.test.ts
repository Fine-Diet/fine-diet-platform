import { computeFactualAcquiredSubtotal } from '../estimate';
import { formatHaulCollectionSpend } from '@/components/food/hauls/presentation';

describe('Hauls collection spend', () => {
  it('returns null when no in-basket priced acquisitions exist', () => {
    expect(computeFactualAcquiredSubtotal([
      { state: 'pending', acquired_price_amount: null, acquired_quantity: 2 },
    ])).toBeNull();
    expect(computeFactualAcquiredSubtotal([
      { state: 'pending', acquired_price_amount: 3, acquired_quantity: 2 },
    ])).toBeNull();
    expect(computeFactualAcquiredSubtotal([
      { state: 'skipped', acquired_price_amount: 3, acquired_quantity: 2 },
    ])).toBeNull();
  });

  it('sums in-basket persisted acquired price×quantity only', () => {
    expect(computeFactualAcquiredSubtotal([
      { state: 'in_basket', acquired_price_amount: 3, acquired_quantity: 2 },
      { state: 'in_basket', acquired_price_amount: 1.5, acquired_quantity: 1 },
      { state: 'pending', acquired_price_amount: 9, acquired_quantity: 1 },
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
