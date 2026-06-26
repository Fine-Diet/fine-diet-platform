import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import type { ProgramCollectionProgramResolution } from '@/lib/programs/programCollectionTypes';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition } from '@/lib/modules/types';

interface Props {
  resolution: ProgramCollectionProgramResolution;
  /**
   * Published marketing composition for this program, when one exists. When null
   * (today's default state), the page falls back to the existing code-catalogue
   * driven layout so behavior is fully preserved.
   */
  composition: PageComposition | null;
  /** SEO override from the marketing product record, when one exists. */
  seo: { title: string; description: string } | null;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function defaultWhoFor(collectionTitle: string): string[] {
  return [
    `People considering the ${collectionTitle} pathway and deciding whether this step fits their current needs.`,
    'Members who want a structured nutrition experiment without diagnosis or guaranteed outcomes.',
  ];
}

function defaultWhatYouWillDo(): string[] {
  return [
    'Review the program context before starting.',
    'Follow guided nutrition and reflection steps at a measured pace.',
    'Use observations from the program to choose a practical next step.',
  ];
}

export default function ProgramMarketingPage({ resolution, composition, seo }: Props) {
  // `resolution.series` is the storage-aligned field name; it is the Collection.
  const { series: collection, program, index, previousProgram, nextProgram } =
    resolution;
  const primaryCta = resolveProgramMarketingCta({ series: collection, program });
  const programHref = `/programs/${collection.slug}/${program.slug}`;
  const whoFor = program.whoFor?.length
    ? program.whoFor
    : defaultWhoFor(collection.title);
  const whatYouWillDo = program.whatYouWillDo?.length
    ? program.whatYouWillDo
    : defaultWhatYouWillDo();

  return (
    <>
      <Head>
        <title>
          {seo?.title ??
            `${program.title} \u2022 ${collection.title} \u2022 Fine Diet Programs`}
        </title>
        <meta
          name="description"
          content={seo?.description ?? (program.objective ?? program.description)}
        />
      </Head>
      {composition ? (
        <main className="min-h-screen bg-neutral-0">
          <ModuleRenderer composition={composition} />
        </main>
      ) : (
      <div className="min-h-screen bg-brand-50 text-brand-900">
        <section className="relative isolate overflow-hidden px-6 py-16 sm:py-20">
          <Image
          src={collection.heroImageUrl}
          alt=""
          fill
          priority
            className="absolute inset-0 -z-20 object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 -z-10 bg-brand-900/80" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-900/25 to-brand-900/92" />
          <div className="mx-auto max-w-5xl text-white">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-white/70">
              <Link
                href="/programs"
                className="underline-offset-4 hover:text-white hover:underline"
              >
                Programs
              </Link>
              <span aria-hidden="true">/</span>
              <Link
                href={`/programs/${collection.slug}`}
                className="underline-offset-4 hover:text-white hover:underline"
              >
                {collection.title}
              </Link>
            </div>

            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
              Program
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.03em] antialiased sm:text-6xl">
              {program.title}
            </h1>
            {program.subtitle && (
              <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/78">
                {program.subtitle}
              </p>
            )}
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/68">
              {program.objective ?? program.description}
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
              <span>{collection.title}</span>
              {program.lengthLabel && <span>{program.lengthLabel}</span>}
              <span>{statusLabel(program.status)}</span>
            </div>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              {primaryCta.href && !primaryCta.disabled ? (
                <Link
                  href={primaryCta.href}
                  className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
                >
                  {primaryCta.label}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-full bg-white/80 px-5 py-2.5 text-sm font-semibold text-brand-900/60 disabled:cursor-not-allowed"
                >
                  {primaryCta.label}
                </button>
              )}
              <Link
                href={primaryCta.secondaryHref}
                className="text-sm font-medium text-white/75 underline-offset-4 hover:text-white hover:underline"
              >
                {primaryCta.secondaryLabel}
              </Link>
            </div>
            {primaryCta.helperText && (
              <p className="mt-3 max-w-xl text-xs leading-relaxed text-white/55">
                {primaryCta.helperText}
              </p>
            )}
          </div>
        </section>

        <section className="px-6 py-14">
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/38">
                  Objective
                </p>
                <p className="mt-3 text-base leading-relaxed text-brand-900/70">
                  {program.objective ?? program.description}
                </p>
              </div>

              <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold antialiased">
                  Who it is for
                </h2>
                <ul className="mt-4 space-y-3">
                  {whoFor.map((item) => (
                    <li
                      key={item}
                      className="text-sm leading-relaxed text-brand-900/66"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold antialiased">
                  What you will do
                </h2>
                <ul className="mt-4 space-y-3">
                  {whatYouWillDo.map((item) => (
                    <li
                      key={item}
                      className="text-sm leading-relaxed text-brand-900/66"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/38">
                  Pathway context
                </p>
                <h2 className="mt-2 text-2xl font-semibold antialiased">
                  Step {index + 1} of {collection.programs.length} in{' '}
                  {collection.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-brand-900/62">
                  This public page explains where {program.title} sits in the
                  collection. Enrollment, delivery modules, and signed-in program
                  management remain separate in `/app/programs`.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {previousProgram ? (
                  <Link
                    href={`/programs/${collection.slug}/${previousProgram.slug}`}
                    className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm transition hover:border-brand-200"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/38">
                      Previous
                    </p>
                    <p className="mt-2 font-semibold antialiased">
                      {previousProgram.title}
                    </p>
                  </Link>
                ) : (
                  <div className="rounded-3xl border border-brand-100 bg-white p-5 text-brand-900/42 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                      Previous
                    </p>
                    <p className="mt-2 text-sm">This is the first step.</p>
                  </div>
                )}

                {nextProgram ? (
                  <Link
                    href={`/programs/${collection.slug}/${nextProgram.slug}`}
                    className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm transition hover:border-brand-200"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/38">
                      Next
                    </p>
                    <p className="mt-2 font-semibold antialiased">
                      {nextProgram.title}
                    </p>
                  </Link>
                ) : (
                  <div className="rounded-3xl border border-brand-100 bg-white p-5 text-brand-900/42 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em]">
                      Next
                    </p>
                    <p className="mt-2 text-sm">This is the final listed step.</p>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold antialiased">
                  Public marketing page
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-brand-900/62">
                  This route uses public marketing catalogue content only. It
                  does not read journal runtime state and does not require
                  authentication.
                </p>
                <Link
                  href={programHref}
                  className="mt-4 inline-flex text-sm font-semibold text-denim-700 underline-offset-4 hover:underline"
                >
                  Current public program URL
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>
      )}
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { getProgramSeriesProgramStaticPathsForPublic } = await import(
    '@/lib/programs/programSeriesDeliveryServerService'
  );
  return {
    paths: (await getProgramSeriesProgramStaticPathsForPublic()).map(
      ({ series, program }) => ({
        params: { series, program },
      }),
    ),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const rawSeries = params?.series;
  const rawProgram = params?.program;
  const seriesSlug = Array.isArray(rawSeries) ? rawSeries[0] : rawSeries;
  const programSlug = Array.isArray(rawProgram) ? rawProgram[0] : rawProgram;

  const { getProgramSeriesProgramBySlugsForPublic } = await import(
    '@/lib/programs/programSeriesDeliveryServerService'
  );
  const resolution =
    seriesSlug && programSlug
      ? await getProgramSeriesProgramBySlugsForPublic(seriesSlug, programSlug)
      : null;

  if (!resolution) {
    return { notFound: true };
  }

  // Composition-driven marketing layer (additive). Public routes read the
  // PUBLISHED composition only — drafts are admin-preview only and never leak
  // here. When absent, `composition` stays null and the existing layout renders.
  const { buildProgramMarketingSlug, getProgramsMarketingComposition, getProgramsMarketingProductRecord } =
    await import('@/lib/programs/programsMarketingApi');
  const marketingSlug = buildProgramMarketingSlug(
    resolution.series.slug,
    resolution.program.slug,
  );
  const [composition, marketingProduct] = await Promise.all([
    getProgramsMarketingComposition(marketingSlug, 'published'),
    getProgramsMarketingProductRecord(marketingSlug, 'published'),
  ]);

  // Publish gate (mirrors integrative-care, which requires BOTH a product record
  // and a composition): a composition only takes over the public render when its
  // marketing product record is ALSO published. The product record is therefore
  // the explicit publish switch — seeding a composition JSON alone does not flip
  // the live page, so the existing layout keeps rendering until a program is
  // intentionally published to the template.
  const useComposition = Boolean(marketingProduct && composition);

  return {
    props: {
      resolution,
      composition: useComposition ? composition : null,
      seo: marketingProduct
        ? { title: marketingProduct.seoTitle, description: marketingProduct.seoDescription }
        : null,
    },
    revalidate: 300,
  };
};
