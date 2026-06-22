import type { GetStaticProps } from 'next';
import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';
import BuyOfferButton from '@/components/checkout/BuyOfferButton';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import type { ProgramSeriesDefinition } from '@/lib/programs/programSeriesTypes';

interface Props {
  programSeries: ProgramSeriesDefinition[];
}

const FAQ_ITEMS: Array<{ question: string; answer: string }> = [
  {
    question: 'Where do I start?',
    answer:
      'Everyone starts with Baseline, the first program in Nutrition Foundations. It establishes a practical 21-day rhythm and a starting point future programs build from.',
  },
  {
    question: 'Is this a diet or a restriction plan?',
    answer:
      'No. Nutrition Foundations is a staged pathway built on The Fine Diet Method. You add structure and observe patterns before deciding whether a more focused program fits.',
  },
  {
    question: 'How do programs work with my journal?',
    answer:
      'Programs are public overviews here. Active enrollment, check-ins, and delivery live in the signed-in app once you have access.',
  },
];

function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
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
          : 'bg-white/10 text-white/64'
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

export default function ProgramsPage({ programSeries }: Props) {
  const leadSeries = programSeries[0] ?? null;
  const heroCta = leadSeries
    ? resolveProgramMarketingCta({ series: leadSeries })
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
          <div className="mx-auto max-w-4xl text-center text-white">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
              Fine Diet Programs
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] antialiased sm:text-6xl">
              Your nutrition will never
              <br className="hidden sm:block" /> need another restart
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/78">
              Begin with nutrition, then follow your signals. Start with a
              practical Baseline rhythm and move into focused pathways as they
              fit your goals.
            </p>
            {heroCta && (
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                {heroCta.href && !heroCta.disabled ? (
                  <Link
                    href={heroCta.href}
                    className="inline-flex rounded-full bg-white px-6 py-3 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
                  >
                    {heroCta.label}
                  </Link>
                ) : (
                  <span className="rounded-full bg-white/80 px-6 py-3 text-sm font-semibold text-brand-900/60">
                    {heroCta.label}
                  </span>
                )}
                <Link
                  href={heroCta.secondaryHref}
                  className="text-sm font-medium text-white/75 underline-offset-4 hover:text-white hover:underline"
                >
                  {heroCta.secondaryLabel}
                </Link>
              </div>
            )}
          </div>
        </section>

        <section className="px-6 py-16">
          <div className="mx-auto max-w-5xl">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
                  Begin with nutrition, then follow your signals
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-900/58">
                  Each pathway is a public overview. Active enrollment and
                  delivery live in the signed-in app.
                </p>
              </div>
              <Link
                href="/app/programs"
                className="text-sm font-medium text-denim-600 underline-offset-4 hover:underline"
              >
                Manage my programs
              </Link>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {programSeries.map((series) => {
                const cta = resolveProgramMarketingCta({ series });
                return (
                  <Link
                    key={series.slug}
                    href={`/programs/${series.slug}`}
                    className="group flex flex-col overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm transition hover:shadow-md"
                  >
                    <div className="relative aspect-[16/10] w-full overflow-hidden bg-brand-100">
                      <Image
                        src={series.heroImageUrl}
                        alt=""
                        fill
                        className="object-cover transition duration-300 group-hover:scale-[1.03]"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      />
                      <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-brand-900">
                        {categoryLabel(series.category)}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="text-xl font-semibold antialiased">
                        {series.title}
                      </h3>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-brand-900/66">
                        {series.subtitle}
                      </p>
                      <p className="mt-3 text-xs text-brand-900/45">
                        {series.programs.length} programs in pathway
                      </p>
                      <span className="mt-3 text-xs font-semibold text-denim-700 underline-offset-4 group-hover:underline">
                        {cta.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {leadSeries && (
          <section className="bg-brand-900 px-6 py-16 text-white">
            <div className="mx-auto max-w-5xl">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
                Meet your nutrition foundations
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/64">
                {leadSeries.title} is a staged sequence. You start with Baseline,
                then build from what you learn.
              </p>

              <ol className="mt-8 space-y-3">
                {leadSeries.programs.map((program, index) => (
                  <li
                    key={program.slug}
                    className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/42">
                        Step {index + 1}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold antialiased">
                        <Link
                          href={`/programs/${leadSeries.slug}/${program.slug}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {program.title}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-white/64">
                        {program.description}
                      </p>
                    </div>
                    <ProgramStatusBadge status={program.status} />
                  </li>
                ))}
              </ol>
            </div>
          </section>
        )}

        <section className="px-6 py-16">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
              Built differently than most nutrition programs
            </h2>
            <dl className="mt-8 divide-y divide-brand-100 border-y border-brand-100">
              {[
                {
                  term: 'Starts with a baseline, not a verdict',
                  desc: 'You observe your own patterns before changing several things at once.',
                },
                {
                  term: 'Staged, not all-or-nothing',
                  desc: 'Move into focused pathways only when they fit, instead of one rigid plan.',
                },
                {
                  term: 'Keeps what works',
                  desc: 'Each program builds on the last so progress compounds instead of resetting.',
                },
              ].map((row) => (
                <div
                  key={row.term}
                  className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:gap-8"
                >
                  <dt className="text-base font-semibold antialiased sm:w-64 sm:shrink-0">
                    {row.term}
                  </dt>
                  <dd className="text-sm leading-relaxed text-brand-900/66">
                    {row.desc}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="bg-white px-6 py-16">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
              Frequently asked
            </h2>
            <div className="mt-8 space-y-4">
              {FAQ_ITEMS.map((item) => (
                <div
                  key={item.question}
                  className="rounded-2xl border border-brand-100 p-5"
                >
                  <h3 className="text-base font-semibold antialiased">
                    {item.question}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-brand-900/66">
                    {item.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-20">
          <div className="mx-auto max-w-4xl rounded-3xl bg-brand-900 px-6 py-14 text-center text-white">
            <h2 className="text-3xl font-semibold tracking-[-0.02em] antialiased sm:text-4xl">
              Find your baseline, then keep what works
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/68">
              Get access through the Fine Diet Journal and start Baseline when
              you are ready.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
              <BuyOfferButton
                offerKey="journal-annual"
                label="Annual"
                placement="programs"
                variant="primary"
                size="sm"
              />
              <BuyOfferButton
                offerKey="journal-monthly"
                label="Monthly"
                placement="programs"
                variant="secondary"
                size="sm"
              />
            </div>
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
