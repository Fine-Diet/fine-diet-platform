/**
 * ProgramCategoryView — composes the public `/programs/[category-slug]` surface
 * from a set of typed, code-owned category sections + the input-defined
 * ProgramCardGrid.
 *
 * Section modules:
 *   CategoryHero · CategoryHowItWorks · CategoryIntro · ProgramCardGrid ·
 *   CategoryDifferentiators · CategoryAppIntegration (reasons-split fallback) ·
 *   CategoryComparison · CategoryFaq · CategoryFinalCta
 *
 * CTA behavior is centralized via `resolveProgramMarketingCta`.
 * No React hooks — safe for static rendering and direct unit-test invocation.
 */

import Image from 'next/image';
import Link from 'next/link';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import type {
  ProgramMarketingCtaResolution,
  ProgramSeriesDefinition,
} from '@/lib/programs/programSeriesTypes';
import type { ProgramCategoryContent } from '@/lib/programs/programCategoryContent';
import ProgramCardGrid from './ProgramCardGrid';

function CtaButton({
  cta,
  tone = 'light',
}: {
  cta: ProgramMarketingCtaResolution;
  tone?: 'light' | 'dark';
}) {
  const solid =
    tone === 'light'
      ? 'bg-white text-brand-900 hover:bg-brand-50'
      : 'bg-brand-900 text-white hover:bg-brand-800';
  const disabledSolid =
    tone === 'light' ? 'bg-white/80 text-brand-900/60' : 'bg-brand-900/70 text-white/70';

  if (cta.href && !cta.disabled) {
    return (
      <Link
        href={cta.href}
        className={`inline-flex rounded-full px-6 py-3 text-sm font-semibold transition ${solid}`}
      >
        {cta.label}
      </Link>
    );
  }
  return (
    <span
      className={`inline-flex rounded-full px-6 py-3 text-sm font-semibold ${disabledSolid}`}
    >
      {cta.label}
    </span>
  );
}

export function CategoryHero({
  series,
  content,
  cta,
}: {
  series: ProgramSeriesDefinition;
  content: ProgramCategoryContent;
  cta: ProgramMarketingCtaResolution;
}) {
  return (
    <section className="relative isolate overflow-hidden px-6 py-20 sm:py-24">
      <Image
        src={series.heroImageUrl}
        alt=""
        fill
        priority
        className="absolute inset-0 -z-20 object-cover"
        sizes="100vw"
      />
      <div className="absolute inset-0 -z-10 bg-brand-900/82" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-brand-900/45 to-brand-900/92" />
      <div className="mx-auto max-w-4xl text-center text-white">
        <Link
          href="/programs"
          className="text-sm text-white/70 underline-offset-4 hover:text-white hover:underline"
        >
          Back to Programs
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.24em] text-white/58">
          {content.eyebrow}
        </p>
        <h1 className="mt-3 whitespace-pre-line text-4xl font-semibold tracking-[-0.03em] antialiased sm:text-6xl">
          {content.heroHeadline}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-white/78">
          {content.heroSubhead}
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <CtaButton cta={cta} tone="light" />
          <Link
            href={cta.secondaryHref}
            className="text-sm font-medium text-white/75 underline-offset-4 hover:text-white hover:underline"
          >
            {cta.secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

export function CategoryHowItWorks({ content }: { content: ProgramCategoryContent }) {
  if (content.process.length === 0) return null;
  return (
    <section className="border-b border-brand-100 bg-white px-6 py-14">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
          {content.howItWorksHeading}
        </h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-3">
          {content.process.map((step) => (
            <li
              key={step.stepNumber}
              className="rounded-2xl border border-brand-100 bg-brand-50 p-5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-sm font-semibold text-white">
                  {step.stepNumber}
                </span>
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/45">
                  {step.label}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold antialiased">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-brand-900/66">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export function CategoryIntro({ content }: { content: ProgramCategoryContent }) {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-4xl">
          {content.introHeading}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-brand-900/68">
          {content.introBody}
        </p>
      </div>
    </section>
  );
}

export function CategoryDifferentiators({
  content,
}: {
  content: ProgramCategoryContent;
}) {
  if (content.differentiators.length === 0) return null;
  return (
    <section className="bg-brand-900 px-6 py-16 text-white">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
          {content.differentiatorsHeading}
        </h2>
        <div className="mt-8 grid gap-8 sm:grid-cols-3">
          {content.differentiators.map((item, index) => (
            <div key={`${item.title}-${index}`}>
              <span className="text-sm font-semibold text-white/40">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-2 text-lg font-semibold antialiased">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-white/66">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Journal/app integration. When `imageUrl` is present it renders a split layout;
 * otherwise it falls back to a reasons-only layout (reasons-split fallback).
 */
export function CategoryAppIntegration({
  content,
}: {
  content: ProgramCategoryContent;
}) {
  const { appIntegration } = content;
  const hasImage = Boolean(appIntegration.imageUrl);

  const reasons = (
    <ul className="mt-8 space-y-6">
      {appIntegration.reasons.map((item, index) => (
        <li key={`${item.label}-${index}`} className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-widest text-brand-900">
            {item.label}
          </span>
          <span className="text-base font-light leading-relaxed text-brand-900/70">
            {item.sentence}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="overflow-hidden px-6 py-16">
      <div
        className={`mx-auto grid max-w-5xl items-center gap-10 ${
          hasImage ? 'lg:grid-cols-2' : ''
        }`}
      >
        <div className={hasImage ? '' : 'mx-auto max-w-3xl'}>
          <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-4xl">
            {appIntegration.heading}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-brand-900/68">
            {appIntegration.body}
          </p>
          {reasons}
        </div>
        {hasImage && appIntegration.imageUrl && (
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-3xl bg-brand-100">
            <Image
              src={appIntegration.imageUrl}
              alt={appIntegration.imageAlt ?? appIntegration.heading}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        )}
      </div>
    </section>
  );
}

export function CategoryComparison({
  content,
}: {
  content: ProgramCategoryContent;
}) {
  if (content.comparison.length === 0) return null;
  return (
    <section className="bg-white px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
          {content.comparisonHeading}
        </h2>
        <div className="mt-8 overflow-hidden rounded-3xl border border-brand-100">
          <div className="grid grid-cols-3 bg-brand-900 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
            <span className="px-4 py-3" />
            <span className="px-4 py-3">Fine Diet</span>
            <span className="px-4 py-3">Most programs</span>
          </div>
          {content.comparison.map((row, index) => (
            <div
              key={row.aspect}
              className={`grid grid-cols-3 text-sm ${
                index % 2 === 0 ? 'bg-brand-50' : 'bg-white'
              }`}
            >
              <span className="px-4 py-4 font-semibold text-brand-900">
                {row.aspect}
              </span>
              <span className="px-4 py-4 text-brand-900/75">{row.fineDiet}</span>
              <span className="px-4 py-4 text-brand-900/55">{row.typical}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CategoryFaq({ content }: { content: ProgramCategoryContent }) {
  if (content.faq.length === 0) return null;
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-3xl">
          {content.faqHeading}
        </h2>
        <div className="mt-8 space-y-3">
          {content.faq.map((item, index) => (
            <details
              key={`${item.question}-${index}`}
              className="group rounded-2xl border border-brand-100 bg-white p-5"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold antialiased">
                {item.question}
                <span className="text-brand-900/40 transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-brand-900/66">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CategoryFinalCta({
  content,
  cta,
}: {
  content: ProgramCategoryContent;
  cta: ProgramMarketingCtaResolution;
}) {
  return (
    <section className="px-6 pb-20">
      <div className="mx-auto max-w-4xl rounded-3xl bg-brand-900 px-6 py-14 text-center text-white">
        <h2 className="text-3xl font-semibold tracking-[-0.02em] antialiased sm:text-4xl">
          {content.finalCtaHeadline}
        </h2>
        {content.finalCtaBody && (
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/68">
            {content.finalCtaBody}
          </p>
        )}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <CtaButton cta={cta} tone="light" />
          <Link
            href={cta.secondaryHref}
            className="text-sm font-medium text-white/75 underline-offset-4 hover:text-white hover:underline"
          >
            {cta.secondaryLabel}
          </Link>
        </div>
      </div>
    </section>
  );
}

export interface ProgramCategoryViewProps {
  series: ProgramSeriesDefinition;
  content: ProgramCategoryContent;
}

export default function ProgramCategoryView({
  series,
  content,
}: ProgramCategoryViewProps) {
  const seriesCta = resolveProgramMarketingCta({ series });

  return (
    <div className="min-h-screen bg-brand-50 text-brand-900">
      <CategoryHero series={series} content={content} cta={seriesCta} />
      <CategoryHowItWorks content={content} />
      <CategoryIntro content={content} />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <ProgramCardGrid
            series={series}
            heading={content.cardGridHeading}
            subhead={content.cardGridSubhead}
          />
        </div>
      </section>

      <CategoryDifferentiators content={content} />
      <CategoryAppIntegration content={content} />
      <CategoryComparison content={content} />
      <CategoryFaq content={content} />
      <CategoryFinalCta content={content} cta={seriesCta} />
    </div>
  );
}
