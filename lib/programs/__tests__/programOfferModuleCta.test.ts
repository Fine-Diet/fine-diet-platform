/**
 * Verifies the cta.program-offer.v1 resolver preserves offer/checkout and
 * coming_soon/disabled truth: the module only carries slugs, so all CTA
 * behavior must flow through the centralized resolveProgramMarketingCta.
 */
import { describe, it, expect } from '@jest/globals';
import { resolveProgramOfferModuleCta } from '../programOfferModuleCta';

describe('resolveProgramOfferModuleCta', () => {
  it('resolves an available program to its checkout offer link', () => {
    const resolved = resolveProgramOfferModuleCta({
      collectionSlug: 'nutrition',
      programSlug: 'baseline',
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.cta.kind).toBe('checkout_link');
    expect(resolved!.cta.disabled).toBe(false);
    expect(resolved!.cta.offerKey).toBe('journal-annual');
    expect(resolved!.cta.href).toBe(
      '/buy/journal-annual?placement=program-nutrition-baseline&source=program_marketing',
    );
    expect(resolved!.cta.label).toBe('Get Baseline access');
    expect(resolved!.cta.secondaryHref).toBe('/app/programs');
  });

  it('keeps coming_soon programs disabled (no checkout exposed)', () => {
    const resolved = resolveProgramOfferModuleCta({
      collectionSlug: 'nutrition',
      programSlug: 'digestive-foundations',
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.cta.kind).toBe('disabled');
    expect(resolved!.cta.disabled).toBe(true);
    expect(resolved!.cta.href).toBeNull();
    expect(resolved!.cta.offerKey).toBeNull();
    expect(resolved!.cta.label).toBe('Coming soon');
  });

  it('keeps planned programs disabled', () => {
    const resolved = resolveProgramOfferModuleCta({
      collectionSlug: 'nutrition',
      programSlug: 'gluten-response',
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.cta.kind).toBe('disabled');
    expect(resolved!.cta.disabled).toBe(true);
    expect(resolved!.cta.href).toBeNull();
    expect(resolved!.cta.label).toBe('Planned');
  });

  it('resolves the collection-level CTA when no programSlug is given', () => {
    const resolved = resolveProgramOfferModuleCta({ collectionSlug: 'nutrition' });

    expect(resolved).not.toBeNull();
    expect(resolved!.program).toBeNull();
    expect(resolved!.cta.kind).toBe('internal_link');
    expect(resolved!.cta.href).toBe('/programs/nutrition/baseline');
    expect(resolved!.cta.label).toBe('Start with Baseline');
  });

  it('returns null for an unknown collection', () => {
    expect(
      resolveProgramOfferModuleCta({ collectionSlug: 'does-not-exist' }),
    ).toBeNull();
  });

  it('returns null when the program is not in the collection', () => {
    expect(
      resolveProgramOfferModuleCta({
        collectionSlug: 'nutrition',
        programSlug: 'not-a-real-program',
      }),
    ).toBeNull();
  });

  it('returns the resolved collection + program objects, not just the CTA', () => {
    const resolved = resolveProgramOfferModuleCta({
      collectionSlug: 'nutrition',
      programSlug: 'baseline',
    });

    expect(resolved!.collection.slug).toBe('nutrition');
    expect(resolved!.program).not.toBeNull();
    expect(resolved!.program!.slug).toBe('baseline');
  });

  it('resolves the collection-level CTA for the Lifestyle collection', () => {
    const resolved = resolveProgramOfferModuleCta({ collectionSlug: 'lifestyle' });

    expect(resolved).not.toBeNull();
    expect(resolved!.program).toBeNull();
    expect(resolved!.cta.kind).toBe('internal_link');
    expect(resolved!.cta.href).toBe('/programs/lifestyle/lean');
    expect(resolved!.cta.label).toBe('View Lifestyle pathway');
    expect(resolved!.cta.secondaryHref).toBe('/app/programs');
  });

  it('resolves the collection-level CTA for the Advanced collection', () => {
    const resolved = resolveProgramOfferModuleCta({ collectionSlug: 'advanced' });

    expect(resolved).not.toBeNull();
    expect(resolved!.cta.kind).toBe('internal_link');
    expect(resolved!.cta.href).toBe('/programs/advanced/elimination-protocol');
    expect(resolved!.cta.label).toBe('View Advanced pathway');
  });

  it('normalizes slug casing and surrounding whitespace before resolving', () => {
    const resolved = resolveProgramOfferModuleCta({
      collectionSlug: '  NUTRITION  ',
      programSlug: ' Baseline ',
    });

    expect(resolved).not.toBeNull();
    expect(resolved!.collection.slug).toBe('nutrition');
    expect(resolved!.program!.slug).toBe('baseline');
    expect(resolved!.cta.kind).toBe('checkout_link');
    expect(resolved!.cta.offerKey).toBe('journal-annual');
  });
});
