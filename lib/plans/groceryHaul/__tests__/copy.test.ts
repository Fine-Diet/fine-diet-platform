import {
  formatGroceryHaulSnapshotAmount,
  formatGroceryHaulSnapshotProvenance,
  formatGroceryHaulStatusLabel,
} from '../copy';

describe('grocery haul copy', () => {
  it('labels planned status and snapshot amount without retailer language', () => {
    expect(formatGroceryHaulStatusLabel('planned')).toBe('Planned');
    expect(
      formatGroceryHaulSnapshotAmount({ quantity_snapshot: 2, unit_snapshot: 'cup' }),
    ).toBe('2 cup');
    expect(formatGroceryHaulSnapshotProvenance('planned_meal')).toBe('From a plan');
    expect(formatGroceryHaulSnapshotProvenance('manual')).toBe('Added by you');
  });
});
