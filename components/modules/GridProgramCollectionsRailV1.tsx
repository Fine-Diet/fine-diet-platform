import Image from 'next/image';

import SeriesPathwayRail from '@/components/programs/SeriesPathwayRail';
import PathwayCardCta from '@/components/programs/PathwayCardCta';
import type { GridProgramCollectionsRailV1Content } from '@/lib/modules/types';
import {
  getProgramSeriesBySlug,
  getPublishedProgramSeries,
  resolveProgramMarketingCta,
} from '@/lib/programs/programSeriesCatalogue';
import type { ProgramCollectionDefinition } from '@/lib/programs/programCollectionTypes';

interface Props {
  content: GridProgramCollectionsRailV1Content;
}

const DEFAULT_HEADING = 'Begin with nutrition, then follow your signals';
const DEFAULT_INTRO =
  'Each pathway is a public overview. Active enrollment and delivery live in the signed-in app.';
const DEFAULT_FEATURED_COLLECTION_SLUG = 'nutrition';
const DEFAULT_CTA_NOTE =
  'Start with Baseline in Nutrition Foundations — the featured pathway most members begin with.';

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

function resolveCollections(content: GridProgramCollectionsRailV1Content): ProgramCollectionDefinition[] {
  const published = getPublishedProgramSeries() as ProgramCollectionDefinition[];
  const requestedSlugs = (content.collectionSlugs ?? [])
    .map(normalizeSlug)
    .filter(Boolean);

  if (requestedSlugs.length === 0) return published;

  const resolved = requestedSlugs
    .map((slug) => getProgramSeriesBySlug(slug) as ProgramCollectionDefinition | null)
    .filter((collection): collection is ProgramCollectionDefinition => Boolean(collection));

  if (resolved.length === 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[grid.program-collections-rail.v1] No published collections found for ${requestedSlugs.join(', ')}`,
      );
    }
    return published;
  }

  return resolved;
}

function resolveFeaturedCollection(
  content: GridProgramCollectionsRailV1Content,
  collections: ProgramCollectionDefinition[],
): ProgramCollectionDefinition | null {
  const slug = normalizeSlug(content.featuredCollectionSlug ?? DEFAULT_FEATURED_COLLECTION_SLUG);
  return (
    collections.find((collection) => collection.slug === slug) ??
    (getProgramSeriesBySlug(slug) as ProgramCollectionDefinition | null) ??
    collections[0] ??
    null
  );
}

function eyebrowForCollection(
  collection: ProgramCollectionDefinition,
  featuredCollection: ProgramCollectionDefinition | null,
  content: GridProgramCollectionsRailV1Content,
): string {
  if (featuredCollection && collection.slug === featuredCollection.slug) {
    return content.featuredEyebrow ?? 'Start here';
  }
  return content.secondaryEyebrow ?? 'Coming soon';
}

export function GridProgramCollectionsRailV1({ content }: Props) {
  const collections = resolveCollections(content);
  const featuredCollection = resolveFeaturedCollection(content, collections);
  const featuredCta = featuredCollection
    ? resolveProgramMarketingCta({ series: featuredCollection })
    : null;
  const showFeaturedCta = content.showFeaturedCta !== false;

  if (collections.length === 0) return null;

  return (
    <SeriesPathwayRail
      heading={content.heading ?? DEFAULT_HEADING}
      intro={content.intro ?? DEFAULT_INTRO}
      cta={showFeaturedCta ? featuredCta ?? undefined : undefined}
      ctaNote={showFeaturedCta ? content.ctaNote ?? DEFAULT_CTA_NOTE : undefined}
    >
      {collections.map((collection) => {
        const cta = resolveProgramMarketingCta({ series: collection });
        const description = collection.description || collection.subtitle;

        return (
          <article
            key={collection.slug}
            className="flex w-[min(330px,82vw)] flex-shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-white"
          >
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-brand-100">
              <Image
                src={collection.heroImageUrl}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 640px) 82vw, 330px"
              />
            </div>
            <div className="flex flex-1 flex-col p-5 sm:p-6">
              <p className="text-xs font-light uppercase tracking-[0.08em] text-brand-900/70 antialiased">
                {eyebrowForCollection(collection, featuredCollection, content)}
              </p>
              <h3 className="mt-1 text-lg font-semibold leading-tight text-brand-900 antialiased sm:text-xl">
                {collection.title}
              </h3>
              <p className="mt-4 line-clamp-5 min-h-[7.5rem] text-lg font-light leading-tight text-brand-900/70 antialiased sm:text-xl">
                {description}
              </p>
              <div className="mt-auto pt-6">
                <PathwayCardCta cta={cta} />
              </div>
            </div>
          </article>
        );
      })}
    </SeriesPathwayRail>
  );
}
