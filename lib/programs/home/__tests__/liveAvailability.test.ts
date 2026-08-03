import {
  buildLiveCatalogueFromAvailability,
  buildLiveFeaturedFromAvailability,
  mapAvailabilityStateToFeatured,
} from '../adapters';
import type { ProgramAvailabilityEntry } from '@/lib/programs/programAvailabilityServerService';

function entry(
  slug: string,
  state: ProgramAvailabilityEntry['state'],
  can_start = false,
): ProgramAvailabilityEntry {
  const reason: ProgramAvailabilityEntry['reason'] =
    state === 'available'
      ? 'eligible_to_start'
      : state === 'in_progress'
        ? 'enrollment_open'
        : state === 'completed'
          ? 'enrollment_completed'
          : state === 'dependency_locked'
            ? 'prerequisite_incomplete'
            : 'entitlement_required';
  return {
    slug,
    state,
    reason,
    is_entitled: state !== 'not_entitled',
    has_open_enrollment: state === 'in_progress',
    is_completed: state === 'completed',
    runtime_ready: true,
    dependency: null,
    can_start,
  };
}

describe('Programs Home live availability adapters', () => {
  test('maps availability states into featured CTA truth', () => {
    expect(mapAvailabilityStateToFeatured('available', true)).toEqual({
      availability: 'available',
      ctaLabel: 'Open',
      disabled: false,
    });
    expect(mapAvailabilityStateToFeatured('dependency_locked', false)).toEqual({
      availability: 'locked',
      ctaLabel: 'Locked',
      disabled: true,
    });
  });

  test('live featured cards use runtime source and href when available', () => {
    const featured = buildLiveFeaturedFromAvailability([
      entry('baseline', 'available', true),
      entry('digestive-foundations', 'dependency_locked'),
      entry('protein-sufficiency', 'not_entitled'),
    ]);
    expect(featured.status).toBe('populated');
    expect(featured.items[0]?.slug).toBe('baseline');
    expect(featured.items[0]?.source).toBe('runtime');
    expect(featured.items[0]?.href).toBe('/app/programs/baseline');
    expect(featured.items[1]?.disabled).toBe(true);
    expect(featured.items[1]?.href).toBeUndefined();
  });

  test('live catalogue never invents available CTAs without availability truth', () => {
    const items = buildLiveCatalogueFromAvailability([
      entry('baseline', 'in_progress'),
    ]);
    const baseline = items.find((item) => item.slug === 'baseline');
    expect(baseline?.availability).toBe('in_progress');
    expect(baseline?.href).toBe('/app/programs/baseline');
    const locked = items.find((item) => item.slug === 'digestive-foundations');
    // Absent from availability payload → coming_soon / no fake success path.
    expect(locked?.availability).toBe('coming_soon');
    expect(locked?.href).toBeUndefined();
  });
});
