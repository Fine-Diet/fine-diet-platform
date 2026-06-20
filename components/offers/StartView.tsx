/**
 * StartView — the central app access / subscription sales surface.
 *
 * This template is the default /start entry point and the shared base for
 * slugged campaign/offer start pages. It keeps the page modular so marketing
 * can vary hero copy, offer sets, and pricing-card layout without rebuilding
 * the route.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
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

/**
 * Pricing-card layout strategy. `auto` derives the grid from the number of
 * cards; the explicit values let marketing pin a layout per offer/page once
 * the config surface exists. Wiring is already threaded through StartView so
 * adding a CMS/offer-config field later only means passing this prop.
 */
export type PricingLayout =
  | 'auto'
  | 'two-up'
  | 'three-up-stack'
  | 'four-up'
  | 'two-by-two';

export interface StartViewProps {
  primaryOffer: OfferMarketingDTO;
  practitionerOffers: OfferMarketingDTO[];
  planOptions: StartPlanOption[];
  /** Shown when the requested slug fell back to the default public offer. */
  fallbackNotice?: string | null;
  /** Optional override for pricing-card layout. Defaults to `auto`. */
  pricingLayout?: PricingLayout;
}

const APP_PREVIEW_IMAGE =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';

const HERO_RAIL_ITEMS = [
  'Food clarity',
  'Body signals',
  'Meal rhythm',
  'Self-guided programs',
  'Repeat what works',
];

const SYSTEM_CARDS = [
  {
    id: 'nutrition-insights',
    eyebrow: 'Nutrition insights',
    headline: 'Turn your logs into signals.',
    description:
      'Spot meals, timing, and routines that support clarity, comfort, consistency, and progress without trying to decode everything from memory.',
    image: 'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg',
  },
  {
    id: 'daily-log',
    eyebrow: 'Daily log',
    headline: 'Track meals with context.',
    description:
      'Log what you ate, when you ate, and how your body responded, including energy, hunger, digestion, symptoms, and notes that help patterns surface.',
    image: 'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg',
  },
  {
    id: 'weekly-rhythm',
    eyebrow: 'Weekly rhythm',
    headline: 'Plan repeatable meals around real life.',
    description:
      'Build a practical rhythm for meals, prep, recipes, and routines so your nutrition system becomes easier to repeat instead of harder to maintain.',
    image: 'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg',
  },
];

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Choose monthly or annual',
    body: 'Pick the billing rhythm you want after your trial: monthly flexibility or annual best value.',
  },
  {
    number: '02',
    title: 'Create your account',
    body: 'Start your trial with a payment method on file. No charge today when your trial applies.',
  },
  {
    number: '03',
    title: 'Use the full system',
    body: 'Journal meals, explore insights, plan your week, save recipes, and follow self-guided programs in one place.',
  },
  {
    number: '04',
    title: 'Continue or cancel',
    body: 'After the trial, your selected plan begins automatically unless you cancel before the trial ends.',
  },
];

const FAQ_ITEMS = [
  {
    question: 'Do I get charged today?',
    answer: 'No charge today when you begin your trial. Your selected plan begins automatically after the trial unless you cancel before it ends.',
  },
  {
    question: 'Why do I choose monthly or annual before the trial?',
    answer: 'Choosing first keeps the trial and renewal path clear. You start the trial on the plan you expect to continue when the trial ends.',
  },
  {
    question: 'Can I cancel before I’m charged?',
    answer: 'Yes. You can cancel before the trial ends to avoid the first subscription charge.',
  },
  {
    question: 'Can I switch plans later?',
    answer: 'Yes. Your subscription can be adjusted later, but the cleanest starting point is to choose the plan you expect to continue after the trial.',
  },
  {
    question: 'What’s included in the trial?',
    answer: 'The trial gives you access to the Fine Diet app experience: journaling, insights, recipes, meal planning, and guided programs as they run.',
  },
  {
    question: 'Are programs included?',
    answer: 'Yes. The standard Fine Diet app subscription includes app access and Fine Diet programs as they run.',
  },
];

const AUTO_INTERVAL = 6000;
const RESUME_DELAY = 8000;

function planHref(offerKey: string): string {
  const params = new URLSearchParams({
    placement: 'start-plan',
    source: 'start',
  });
  return `/buy/${offerKey}?${params.toString()}`;
}

/**
 * Resolve the pricing-grid Tailwind classes.
 *
 * `auto` makes the 1/2/3/4-card behaviour explicit so layouts never collapse
 * into an awkward 2+1 orphan row:
 *   - 1 card  → centered single card
 *   - 2 cards → 1 col mobile, 2 col tablet/desktop
 *   - 3 cards → 1 col mobile, 3 col on large screens (never 2+1)
 *   - 4 cards → 1 col mobile, 2x2 tablet, 4-up on wide screens
 *
 * The explicit layout values let marketing pin a shape regardless of count.
 */
function getPricingGridClass(
  cardCount: number,
  layout: PricingLayout = 'auto',
): string {
  switch (layout) {
    case 'two-up':
      return 'grid-cols-1 md:grid-cols-2';
    case 'three-up-stack':
      return 'grid-cols-1 lg:grid-cols-3';
    case 'four-up':
      return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
    case 'two-by-two':
      return 'grid-cols-1 md:grid-cols-2';
    case 'auto':
    default:
      break;
  }

  if (cardCount === 1) return 'grid-cols-1 mx-auto max-w-xl';
  if (cardCount === 2) return 'grid-cols-1 md:grid-cols-2';
  if (cardCount === 3) return 'grid-cols-1 lg:grid-cols-3';
  if (cardCount === 4) return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
}

function PrimaryCta({ hasAppAccess }: { hasAppAccess: boolean }) {
  if (hasAppAccess) {
    return (
      <Link
        href={APP_ROUTES.home}
        className="inline-flex items-center justify-center rounded-full bg-denim-500 px-7 py-3 text-sm font-semibold text-white antialiased transition-colors hover:bg-denim-400"
      >
        Open app
      </Link>
    );
  }

  return (
    <a
      href="#plans"
      className="inline-flex items-center justify-center rounded-full bg-denim-500 px-7 py-3 text-sm font-semibold text-white antialiased transition-colors hover:bg-denim-400"
    >
      Start your free trial
    </a>
  );
}

function HeroBottomRail() {
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 translate-y-1/2 border-y border-neutral-200 bg-white text-neutral-950 shadow-sm">
      <div
        className="mx-auto flex max-w-6xl gap-10 overflow-x-auto px-5 py-4 text-xs font-semibold uppercase tracking-[0.28em] antialiased sm:px-6 lg:px-8"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {HERO_RAIL_ITEMS.map((item) => (
          <span key={item} className="whitespace-nowrap text-neutral-950/70">
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function SystemCardsScroller() {
  const total = SYSTEM_CARDS.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollTo = useCallback((index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const card = container.children[index] as HTMLElement | undefined;
    if (!card) return;
    container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: 'smooth' });
    setActiveIndex(index);
  }, []);

  const handleInteract = useCallback(() => {
    setPaused(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setPaused(false), RESUME_DELAY);
  }, []);

  useEffect(() => {
    if (paused || total <= 1) return;
    autoTimer.current = setInterval(() => {
      setActiveIndex((prev) => {
        const next = (prev + 1) % total;
        const container = scrollRef.current;
        const card = container?.children[next] as HTMLElement | undefined;
        if (container && card) {
          container.scrollTo({ left: card.offsetLeft - container.offsetLeft, behavior: 'smooth' });
        }
        return next;
      });
    }, AUTO_INTERVAL);

    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
    };
  }, [paused, total]);

  useEffect(() => {
    return () => {
      if (autoTimer.current) clearInterval(autoTimer.current);
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  return (
    <section className="bg-neutral-950 px-0 pb-16 pt-24 text-white sm:pb-20 sm:pt-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-6 lg:px-8">
        <h2 className="max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.03em] text-white antialiased sm:text-5xl">
          Everything you need to plan, log, learn, and repeat.
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/60 antialiased sm:text-base">
          Fine Diet brings your meals, symptoms, plans, recipes, programs, and progress into one place so your nutrition stops living in scattered notes, screenshots, and good intentions.
        </p>
      </div>

      <div
        ref={scrollRef}
        className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-4 scroll-smooth sm:px-6 lg:px-[calc((100vw-72rem)/2+2rem)]"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        onPointerDown={handleInteract}
      >
        {SYSTEM_CARDS.map((card) => (
          <article
            key={card.id}
            className="flex min-h-[220px] flex-shrink-0 snap-start overflow-hidden rounded-2xl border border-white bg-transparent text-white"
            style={{ width: 'min(560px, 86vw)' }}
          >
            <div className="relative w-36 flex-shrink-0 overflow-hidden sm:w-44">
              <img
                src={card.image}
                alt="Fine Diet nutrition system"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-1 flex-col px-5 py-5 sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white antialiased">
                {card.eyebrow}
              </p>
              <h3 className="mt-4 text-lg font-semibold leading-snug tracking-[-0.02em] text-white antialiased sm:text-xl">
                {card.headline}
              </h3>
              <div className="mt-4 pl-7">
                <p className="text-sm font-light leading-relaxed text-white/75 antialiased">
                  {card.description}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {total > 1 && (
        <div className="mt-5 flex justify-center gap-2">
          {SYSTEM_CARDS.map((card, index) => (
            <button
              key={card.id}
              type="button"
              onClick={() => {
                handleInteract();
                scrollTo(index);
              }}
              aria-label={`Go to product card ${index + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === activeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/60'
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default function StartView({
  primaryOffer,
  planOptions,
  fallbackNotice,
  pricingLayout = 'auto',
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
  const pricingGridClass = getPricingGridClass(visiblePlanOptions.length, pricingLayout);

  return (
    <>
      <Head>
        <title>{copy.title} &bull; Fine Diet</title>
        <meta name="description" content={copy.subtitle} />
      </Head>

      <main className="min-h-screen bg-neutral-950 text-white">
        {/* Hero */}
        <section className="relative isolate min-h-[720px] overflow-visible bg-neutral-950">
          <div className="absolute inset-0 -z-20 overflow-hidden">
            <img
              src={APP_PREVIEW_IMAGE}
              alt="Fine Diet app and nutrition system"
              className="h-full w-full scale-105 object-cover opacity-35 blur-[1px]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-neutral-950/70 via-neutral-950/75 to-neutral-950/80" />
            <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/70 to-neutral-950/20" />
          </div>

          <div className="mx-auto flex min-h-[720px] max-w-6xl flex-col items-center justify-center px-5 pb-24 pt-28 text-center sm:px-6 lg:px-8">
            {fallbackNotice && (
              <div className="mb-6 max-w-2xl rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-left">
                <p className="text-sm text-amber-200 antialiased">{fallbackNotice}</p>
              </div>
            )}

            <div className="max-w-5xl">
              {copy.eyebrow && (
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/80 antialiased">
                  {copy.eyebrow}
                </p>
              )}
              <h1 className="mx-auto mt-4 max-w-4xl text-5xl font-semibold leading-[0.95] tracking-[-0.05em] text-white antialiased sm:text-6xl lg:text-7xl">
                Go beyond tracking and build a nutrition system—that adapts with you.
              </h1>
              <p className="mx-auto mt-6 max-w-3xl text-sm leading-7 text-white/70 antialiased sm:text-base">
                Discover your daily rhythm by creating a realistic plan that supports your energy, digestion, and overall wellbeing.
              </p>
              <div className="mt-8 flex flex-col items-center gap-3">
                <PrimaryCta hasAppAccess={hasAppAccess} />
                <span className="text-xs text-white/50 antialiased">
                  {hasAppAccess ? 'You already have access.' : 'Choose monthly or annual before checkout.'}
                </span>
              </div>
            </div>
          </div>

          <HeroBottomRail />
        </section>

        <SystemCardsScroller />

        {/* Trial process */}
        <section className="bg-neutral-950 px-5 pb-16 text-white sm:px-6 lg:px-8 lg:pb-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/45 antialiased">
                How the trial works
              </p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.03em] text-white antialiased sm:text-4xl">
                Your trial starts first. Your plan starts later.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/60 antialiased sm:text-base">
                Choose the plan you want to continue with, create your account, and use the full Fine Diet system free during your trial. No charge today when your trial applies.
              </p>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-2">
              {PROCESS_STEPS.map((step) => (
                <article key={step.number} className="rounded-2xl border border-white/20 bg-transparent p-5 sm:p-6">
                  <div className="flex gap-4">
                    <span className="text-sm font-semibold text-white antialiased">{step.number}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-white antialiased">{step.title}</h3>
                      <p className="mt-1 text-sm font-light leading-6 text-white/60 antialiased">{step.body}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing selector */}
        <section id="plans" className="bg-neutral-100 px-5 py-16 text-neutral-950 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-5xl">
                Choose your Founder’s Launch access
              </h2>
              <p className="mt-4 text-sm leading-7 text-neutral-600 antialiased sm:text-base">
                Start with a trial, then lock in the full year of Fine Diet at the best value. Either way, you get the app, guided journaling, insights, recipes, meal scheduling, and every Fine Diet program as it runs.
              </p>
            </div>

            <div className="mt-8">
              {hasAppAccess ? (
                <div className="rounded-[2rem] border border-neutral-200 bg-white p-8 shadow-sm">
                  <h3 className="text-2xl font-semibold text-neutral-950 antialiased">You already have access.</h3>
                  <p className="mt-3 text-sm leading-6 text-neutral-600 antialiased">
                    Continue into the Fine Diet app to use your journal, recipes, plans, programs, and insights.
                  </p>
                  <div className="mt-6">
                    <PrimaryCta hasAppAccess />
                  </div>
                </div>
              ) : (
                <div className={`grid gap-6 ${pricingGridClass}`}>
                  {visiblePlanOptions.map((plan) => (
                    <Link
                      key={plan.offerKey}
                      href={planHref(plan.offerKey)}
                      className="group flex min-h-[360px] flex-col rounded-[1.5rem] border border-neutral-300 bg-white p-7 text-neutral-950 shadow-sm transition hover:border-denim-300/70 focus:outline-none focus:ring-2 focus:ring-denim-400"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          {plan.badge && (
                            <p className="mb-3 inline-flex rounded-full bg-denim-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-denim-600 antialiased">
                              {plan.badge}
                            </p>
                          )}
                          <h3 className="text-2xl font-semibold text-neutral-950 antialiased">
                            {plan.title}
                          </h3>
                        </div>
                      </div>

                      <div className="mt-5 flex items-baseline gap-1">
                        <span className="text-4xl font-semibold tracking-[-0.04em] text-neutral-950 antialiased">
                          {plan.priceLabel}
                        </span>
                        {plan.priceSuffix && (
                          <span className="text-sm text-neutral-500 antialiased">
                            {plan.priceSuffix}
                          </span>
                        )}
                      </div>

                      <p className="mt-5 text-sm leading-6 text-neutral-600 antialiased">
                        {plan.subtitle}
                      </p>
                      {plan.trialNote && (
                        <p className="mt-4 text-xs leading-5 text-neutral-500 antialiased">
                          {plan.trialNote}
                        </p>
                      )}
                      <span className="mt-auto inline-flex w-full items-center justify-center rounded-full bg-denim-500 px-5 py-3 text-sm font-semibold text-white transition group-hover:bg-denim-400 antialiased">
                        {plan.ctaLabel}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-neutral-100 px-5 pb-16 text-neutral-950 sm:px-6 lg:px-8 lg:pb-20">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] border border-neutral-300 bg-neutral-100">
            <div className="bg-neutral-950 px-6 py-6 text-white sm:px-8">
              <h2 className="text-3xl font-semibold tracking-[-0.03em] antialiased sm:text-4xl">FAQs</h2>
            </div>
            <div className="divide-y divide-neutral-300">
              {FAQ_ITEMS.map((item, index) => (
                <details key={item.question} open={index === 0} className="group bg-neutral-100 px-6 py-5 sm:px-8">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-sm font-semibold antialiased">
                    {item.question}
                    <span className="text-neutral-500 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 max-w-4xl text-sm leading-6 text-neutral-600 antialiased">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-neutral-300 bg-neutral-100 px-5 py-16 text-neutral-950 sm:px-6 lg:px-8 lg:py-20">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="mx-auto max-w-3xl text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-5xl">
              Build a nutrition system you can understand, repeat, and adjust to real life.
            </h2>
            <div className="mt-8 flex justify-center">
              <PrimaryCta hasAppAccess={hasAppAccess} />
            </div>
            {!hasAppAccess && (
              <p className="mt-5 text-xs text-neutral-500 antialiased">
                Start free during your trial. Choose monthly or annual before checkout.
              </p>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
