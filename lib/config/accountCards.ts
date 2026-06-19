export interface AccountCard {
  id: string;
  title: string;
  description: string;
  image: string;
  href: string;
  buttonLabel?: string;
}

export const SHARED_PROGRAM_CARDS: AccountCard[] = [
  {
    id: 'nutrition-intensive',
    title: '21-Day Nutrition Intensive',
    description: 'Starts at $525 for someone wanting answers now without a long commitment.',
    image: '/images/care/14-Day-Intensive.jpg',
    href: '/integrative-care/nutrition-intensive',
    buttonLabel: 'Get Started',
  },
  {
    id: 'gut-rebalance',
    title: '12-Week Gut Rebalance',
    description: '$14,440 for someone ready for deeper root-cause work + longterm change.',
    image: '/images/care/12-Week-Gut-Reset.jpg',
    href: '/integrative-care/gut-rebalance',
    buttonLabel: 'Get Started',
  },
];

export const SHARED_ASSESSMENT_CARDS: AccountCard[] = [
  {
    id: 'gut-check',
    title: 'Gut Check',
    description:
      'Answer 17 questions and get a personalised read on your gut health pattern — free, instant, and grounded in real nutritional science.',
    image: '/images/programs/calm-your-gut.jpg',
    href: '/assessments/gut-check',
    buttonLabel: 'Get Started',
  },
  {
    id: 'ideal-eating',
    title: 'Ideal Eating Schedule',
    description:
      'Understand how blood sugar, stress and nutrient gaps are affecting your mood, cravings and energy.',
    image: '/images/programs/blood-sugar-balance.jpg',
    href: '/assessments/ideal-eating',
    buttonLabel: 'Get Started',
  },
];

/**
 * Maps confirmed DB assessment_type values → display metadata.
 *
 * CONFIRMED values (from assessment_submissions + AssessmentType):
 *   'gut-check'   — only current submittable assessment type
 *
 * 'ideal-eating' is a static catalog card only and does NOT appear
 * in assessment_submissions rows. Do not add it here.
 *
 * Add a new entry when a new assessment type ships and is confirmed
 * to appear in the submissions table.
 */
export const ASSESSMENT_TYPE_MAP: Record<
  string,
  Pick<AccountCard, 'title' | 'image' | 'href'>
> = {
  'gut-check': {
    title: 'Gut Check',
    image: '/images/programs/calm-your-gut.jpg',
    href: '/assessments/gut-check',
  },
};

/** Shown in the assessments section when the user has no completed assessments. */
export const ASSESSMENTS_EMPTY_FALLBACK: AccountCard = {
  id: 'assessments-prospect',
  title: 'Find the assessment for you',
  description:
    'Discover your gut health pattern, eating schedule, and more — free and instant.',
  image: '/images/programs/calm-your-gut.jpg',
  href: '/assessments',
  buttonLabel: 'Browse Assessments',
};

/** "See more" destinations */
export const PROGRAMS_SEE_MORE_HREF = '/programs';
export const ASSESSMENTS_SEE_MORE_HREF = '/account/assessments';
