import type { GetStaticProps } from 'next';
import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import { resolveProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import type { ProgramSeriesDefinition } from '@/lib/programs/programSeriesTypes';
import { PrimaryPillCta, SecondaryCtaLink } from '@/components/programs/PrimaryPillCta';
import SeriesPathwayRail from '@/components/programs/SeriesPathwayRail';
import ProgramSequenceMatrix from '@/components/programs/ProgramSequenceMatrix';
import {
  CategoryAppIntegration,
  CategoryComparison,
  CategoryFaq,
} from '@/components/programs/ProgramCategoryView';

interface Props {
  programSeries: ProgramSeriesDefinition[];
}

function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
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
        {/* Hero */}
        <section className="relative isolate overflow-hidden px-6 py-20 sm:py-24">
          {leadSeries && (
            <Image
              src={leadSeries.heroImageUrl}
              alt=""
              fill
              priority
              className="absolute inset-0 -z-20 object-cover"
              sizes="100vw"
            />
          )}
          <div className="absolute inset-0 -z-10 bg-brand-900/80" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-900/40 to-brand-900/92" />
          <div className="mx-auto max-w-3xl text-center text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
              Fine Diet Programs
            </p>
            <h1 className="mx-auto mt-4 text-4xl font-semibold leading-[0.98] tracking-[-0.04em] antialiased sm:text-6xl">
              Your nutrition will never
              <br className="hidden sm:block" /> need another restart
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
              Begin with nutrition, then follow your signals. Start with a
              practical Baseline rhythm and move into focused pathways as they
              fit your goals.
            </p>
            {heroCta && (
              <div className="mt-8 flex flex-col items-center gap-4">
                <PrimaryPillCta cta={heroCta} wide />
                <SecondaryCtaLink cta={heroCta} tone="light" />
              </div>
            )}
          </div>
        </section>

        {/* Featured pathway rail */}
        <SeriesPathwayRail
          heading="Begin with nutrition, then follow your signals"
          intro="Each pathway is a public overview. Active enrollment and delivery live in the signed-in app."
        >
          {programSeries.map((series) => {
            const cta = resolveProgramMarketingCta({ series });
            return (
              <Link
                key={series.slug}
                href={`/programs/${series.slug}`}
                className="group flex flex-shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/5 transition-colors hover:border-white/40"
                style={{ width: 'min(360px, 82vw)' }}
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden">
                  <Image
                    src={series.heroImageUrl}
                    alt=""
                    fill
                    className="object-cover transition duration-300 group-hover:scale-[1.03]"
                    sizes="(max-width: 640px) 82vw, 360px"
                  />
                  <span className="absolute bottom-3 left-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur">
                    {categoryLabel(series.category)}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h3 className="text-lg font-semibold text-white antialiased sm:text-xl">
                    {series.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm font-light leading-relaxed text-white/65">
                    {series.subtitle}
                  </p>
                  <p className="mt-3 text-xs text-white/45">
                    {series.programs.length} programs in pathway
                  </p>
                  <span className="mt-3 text-xs font-semibold text-white underline-offset-4 group-hover:underline">
                    {cta.label}
                  </span>
                </div>
              </Link>
            );
          })}
        </SeriesPathwayRail>

        {/* Nutrition Foundations sequence — light rounded matrix */}
        {leadSeries && (
          <section className="px-6 py-16 sm:py-20">
            <div className="mx-auto max-w-5xl">
              <ProgramSequenceMatrix
                series={leadSeries}
                heading="Meet your nutrition foundations"
                subhead={`${leadSeries.title} is a staged sequence. You start with Baseline, then build from what you learn.`}
              />
            </div>
          </section>
        )}

        {/* App/journal split band · comparison · premium FAQ (shared with the
            category surface for visual + behavioral consistency). */}
        {leadContent && (
          <>
            <CategoryAppIntegration content={leadContent} />
            <CategoryComparison content={leadContent} />
            <CategoryFaq content={leadContent} />
          </>
        )}

        {/* Final CTA — large centered headline, one wide pale-blue pill */}
        <section className="px-6 py-16 sm:py-20">
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
