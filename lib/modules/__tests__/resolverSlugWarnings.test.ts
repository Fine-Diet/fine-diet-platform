/**
 * Tests for resolver-slug warnings — the authoring-side check that surfaces the
 * DATA prerequisite for resolver-driven modules (program cards, program-offer
 * CTA, pathway nav) when their slug is a leftover template placeholder or empty.
 */

import {
  getModuleResolverSlugWarnings,
  PLACEHOLDER_SLUG_TOKENS,
} from '../resolverSlugWarnings';

describe('getModuleResolverSlugWarnings', () => {
  it('returns nothing for non-resolver module types', () => {
    expect(getModuleResolverSlugWarnings('hero.standard.v1', { headline: 'x' })).toEqual([]);
    expect(getModuleResolverSlugWarnings('comparison.table.v1', {})).toEqual([]);
  });

  it('flags a placeholder collection slug on grid.program-cards.v1', () => {
    const warnings = getModuleResolverSlugWarnings('grid.program-cards.v1', {
      collectionSlug: 'collection-slug',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].field).toBe('collectionSlug');
    expect(warnings[0].message).toMatch(/placeholder/i);
  });

  it('flags an empty collection slug', () => {
    const warnings = getModuleResolverSlugWarnings('grid.program-cards.v1', {
      collectionSlug: '   ',
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/empty/i);
  });

  it('is silent when a real collection slug is set', () => {
    expect(
      getModuleResolverSlugWarnings('grid.program-cards.v1', { collectionSlug: 'nutrition' }),
    ).toEqual([]);
  });

  it('flags both placeholder slugs on a program-level CTA', () => {
    const warnings = getModuleResolverSlugWarnings('cta.program-offer.v1', {
      collectionSlug: 'collection-slug',
      programSlug: 'program-slug',
    });
    expect(warnings.map((w) => w.field).sort()).toEqual(['collectionSlug', 'programSlug']);
  });

  it('does not flag an omitted optional programSlug (collection-level CTA)', () => {
    expect(
      getModuleResolverSlugWarnings('cta.program-offer.v1', { collectionSlug: 'nutrition' }),
    ).toEqual([]);
  });

  it('exposes the placeholder token set the templates ship with', () => {
    expect(PLACEHOLDER_SLUG_TOKENS).toContain('collection-slug');
    expect(PLACEHOLDER_SLUG_TOKENS).toContain('program-slug');
  });
});
