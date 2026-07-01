/**
 * Unit tests for the composition-driven hero CTA on hero.standard.v1.
 *
 * The hero CTA is authored/edited from the composition input model (not
 * resolved from the catalogue), so we assert the schema accepts the explicit
 * CTA fields and that they are exposed as editable field descriptors. The
 * jest environment is `node` (no DOM) and HeroStandardV1 uses hooks/router, so
 * rendering is covered by the integration build rather than a DOM render here.
 */
import { heroStandardV1Schema, MODULE_CONTENT_SCHEMAS } from '@/lib/modules/schema';
import { MODULE_FIELD_DESCRIPTORS } from '@/lib/modules/fieldDescriptors';

const BASE = {
  headline: 'The most comprehensive, self-led nutrition program',
  images: { desktop: 'https://example.com/d.jpg', mobile: 'https://example.com/m.jpg' },
  height: 'full' as const,
};

describe('hero.standard.v1 composition-driven CTA schema', () => {
  it('accepts explicit primary + secondary CTA fields', () => {
    const result = heroStandardV1Schema.safeParse({
      ...BASE,
      ctaPrimaryLabel: 'Start with Baseline',
      ctaPrimaryHref: '/programs/nutrition/baseline',
      ctaSecondaryLabel: 'Manage my programs',
      ctaSecondaryHref: '/app/programs',
    });
    expect(result.success).toBe(true);
  });

  it('treats the CTA fields as optional (back-compatible with existing heroes)', () => {
    expect(heroStandardV1Schema.safeParse(BASE).success).toBe(true);
  });

  it('is wired into the schema map', () => {
    expect(MODULE_CONTENT_SCHEMAS['hero.standard.v1']).toBeDefined();
  });
});

describe('hero.standard.v1 start-style optional fields', () => {
  it('accepts eyebrow, ctaNote, heroRailEnabled, heroRailItems, and overlayStrength', () => {
    const result = heroStandardV1Schema.safeParse({
      ...BASE,
      eyebrow: 'Three goals',
      ctaPrimaryLabel: 'Start your free trial',
      ctaPrimaryHref: '#plans',
      ctaNote: 'Choose monthly or annual before checkout.',
      heroRailEnabled: true,
      heroRailItems: ['Food clarity', 'Body signals', 'Meal rhythm'],
      overlayStrength: 'dark',
    });
    expect(result.success).toBe(true);
  });

  it('remains valid when all start-style fields are omitted (back-compatible)', () => {
    expect(heroStandardV1Schema.safeParse(BASE).success).toBe(true);
  });

  it('rejects an unknown overlayStrength value', () => {
    const result = heroStandardV1Schema.safeParse({ ...BASE, overlayStrength: 'extra-dark' });
    expect(result.success).toBe(false);
  });

  it('does not define a headlineScale field on the schema (canonical sizing only)', () => {
    const shape = heroStandardV1Schema.shape as Record<string, unknown>;
    expect(shape).not.toHaveProperty('headlineScale');
  });
});

describe('hero.standard.v1 start-style fields are editable from the admin input model', () => {
  const descriptors = MODULE_FIELD_DESCRIPTORS['hero.standard.v1'];
  const keys = descriptors.map((d) => d.key);

  it('exposes the new start-style descriptor keys', () => {
    expect(keys).toEqual(
      expect.arrayContaining([
        'eyebrow',
        'ctaNote',
        'heroRailEnabled',
        'heroRailItems',
        'overlayStrength',
      ]),
    );
  });

  it('does not expose a headlineScale descriptor (canonical sizing only)', () => {
    expect(keys).not.toContain('headlineScale');
  });

  it('groups overlayStrength under "Hero Display"', () => {
    const field = descriptors.find((d) => d.key === 'overlayStrength');
    expect(field?.group).toBe('Hero Display');
    expect(field?.optional).toBe(true);
  });

  it('groups ctaNote under "Hero CTA" and keeps it optional', () => {
    const field = descriptors.find((d) => d.key === 'ctaNote');
    expect(field?.group).toBe('Hero CTA');
    expect(field?.optional).toBe(true);
  });

  it('groups the rail fields under "Hero Bottom Rail"', () => {
    const railFields = descriptors.filter(
      (d) => d.key === 'heroRailEnabled' || d.key === 'heroRailItems',
    );
    expect(railFields).toHaveLength(2);
    for (const field of railFields) {
      expect(field.group).toBe('Hero Bottom Rail');
      expect(field.optional).toBe(true);
    }
  });

  it('keeps the original four CTA fields grouped under "Hero CTA"', () => {
    const ctaFields = descriptors.filter((d) => d.key.startsWith('cta'));
    expect(ctaFields.map((d) => d.key).sort()).toEqual(
      ['ctaNote', 'ctaPrimaryHref', 'ctaPrimaryLabel', 'ctaSecondaryHref', 'ctaSecondaryLabel'].sort(),
    );
    for (const field of ctaFields) {
      expect(field.group).toBe('Hero CTA');
      expect(field.optional).toBe(true);
    }
  });
});

describe('hero.standard.v1 CTA is editable from the admin input model', () => {
  const descriptors = MODULE_FIELD_DESCRIPTORS['hero.standard.v1'];
  const keys = descriptors.map((d) => d.key);

  it('exposes the four CTA fields as editor descriptors', () => {
    expect(keys).toEqual(
      expect.arrayContaining([
        'ctaPrimaryLabel',
        'ctaPrimaryHref',
        'ctaSecondaryLabel',
        'ctaSecondaryHref',
      ]),
    );
  });

  it('groups the CTA fields under a "Hero CTA" group', () => {
    const ctaFields = descriptors.filter((d) => d.key.startsWith('cta'));
    expect(ctaFields).toHaveLength(5);
    for (const field of ctaFields) {
      expect(field.group).toBe('Hero CTA');
      expect(field.optional).toBe(true);
    }
  });
});
