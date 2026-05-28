import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import type { ProgramSeriesDefinition } from '@/lib/programs/programSeriesTypes';

interface Props {
  series: ProgramSeriesDefinition;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function ProgramStatusBadge({ status }: { status: string }) {
  const isAvailable = status === 'available';
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
        isAvailable
          ? 'bg-denim-500/12 text-denim-700'
          : 'bg-brand-100 text-brand-900/58'
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

export default function ProgramSeriesPage({ series }: Props) {
  const seriesCta = resolveProgramMarketingCta({ series });

  return (
    <>
      <Head>
        <title>{series.title} &bull; Fine Diet Programs</title>
        <meta name="description" content={series.description} />
      </Head>
      <div className="min-h-screen bg-brand-50 text-brand-900">
        <section className="relative isolate overflow-hidden px-6 py-16 sm:py-20">
          <Image
            src={series.heroImageUrl}
            alt=""
            fill
            priority
            className="absolute inset-0 -z-20 object-cover"
            sizes="100vw"
          />
          <div className="absolute inset-0 -z-10 bg-brand-900/78" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-900/30 to-brand-900/90" />
          <div className="mx-auto max-w-5xl text-white">
            <Link
              href="/programs"
              className="text-sm text-white/70 underline-offset-4 hover:text-white hover:underline"
            >
              Back to Programs
            </Link>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
              Program series
            </p>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-0.03em] antialiased sm:text-6xl">
              {series.title}
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-relaxed text-white/78">
              {series.subtitle}
            </p>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/68">
              {series.description}
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {seriesCta.href && !seriesCta.disabled ? (
                <Link
                  href={seriesCta.href}
                  className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
                >
                  {seriesCta.label}
                </Link>
              ) : (
                <button
                  type="button"
                  disabled
                  className="rounded-full bg-white/80 px-5 py-2.5 text-sm font-semibold text-brand-900/60 disabled:cursor-not-allowed"
                >
                  {seriesCta.label}
                </button>
              )}
              <Link
                href={seriesCta.secondaryHref}
                className="text-sm font-medium text-white/75 underline-offset-4 hover:text-white hover:underline"
              >
                {seriesCta.secondaryLabel}
              </Link>
            </div>
            {seriesCta.helperText && (
              <p className="mt-3 max-w-xl text-xs leading-relaxed text-white/55">
                {seriesCta.helperText}
              </p>
            )}
          </div>
        </section>

        <section className="px-6 py-14">
          <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-5">
              <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold antialiased">
                  Who it is for
                </h2>
                <ul className="mt-4 space-y-3">
                  {series.whoFor.map((item) => (
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
                  {series.whatYouWillDo.map((item) => (
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

            <div>
              <div className="mb-4">
                <h2 className="text-2xl font-semibold antialiased">
                  Pathway sequence
                </h2>
                <p className="mt-1 text-sm text-brand-900/58">
                  Public overview only. Active enrollment state and delivery
                  modules live in signed-in `/app/programs`.
                </p>
              </div>

              <ol className="space-y-3">
                {series.programs.map((program, index) => {
                  const programHref = `/programs/${series.slug}/${program.slug}`;
                  const programCta = resolveProgramMarketingCta({
                    series,
                    program,
                  });

                  return (
                    <li
                      key={program.slug}
                      className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/38">
                            Step {index + 1}
                          </p>
                          <h3 className="mt-1 text-xl font-semibold antialiased">
                            <Link
                              href={programHref}
                              className="underline-offset-4 hover:underline"
                            >
                              {program.title}
                            </Link>
                          </h3>
                          {program.subtitle && (
                            <p className="mt-1 text-sm font-medium text-brand-900/55">
                              {program.subtitle}
                            </p>
                          )}
                        </div>
                        <ProgramStatusBadge status={program.status} />
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-brand-900/66">
                        {program.description}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {program.lengthLabel && (
                          <p className="text-xs font-medium text-brand-900/42">
                            {program.lengthLabel}
                          </p>
                        )}
                        <Link
                          href={programHref}
                          className="text-xs font-semibold text-denim-700 underline-offset-4 hover:underline"
                        >
                          View program
                        </Link>
                        {programCta.href && !programCta.disabled ? (
                          <Link
                            href={programCta.href}
                            className="text-xs font-semibold text-brand-900 underline-offset-4 hover:underline"
                          >
                            {programCta.label}
                          </Link>
                        ) : (
                          <span className="text-xs font-semibold text-brand-900/38">
                            {programCta.label}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const { getProgramSeriesStaticPathsForPublic } = await import(
    '@/lib/programs/programSeriesDeliveryServerService'
  );
  return {
    paths: (await getProgramSeriesStaticPathsForPublic()).map((series) => ({
      params: { series },
    })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const rawSeries = params?.series;
  const seriesSlug = Array.isArray(rawSeries) ? rawSeries[0] : rawSeries;
  const { getProgramSeriesBySlugForPublic } = await import(
    '@/lib/programs/programSeriesDeliveryServerService'
  );
  const series = seriesSlug
    ? await getProgramSeriesBySlugForPublic(seriesSlug)
    : null;

  if (!series) {
    return { notFound: true };
  }

  return {
    props: {
      series,
    },
    revalidate: 300,
  };
};
