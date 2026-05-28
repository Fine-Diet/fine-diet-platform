import type { GetStaticProps } from 'next';
import Link from 'next/link';
import Head from 'next/head';
import Image from 'next/image';
import BuyOfferButton from '@/components/checkout/BuyOfferButton';
import type { ProgramSeriesDefinition } from '@/lib/programs/programSeriesTypes';

interface Props {
  programSeries: ProgramSeriesDefinition[];
}

function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export default function ProgramsPage({ programSeries }: Props) {
  return (
    <>
      <Head>
        <title>Programs &bull; Fine Diet</title>
        <meta
          name="description"
          content="Explore Fine Diet program pathways, including The Fine Diet Method, Lifestyle, and Advanced series."
        />
      </Head>
      <div className="min-h-screen bg-brand-50 text-brand-900">
        <section className="px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-denim-600">
              Fine Diet Programs
            </p>
            <div className="mt-4 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
              <div>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.03em] text-brand-900 antialiased sm:text-6xl">
                  Guided nutrition pathways, built to scale with you.
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-relaxed text-brand-900/68 antialiased">
                  Browse the public program catalogue. This marketing side is
                  separate from your signed-in program management and runtime
                  delivery in the app.
                </p>
              </div>
              <div className="rounded-3xl border border-brand-100 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold antialiased">
                  Fine Diet Journal
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-brand-900/60 antialiased">
                  Your personal nutrition companion. Track meals, monitor
                  trends, and use program access when it is available.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
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
            </div>
          </div>
        </section>

        <section className="px-6 pb-16">
          <div className="mx-auto max-w-5xl">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold antialiased">
                  Program series
                </h2>
                <p className="mt-1 text-sm text-brand-900/58">
                  Public pathways for learning, purchase, and future program
                  pages. No active enrollment state is shown here.
                </p>
              </div>
              <Link
                href="/app/programs"
                className="text-sm font-medium text-denim-600 underline-offset-4 hover:underline"
              >
                Manage my programs
              </Link>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {programSeries.map((series) => (
                <article
                  key={series.slug}
                  className="overflow-hidden rounded-3xl border border-brand-100 bg-white shadow-sm"
                >
                  <div className="relative h-40 bg-brand-100">
                    <Image
                      src={series.heroImageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                    <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-brand-900">
                      {categoryLabel(series.category)}
                    </span>
                  </div>
                  <div className="p-5">
                    <h3 className="text-xl font-semibold antialiased">
                      {series.title}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-brand-900/62">
                      {series.subtitle}
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-brand-900/62">
                      {series.description}
                    </p>
                    <p className="mt-4 text-xs text-brand-900/45">
                      {series.programs.length} programs in pathway
                    </p>
                    <Link
                      href={`/programs/${series.slug}`}
                      className="mt-4 inline-flex rounded-full bg-brand-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-800"
                    >
                      Learn more
                    </Link>
                  </div>
                </article>
              ))}
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
