import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import type { ProgramSeriesProgramResolution } from '@/lib/programs/programSeriesTypes';

interface Props {
  resolution: ProgramSeriesProgramResolution;
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function defaultWhoFor(seriesTitle: string): string[] {
  return [
    `People considering the ${seriesTitle} pathway and deciding whether this step fits their current needs.`,
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

export default function ProgramMarketingPage({ resolution }: Props) {
  const { series, program, index, previousProgram, nextProgram } = resolution;
  const primaryCta = resolveProgramMarketingCta({ series, program });
  const programHref = `/programs/${series.slug}/${program.slug}`;
  const whoFor = program.whoFor?.length
    ? program.whoFor
    : defaultWhoFor(series.title);
  const whatYouWillDo = program.whatYouWillDo?.length
    ? program.whatYouWillDo
    : defaultWhatYouWillDo();

  return (
    <>
      <Head>
        <title>
          {program.title} &bull; {series.title} &bull; Fine Diet Programs
        </title>
        <meta
          name="description"
          content={program.objective ?? program.description}
        />
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
                href={`/programs/${series.slug}`}
                className="underline-offset-4 hover:text-white hover:underline"
              >
                {series.title}
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
              <span>{series.title}</span>
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
                  Step {index + 1} of {series.programs.length} in {series.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-brand-900/62">
                  This public page explains where {program.title} sits in the
                  series. Enrollment, delivery modules, and signed-in program
                  management remain separate in `/app/programs`.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {previousProgram ? (
                  <Link
                    href={`/programs/${series.slug}/${previousProgram.slug}`}
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
                    href={`/programs/${series.slug}/${nextProgram.slug}`}
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

  return {
    props: {
      resolution,
    },
    revalidate: 300,
  };
};
