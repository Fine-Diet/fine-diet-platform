import Image from 'next/image';
import Link from 'next/link';

import type {
  ProgramsIndexCollectionCard,
  ProgramsIndexContent,
} from '@/lib/programs/programsIndexContent';

interface ProgramsIndexViewProps {
  content: ProgramsIndexContent;
  collections: ProgramsIndexCollectionCard[];
}

function programCountLabel(count: number): string {
  return `${count} Program${count === 1 ? '' : 's'}`;
}

export default function ProgramsIndexView({
  content,
  collections,
}: ProgramsIndexViewProps) {
  return (
    <main className="min-h-screen bg-brand-50 text-brand-900">
      <section className="px-6 py-16 sm:py-24">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-900/45">
            {content.eyebrow}
          </p>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.92] tracking-[-0.045em] antialiased sm:text-7xl">
            {content.title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-brand-900/68 sm:text-lg">
            {content.description}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#program-collections"
              className="inline-flex rounded-full bg-brand-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              Browse Collections
            </a>
            <Link
              href={content.finalCtaHref}
              className="inline-flex rounded-full border border-brand-900/20 px-5 py-2.5 text-sm font-semibold text-brand-900 transition hover:border-brand-900/40"
            >
              {content.finalCtaLabel}
            </Link>
          </div>
        </div>
      </section>

      <section className="border-y border-brand-900/10 bg-white px-6 py-14">
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div>
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-4xl">
              {content.introHeading}
            </h2>
            <p className="mt-5 text-base leading-relaxed text-brand-900/66">
              {content.introBody}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {content.methodSteps.map((step, index) => (
              <div key={step.title} className="rounded-3xl border border-brand-100 bg-brand-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-900/38">
                  Step {index + 1}
                </p>
                <h3 className="mt-4 text-base font-semibold antialiased">{step.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-brand-900/62">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="program-collections" className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-5xl">
            {content.collectionsHeading}
          </h2>
          <p className="mt-5 max-w-3xl text-base leading-relaxed text-brand-900/66">
            {content.collectionsBody}
          </p>

          {collections.length > 0 ? (
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {collections.map((collection) => (
                <Link
                  key={collection.slug}
                  href={collection.href}
                  className="group overflow-hidden rounded-[2rem] border border-brand-100 bg-white shadow-sm transition hover:border-brand-200 hover:shadow-md"
                >
                  <div className="relative aspect-[4/3] bg-brand-100">
                    <Image
                      src={collection.heroImageUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 50vw"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-brand-900/70 to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/72">
                      <span>{collection.category}</span>
                      <span>{programCountLabel(collection.programCount)}</span>
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-2xl font-semibold leading-tight tracking-[-0.025em] antialiased">
                      {collection.title}
                    </h3>
                    {collection.subtitle && (
                      <p className="mt-2 text-sm font-medium text-brand-900/55">
                        {collection.subtitle}
                      </p>
                    )}
                    <p className="mt-4 text-sm leading-relaxed text-brand-900/62">
                      {collection.description}
                    </p>
                    {collection.firstProgramTitle && (
                      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/42">
                        Starts with {collection.firstProgramTitle}
                      </p>
                    )}
                    <span className="mt-5 inline-flex text-sm font-semibold text-denim-700 underline-offset-4 group-hover:underline">
                      View Collection
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-10 rounded-[2rem] border border-brand-100 bg-white p-8 shadow-sm">
              <h3 className="text-xl font-semibold antialiased">{content.emptyHeading}</h3>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-brand-900/62">
                {content.emptyBody}
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto max-w-5xl rounded-[2rem] bg-brand-900 p-8 text-white sm:p-10">
          <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased">
            {content.finalCtaHeading}
          </h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/70">
            {content.finalCtaBody}
          </p>
          <Link
            href={content.finalCtaHref}
            className="mt-6 inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-900 transition hover:bg-brand-50"
          >
            {content.finalCtaLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
