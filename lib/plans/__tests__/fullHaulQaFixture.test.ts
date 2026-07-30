import {
  buildFullHaulSegmentsQaFixture,
  isFullHaulQaSegmentsEnabled,
} from '../fullHaulQaFixture';

describe('fullHaulQaFixture', () => {
  const ORIGINAL_ENV = process.env.NODE_ENV;

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: ORIGINAL_ENV,
      writable: true,
      configurable: true,
    });
  });

  it('is permanently disabled in production even with the query param', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      writable: true,
      configurable: true,
    });
    expect(isFullHaulQaSegmentsEnabled('segments')).toBe(false);
  });

  it('enables only for qa_full_haul=segments outside production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'development',
      writable: true,
      configurable: true,
    });
    expect(isFullHaulQaSegmentsEnabled('segments')).toBe(true);
    expect(isFullHaulQaSegmentsEnabled('other')).toBe(false);
    expect(isFullHaulQaSegmentsEnabled(undefined)).toBe(false);
  });

  it('keeps segment merchandise equal to Full Haul merchandise and tax only at haul level', () => {
    const { summary, full_haul } = buildFullHaulSegmentsQaFixture({
      groceryListId: 'list-qa',
    });

    const segmentSum = full_haul.segments.reduce(
      (acc, segment) => acc + segment.estimated_merchandise_subtotal,
      0,
    );
    expect(segmentSum).toBe(full_haul.estimated_merchandise_subtotal);
    expect(full_haul.estimated_merchandise_subtotal).toBe(186.4);
    expect(full_haul.estimated_tax).toBe(8.75);
    expect(full_haul.estimated_total).toBe(195.15);
    expect(full_haul.tax_status).toBe('estimated');
    expect(full_haul.segments.map((s) => s.label)).toEqual([
      'Rashad — Weekly Meal Plan',
      'Craig — Meal Map',
      'Household Essentials',
      'Shared / Unallocated',
    ]);
    expect(full_haul.segments.find((s) => s.kind === 'shared_unallocated')?.explanation).toMatch(
      /cannot yet be allocated/i,
    );
    expect(summary.estimated_total).toBe(195.15);
    expect(summary.unpriced_item_count).toBe(5);
    expect(summary.priced_item_count).toBe(42);
  });
});
