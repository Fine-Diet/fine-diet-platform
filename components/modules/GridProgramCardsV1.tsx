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
    return null;
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
