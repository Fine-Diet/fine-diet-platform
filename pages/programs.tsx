import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import { resolveProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import type { ProgramCollectionDefinition } from '@/lib/programs/programCollectionTypes';
import {
  getProgramsMarketingComposition,
  getProgramsMarketingProductRecord,
  PROGRAMS_INDEX_MARKETING_SLUG,
  type ProgramsMarketingProduct,
} from '@/lib/programs/programsMarketingApi';
import { PrimaryPillCta, SecondaryCtaLink } from '@/components/programs/PrimaryPillCta';
import ProgramSequenceMatrix from '@/components/programs/ProgramSequenceMatrix';
import { AmbientMarqueeStripV1 } from '@/components/modules/AmbientMarqueeStripV1';
import { GridProgramCollectionsRailV1 } from '@/components/modules/GridProgramCollectionsRailV1';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition } from '@/lib/modules/types';
import {
  CategoryAppIntegration,
  CategoryComparison,
  CategoryFaq,
} from '@/components/programs/ProgramCategoryView';
import {
  StackedPageHero,
  stackedLayerClasses,
} from '@/components/layout/StackedPageSection';

const PROGRAMS_MARQUEE = {
  text: 'NOT A DETOX. NOT A DIET CHALLENGE. NOT ANOTHER TRACKER.',
  speed: 50,
  direction: 'left' as const,
  pauseOnHover: true,
};

interface Props {
  programCollections: ProgramCollectionDefinition[];
  /** Optional so admin preview callers can render the catalogue fallback directly. */
  managedProduct?: ProgramsMarketingProduct | null;
  /** Optional so admin preview callers can render the catalogue fallback directly. */
  managedComposition?: PageComposition | null;
}

export default function ProgramsPage({
  programCollections,
  managedProduct = null,
  managedComposition = null,
}: Props) {
  if (managedProduct && managedComposition) {
    return (
      <>
        <Head>
          <title>{managedProduct.seoTitle}</title>
          <meta name="description" content={managedProduct.seoDescription} />
        </Head>
        <main className="min-h-screen bg-brand-50 text-brand-900">
          <ModuleRenderer composition={managedComposition} layout="stacked" />
        </main>
      </>
    );
  }

  // The offer index is nutrition-led: prefer the Nutrition Foundations
  // collection for the hero CTA, sequence matrix, and shared category sections.
  const leadCollection =
    programCollections.find((collection) => collection.slug === 'nutrition') ??
    programCollections[0] ??
    null;
  const heroCta = leadCollection
    ? resolveProgramMarketingCta({ series: leadCollection })
    : null;
  const leadContent = leadCollection
    ? resolveProgramCategoryContent(leadCollection)
    : null;

  return (
    <>
      <Head>
        <title>Programs &bull; Fine Diet</title>
        <meta
          name="description"
          content="Begin with nutrition, then follow your signals. Explore Fine Diet program pathways, starting with Baseline in Nutrition Foundations."
        />
      </Head>
      <div className="min-h-screen bg-brand-50 text-brand-900">
        {/* Hero — layer 0 */}
        <StackedPageHero className="relative isolate overflow-hidden">
          <div className="absolute inset-0">
            {leadCollection && (
              <Image
                src={leadCollection.heroImageUrl}
                alt=""
                fill
                priority
                className="object-cover object-center"
                sizes="100vw"
              />
            )}
            <div className="absolute inset-0 bg-black/60" />
          </div>
          <div className="relative mx-auto flex h-[99vh] max-w-[1200px] flex-col items-center justify-center gap-6 px-6 py-0 text-center text-white sm:h-[97vh] sm:px-10">
            <div className="w-full max-w-3xl">
              <h1 className="mx-auto font-semibold leading-none antialiased text-hero-mobile sm:text-5xl lg:text-6xl lg:leading-none">
                Your nutrition will never
                <br className="hidden sm:block" /> need another restart
              </h1>
              <p className="mx-auto mt-4 max-w-2xl font-light text-base leading-5 text-white/80 sm:mt-5 sm:text-lg">
                Begin with nutrition, then follow your signals. Start with a
                practical Baseline rhythm and move into focused pathways as they
                fit your goals.
              </p>
            </div>
            {heroCta && (
              <div className="w-full">
                <PrimaryPillCta cta={heroCta} wide />
                <div className="mt-4 flex justify-center">
                  <SecondaryCtaLink cta={heroCta} tone="light" />
                </div>
              </div>
            )}
          </div>
        </StackedPageHero>

        {/* Featured pathway rail — layer 1 (resolver-driven module) */}
        <div className={stackedLayerClasses(1)}>
          <GridProgramCollectionsRailV1 content={{}} />
        </div>

        {/* Nutrition Foundations sequence — layer 2 */}
        {leadCollection && (
          <section className={stackedLayerClasses(2, 'bg-brand-50 px-6 py-16 sm:py-20')}>
            <div className="mx-auto max-w-3xl">
              <ProgramSequenceMatrix
                collection={leadCollection}
                heading="Meet your nutrition foundations"
                subhead={`${leadCollection.title} is a staged sequence. You start with Baseline, then build from what you learn.`}
                cta={heroCta ?? undefined}
              />
            </div>
          </section>
        )}

        {/* App/journal split band · comparison · premium FAQ — layers 3–5 */}
        {leadContent && (
          <>
            <CategoryAppIntegration content={leadContent} cta={heroCta ?? undefined} />
            <CategoryComparison content={leadContent} />
            <CategoryFaq content={leadContent} stackLayer={5} />
          </>
        )}

        <AmbientMarqueeStripV1 content={PROGRAMS_MARQUEE} />

        {/* Final CTA */}
        <section className="bg-brand-50 px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight antialiased sm:text-5xl">
              Find your baseline,
              <br className="hidden sm:block" /> then keep what works
            </h2>
            {heroCta && (
              <div className="mt-8 flex flex-col items-center gap-4">
                <PrimaryPillCta cta={heroCta} wide />
                <SecondaryCtaLink cta={heroCta} tone="dark" />
              </div>
            )}
            <p className="mx-auto mt-5 max-w-xl text-xs leading-5 text-brand-900/55 antialiased">
              Access is handled through the Fine Diet Journal. Start Baseline
              when you are ready — browsing here never changes your account.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps<Props> = async () => {
  const { getPublishedProgramSeriesForPublic } = await import(
    '@/lib/programs/programSeriesDeliveryServerService'
  );

  const [programCollections, managedProduct, managedComposition] = await Promise.all([
    getPublishedProgramSeriesForPublic(),
    getProgramsMarketingProductRecord(PROGRAMS_INDEX_MARKETING_SLUG, 'published'),
    getProgramsMarketingComposition(PROGRAMS_INDEX_MARKETING_SLUG, 'published'),
  ]);

  return {
    props: {
      programCollections,
      managedProduct:
        managedProduct?.kind === 'index' ? managedProduct : null,
      managedComposition,
    },
    revalidate: 300,
  };
};
