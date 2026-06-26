import { describe, expect, test } from '@jest/globals';
import { PROGRAMS_MVP_CATEGORIES } from '../appProgramsMvp';
import { getProgramSeriesBySlug } from '../programSeriesCatalogue';

/**
 * Guards the canonical program-slug alignment between the two code-owned
 * registries:
 *   - public catalogue (`programSeriesCatalogue`) — also the source of truth for
 *     `program:<slug>` entitlement keys, offers, and `/programs/...` routes
 *   - in-app MVP hub registry (`appProgramsMvp`)
 *
 * Concrete (non-placeholder) app MVP program slugs must match the canonical
 * public catalogue slugs so a single `program:<slug>` identity flows across
 * marketing, access, and delivery. Placeholder programs (`status: 'tba'`) are
 * not yet real programs and are intentionally exempt.
 */
describe('program registry slug alignment', () => {
  test('every concrete app MVP program slug exists in its public collection', () => {
    for (const category of PROGRAMS_MVP_CATEGORIES) {
      const collection = getProgramSeriesBySlug(category.slug);
      if (!collection) continue;
      const canonicalSlugs = new Set(collection.programSlugs);
      for (const series of category.series) {
        for (const program of series.programs) {
          if (program.status === 'tba') continue;
          expect({
            slug: program.slug,
            inPublicCatalogue: canonicalSlugs.has(program.slug),
          }).toEqual({ slug: program.slug, inPublicCatalogue: true });
        }
      }
    }
  });

  test('legacy divergent slugs are no longer used in the app MVP registry', () => {
    const allAppSlugs = PROGRAMS_MVP_CATEGORIES.flatMap((category) =>
      category.series.flatMap((series) =>
        series.programs.map((program) => program.slug),
      ),
    );

    expect(allAppSlugs).not.toContain('digestive-reset');
    expect(allAppSlugs).not.toContain('protein-optimization');
    expect(allAppSlugs).toContain('digestive-foundations');
    expect(allAppSlugs).toContain('protein-sufficiency');
  });
});
