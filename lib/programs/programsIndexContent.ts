/**
 * Programs index copy helpers.
 *
 * The top-level `/programs` route is a public directory surface. It should be
 * able to render from catalogue metadata alone and should not carry checkout,
 * pricing, grants, entitlement, or clinical-claim truth.
 */

import type { ProgramCollectionDefinition } from './programCollectionTypes';

export interface ProgramsIndexContent {
  eyebrow: string;
  title: string;
  description: string;
  introHeading: string;
  introBody: string;
  methodSteps: Array<{
    title: string;
    body: string;
  }>;
  collectionsHeading: string;
  collectionsBody: string;
  emptyHeading: string;
  emptyBody: string;
  finalCtaHeading: string;
  finalCtaBody: string;
  finalCtaLabel: string;
  finalCtaHref: string;
}

export interface ProgramsIndexCollectionCard {
  slug: string;
  href: string;
  title: string;
  description: string;
  subtitle?: string;
  category: string;
  programCount: number;
  firstProgramTitle?: string;
  heroImageUrl: string;
}

const DEFAULT_PROGRAMS_INDEX_CONTENT: ProgramsIndexContent = {
  eyebrow: 'Fine Diet Programs',
  title: 'Explore structured nutrition pathways',
  description:
    'Choose a Fine Diet Program Collection and start with the pathway that fits your next step.',
  introHeading: 'Programs are public overviews. Delivery happens in the app.',
  introBody:
    'Each Collection explains a structured pathway. Once you have access, enrollment, check-ins, and program delivery happen inside the signed-in Fine Diet app.',
  methodSteps: [
    {
      title: 'Choose a pathway',
      body: 'Browse public Collections and understand what each one is built to help you explore.',
    },
    {
      title: 'Start with the first useful step',
      body: 'Most pathways begin with a foundation Program before moving into more focused work.',
    },
    {
      title: 'Continue in the app',
      body: 'Use the signed-in app for enrollment, check-ins, logging, and guided delivery.',
    },
  ],
  collectionsHeading: 'Program Collections',
  collectionsBody:
    'Collections group related Programs into a staged sequence. Public pages explain the path; the app handles the work.',
  emptyHeading: 'Programs are being prepared',
  emptyBody:
    'The public catalogue is not available yet. Check back soon, or continue into the app if you already have access.',
  finalCtaHeading: 'Not sure where to start?',
  finalCtaBody:
    'Start with the Collection that matches your current goal. If you already have access, manage active Programs in the app.',
  finalCtaLabel: 'Manage my programs',
  finalCtaHref: '/app/programs',
};

function categoryLabel(category: string): string {
  return category.replace(/-/g, ' ');
}

export function getProgramsIndexContent(): ProgramsIndexContent {
  return DEFAULT_PROGRAMS_INDEX_CONTENT;
}

export function buildProgramsIndexCollectionCards(
  collections: ProgramCollectionDefinition[],
): ProgramsIndexCollectionCard[] {
  return collections.map((collection) => ({
    slug: collection.slug,
    href: `/programs/${collection.slug}`,
    title: collection.title || collection.slug,
    subtitle: collection.subtitle || undefined,
    description:
      collection.description ||
      collection.subtitle ||
      'Public overview for this Fine Diet Program Collection.',
    category: categoryLabel(collection.category),
    programCount: collection.programs.length,
    firstProgramTitle: collection.programs[0]?.title,
    heroImageUrl: collection.heroImageUrl,
  }));
}
