/**
 * Module Embed — /style-guide/modules/embed/[slug]?variant=...
 *
 * Standalone page that renders a single module at full scale.
 * Loaded inside an iframe by the detail page so that viewport-based
 * media queries (sm:, md:, lg:) fire correctly at the iframe width.
 *
 * No chrome, no layout — just the component and global styles.
 */

import { useRouter } from 'next/router';
import { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';

import { MODULE_REGISTRY } from '@/lib/moduleRegistry';

import { HeroSection } from '@/components/home/HeroSection';
import { HeroMediumSection } from '@/components/home/HeroMediumSection';
import { FeatureSection } from '@/components/home/FeatureSection';
import { GridSection } from '@/components/home/GridSection';
import { GridMediumSection } from '@/components/home/GridMediumSection';
import { CTASection } from '@/components/home/CTASection';
import { Button } from '@/components/ui/Button';
import { MealSection } from '@/components/journal/MealSection';
import { JournalHeroSection } from '@/components/journal/JournalHeroSection';
import { AuroraBackground } from '@/components/journal/AuroraBackground';
import BuyOfferButton from '@/components/checkout/BuyOfferButton';

import type { HomeContent } from '@/lib/contentTypes';

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_HOME_CONTENT: HomeContent = {
  hero: {
    title: 'Read your body.\nReset your health.',
    description:
      'Your body keeps receipts — learn how to read them and reclaim how you feel, look and live.',
    buttons: [
      { label: 'Start Your Free Journal', variant: 'primary', href: '#' },
      { label: 'Explore The Program', variant: 'tertiary', href: '#' },
    ],
    images: {
      desktop: '/images/home/hero-desktop.jpg',
      mobile: '/images/home/hero-mobile.jpg',
    },
  },
  featureSections: [
    {
      title: 'Break up with sugar, feel like yourself again.',
      description:
        'The Food & Mood Journal helps you build awareness and make better choices. Free with account.',
      buttons: [
        { label: 'Learn More', variant: 'primary', href: '#' },
        { label: 'Join', variant: 'tertiary', href: '#' },
      ],
      images: {
        desktop: '/images/home/integrative-care-desktop.jpg',
        mobile: '/images/home/integrative-care-mobile.jpg',
      },
      slides: [
        {
          id: 'slide-1',
          title: 'Turn your symptoms into a strategy',
          description:
            'High-touch, practitioner-led support designed for women who are tired of guessing.',
          images: {
            desktop: '/images/home/integrative-care-desktop.jpg',
            mobile: '/images/home/integrative-care-mobile.jpg',
          },
          buttons: [
            { label: 'Explore Integrative Care', variant: 'primary', href: '#' },
            { label: 'View Success Stories', variant: 'tertiary', href: '#' },
          ],
        },
        {
          id: 'slide-2',
          title: 'Nutrition that actually works for you',
          description:
            'Personalized guidance that adapts to your body, your schedule, and your real life.',
          images: {
            desktop: '/images/home/health-reset-desktop.jpg',
            mobile: '/images/home/health-reset-mobile.jpg',
          },
          buttons: [{ label: 'Get Started', variant: 'primary', href: '#' }],
        },
      ],
    },
  ],
  gridSections: [
    {
      items: [
        {
          title: 'Fine Diet Approved',
          description: 'Save up to 30% on recommended brands.',
          image: '/images/home/fine-diet-approved-desktop.jpg',
          button: { label: 'Get Deals', variant: 'tertiary', href: '#' },
        },
        {
          title: 'Get The Fine Print',
          description:
            'Interested in receiving the latest in nutrition insights and early access to new programs?',
          image: '/images/home/fine-print-desktop.jpg',
          button: { label: 'Join', variant: 'quaternary', href: '#' },
        },
      ],
    },
  ],
  ctaSection: {
    title: 'Start your Food & Mood Journal today.',
    description: 'Track mood, meals, sleep, and cravings in minutes.',
    button: { label: 'Start Tracking', variant: 'primary', href: '#' },
    images: {
      desktop: '/images/home/hero-desktop.jpg',
      mobile: '/images/home/hero-mobile.jpg',
    },
  },
};

const MOCK_FEATURE_SINGLE = {
  title: "When you're ready for a real health reset",
  description:
    'A 12-week, functional-nutrition framework that helps you calm inflammation, balance your metabolism and more.',
  buttons: [
    { label: "See What You'll Learn", variant: 'primary' as const, href: '#' },
    { label: 'Join The Waitlist', variant: 'tertiary' as const, href: '#' },
  ],
  images: {
    desktop: '/images/home/health-reset-desktop.jpg',
    mobile: '/images/home/health-reset-mobile.jpg',
  },
  slides: [],
};

const MOCK_GRID_NO_IMAGE = {
  items: [
    {
      title: 'Solid Background Card',
      description: 'This card has no image — it falls back to the neutral-700 solid fill.',
      button: { label: 'Explore', variant: 'primary' as const, href: '#' },
    },
    {
      title: 'Another Solid Card',
      description: 'Useful for non-visual content blocks.',
      button: { label: 'Learn More', variant: 'tertiary' as const, href: '#' },
    },
  ],
};

const MOCK_CTA_SOLID = {
  title: 'This is a solid-background CTA variant.',
  description: 'No image — uses neutral-700 fill with centered content.',
  button: { label: 'Get Started', variant: 'primary' as const, href: '#' },
};

const MOCK_FOOD_ITEMS = [
  { id: '1', name: 'Scrambled Eggs' },
  { id: '2', name: 'Avocado Toast' },
  { id: '3', name: 'Black Coffee' },
];

/* ------------------------------------------------------------------ */
/*  Render switch                                                      */
/* ------------------------------------------------------------------ */

function ModuleRender({ slug, variant }: { slug: string; variant: string }) {
  switch (slug) {
    case 'hero': {
      const content = { ...MOCK_HOME_CONTENT };
      if (variant === 'single-cta') {
        content.hero = { ...content.hero, buttons: [content.hero.buttons[0]] };
      }
      return (
        <div className="bg-brand-900">
          <HeroSection homeContent={content} />
        </div>
      );
    }

    case 'hero-medium': {
      const content = { ...MOCK_HOME_CONTENT };
      if (variant === 'single-cta') {
        content.hero = { ...content.hero, buttons: [content.hero.buttons[0]] };
      }
      return (
        <div className="bg-brand-900">
          <HeroMediumSection homeContent={content} />
        </div>
      );
    }

    case 'feature-card': {
      const sectionData =
        variant === 'single-slide'
          ? MOCK_FEATURE_SINGLE
          : MOCK_HOME_CONTENT.featureSections[0];
      return (
        <div className="bg-brand-900 px-3 py-3">
          <FeatureSection content={sectionData} />
        </div>
      );
    }

    case 'grid-2col': {
      const section =
        variant === 'solid-background'
          ? MOCK_GRID_NO_IMAGE
          : MOCK_HOME_CONTENT.gridSections[0];
      return (
        <div className="bg-brand-900 px-3 py-3">
          <GridSection section={section} />
        </div>
      );
    }

    case 'grid-2col-medium': {
      const section =
        variant === 'solid-background'
          ? MOCK_GRID_NO_IMAGE
          : MOCK_HOME_CONTENT.gridSections[0];
      return (
        <div className="bg-brand-900 px-3 py-3">
          <GridMediumSection section={section} />
        </div>
      );
    }

    case 'cta-banner': {
      let content: typeof MOCK_HOME_CONTENT.ctaSection;
      if (variant === 'solid-background') content = MOCK_CTA_SOLID;
      else if (variant === 'no-description')
        content = { ...MOCK_HOME_CONTENT.ctaSection, description: undefined };
      else content = MOCK_HOME_CONTENT.ctaSection;
      return (
        <div className="bg-brand-900">
          <CTASection content={content} />
        </div>
      );
    }

    case 'button': {
      const v = variant as 'primary' | 'secondary' | 'tertiary' | 'quaternary';
      const needsDark = v === 'tertiary';
      return (
        <div
          className={`flex flex-col items-center gap-6 py-16 px-8 ${
            needsDark ? 'bg-brand-900' : 'bg-neutral-100'
          }`}
        >
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button variant={v} size="sm">Small</Button>
            <Button variant={v} size="md">Medium</Button>
            <Button variant={v} size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button variant={v} size="lg" disabled>Disabled</Button>
          </div>
        </div>
      );
    }

    case 'buy-offer-button': {
      const v = variant as 'primary' | 'secondary' | 'ghost';
      return (
        <div className="bg-brand-900 flex flex-col items-center gap-6 py-16 px-8">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <BuyOfferButton offerKey="preview-only" label="Annual Plan" variant={v} size="sm" placement="style-guide" />
            <BuyOfferButton offerKey="preview-only" label="Monthly Plan" variant={v} size="md" placement="style-guide" />
            <BuyOfferButton offerKey="preview-only" label="Lifetime Access" variant={v} size="lg" placement="style-guide" />
          </div>
          <p className="text-xs text-white/30 antialiased">
            Preview only — buttons will return an error if clicked
          </p>
        </div>
      );
    }

    case 'meal-section':
      return (
        <div className="bg-brand-900 px-4 py-8 space-y-4 max-w-[650px] mx-auto">
          {variant === 'empty' && <MealSection title="Morning" actionLabel="Add" actionIcon="plus" />}
          {variant === 'with-food-items' && (
            <MealSection title="Midday" actionLabel="Edit" actionIcon="edit" foodItems={MOCK_FOOD_ITEMS} onRemoveItem={() => {}} />
          )}
          {variant === 'translucent' && (
            <MealSection title="Evening" actionLabel="" actionIcon="arrow" foodItems={[{ id: '1', name: 'Grilled Salmon' }]} isTranslucent onRemoveItem={() => {}} />
          )}
        </div>
      );

    case 'journal-hero':
      return (
        <div className="bg-brand-900">
          <JournalHeroSection
            score={72} dateLabel="Today" onPrevDay={() => {}} onNextDay={() => {}}
            canGoNext={false} dailyIntake={1450} dailyGoal={2500}
            scoreLoading={false} scoreLabel="Nutrition Density"
          >
            <MealSection title="Morning" actionLabel="Add" actionIcon="plus" />
            <MealSection title="Midday" actionLabel="Edit" actionIcon="edit" foodItems={MOCK_FOOD_ITEMS} onRemoveItem={() => {}} />
            <MealSection title="Evening" actionLabel="Add" actionIcon="plus" />
          </JournalHeroSection>
        </div>
      );

    case 'aurora-background':
      return (
        <div className="relative h-[400px] overflow-hidden">
          <AuroraBackground />
          <div className="relative z-10 flex items-center justify-center h-full">
            <p className="text-white/60 text-sm antialiased">Animated aurora gradient layer</p>
          </div>
        </div>
      );

    case 'access-card': {
      const configs: Record<string, { title: string; status: string; color: string; cta: string }> = {
        active: { title: 'Journal', status: 'Active', color: 'text-dark_accent-400', cta: 'Open Journal' },
        inactive: { title: 'Programs', status: 'Explore', color: 'text-white/40', cta: 'View Programs' },
        'expiring-soon': { title: 'Journal', status: 'Expires in 7 days', color: 'text-amber-400', cta: 'Renew Access' },
      };
      const c = configs[variant] || configs.active;
      return (
        <div className="bg-brand-900 px-5 py-8 max-w-2xl mx-auto space-y-3">
          <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700/50 p-5 flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-white antialiased">{c.title}</h3>
              <span className={`text-xs font-medium antialiased ${c.color}`}>{c.status}</span>
            </div>
            <span className="self-start text-sm font-medium text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased cursor-pointer">
              {c.cta} &rarr;
            </span>
          </div>
        </div>
      );
    }

    case 'quick-action':
      return (
        <div className="bg-brand-900 px-5 py-8 max-w-2xl mx-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className={`flex flex-col items-center justify-center rounded-2xl py-5 px-4 transition-colors ${variant === 'accent' ? 'bg-dark_accent-500/20 hover:bg-dark_accent-500/30' : 'bg-neutral-800/50 hover:bg-neutral-800/70'}`}>
              <span className={`text-base font-semibold antialiased ${variant === 'accent' ? 'text-dark_accent-300' : 'text-white'}`}>
                {variant === 'accent' ? 'Log Food' : 'Gut Check'}
              </span>
              <span className={`text-[11px] antialiased mt-1 ${variant === 'accent' ? 'text-dark_accent-500/70' : 'text-white/40'}`}>
                {variant === 'accent' ? 'Fast add meals & snacks' : 'Quick assessment'}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center rounded-2xl py-5 px-4 transition-colors bg-neutral-800/50 hover:bg-neutral-800/70">
              <span className="text-base font-semibold antialiased text-white">Shop</span>
              <span className="text-[11px] antialiased mt-1 text-white/40">Products & supplements</span>
            </div>
          </div>
        </div>
      );

    case 'recommendation-card':
      return (
        <div className="bg-brand-900 px-5 py-8 max-w-2xl mx-auto space-y-3">
          <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700/50 p-5 flex flex-col gap-2">
            <h4 className="text-sm font-semibold text-white antialiased">Try the Gut Check Assessment</h4>
            <p className="text-xs text-white/50 antialiased leading-relaxed">
              A quick 3-minute check-in to understand your digestive patterns and get personalized recommendations.
            </p>
            <span className="self-start mt-1 text-sm font-medium text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased cursor-pointer">
              Take Assessment &rarr;
            </span>
          </div>
        </div>
      );

    case 'form-panel':
      return (
        <div className="bg-brand-900 min-h-[500px] flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white mb-4 antialiased">The Food & Mood Journal</h1>
              <p className="text-base sm:text-lg text-white/90 font-light antialiased mb-2">Your personal nutrition companion</p>
              <p className="text-base sm:text-lg text-white/80 font-light antialiased">Track what you eat, how you feel, and start connecting the dots.</p>
            </div>
            <div className="bg-neutral-800/40 backdrop-blur rounded-[2.5rem] p-6 sm:p-8 md:p-10 shadow-soft">
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-white mb-2 antialiased">Get early access</h2>
                <p className="text-base text-white/90 font-light antialiased">Join the waitlist and be the first to know when we launch.</p>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-white mb-2 antialiased">Email <span className="text-white/60">(required)</span></label>
                  <input type="email" readOnly placeholder="your.email@example.com" className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl text-white placeholder-white/50 focus:outline-none antialiased" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white mb-2 antialiased">Name <span className="text-white/60">(optional)</span></label>
                  <input type="text" readOnly placeholder="Your name" className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl text-white placeholder-white/50 focus:outline-none antialiased" />
                </div>
                <div className="pt-2">
                  <Button variant="primary" size="lg" className="w-full">Join Waitlist</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );

    case 'section-label':
      return (
        <div className="bg-brand-900 px-5 py-8 max-w-2xl mx-auto space-y-6">
          <div>
            <h2 className="text-xs font-semibold text-white/40 antialiased uppercase tracking-wider mb-3 px-1">Your Access</h2>
            <div className="h-16 rounded-2xl bg-neutral-800/50 border border-neutral-700/50" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-white/40 antialiased uppercase tracking-wider mb-3 px-1">Quick Actions</h2>
            <div className="h-16 rounded-2xl bg-neutral-800/50 border border-neutral-700/50" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-white/40 antialiased uppercase tracking-wider mb-3 px-1">Recommended for You</h2>
            <div className="h-16 rounded-2xl bg-neutral-800/50 border border-neutral-700/50" />
          </div>
        </div>
      );

    default:
      return (
        <div className="bg-brand-900 flex items-center justify-center py-20">
          <p className="text-sm text-white/40 antialiased">No live preview available for this module yet.</p>
        </div>
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

interface EmbedProps {
  slug: string;
}

export default function ModuleEmbed({ slug }: EmbedProps) {
  const router = useRouter();
  const variant = (router.query.variant as string) || 'default';

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen">
        <ModuleRender slug={slug} variant={variant} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Static generation                                                  */
/* ------------------------------------------------------------------ */

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = MODULE_REGISTRY.map((mod) => ({
    params: { slug: mod.slug },
  }));
  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<EmbedProps> = async ({ params }) => {
  const slug = params?.slug as string;
  const mod = MODULE_REGISTRY.find((m) => m.slug === slug);
  if (!mod) return { notFound: true };
  return { props: { slug } };
};
