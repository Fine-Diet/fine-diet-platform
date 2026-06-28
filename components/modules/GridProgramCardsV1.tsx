/**
 * Module: grid.program-cards.v1
 *
 * Resolver-driven grid of program cards for a collection. Authored content owns
 * ONLY the target collection slug and the presentational heading/subhead — the
 * program list, sequence/order, internal links, length labels, card detail, and
 * any status/offer/availability truth all come from the code catalogue via
 * `getProgramSeriesBySlug` + the shared `ProgramCardGrid`.
 *
 * This keeps offer/entitlement truth and the program sequence centralized; a
 * composition can never hand-author the program list or links.
 *
 * Wrapper mirrors ProgramCategoryView's card-grid section. Hook-free (ProgramCard
 * uses native <details>), so it is SSR-safe and directly unit-test renderable.
 */

import type { GridProgramCardsV1Content } from '@/lib/modules/types';
import { getProgramSeriesBySlug } from '@/lib/programs/programSeriesCatalogue';
import { PLACEHOLDER_SLUG_TOKENS } from '@/lib/modules/resolverSlugWarnings';
import ProgramCardGrid from '@/components/programs/ProgramCardGrid';

interface Props {
  content: GridProgramCardsV1Content;
}

export function GridProgramCardsV1({ content }: Props) {
  const collection = getProgramSeriesBySlug(content.collectionSlug);

  if (!collection) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[grid.program-cards.v1] Unknown program collection "${content.collectionSlug}"`,
      );
    }

    // Show an authoring-only empty-state notice when the slug is a leftover
    // template placeholder or empty — but ONLY in non-production builds.
    // In production a placeholder slug (accidentally published or otherwise)
    // must render nothing, not admin-facing copy. The composition editor's
    // resolverSlugWarnings panel is the correct surface for that warning.
    const slug = (content.collectionSlug ?? '').trim();
    const isPlaceholderOrEmpty =
      slug === '' || (PLACEHOLDER_SLUG_TOKENS as readonly string[]).includes(slug);
    if (!isPlaceholderOrEmpty || process.env.NODE_ENV === 'production') return null;

    return (
      <section className="px-6 py-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-dashed border-brand-900/25 bg-brand-50 px-6 py-10 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-900/45">
            Program cards
          </p>
          <p className="mt-3 text-base leading-relaxed text-brand-900/70">
            No program cards yet — set <span className="font-semibold">Collection slug</span>{' '}
            to a real program collection (for example <code>nutrition</code>) so the
            sequence resolves from the catalogue.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <ProgramCardGrid
          collection={collection}
          heading={content.heading}
          subhead={content.subhead}
        />
      </div>
    </section>
  );
}
