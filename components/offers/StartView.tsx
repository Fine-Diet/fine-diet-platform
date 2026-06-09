/**
 * StartView — the central app access / subscription sales surface.
 *
 * Uses the editorial/module language from the Integrative Care pages, but frames
 * the page around the Fine Diet app subscription: product promise, plan choice,
 * trial mechanics, app value, differentiation, FAQ, and practitioner upsell.
 */

import Link from 'next/link';
import Head from 'next/head';
import OfferCard from './OfferCard';
import { useOffers } from '@/lib/access/useOffers';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import type { OfferMarketingDTO } from '@/lib/access/offerCatalogService';

export interface StartPlanOption {
  offerKey: string;
  title: string;
  subtitle: string;
  priceLabel: string;
  priceSuffix: string | null;
  ctaLabel: string;
  trialNote: string | null;
  badge?: string | null;
}

export interface StartViewProps {
  primaryOffer: OfferMarketingDTO;
  practitionerOffers: OfferMarketingDTO[];
  planOptions: StartPlanOption[];
  /** Shown when the requested slug fell back to the default public offer. */
  fallbackNotice?: string | null;
}

const APP_PREVIEW_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';

const VALUE_FEATURES = [
  {
    label: 'Food journal',
    title: 'Track meals with context',
    body: 'Capture what you ate, when you ate, symptoms, energy, hunger, digestion, and notes that help patterns surface.',
  },
  {
    label: 'Insights',
    title: 'See what your body repeats',
    body: 'Turn logs into body-feedback loops so you can notice what supports clarity, comfort, consistency, and progress.',
  },
  {
    label: 'Meal planning',
    title: 'Plan around real life',
    body: 'Build repeatable meals, prep structure, and weekly rhythm without treating every day like a brand-new diet reset.',
  },
  {
    label: 'Programs',
    title: 'Follow guided structure',
    body: 'Use Fine Diet programs as they run, with app tools that support the same direction instead of scattering the work.',
  },
  {
    label: 'Recipes',
    title: 'Cook from a usable system',
    body: 'Keep meals practical, flexible, and aligned with the foods and routines you are learning work best for your body.',
  },
  {
    label: 'Progress',
    title: 'Build consistency without obsession',
    body: 'Focus on repeatable behaviors and body response, not punishment, perfection, or another all-or-nothing tracking loop.',
  },
];

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Choose monthly or annual',
    body: 'Pick the billing rhythm before checkout so your trial is tied to the plan you actually want to continue.',
  },
  {
    number: '02',
    title: 'Create your account',
    body: 'Start your trial with a payment method on file. No charge today when the trial applies.',
  },
  {
    number: '03',
    title: 'Use the full system',
    body: 'Explore journaling, insights, recipes, meal planning, and programs together in one place.',
  },
  {
    number: '04',
    title: 'Continue or cancel',
    body: 'Your selected plan begins automatically after the trial unless you cancel before it ends.',
  },
];

const DIFFERENTIATORS = [
  {
    label: 'REASON 01',
    sentence: 'It connects what you eat to how you feel, not just what you consumed.',
  },
  {
    label: 'REASON 02',
    sentence: 'It turns body feedback into repeatable meals, plans, and routines.',
  },
  {
    label: 'REASON 03',
    sentence: 'It keeps programs, journaling, recipes, and planning inside one system.',
  },
];

const FAQ_ITEMS = [
  {
    question: 'Do I get charged today?',
    answer: 'No charge today when you start a trial. Your selected plan begins automatically after the trial unless you cancel before the trial ends.',
  },
  {
    question: 'Do I choose monthly or annual before the trial?',
    answer: 'Yes. You choose the billing option first, then the trial starts on that selected plan. This keeps checkout and renewal timing clear.',
  },
  {
    question: 'Can I switch plans later?',
    answer: 'Yes. The subscription can be adjusted later, but the cleanest starting point is to choose the plan you expect to continue after the trial.',
  },
  {
    question: 'Are programs included?',
    answer: 'Yes. The standard Fine Diet app subscription includes app access and Fine Diet programs as they run.',
  },
  {
    question: 'Is this just another calorie tracker?',
    answer: 'No. Fine Diet is built around body feedback, meal structure, program guidance, and repeatable eating systems rather than simple calorie counting.',
  },
];

function planHref(offerKey: string): string {
  const params = new URLSearchParams({
    placement: 'start-plan',
    source: 'start',
  });
  return `/buy/${offerKey}?${params.toString()}`;
}

function PrimaryCta({ hasAppAccess }: { hasAppAccess: boolean }) {
  if (hasAppAccess) {
    return (
      <Link
        href={APP_ROUTES.home}
        className="inline-flex items-center justify-center rounded-full bg-denim-500 px-6 py-3 text-base font-semibold text-white antialiased transition-colors hover:bg-denim-400"
      >
        Open app
      </Link>
    );
  }

  return (
    <a
      href="#plans"
      className="inline-flex items-center justify-center rounded-full bg-denim-500 px-6 py-3 text-base font-semibold text-white antialiased transition-colors hover:bg-denim-400"
    >
      Start your free trial
    </a>
  );
}

export default function StartView({
  primaryOffer,
  practitionerOffers,
  planOptions,
  fallbackNotice,
}: StartViewProps) {
  const { hasAppAccess } = useOffers('baseline');
  const { copy } = primaryOffer;
  const visiblePlanOptions = planOptions.length > 0
    ? planOptions
    : [
        {
          offerKey: primaryOffer.offerKey,
          title: primaryOffer.copy.title,
          subtitle: primaryOffer.copy.subtitle,
          priceLabel: primaryOffer.priceLabel,
          priceSuffix: primaryOffer.priceSuffix,
          ctaLabel: primaryOffer.copy.ctaLabel,
          trialNote: primaryOffer.copy.trialNote,
          badge: null,
        },
      ];

  return (
    <>
      <Head>
        <title>{copy.title} &bull; Fine Diet</title>
        <meta name="description" content={copy.subtitle} />
      </Head>

      <main className="min-h-screen bg-neutral-950 text-white">
        {/* Hero: blurred editorial offer module reference */}
        <section className="relative isolate min-h-[680px] overflow-hidden bg-neutral-950">
          <div className="absolute inset-0 -z-20">
            <img
              src={APP_PREVIEW_IMAGE}
              alt="Fine Diet app and nutrition system"
              className="h-full w-full object-cover opacity-35 blur-[1px] scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/70 via-neutral-950/78 to-neutral-950" />
            <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/70 to-neutral-950/20" />
          </div>

          <div className="mx-auto flex min-h-[680px] max-w-6xl flex-col justify-end px-5 pb-12 pt-28 sm:px-6 lg:px-8 lg:pb-16">
            {fallbackNotice && (
              <div className="mb-6 max-w-2xl rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
                <p className="text-sm text-amber-200 antialiased">{fallbackNotice}</p>
              </div>
            )}

            <div className="max-w-3xl">
              {copy.eyebrow && (
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-denim-300 antialiased">
                  {copy.eyebrow}
                </p>
              )}
              <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[0.95] tracking-[-0.04em] text-white antialiased sm:text-6xl lg:text-7xl">
                Eat with more clarity. Build a body-responsive food system.
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-white/72 antialiased sm:text-lg">
                Fine Diet combines guided journaling, meal planning, programs, recipes, and food insights so you can understand what works for your body — then repeat it.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <PrimaryCta hasAppAccess={hasAppAccess} />
                <span className="text-sm text-white/50 antialiased">
                  {hasAppAccess ? 'You already have access.' : 'Choose monthly or annual before checkout.'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Product promise strip */}
        <section className="border-y border-white/10 bg-neutral-950 py-4">
          <div className="mx-auto flex max-w-6xl gap-8 overflow-hidden px-5 text-xs font-semibold uppercase tracking-[0.28em] text-white/45 antialiased sm:px-6 lg:px-8">
            <span className="whitespace-nowrap">Food clarity</span>
            <span className="whitespace-nowrap">Body feedback</span>
            <span className="whitespace-nowrap">Meal rhythm</span>
            <span className="whitespace-nowrap">Guided programs</span>
            <span className="whitespace-nowrap">Repeat what works</span>
          </div>
        </section>

        {/* Pricing selector */}
        <section id="plans" className="bg-neutral-950 px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-denim-300 antialiased">
                  Start your trial
                </p>
                <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] text-white antialiased sm:text-5xl">
                  Choose your payment option before checkout.
                </h2>
                <p className="mt-5 text-sm leading-7 text-white/62 antialiased sm:text-base">
                  Start the trial on the billing option you choose. No charge today when a trial applies, and your selected plan begins automatically after the trial unless you cancel.
                </p>
              </div>

              {hasAppAccess ? (
                <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8">
                  <h3 className="text-2xl font-semibold text-white antialiased">You already have access.</h3>
                  <p className="mt-3 text-sm leading-6 text-white/60 antialiased">
                    Continue into the Fine Diet app to use your journal, recipes, plans, programs, and insights.
                  </p>
                  <div className="mt-6">
                    <PrimaryCta hasAppAccess />
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {visiblePlanOptions.map((plan) => (
                    <Link
                      key={plan.offerKey}
                      href={planHref(plan.offerKey)}
                      className="group flex min-h-[340px] flex-col rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 transition hover:border-denim-300/70 hover:bg-white/[0.07] focus:outline-none focus:ring-2 focus:ring-denim-400"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          {plan.badge && (
                            <p className="mb-3 inline-flex rounded-full bg-denim-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-denim-200 antialiased">
                              {plan.badge}
                            </p>
                          )}
                          <h3 className="text-2xl font-semibold text-white antialiased">
                            {plan.title}
                          </h3>
                        </div>
                      </div>

                      <div className="mt-7 flex items-baseline gap-1">
                        <span className="text-4xl font-semibold tracking-[-0.04em] text-white antialiased">
                          {plan.priceLabel}
                        </span>
                        {plan.priceSuffix && (
                          <span className="text-sm text-white/55 antialiased">
                            {plan.priceSuffix}
                          </span>
                        )}
                      </div>

                      <p className="mt-5 text-sm leading-6 text-white/65 antialiased">
                        {plan.subtitle}
                      </p>
                      {plan.trialNote && (
                        <p className="mt-4 text-xs leading-5 text-white/45 antialiased">
                          {plan.trialNote}
                        </p>
                      )}
                      <span className="mt-auto inline-flex w-fit rounded-full bg-denim-500 px-5 py-2.5 text-sm font-semibold text-white transition group-hover:bg-denim-400 antialiased">
                        {plan.ctaLabel}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* What you get */}
        <section className="bg-neutral-100 px-5 py-16 text-neutral-950 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 antialiased">
                What you get
              </p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-5xl">
                One system for the daily work of eating well.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {VALUE_FEATURES.map((feature) => (
                <article key={feature.title} className="rounded-[2rem] bg-white p-6 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-denim-500 antialiased">
                    {feature.label}
                  </p>
                  <h3 className="mt-4 text-xl font-semibold tracking-[-0.02em] antialiased">
                    {feature.title}
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-600 antialiased">
                    {feature.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Process stack */}
        <section className="bg-neutral-950 px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-denim-300 antialiased">
                  How the trial works
                </p>
                <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] text-white antialiased sm:text-5xl">
                  Start with clarity before the first charge.
                </h2>
              </div>
              <div className="space-y-3">
                {PROCESS_STEPS.map((step) => (
                  <div key={step.number} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
                    <div className="flex gap-5">
                      <span className="text-sm font-semibold text-denim-300 antialiased">{step.number}</span>
                      <div>
                        <h3 className="text-xl font-semibold text-white antialiased">{step.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-white/60 antialiased">{step.body}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Persuasion CTA */}
        <section className="bg-denim-500 px-5 py-14 text-white sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-5xl">
                Not another diet tracker. A body-feedback system.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/78 antialiased sm:text-base">
                Fine Diet helps you connect meals, symptoms, plans, recipes, and programs so your eating structure becomes easier to repeat.
              </p>
            </div>
            {!hasAppAccess && (
              <a
                href="#plans"
                className="inline-flex w-fit items-center justify-center rounded-full bg-white px-6 py-3 text-base font-semibold text-denim-600 antialiased transition hover:bg-white/90"
              >
                Compare plans
              </a>
            )}
          </div>
        </section>

        {/* Split reasons */}
        <section className="bg-neutral-100 px-5 py-16 text-neutral-950 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1fr_1fr] lg:items-stretch">
            <div className="overflow-hidden rounded-[2rem] bg-neutral-300 min-h-[420px]">
              <img
                src={APP_PREVIEW_IMAGE}
                alt="Fine Diet food and app preview"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="rounded-[2rem] bg-white p-8 lg:p-10">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 antialiased">
                Why it works
              </p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-5xl">
                Three reasons Fine Diet fits the way people actually eat.
              </h2>
              <div className="mt-8 space-y-6">
                {DIFFERENTIATORS.map((item) => (
                  <div key={item.label} className="border-t border-neutral-200 pt-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-denim-500 antialiased">
                      {item.label}
                    </p>
                    <p className="mt-2 text-lg leading-7 text-neutral-800 antialiased">
                      {item.sentence}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Practitioner-supported (clearly separate, premium) */}
        {practitionerOffers.length > 0 && (
          <section className="bg-neutral-950 px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
            <div className="mx-auto max-w-6xl">
              <div className="max-w-2xl">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40 antialiased">
                  Practitioner-supported care
                </p>
                <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] text-white antialiased sm:text-5xl">
                  Need deeper support?
                </h2>
                <p className="mt-4 text-sm leading-7 text-white/60 antialiased sm:text-base">
                  Practitioner-supported care is a separate premium layer for people who need more guidance, clinical context, or complex gut support. It is not required to use the app.
                </p>
              </div>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                {practitionerOffers.map((offer) => (
                  <OfferCard
                    key={offer.slug}
                    offer={offer}
                    placement="start-practitioner"
                    featured={false}
                  />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="bg-neutral-100 px-5 py-16 text-neutral-950 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-neutral-500 antialiased">
              FAQs
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-5xl">
              Trial and subscription questions.
            </h2>
            <div className="mt-8 divide-y divide-neutral-200 overflow-hidden rounded-[2rem] bg-white">
              {FAQ_ITEMS.map((item) => (
                <details key={item.question} className="group p-6 open:bg-neutral-50">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold antialiased">
                    {item.question}
                    <span className="text-denim-500 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-4 text-sm leading-6 text-neutral-600 antialiased">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="bg-neutral-950 px-5 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-6xl rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-8 text-center lg:p-12">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-denim-300 antialiased">
              Start where you are
            </p>
            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.03em] text-white antialiased sm:text-5xl">
              Build a food system you can understand, repeat, and adjust.
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-white/60 antialiased sm:text-base">
              Choose monthly or annual, start the trial, and use Fine Diet as your daily home base for eating with more clarity.
            </p>
            <div className="mt-8 flex justify-center">
              <PrimaryCta hasAppAccess={hasAppAccess} />
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
