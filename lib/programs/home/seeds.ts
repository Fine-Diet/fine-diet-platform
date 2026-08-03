/**
 * Code-owned Programs Home presentation seeds.
 *
 * These are not production programme rows, enrollments, or entitlements.
 * Seeded entries without canonical routes open a non-persistent preview sheet.
 */

import type {
  ProgramsHomeCatalogueItem,
  ProgramsHomeCategory,
  ProgramsHomeFeaturedItem,
} from './types';

export const PROGRAMS_HOME_HERO_IMAGE_URL =
  'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1777415406662-Home-Baseline-Program-Image-3x1.jpg';

export const PROGRAMS_HOME_BASELINE_DEFAULT_COPY = {
  eyebrow: 'Baseline',
  metaLabel: '21-Day Program',
  title: 'The most comprehensive, self-led nutrition program',
  description:
    'A description will go here on what they are about to hear and how to apply it to complete their baseline setup.',
  imageUrl: PROGRAMS_HOME_HERO_IMAGE_URL,
} as const;

export const PROGRAMS_HOME_CATEGORIES: ProgramsHomeCategory[] = [
  { key: 'nutrition', label: 'Nutrition', sortOrder: 1, status: 'active' },
  { key: 'lifestyle', label: 'Lifestyle', sortOrder: 2, status: 'coming_soon' },
  { key: 'advanced', label: 'Advanced', sortOrder: 3, status: 'coming_soon' },
];

export const PROGRAMS_HOME_FEATURED_SEEDS: ProgramsHomeFeaturedItem[] = [
  {
    id: 'featured-nutrition-foundations',
    slug: 'nutrition-foundations',
    eyebrow: 'Start Here',
    title: 'Nutrition Foundations',
    description:
      'A staged nutrition pathway that starts with Baseline and builds practical meal rhythm.',
    imageUrl:
      'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1776806738515-Navigation-Featured-Image-Intensive.jpg',
    availability: 'available',
    ctaLabel: 'Activate',
    disabled: false,
    source: 'seed',
  },
  {
    id: 'featured-lifestyle-systems',
    slug: 'lifestyle-systems',
    eyebrow: 'Coming Soon',
    title: 'Lifestyle Systems',
    description: 'Daily rhythm tools that support nutrition work over time.',
    imageUrl:
      'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779826859288-woman-in-hunter-green_copy.jpg',
    availability: 'coming_soon',
    ctaLabel: 'Coming Soon',
    disabled: true,
    source: 'seed',
  },
  {
    id: 'featured-targeted-protocols',
    slug: 'targeted-protocols',
    eyebrow: 'Coming Soon',
    title: 'Targeted Protocols',
    description: 'Focused protocols for specific nutrition and recovery goals.',
    imageUrl:
      'https://tssvlflebugqhtogqdfs.supabase.co/storage/v1/object/public/assets/misc/1779826953239-building-blocks.jpg',
    availability: 'coming_soon',
    ctaLabel: 'Coming Soon',
    disabled: true,
    source: 'seed',
  },
];

const NUTRITION_DESCRIPTION =
  'Create templates to repeat daily of meals you prefer';

export const PROGRAMS_HOME_CATALOGUE_SEEDS: ProgramsHomeCatalogueItem[] = [
  {
    id: 'cat-balanced',
    slug: 'balanced',
    categoryKey: 'nutrition',
    title: 'Balanced',
    description: NUTRITION_DESCRIPTION,
    imageUrl: '/images/programs/blood-sugar-balance.jpg',
    availability: 'coming_soon',
    source: 'seed',
  },
  {
    id: 'cat-sport-fuel',
    slug: 'sport-fuel',
    categoryKey: 'nutrition',
    title: 'Sport Fuel',
    description: NUTRITION_DESCRIPTION,
    imageUrl: '/images/programs/metabolic-reset.jpg',
    availability: 'coming_soon',
    source: 'seed',
  },
  {
    id: 'cat-nourishment',
    slug: 'nourishment',
    categoryKey: 'nutrition',
    title: 'Nourishment',
    description: NUTRITION_DESCRIPTION,
    imageUrl: '/images/programs/inflammation-support.jpg',
    availability: 'coming_soon',
    source: 'seed',
  },
  {
    id: 'cat-nutriboost',
    slug: 'nutriboost',
    categoryKey: 'nutrition',
    title: 'NutriBoost',
    description: NUTRITION_DESCRIPTION,
    imageUrl: '/images/programs/calm-your-gut.jpg',
    availability: 'coming_soon',
    source: 'seed',
  },
];

export function categoryLabelForKey(key: string): string {
  return (
    PROGRAMS_HOME_CATEGORIES.find((category) => category.key === key)?.label ??
    key
  );
}
