import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import { resolveProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import type { ProgramSeriesDefinition } from '@/lib/programs/programSeriesTypes';
import { PrimaryPillCta, SecondaryCtaLink } from '@/components/programs/PrimaryPillCta';
import SeriesPathwayRail from '@/components/programs/SeriesPathwayRail';
import ProgramSequenceMatrix from '@/components/programs/ProgramSequenceMatrix';
import PathwayCardCta from '@/components/programs/PathwayCardCta';
import { AmbientMarqueeStripV1 } from '@/components/modules/AmbientMarqueeStripV1';
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
  programSeries: ProgramSeriesDefinition[];
}

export default function ProgramsPage({ programSeries }: Props) {
  // The offer index is nutrition-led: prefer the Nutrition Foundations series
  // for the hero CTA, sequence matrix, and shared category sections.
  const leadSeries =
    programSeries.find((series) => series.slug === 'nutrition') ??
    programSeries[0] ??
    null;
  const heroCta = leadSeries ? resolveProgramMarketingCta({ series: leadSeries }) : null;
  const leadContent = leadSeries ? resolveProgramCategoryContent(leadSeries) : null;

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
            {leadSeries && (
              <Image
                src={leadSeries.heroImageUrl}
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
              <p className="mx-auto mt-4 max-w-2xl font-light text-base leading-relaxed text-white/80 sm:mt-5 sm:text-lg">
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

        {/* Featured pathway rail — layer 1 */}
        <SeriesPathwayRail
          stackLayer={1}
          heading="Begin with nutrition, then follow your signals"
          intro="Each pathway is a public overview. Active enrollment and delivery live in the signed-in app."
          cta={heroCta ?? undefined}
          ctaNote="Start with Baseline in Nutrition Foundations — the featured pathway most members begin with."
        >
          {programSeries.map((series) => {
            const cta = resolveProgramMarketingCta({ series });
            return (
              <article
                key={series.slug}
                className="flex w-[min(250px,82vw)] flex-shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-white"
              >
                <div className="relative aspect-[2/1] w-full overflow-hidden">
                  <Image
                    src={series.heroImageUrl}
                    alt=""
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 82vw, 300px"
                  />
                </div>
                <div className="flex flex-1 flex-col p-5">
                <p className="text-xs uppercase font-light text-brand-900 antialiased sm:text-xs">
                    Status Line
                  </p>
                  <h3 className="text-lg font-semibold text-brand-900 antialiased sm:text-xl">
                    {series.title}
                  </h3>
                  <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-light leading-normal text-brand-900">
                    {series.subtitle}
                  </p>
                  <div className="mt-2">
                    <PathwayCardCta cta={cta} />
                  </div>
                </div>
              </article>
            );
          })}
        </SeriesPathwayRail>

        {/* Nutrition Foundations sequence — layer 2 */}
        {leadSeries && (
          <section className={stackedLayerClasses(2, 'bg-brand-50 px-6 py-16 sm:py-20')}>
            <div className="mx-auto max-w-3xl">
              <ProgramSequenceMatrix
                series={leadSeries}
                heading="Meet your nutrition foundations"
                subhead={`${leadSeries.title} is a staged sequence. You start with Baseline, then build from what you learn.`}
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

        {/* Final CTA — layer 6 */}
        <section className={stackedLayerClasses(6, 'bg-brand-50 px-6 py-16 sm:py-20')}>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-5xl">
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
  return {
    props: {
      programSeries: await getPublishedProgramSeriesForPublic(),
    },
    revalidate: 300,
  };
};
