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
    expect(ctaFields).toHaveLength(4);
    for (const field of ctaFields) {
      expect(field.group).toBe('Hero CTA');
      expect(field.optional).toBe(true);
    }
  });
});
