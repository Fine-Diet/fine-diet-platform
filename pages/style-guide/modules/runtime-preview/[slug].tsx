import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';

import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import { MODULE_DISCOVERY_CATALOG } from '@/lib/moduleDiscoveryCatalog';
import { getModuleDiscoveryMetadata } from '@/lib/moduleDiscoveryMetadata';
import type { ModuleTypeKey, PageComposition } from '@/lib/modules/types';

const IMG = '/images/home/health-reset-desktop.jpg';
const IMG2 = '/images/home/fine-diet-approved-desktop.jpg';

interface Props {
  composition: PageComposition;
}

const RUNTIME_TYPES = MODULE_DISCOVERY_CATALOG.map((mod) => getModuleDiscoveryMetadata(mod).runtimeKey)
  .filter((value): value is ModuleTypeKey => Boolean(value));

function one(type: ModuleTypeKey, content: Record<string, unknown>): PageComposition {
  const module = { id: `preview-${type}`, type, content } as unknown as PageComposition['modules'][number];
  return {
    key: `style-guide:runtime-preview:${type}`,
    version: 1,
    modules: [module],
  };
}

function compositionFor(type: ModuleTypeKey): PageComposition | null {
  switch (type) {
    case 'hero.offer-blur.v1':
      return one(type, {
        title: 'Build a nutrition system\nthat adapts with you.',
        subtitle: 'Rendered preview for the reusable pathway hero.',
        ctaLabel: 'Explore the pathway',
        ctaHref: '#',
        imageDesktop: IMG,
        imageMobile: IMG,
        overlayStrength: 'dark',
      });
    case 'process.slide-stack.v1':
      return one(type, {
        heading: 'How guided support works',
        defaultOpenIndex: 0,
        steps: [
          { stepNumber: 1, label: 'Start', title: 'Clarify the starting point', lines: ['Review the current rhythm.', 'Identify the strongest signal.'], imageDesktop: IMG, imageMobile: IMG },
          { stepNumber: 2, label: 'Apply', title: 'Follow a focused sequence', lines: ['Use the plan daily.', 'Adjust around real life.'], imageDesktop: IMG2, imageMobile: IMG2 },
          { stepNumber: 3, label: 'Learn', title: 'Choose the next step', lines: ['Review what changed.', 'Carry forward what worked.'], imageDesktop: IMG, imageMobile: IMG },
        ],
      });
    case 'process.timed-steps.v1':
      return one(type, {
        heading: 'A clear sequence for getting started',
        steps: [
          { stepNumber: 1, label: 'Day 1', title: 'Choose your pathway', description: 'Pick the starting point that matches the outcome.' },
          { stepNumber: 2, label: 'Week 1', title: 'Build the rhythm', description: 'Create repeatable meals, logs, and reflection points.' },
          { stepNumber: 3, label: 'Next', title: 'Decide what changes', description: 'Continue, repeat, or choose a focused program.' },
        ],
      });
    case 'persuasion.simple-cta.v1':
      return one(type, { heading: 'Make the next step feel obvious.', intro: 'A concise persuasion block before a final action.', items: ['Explain the promise.', 'Reduce uncertainty.', 'Point to the next action.'], ctaLabel: 'Continue', ctaHref: '#', variant: 'list' });
    case 'ambient.marquee-strip.v1':
      return one(type, { text: 'Plan better • Log with context • Learn your rhythm • Repeat what works •', speed: 32, direction: 'left', pauseOnHover: true });
    case 'case-study.scroll-cards.v1':
      return one(type, { sectionHeading: 'Pathway stories', cards: [{ id: 'one', imageDesktop: IMG, imageMobile: IMG, imageAlt: 'Preview', before: 'Before: meals felt reactive.', breakthrough: 'Breakthrough: patterns became visible.', after: 'After: the next step was clearer.' }, { id: 'two', imageDesktop: IMG2, imageMobile: IMG2, imageAlt: 'Preview', before: 'Before: every week started from scratch.', breakthrough: 'Breakthrough: templates reduced decisions.', after: 'After: planning became repeatable.' }] });
    case 'faq.accordion.v2':
      return one(type, { title: 'Questions before you start', defaultOpenIndex: 0, items: [{ id: 'one', question: 'Where does this module fit?', answer: 'Use it when common questions need a structured answer.' }, { id: 'two', question: 'Can editors change the copy?', answer: 'Yes. Questions and answers are authored in composition content.' }, { id: 'three', question: 'Is this only for Programs?', answer: 'No. It can support multiple public pathway pages.' }] });
    case 'feature.reasons-split.v1':
      return one(type, { heading: 'Why this pathway works better than guessing.', body: 'Use this split feature for numbered reasons beside a strong image.', items: [{ label: '01', sentence: 'It starts from the user rhythm.' }, { label: '02', sentence: 'It keeps the next step specific.' }, { label: '03', sentence: 'It connects education to action.' }], imageDesktop: IMG, imageMobile: IMG, imageAlt: 'Preview', ctaLabel: 'See the next step', ctaHref: '#', ctaTone: 'denim' });
    case 'cta.program-offer.v1':
      return one(type, { collectionSlug: 'nutrition', programSlug: 'baseline', eyebrow: 'Program pathway', heading: 'Start with Baseline, then choose the next focused path.', body: 'The action resolves from the centralized program catalogue.', align: 'center', surface: 'light', ctaStyle: 'full' });
    case 'comparison.table.v1':
      return one(type, { heading: 'A clearer way to choose a path', columns: { left: 'Fine Diet pathway', right: 'Generic plan' }, rows: [{ label: 'Starting point', left: 'Begins with logs and patterns.', right: 'Starts from a fixed template.' }, { label: 'Next steps', left: 'Routes toward the right program.', right: 'Leaves users to decide alone.' }, { label: 'Sustainability', left: 'Designed around repeatable routines.', right: 'Often depends on intensity.' }] });
    case 'feature.icon-tiles.v1':
      return one(type, { heading: 'What users get from the system', intro: 'Use icon tiles for benefits, pillars, or app capabilities.', surface: 'dark', tiles: [{ icon: 'notebook', title: 'Guided logging', description: 'Capture meals and body signals with context.' }, { icon: 'insights', title: 'Pattern clarity', description: 'Turn repeated logs into useful next steps.' }, { icon: 'programs', title: 'Programs', description: 'Follow staged pathways as they become available.' }, { icon: 'save', title: 'Repeatable meals', description: 'Save what works and bring it forward.' }] });
    case 'grid.program-cards.v1':
      return one(type, { collectionSlug: 'nutrition', heading: 'Nutrition Foundations', subhead: 'A resolver-driven grid using the centralized program catalogue.' });
    case 'nav.program-pathway.v1':
      return one(type, { collectionSlug: 'nutrition', programSlug: 'baseline' });
    case 'pricing.tiers.v1':
      return one(type, { title: 'Choose your plan', description: 'Preview cards for module discovery.', columns: { mobile: 1, tablet: 2, desktop: 2 }, cards: [{ id: 'monthly', title: 'Monthly', subtitle: 'Flexible', description: 'Month to month.', price: 'Monthly', paymentSchedule: 'Plan', button: { label: 'Preview monthly', href: '#', variant: 'primary' } }, { id: 'annual', title: 'Annual', subtitle: 'Best value', description: 'Yearly rhythm.', price: 'Annual', paymentSchedule: 'Plan', button: { label: 'Preview annual', href: '#', variant: 'primary' } }] });
    default:
      return null;
  }
}

export default function RuntimePreview({ composition }: Props) {
  return (
    <>
      <Head><meta name="robots" content="noindex" /></Head>
      <main className="min-h-screen bg-brand-900 text-brand-900">
        <ModuleRenderer composition={composition} layout="flat" />
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: RUNTIME_TYPES.filter((type) => Boolean(compositionFor(type))).map((type) => ({ params: { slug: type } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async ({ params }) => {
  const composition = compositionFor(params?.slug as ModuleTypeKey);
  if (!composition) return { notFound: true };
  return { props: { composition } };
};
