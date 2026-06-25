/**
 * ProgramCategoryView — composes the public `/programs/[category-slug]` surface
 * from a set of typed, code-owned category sections + the input-defined
 * ProgramCardGrid.
 *
 * Section modules:
 *   CategoryHero · TimedProcessSteps · CategoryIntro · ProgramCardGrid ·
 *   CategoryDifferentiators · CategoryAppIntegration (reasons-split fallback) ·
 *   CategoryComparison · CategoryFaq (FaqAccordionV2) · CategoryFinalCta
 *
 * CTA behavior is centralized via `resolveProgramMarketingCta`. Interactive
 * sub-modules (TimedProcessSteps, FaqAccordionV2) own their own hooks; the
 * composition itself stays hook-free so the static parts (hero, card grid,
 * comparison, final CTA) remain directly unit-test renderable.
 */

import Image from 'next/image';
import { resolveProgramMarketingCta } from '@/lib/programs/programSeriesCatalogue';
import type {
  ProgramMarketingCtaResolution,
  ProgramSeriesDefinition,
} from '@/lib/programs/programSeriesTypes';
import type {
  CategoryIconName,
  ProgramCategoryContent,
} from '@/lib/programs/programCategoryContent';
import { FaqAccordionV2 } from '@/components/modules/FaqAccordionV2';
import { AmbientMarqueeStripV1 } from '@/components/modules/AmbientMarqueeStripV1';
import { stackedLayerClasses } from '@/components/layout/StackedPageSection';
import { cn } from '@/lib/utils';
import {
  HomeIcon,
  InsightsIcon,
  NotebookIcon,
  ProgramsIcon,
  QuadrantsIcon,
  SaveIcon,
} from '@/components/icons';
import ProgramCardGrid from './ProgramCardGrid';
import TimedProcessSteps from './TimedProcessSteps';
import { PrimaryPillCta, SecondaryCtaLink } from './PrimaryPillCta';

const PROGRAMS_MARQUEE = {
  text: 'NOT A DETOX. NOT A DIET CHALLENGE. NOT ANOTHER TRACKER.',
  speed: 50,
  direction: 'left' as const,
  pauseOnHover: true,
};

// Allowlisted icon map for the differentiator strip.
const DIFFERENTIATOR_ICONS: Record<CategoryIconName, typeof InsightsIcon> = {
  insights: InsightsIcon,
  programs: ProgramsIcon,
  notebook: NotebookIcon,
  quadrants: QuadrantsIcon,
  home: HomeIcon,
  save: SaveIcon,
};

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
    <section className="relative isolate overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src={series.heroImageUrl}
          alt=""
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-black/60" />
      </div>
      <div className="relative mx-auto flex h-[99vh] max-w-[1200px] flex-col items-center justify-center gap-6 px-6 py-0 text-center text-white sm:h-[97vh] sm:px-10">
        <div className="w-full max-w-4xl">
          <h1 className="whitespace-pre-line text-hero-mobile font-semibold leading-none tracking-[-0.03em] antialiased sm:text-6xl sm:leading-none">
            {content.heroHeadline}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-white/80 sm:text-lg">
            {content.heroSubhead}
          </p>
        </div>
        <div className="w-full">
          <PrimaryPillCta cta={cta} wide />
          <div className="mt-4 flex justify-center">
            <SecondaryCtaLink cta={cta} tone="light" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function CategoryIntro({
  content,
  cta,
}: {
  content: ProgramCategoryContent;
  cta: ProgramMarketingCtaResolution;
}) {
  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-3xl text-left">
        <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-4xl">
          {content.introHeading}
        </h2>
        <p className="mt-5 text-base leading-relaxed text-brand-900/68">
          {content.introBody}
        </p>
        <div className="mt-8">
          <PrimaryPillCta cta={cta} wide tone="quinary" />
        </div>
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
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {content.differentiators.map((item, index) => {
            const Icon = item.icon ? DIFFERENTIATOR_ICONS[item.icon] : null;
            return (
              <div key={`${item.title}-${index}`}>
                <div className="flex items-center gap-3">
                  {Icon ? (
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="text-sm font-semibold text-white/40">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-lg font-semibold antialiased">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/66">
                  {item.description}
                </p>
              </div>
            );
          })}
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
  stackLayer,
  cta,
}: {
  content: ProgramCategoryContent;
  stackLayer?: number;
  cta?: ProgramMarketingCtaResolution;
}) {
  const { appIntegration } = content;
  const hasImage = Boolean(appIntegration.imageUrl);

  const reasons = (
    <ul className="mt-10 grid grid-cols-[max-content_1fr] gap-x-8 gap-y-5">
      {appIntegration.reasons.map((item, index) => (
        <li key={`${item.label}-${index}`} className="contents">
          <span className="self-start text-base font-semibold uppercase tracking-[-0.01em] text-brand-900">
            {item.label}
          </span>
          <span className="self-start text-base font-light leading-relaxed text-brand-900/70">
            {item.sentence}
          </span>
        </li>
      ))}
    </ul>
  );

  const primaryCta = cta ? (
    <div className="mt-10">
      <PrimaryPillCta cta={cta} wide />
    </div>
  ) : null;

  if (hasImage && appIntegration.imageUrl) {
    return (
      <section
        className={cn(
          'overflow-hidden border-y border-brand-900/20 bg-brand-50',
          stackLayer != null
            ? stackedLayerClasses(stackLayer, 'bg-brand-50')
            : undefined,
        )}
      >
        <div className="grid min-h-[30rem] lg:grid-cols-2">
          <div className="order-2 flex items-center px-6 py-16 sm:px-12 lg:order-1 lg:justify-end lg:px-14 lg:py-20">
            <div className="mx-auto w-full max-w-3xl lg:mx-0 lg:max-w-[30rem]">
              <h2 className="max-w-2xl text-3xl font-semibold leading-[0.95] tracking-[-0.035em] antialiased sm:text-4xl lg:max-w-md">
                {appIntegration.heading}
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-brand-900/68 lg:max-w-md">
                {appIntegration.body}
              </p>
              {reasons}
              {primaryCta}
            </div>
          </div>
          <div className="relative order-1 min-h-[22rem] w-full bg-brand-100 lg:order-2 lg:min-h-[30rem]">
            <Image
              src={appIntegration.imageUrl}
              alt={appIntegration.imageAlt ?? appIntegration.heading}
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        'overflow-hidden border-y border-brand-900/20 bg-brand-50 px-6 py-16',
        stackLayer != null
          ? stackedLayerClasses(stackLayer, 'bg-brand-50')
          : undefined,
      )}
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-semibold tracking-[-0.02em] antialiased sm:text-4xl">
          {appIntegration.heading}
        </h2>
        <p className="mt-4 text-base leading-relaxed text-brand-900/68">
          {appIntegration.body}
        </p>
        {reasons}
        {primaryCta}
      </div>
    </section>
  );
}

export function CategoryComparison({
  content,
  stackLayer,
}: {
  content: ProgramCategoryContent;
  stackLayer?: number;
}) {
  if (content.comparison.length === 0) return null;
  return (
    <section
      className={cn(
        'bg-brand-50 px-6 py-16 sm:py-20',
        stackLayer != null ? stackedLayerClasses(stackLayer, 'bg-brand-50') : undefined,
      )}
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-4xl">
          {content.comparisonHeading}
        </h2>
        <div className="mt-10">
          <div className="grid grid-cols-2 gap-6 border-b border-brand-900/20 pb-4 text-base font-semibold uppercase tracking-[0.04em] text-brand-900">
            <span>Fine Diet Programs</span>
            <span className="text-right">Most Programs</span>
          </div>
          <div>
            {content.comparison.map((row) => (
              <div
                key={row.aspect}
                className="grid grid-cols-2 gap-6 border-b border-brand-900/20 py-5 text-base font-light leading-relaxed text-brand-900/72"
              >
                <p className="text-left">{row.fineDiet}</p>
                <p className="text-right">{row.typical}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function CategoryFaq({
  content,
  stackLayer,
}: {
  content: ProgramCategoryContent;
  stackLayer?: number;
}) {
  if (content.faq.length === 0) return null;
  const faq = (
    <FaqAccordionV2
      content={{
        title: content.faqHeading,
        defaultOpenIndex: 0,
        items: content.faq.map((item, index) => ({
          id: `faq-${index}`,
          question: item.question,
          answer: item.answer,
        })),
      }}
    />
  );
  if (stackLayer == null) return faq;
  return <div className={stackedLayerClasses(stackLayer, 'bg-brand-50')}>{faq}</div>;
}

export function CategoryFinalCta({
  content,
  cta,
}: {
  content: ProgramCategoryContent;
  cta: ProgramMarketingCtaResolution;
}) {
  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-5xl">
          {content.finalCtaHeadline}
        </h2>
        <div className="mt-8 flex flex-col items-center gap-4">
          <PrimaryPillCta cta={cta} wide />
          <SecondaryCtaLink cta={cta} tone="dark" />
        </div>
        {content.finalCtaBody && (
          <p className="mx-auto mt-5 max-w-xl text-xs leading-5 text-brand-900/55 antialiased">
            {content.finalCtaBody}
          </p>
        )}
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
      <TimedProcessSteps heading={content.howItWorksHeading} steps={content.process} />
      <CategoryIntro content={content} cta={seriesCta} />

      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <ProgramCardGrid series={series} />
        </div>
      </section>

      <CategoryDifferentiators content={content} />
      <CategoryAppIntegration content={content} cta={seriesCta} />
      <CategoryComparison content={content} />
      <CategoryFaq content={content} />
      <AmbientMarqueeStripV1 content={PROGRAMS_MARQUEE} />
      <CategoryFinalCta content={content} cta={seriesCta} />
    </div>
  );
}
