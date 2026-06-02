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

import { MODULE_STYLE_CATALOG } from '@/lib/moduleRegistry';

import { HeroSection } from '@/components/home/HeroSection';
import { HeroMediumSection } from '@/components/home/HeroMediumSection';
import { FeatureSection } from '@/components/home/FeatureSection';
import { GridSection } from '@/components/home/GridSection';
import { GridMediumSection } from '@/components/home/GridMediumSection';
import { GridSectionApp } from '@/components/home/GridSectionApp';
import { GridAppSectionHome } from '@/components/journal/GridAppSectionHome';
import { CTASection } from '@/components/home/CTASection';
import { Button } from '@/components/ui/Button';
import { MealSection } from '@/components/journal/MealSection';
import { JournalHeroSection } from '@/components/journal/JournalHeroSection';
import { AuroraBackground } from '@/components/journal/AuroraBackground';
import BuyOfferButton from '@/components/checkout/BuyOfferButton';
import { NutritionDensityGauge } from '@/components/journal/NutritionDensityGauge';
import { StackedPageHero, StackedPageSection } from '@/components/layout/StackedPageSection';
import { AppTopNav } from '@/components/journal/AppTopNav';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { AppShell } from '@/components/journal/AppShell';
import { JournalBlockSection } from '@/components/journal/JournalBlockSection';
import { DailySummary } from '@/components/journal/DailySummary';
import { AccessCard } from '@/components/app/cards/AccessCard';
import { QuickActionButton } from '@/components/app/actions/QuickActionButton';
import { RecommendationCard } from '@/components/app/cards/RecommendationCard';
import { TodayRhythm } from '@/components/journal/home/TodayRhythm';
import { NutritionDensityScroller } from '@/components/journal/home/NutritionDensityScroller';
import { QuickEntryRow } from '@/components/journal/home/QuickEntryRow';
import { PrepPantryCard, type PrepPantryView } from '@/components/journal/home/PrepPantryCard';
import { HomeTemplateCards } from '@/components/journal/home/HomeTemplateCards';
import { SavedMealCard } from '@/components/journal/SavedMealCard';
import { JournalDateSelector } from '@/components/journal/JournalDateSelector';
import { GridItemApp } from '@/components/home/GridItemApp';
import { NDSDisplay } from '@/components/journal/NDSDisplay';
import { SlotCard } from '@/components/journal/plans/SlotCard';
import { DayView } from '@/components/journal/plans/DayView';
import { WeekViewPanel } from '@/components/journal/plans/WeekViewPanel';
import { ProjectedNDSStrip } from '@/components/journal/plans/ProjectedNDSStrip';
import { ScheduleConflictBanner } from '@/components/journal/plans/ScheduleConflictBanner';
import { ProfileDefaultsBanner } from '@/components/journal/plans/ProfileDefaultsBanner';
import { ProgramDeliveryModules } from '@/components/journal/programs/ProgramDeliveryModules';
import { BaselinePrepModules } from '@/components/journal/programs/BaselinePrepModules';
import { BaselineWeekOneModules } from '@/components/journal/programs/BaselineWeekOneModules';
import { BaselineWeekTwoModules } from '@/components/journal/programs/BaselineWeekTwoModules';
import { BaselineWeekThreeModules } from '@/components/journal/programs/BaselineWeekThreeModules';
import { LoggedItemCard } from '@/components/journal/LoggedItemCard';
import { CompactLoggedCard } from '@/components/journal/CompactLoggedCard';
// Aurora naming collision: components/ui/aurora-background also exports
// `AuroraBackground` (generic page wrapper). Import it aliased so it can be
// cataloged separately (aurora-page-wrapper) without clashing with the journal
// AuroraBackground (aurora-background) imported above.
import { AuroraBackground as AuroraPageWrapper } from '@/components/ui/aurora-background';

import type { HomeContent } from '@/lib/contentTypes';
import type { SummaryRowModule } from '@/lib/summaryRowTypes';
import type { JournalEntry } from '@/lib/journal';
import type {
  ResolvedScheduleSlot,
  Plan,
  PlanDay,
  PlanSlot,
  PlanSlotBlock,
  PlannedMeal,
  PlannedMealExecutionState,
  PlanInputSnapshot,
  ScheduleConflict,
  NDSConfidence,
} from '@/lib/plans/types';
import type { PlanDisplayPrefs } from '@/lib/plans';
import type { MealDerivedData } from '@/lib/nds/types';
import type { ProgramDeliveryModuleDefinition } from '@/lib/programs/deliveryModuleTypes';
import type { BaselinePrepModuleAccess } from '@/lib/programs/runtimeUi';
import type {
  ProgramRuntimeSummary,
  ProgramEnrollment,
  ProgramVersion,
  ProgramCheckinResponse,
  ProgramCapacity,
} from '@/lib/programs/runtimeTypes';
import type { Measure } from '@/lib/units/convert';
import type { NDSData } from '@/lib/nds/useNDS';

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

const MOCK_SUMMARY_MODULES: SummaryRowModule[] = [
  {
    id: 'hydration',
    variant: 'summary_row',
    title: 'Hydration',
    subtitle: 'Today',
    image: '/images/home/fine-diet-approved-desktop.jpg',
    status: { label: 'Behind', level: 'warn', reason: '68% of goal' },
    primary: { value: 54, unit: 'oz', note: 'of 80 oz' },
    metrics: [
      { label: 'complete', value: '68%', unit: null, style: 'progress' },
      { label: 'last', value: '2:10p', unit: null, style: 'timestamp' },
    ],
    insight: { text: 'On pace if you add ~10 oz before 5pm.', confidence: 'low' },
    cta: { label: 'Add water', href: '#' },
    empty: { isEmpty: false },
    drilldown: { label: 'View details', href: '#' },
  },
  {
    id: 'sleep',
    variant: 'summary_row',
    title: 'Sleep',
    subtitle: 'Last night',
    image: '/images/home/fine-print-desktop.jpg',
    status: { label: 'Improving', level: 'ok', reason: 'Quality up vs 3-day avg' },
    primary: { value: '6h 35m', unit: null, note: 'Quality 3/5' },
    metrics: [
      { label: 'bedtime', value: '11:48p', unit: null, style: 'timestamp' },
      { label: 'wake', value: '6:23a', unit: null, style: 'timestamp' },
    ],
    insight: { text: 'Earlier dinner aligned with better sleep.', confidence: 'med' },
    cta: { label: 'Log sleep', href: '#' },
    empty: { isEmpty: false },
    drilldown: { label: 'View details', href: '#' },
  },
];

const MOCK_SUMMARY_EMPTY: SummaryRowModule[] = [
  {
    id: 'mood',
    variant: 'summary_row',
    title: 'Mood',
    subtitle: 'Today',
    image: '/images/home/fine-diet-approved-desktop.jpg',
    empty: {
      isEmpty: true,
      headline: 'No mood logged yet',
      body: 'Log how you feel to track patterns.',
      cta: { label: 'Log mood', href: '#' },
    },
    drilldown: { label: 'View details', href: '#' },
  },
];

const MOCK_FOOD_ITEMS = [
  { id: '1', name: 'Scrambled Eggs' },
  { id: '2', name: 'Avocado Toast' },
  { id: '3', name: 'Black Coffee' },
];

/* ── Packet 2A fixtures ─────────────────────────────────────────── */

// Fixed reference date so the style-guide preview is deterministic.
const MOCK_JOURNAL_DATE = new Date('2026-06-01T12:00:00');

function mockEntry(partial: Pick<JournalEntry, 'id' | 'type' | 'block' | 'payload'> & { timestamp?: Date }): JournalEntry {
  const ts = partial.timestamp ?? MOCK_JOURNAL_DATE;
  return {
    id: partial.id,
    type: partial.type,
    block: partial.block,
    payload: partial.payload,
    timestamp: ts,
    created_at: ts,
    updated_at: ts,
  };
}

// Intake entries for a single meal block (JournalBlockSection).
const MOCK_BLOCK_ENTRIES: JournalEntry[] = [
  mockEntry({
    id: 'blk-1',
    type: 'intake',
    block: 'morning',
    timestamp: new Date('2026-06-01T08:15:00'),
    payload: {
      name: 'Scrambled Eggs',
      quantity: 1,
      calories: 220,
      macros: { protein: 14, carbs: 2, fat: 16 },
    },
  }),
  mockEntry({
    id: 'blk-2',
    type: 'intake',
    block: 'morning',
    timestamp: new Date('2026-06-01T08:20:00'),
    payload: {
      name: 'Avocado Toast',
      quantity: 1,
      calories: 290,
      macros: { protein: 8, carbs: 30, fat: 16 },
    },
  }),
];

/* ── Packet 2B-B fixtures (extracted /journal/home modules) ─────── */

const MOCK_RHYTHM_SLOTS: ResolvedScheduleSlot[] = [
  { key: 'breakfast', enabled: true, target_time: '08:00', label: 'Breakfast', slot_block: 'morning', source: 'profile' },
  { key: 'lunch', enabled: true, target_time: '12:30', label: 'Lunch', slot_block: 'midday', source: 'profile' },
  { key: 'dinner', enabled: true, target_time: '18:30', label: 'Dinner', slot_block: 'evening', source: 'profile' },
];

const MOCK_NDS_DATA: NDSData = {
  date_local: '2026-06-01',
  person_id: 'preview',
  nds_score_100: 72,
  subscores_10: { wfr: 8, ps: 6, pnd: 7, fp: 5, as: 9, mnc: 6, ob: 4 },
  nds_version: 'preview',
  classifier_version: 'preview',
  _meta: { intake_count: 3, meal_count: 2 },
};

const MOCK_PANTRY_VIEW_READY: PrepPantryView = {
  headline: 'Review grocery readiness',
  body: 'See how your Pantry affects the grocery list for your active plan. Required amounts stay primary; deduction only applies on safe identity and unit matches.',
  primaryLabel: 'Review grocery',
  primaryHref: '#',
  secondaryLabel: 'Manage pantry',
  secondaryHref: '#',
  metrics: [
    { label: 'Covered by pantry', value: 8 },
    { label: 'Still to buy', value: 14 },
    { label: 'Needs review', value: 3 },
  ],
  blockerNote: 'Some grocery rows need review before Pantry can apply.',
};

const MOCK_PANTRY_VIEW_MISSING: PrepPantryView = {
  headline: 'Add items you already have',
  body: 'Saving on-hand Pantry items lets safe matches reduce what you still need to buy.',
  primaryLabel: 'Add pantry item',
  primaryHref: '#',
  secondaryLabel: 'Open grocery list',
  secondaryHref: '#',
  metrics: null,
  blockerNote: null,
};

const MOCK_PANTRY_VIEW_EMPTY: PrepPantryView = {
  headline: 'Prep & Pantry',
  body: 'Review your plan and grocery list, and keep on-hand items saved so future lists are easier to execute.',
  primaryLabel: 'Open plans',
  primaryHref: '#',
  secondaryLabel: 'Manage pantry',
  secondaryHref: '#',
  metrics: null,
  blockerNote: null,
};

/* ── Packet 2C-A fixtures (low-risk drop-in app components) ─────── */

// SummaryRowModule with no image → GridItemApp solid fallback. Inert drilldown.
const MOCK_GRID_ITEM_SOLID: SummaryRowModule = {
  id: 'movement',
  variant: 'summary_row',
  title: 'Movement',
  subtitle: 'Today',
  status: { label: 'On track', level: 'ok', reason: 'Met daily target' },
  primary: { value: 42, unit: 'min', note: 'of 30 min' },
  metrics: [
    { label: 'steps', value: '7.4k', unit: null, style: 'progress' },
    { label: 'last', value: '6:10p', unit: null, style: 'timestamp' },
  ],
  empty: { isEmpty: false },
  drilldown: { label: 'View details', href: '#' },
};

// NDSData score variants for NDSDisplay (flat, fixture-only).
const MOCK_NDS_HIGH: NDSData = {
  date_local: '2026-06-01',
  person_id: 'preview',
  nds_score_100: 88,
  subscores_10: { wfr: 9, ps: 8, pnd: 9, fp: 8, as: 9, mnc: 8, ob: 7 },
  nds_version: 'preview',
  classifier_version: 'preview',
};

const MOCK_NDS_MID: NDSData = {
  date_local: '2026-06-01',
  person_id: 'preview',
  nds_score_100: 55,
  subscores_10: { wfr: 6, ps: 5, pnd: 6, fp: 5, as: 6, mnc: 5, ob: 4 },
  nds_version: 'preview',
  classifier_version: 'preview',
};

const MOCK_NDS_LOW: NDSData = {
  date_local: '2026-06-01',
  person_id: 'preview',
  nds_score_100: 24,
  subscores_10: { wfr: 3, ps: 2, pnd: 3, fp: 2, as: 4, mnc: 2, ob: 2 },
  nds_version: 'preview',
  classifier_version: 'preview',
};

/* ── Packet 2C-B fixtures (Plans / Programs renderers) ──────────── */

const PREVIEW_TS = '2026-06-01T08:00:00Z';
const NDS_STAMP = { nds_version: 'preview', classifier_version: 'preview' };

function mockMealDerived(calories: number, protein: number): MealDerivedData {
  return {
    protein_score_10: 7.5,
    is_main_meal: calories >= 250,
    meal_calories: calories,
    meal_protein_g: protein,
    psq_multiplier: 1,
  };
}

function mockPlannedMeal(o: {
  id: string;
  name: string;
  slotId: string;
  calories?: number;
  protein?: number;
  execution_state?: PlannedMealExecutionState;
  confidence?: NDSConfidence;
}): PlannedMeal {
  const calories = o.calories ?? 430;
  const protein = o.protein ?? 28;
  return {
    ...NDS_STAMP,
    id: o.id,
    plan_id: 'plan-preview',
    plan_day_id: 'day-preview',
    plan_slot_id: o.slotId,
    person_id: 'preview',
    name: o.name,
    meal_type: 'breakfast',
    payload: { totals: { calories, protein_g: protein }, items: [] },
    source_template_id: null,
    source_imported_meal_id: null,
    reusable_provenance: null,
    execution_state: o.execution_state ?? 'pending',
    journal_entry_id: null,
    protein_score_10: 7.5,
    is_main_meal: calories >= 250,
    psq_multiplier: 1,
    meal_derived_data: mockMealDerived(calories, protein),
    nds_confidence: o.confidence ?? 'high',
    created_at: PREVIEW_TS,
    updated_at: PREVIEW_TS,
  };
}

function mockSlot(o: {
  id: string;
  block: PlanSlotBlock;
  label: string;
  time: string;
  ordinal: number;
}): PlanSlot {
  return {
    id: o.id,
    plan_day_id: 'day-preview',
    person_id: 'preview',
    slot_block: o.block,
    slot_ordinal: o.ordinal,
    slot_label: o.label,
    target_time: o.time,
    created_at: PREVIEW_TS,
    updated_at: PREVIEW_TS,
  };
}

function mockPlanDay(o: {
  id: string;
  date: string;
  score: number | null;
  confidence: NDSConfidence | null;
}): PlanDay {
  return {
    ...NDS_STAMP,
    id: o.id,
    plan_id: 'plan-preview',
    person_id: 'preview',
    date_local: o.date,
    notes: null,
    projected_nds_100: o.score,
    projected_wfr_10: null,
    projected_ps_10: null,
    projected_pnd_10: null,
    projected_fp_10: null,
    projected_as_10: null,
    projected_mnc_10: null,
    projected_ob_10: null,
    projection_confidence: o.confidence,
    projection_debug_json: null,
    created_at: PREVIEW_TS,
    updated_at: PREVIEW_TS,
  };
}

// Slots used by SlotCard / DayView previews.
const MOCK_SLOT_BREAKFAST = mockSlot({ id: 'slot-bf', block: 'morning', label: 'Breakfast', time: '08:00', ordinal: 0 });
const MOCK_SLOT_LUNCH = mockSlot({ id: 'slot-lunch', block: 'midday', label: 'Lunch', time: '12:30', ordinal: 1 });
const MOCK_SLOT_DINNER = mockSlot({ id: 'slot-dinner', block: 'evening', label: 'Dinner', time: '18:30', ordinal: 2 });

// Seven projected days for ProjectedNDSStrip / WeekViewPanel.
function buildWeek(scores: number[], confidence: NDSConfidence): PlanDay[] {
  return scores.map((score, i) =>
    mockPlanDay({
      id: `day-${i}`,
      date: `2026-06-0${i + 1}`,
      score,
      confidence,
    }),
  );
}
const MOCK_WEEK_HIGH = buildWeek([86, 88, 84, 90, 82, 87, 85], 'high');
const MOCK_WEEK_MID = buildWeek([58, 55, 61, 52, 60, 57, 54], 'medium');
const MOCK_WEEK_LOW = buildWeek([28, 24, 31, 22, 35, 26, 30], 'low');
const MOCK_WEEK_MEAL_COUNTS: Record<string, number> = {
  '2026-06-01': 3,
  '2026-06-02': 3,
  '2026-06-03': 2,
  '2026-06-04': 3,
  '2026-06-05': 2,
  '2026-06-06': 3,
  '2026-06-07': 3,
};

const MOCK_PLAN_SNAPSHOT: PlanInputSnapshot = {
  body: {
    age_years: 34,
    sex: 'female',
    height_cm: 168,
    weight_kg: 64,
    weight_as_of: null,
    body_fat_percent: null,
  },
  preferences: {
    dining_out_frequency: 'weekly',
    shopping_mode_preference: 'mixed',
    household_size: 2,
    eating_window: null,
    eating_window_start: null,
    eating_window_end: null,
    dietary_style: null,
    allergies: null,
  },
  targets: {
    daily_calorie_goal: 2000,
    macro_goals: null,
    nds_score_100_target: null,
    subscore_floors_10: null,
  },
  program_guidance: null,
};

const MOCK_PLAN_DISPLAY: PlanDisplayPrefs = {
  height_display_unit: 'in',
  weight_display_unit: 'lb',
};

const MOCK_PLAN: Plan = {
  ...NDS_STAMP,
  id: 'plan-preview',
  person_id: 'preview',
  title: 'Preview Week Plan',
  plan_shape: 'week',
  source: 'ai_generated',
  status: 'active',
  start_date: '2026-06-01',
  end_date: '2026-06-07',
  program_slug: null,
  program_run_id: null,
  input_snapshot_json: MOCK_PLAN_SNAPSHOT,
  created_at: PREVIEW_TS,
  updated_at: PREVIEW_TS,
};

const MOCK_CONFLICTS: ScheduleConflict[] = [
  {
    kind: 'latest',
    slot_key: 'dinner',
    message: 'Dinner is scheduled after your program’s latest allowed time.',
    suggested_adjustment: { target_time: '18:30' },
  },
  {
    kind: 'min_gap',
    slot_key: 'afternoon_snack',
    message: 'Lunch and afternoon snack are closer than the 3-hour minimum gap.',
    suggested_adjustment: { target_time: '15:30' },
  },
];

const MOCK_CONFLICTS_MANY: ScheduleConflict[] = [
  ...MOCK_CONFLICTS,
  {
    kind: 'earliest',
    slot_key: 'breakfast',
    message: 'Breakfast is earlier than the program’s earliest allowed time.',
    suggested_adjustment: { target_time: '07:30' },
  },
  {
    kind: 'required_vs_disabled',
    slot_key: 'lunch',
    message: 'Lunch is required by the program but currently disabled in your profile.',
    suggested_adjustment: { enabled: true },
  },
];

// Config-driven delivery modules. statusVisibility includes 'not_started' so
// they render with runtimeSummary=null; day bounds omitted intentionally.
const MOCK_DELIVERY_MODULES: ProgramDeliveryModuleDefinition[] = [
  {
    id: 'preview-overview',
    programSlug: 'preview',
    moduleType: 'guide',
    groupTitle: 'This week',
    eyebrow: 'Guide',
    title: 'Program overview',
    body: 'A short orientation to what this week focuses on and how to use the modules below.',
    statusVisibility: ['not_started', 'pre_start', 'active'],
    blocks: [
      { type: 'metrics', metrics: ['selected_start', 'current_day', 'capacity', 'content_progress'] },
      { type: 'list', items: ['Keep a steady rhythm', 'Notice energy + hunger', 'Repeat easy meals'] },
    ],
    cta: { label: 'Open guide', href: '#', tone: 'brand', microcopy: 'Preview link only.' },
  },
  {
    id: 'preview-practice',
    programSlug: 'preview',
    moduleType: 'practice_card',
    groupTitle: 'This week',
    eyebrow: 'Practice',
    title: 'This week’s practice',
    body: 'Pick one repeatable breakfast and lunch rhythm and run it for a few days.',
    statusVisibility: ['not_started', 'pre_start', 'active'],
    blocks: [
      {
        type: 'cards',
        cards: [
          { title: 'Anchor a breakfast', body: 'Choose one easy, repeatable breakfast.' },
          { title: 'Anchor a lunch', body: 'Pick a lunch you can return to without thinking.' },
          { title: 'Observe', body: 'Notice energy + hunger after meals.' },
        ],
      },
      { type: 'notice', eyebrow: 'Reminder', title: 'No overhaul needed', body: 'Rhythm beats strictness during the baseline window.', tone: 'sky' },
    ],
    safetyNotes: ['General wellness guidance only — not medical or clinical advice.'],
  },
];

// USDA-style measures so LoggedItemCard shows a unit dropdown.
const MOCK_MEASURES: Measure[] = [
  { unit: 'cup', grams: 240 },
  { unit: 'tbsp', grams: 15 },
];

// Cross-type entries + enabled keys for the DailySummary tracking tiles.
const MOCK_SUMMARY_ENABLED = ['water', 'sleep', 'mood', 'movement'];
const MOCK_SUMMARY_ENTRIES: JournalEntry[] = [
  mockEntry({
    id: 'sum-water',
    type: 'water',
    block: 'morning',
    timestamp: new Date('2026-06-01T10:05:00'),
    payload: { amount: 48, unit: 'oz' },
  }),
  mockEntry({
    id: 'sum-sleep',
    type: 'sleep',
    block: 'morning',
    timestamp: new Date('2026-06-01T07:00:00'),
    payload: { durationMinutes: 415, quality: 4 },
  }),
  mockEntry({
    id: 'sum-mood',
    type: 'mood',
    block: 'midday',
    timestamp: new Date('2026-06-01T13:30:00'),
    payload: { score: 4 },
  }),
  mockEntry({
    id: 'sum-move',
    type: 'movement',
    block: 'evening',
    timestamp: new Date('2026-06-01T18:10:00'),
    payload: { type: 'Walk', minutes: 35, intensity: 2 },
  }),
];

/* ── Packet 2C-C fixtures (Baseline weekly guidance) ────────────── */

// Minimal, fixture-only ProgramRuntimeSummary. The Baseline week modules only
// read resolved_status, current_day, enrollment.current_capacity, and (week 3)
// latest_checkin_response — the rest is filled with inert, type-complete stubs.
// No API/auth/Supabase; nothing here is fetched or mutated.
function mockCheckinResponse(day: number): ProgramCheckinResponse {
  return {
    id: 'resp-preview',
    enrollment_id: 'enr-preview',
    checkin_template_id: null,
    checkin_day: day,
    response_status: 'completed',
    response_payload_json: {},
    skipped_reason: null,
    responded_at: PREVIEW_TS,
    skipped_at: null,
    input_snapshot_json: {},
    computed_metrics_snapshot_json: {},
    metadata: {},
    created_at: PREVIEW_TS,
    updated_at: PREVIEW_TS,
  };
}

function mockRuntimeSummary(o: {
  currentDay: number;
  capacity: ProgramCapacity;
  latestCheckinResponse?: ProgramCheckinResponse | null;
}): ProgramRuntimeSummary {
  const enrollment: ProgramEnrollment = {
    id: 'enr-preview',
    person_id: 'preview',
    program_id: 'prog-baseline',
    program_slug: 'baseline',
    program_version_id: 'ver-preview',
    source_type: 'entitlement',
    source_ref: null,
    entitlement_key: null,
    assignment_id: null,
    purchase_date: null,
    selected_start_date: '2026-06-01',
    started_at: PREVIEW_TS,
    completed_at: null,
    status: 'active',
    timezone: 'America/New_York',
    current_capacity: o.capacity,
    paused_days_total: 0,
    pause_until: null,
    input_snapshot_json: {},
    computed_metrics_snapshot_json: {},
    metadata: {},
    created_by_user_id: null,
    created_at: PREVIEW_TS,
    updated_at: PREVIEW_TS,
  };
  const version: ProgramVersion = {
    id: 'ver-preview',
    program_id: 'prog-baseline',
    version_key: 'baseline_v1',
    version_label: 'Baseline v1',
    version_number: 1,
    status: 'published',
    duration_days: 21,
    default_unlock_day: 0,
    published_at: PREVIEW_TS,
    metadata: {},
    created_by_user_id: null,
    created_at: PREVIEW_TS,
    updated_at: PREVIEW_TS,
  };
  return {
    enrollment,
    version,
    program: {
      id: 'prog-baseline',
      slug: 'baseline',
      title: 'Baseline',
      tagline: null,
      description: null,
      storefront_href: null,
    },
    resolved_status: 'active',
    current_day: o.currentDay,
    timezone: 'America/New_York',
    next_checkin_template: null,
    latest_checkin_response: o.latestCheckinResponse ?? null,
    latest_recommendation: null,
    resolved_at: PREVIEW_TS,
  };
}

function baselineCapacityFromVariant(variant: string): ProgramCapacity {
  return variant === 'low' ? 'low' : variant === 'high' ? 'high' : 'steady';
}

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

    case 'grid-section-app': {
      const modules = variant === 'empty-state' ? MOCK_SUMMARY_EMPTY : MOCK_SUMMARY_MODULES;
      return (
        <div className="bg-brand-900 px-3 py-8">
          <GridSectionApp modules={modules} />
        </div>
      );
    }

    case 'grid-app-section-home':
      return (
        <div className="bg-brand-900 px-3 py-8">
          <GridAppSectionHome />
        </div>
      );

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
      const configs: Record<string, { title: string; status: string; statusColor: string; ctaLabel: string }> = {
        active: { title: 'Journal', status: 'Active', statusColor: 'text-denim-400', ctaLabel: 'Open Journal' },
        inactive: { title: 'Programs', status: 'Explore', statusColor: 'text-white/40', ctaLabel: 'View Programs' },
        'expiring-soon': { title: 'Journal', status: 'Expires in 7 days', statusColor: 'text-amber-400', ctaLabel: 'Renew Access' },
      };
      const c = configs[variant] || configs.active;
      return (
        <div className="bg-brand-900 px-5 py-8 max-w-2xl mx-auto space-y-3">
          <AccessCard
            title={c.title}
            status={c.status}
            statusColor={c.statusColor}
            ctaLabel={c.ctaLabel}
            ctaHref="#"
          />
        </div>
      );
    }

    case 'quick-action':
      return (
        <div className="bg-brand-900 px-5 py-8 max-w-2xl mx-auto">
          <div className="grid grid-cols-2 gap-3">
            <QuickActionButton
              href="#"
              label={variant === 'accent' ? 'Log Food' : 'Gut Check'}
              sub={variant === 'accent' ? 'Fast add meals & snacks' : 'Quick assessment'}
              accent={variant === 'accent'}
            />
            <QuickActionButton href="#" label="Shop" sub="Products & supplements" />
          </div>
        </div>
      );

    case 'recommendation-card':
      return (
        <div className="bg-brand-900 px-5 py-8 max-w-2xl mx-auto space-y-3">
          <RecommendationCard
            rec={{
              title: 'Try the Gut Check Assessment',
              description:
                'A quick 3-minute check-in to understand your digestive patterns and get personalized recommendations.',
              ctaLabel: 'Take Assessment',
              ctaHref: '#',
            }}
          />
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

    case 'nutrition-density-gauge':
      return (
        <div className="bg-brand-900 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-[420px]">
            <NutritionDensityGauge
              value={variant === 'empty' ? null : 72}
              isLoading={variant === 'loading'}
              animate={false}
            />
          </div>
        </div>
      );

    case 'stacked-page-section':
      return (
        <div className="bg-neutral-950">
          <StackedPageHero className="bg-gradient-to-b from-neutral-900 to-brand-700 px-6 pt-12 pb-16">
            <div className="mx-auto w-full max-w-[650px] text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 antialiased">
                Layer 0 · Hero
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-white antialiased">Stacked Page Hero</h2>
              <p className="mt-2 text-sm font-light text-white/60 antialiased">
                Flat-bottom base layer (z-0). Sections below overlap upward.
              </p>
            </div>
          </StackedPageHero>

          <StackedPageSection layer={1} className="bg-brand-900">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 antialiased">
              Layer 1 · z-10
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white antialiased">First stacked section</h3>
            <p className="mt-2 text-sm font-light text-white/60 antialiased">
              -mt-8 overlap and rounded-t-[2rem] top edge. Solid background so the overlap reads.
            </p>
            <div className="mt-4 h-24 rounded-[24px] bg-neutral-800/60" />
          </StackedPageSection>

          <StackedPageSection layer={2} className="bg-neutral-900">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40 antialiased">
              Layer 2 · z-20
            </p>
            <h3 className="mt-2 text-xl font-semibold text-white antialiased">Second stacked section</h3>
            <p className="mt-2 text-sm font-light text-white/60 antialiased">
              Alternating tone keeps adjacent layers distinct. Inner cards live inside the section.
            </p>
            <div className="mt-4 h-24 rounded-[24px] bg-neutral-800/60" />
          </StackedPageSection>
        </div>
      );

    case 'app-top-nav':
      return (
        <div className="relative bg-brand-900 h-[220px] overflow-hidden">
          <AppTopNav />
          <div className="pt-16 px-6">
            <p className="text-sm text-white/40 antialiased">
              Fixed top nav (pinned to the iframe top). App content renders below the pt-9 offset.
            </p>
          </div>
        </div>
      );

    case 'journal-footer-nav':
      return (
        <div className="relative bg-brand-900 h-[260px] overflow-hidden">
          <div className="px-6 pt-8">
            <p className="text-sm text-white/40 antialiased">
              Fixed bottom tab bar (pinned to the iframe bottom). Active tab follows the route —
              defaults to <span className="font-mono text-white/60">log</span> here. Tap the + control
              to open Quick Entry.
            </p>
          </div>
          <JournalFooterNav />
        </div>
      );

    case 'app-shell':
      return (
        <AppShell>
          <div className="px-6 py-10 max-w-[650px] mx-auto">
            <h2 className="text-2xl font-semibold text-white antialiased">App Shell content</h2>
            <p className="mt-2 text-sm font-light text-white/60 antialiased">
              This area is the <span className="font-mono text-white/60">children</span> slot. The dark
              brand-900 base, white text, and pt-9 offset (clearing the fixed AppTopNav) are provided
              by the shell.
            </p>
            <div className="mt-5 space-y-3">
              <div className="h-20 rounded-2xl bg-neutral-800/60" />
              <div className="h-20 rounded-2xl bg-neutral-800/60" />
            </div>
          </div>
        </AppShell>
      );

    case 'journal-block-section': {
      const entries = variant === 'empty' ? [] : MOCK_BLOCK_ENTRIES;
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-[650px] mx-auto">
          <div className="rounded-2xl bg-neutral-900/60 overflow-hidden">
            <JournalBlockSection block="morning" date={MOCK_JOURNAL_DATE} entries={entries} />
          </div>
        </div>
      );
    }

    case 'daily-summary': {
      const entries = variant === 'empty' ? [] : MOCK_SUMMARY_ENTRIES;
      return (
        <div className="bg-brand-900 px-4 py-8">
          <DailySummary date={MOCK_JOURNAL_DATE} entries={entries} enabledKeys={MOCK_SUMMARY_ENABLED} />
        </div>
      );
    }

    case 'today-rhythm': {
      const loading = variant === 'loading';
      const slots = variant === 'empty' ? [] : MOCK_RHYTHM_SLOTS;
      return (
        <div className="bg-[#16110d] px-4 py-8">
          <TodayRhythm slots={slots} todayEntries={[]} loading={loading} dayPlanHref="#" />
        </div>
      );
    }

    case 'nutrition-density-scroller': {
      const isLoading = variant === 'loading';
      const data = variant === 'empty' ? null : MOCK_NDS_DATA;
      return (
        <div className="bg-[#16110d] px-4 py-8">
          <NutritionDensityScroller data={data} isLoading={isLoading} />
        </div>
      );
    }

    case 'quick-entry-row':
      return (
        <div className="bg-[#16110d] px-4 py-8">
          <QuickEntryRow />
        </div>
      );

    case 'prep-pantry-card': {
      const view =
        variant === 'missing-items'
          ? MOCK_PANTRY_VIEW_MISSING
          : variant === 'empty'
          ? MOCK_PANTRY_VIEW_EMPTY
          : MOCK_PANTRY_VIEW_READY;
      return (
        <div className="bg-[#16110d] px-4 py-8">
          <PrepPantryCard view={view} />
        </div>
      );
    }

    case 'home-template-cards':
      return (
        <div className="bg-[#16110d] px-4 py-8">
          <HomeTemplateCards />
        </div>
      );

    /* ── Packet 2C-A ─────────────────────────────────────────────── */

    case 'saved-meal-card': {
      const showDensity = variant !== 'minimal';
      return (
        <div className="bg-brand-900 px-5 py-8 flex justify-center">
          <SavedMealCard
            id="preview-meal"
            name="Greek Yogurt Bowl with Berries"
            nutritionDensity={showDensity ? 82 : undefined}
          />
        </div>
      );
    }

    case 'journal-date-selector': {
      // "past-day" seeds an initial date 3 days ago so the next chevron is enabled.
      const initialDate =
        variant === 'past-day'
          ? new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
          : new Date();
      return (
        <div className="bg-brand-900 min-h-[160px]">
          <JournalDateSelector key={variant} initialDate={initialDate} />
        </div>
      );
    }

    case 'grid-item-app': {
      const mod =
        variant === 'solid'
          ? MOCK_GRID_ITEM_SOLID
          : variant === 'empty'
          ? MOCK_SUMMARY_EMPTY[0]
          : MOCK_SUMMARY_MODULES[0];
      return (
        <div className="bg-brand-900 px-4 py-8">
          <div className="max-w-[1000px] mx-auto">
            <GridItemApp module={mod} />
          </div>
        </div>
      );
    }

    case 'nds-display': {
      if (variant === 'loading') {
        return (
          <div className="bg-brand-900 px-4 py-8 max-w-md mx-auto">
            <NDSDisplay data={null} isLoading />
          </div>
        );
      }
      const data =
        variant === 'score-low'
          ? MOCK_NDS_LOW
          : variant === 'score-mid'
          ? MOCK_NDS_MID
          : MOCK_NDS_HIGH;
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-md mx-auto">
          <NDSDisplay data={data} />
        </div>
      );
    }

    /* ── Packet 2C-B (Plans / Programs renderers) ────────────────── */

    case 'slot-card': {
      const noop = () => {};
      let meals: PlannedMeal[];
      if (variant === 'empty') {
        meals = [];
      } else if (variant === 'multi-meal') {
        meals = [
          mockPlannedMeal({ id: 'm1', name: 'Greek Yogurt Bowl', slotId: MOCK_SLOT_BREAKFAST.id, calories: 320, protein: 24 }),
          mockPlannedMeal({ id: 'm2', name: 'Protein Smoothie', slotId: MOCK_SLOT_BREAKFAST.id, calories: 280, protein: 30, confidence: 'medium' }),
        ];
      } else if (variant === 'logged') {
        meals = [
          mockPlannedMeal({ id: 'm1', name: 'Salmon & Greens', slotId: MOCK_SLOT_BREAKFAST.id, calories: 520, protein: 38, execution_state: 'eaten' }),
        ];
      } else {
        meals = [
          mockPlannedMeal({ id: 'm1', name: 'Oatmeal with Berries & Almonds', slotId: MOCK_SLOT_BREAKFAST.id, calories: 410, protein: 18 }),
        ];
      }
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-xl mx-auto">
          <SlotCard
            slot={MOCK_SLOT_BREAKFAST}
            meals={meals}
            onRegenerate={meals.length ? noop : undefined}
            onEdit={meals.length ? noop : undefined}
            onRemove={meals.length ? noop : undefined}
            onExecute={meals.length ? noop : undefined}
            onAdd={meals.length ? undefined : noop}
            onEditTime={noop}
            dayDate="2026-06-01"
          />
        </div>
      );
    }

    case 'day-view': {
      const noop = () => {};
      const day = mockPlanDay({ id: 'day-preview', date: '2026-06-01', score: 78, confidence: 'high' });
      let slots: PlanSlot[];
      let meals: PlannedMeal[];
      if (variant === 'empty') {
        slots = [];
        meals = [];
      } else if (variant === 'multi-meal') {
        slots = [MOCK_SLOT_BREAKFAST, MOCK_SLOT_LUNCH, MOCK_SLOT_DINNER];
        meals = [
          mockPlannedMeal({ id: 'd-m1', name: 'Oatmeal with Berries', slotId: MOCK_SLOT_BREAKFAST.id, calories: 410, protein: 18 }),
          mockPlannedMeal({ id: 'd-m2', name: 'Chicken & Quinoa Bowl', slotId: MOCK_SLOT_LUNCH.id, calories: 540, protein: 42 }),
          mockPlannedMeal({ id: 'd-m3', name: 'Side Salad', slotId: MOCK_SLOT_LUNCH.id, calories: 180, protein: 6, confidence: 'medium' }),
          mockPlannedMeal({ id: 'd-m4', name: 'Salmon & Greens', slotId: MOCK_SLOT_DINNER.id, calories: 520, protein: 38, execution_state: 'eaten' }),
        ];
      } else {
        slots = [MOCK_SLOT_BREAKFAST, MOCK_SLOT_LUNCH, MOCK_SLOT_DINNER];
        meals = [
          mockPlannedMeal({ id: 'd-m1', name: 'Oatmeal with Berries', slotId: MOCK_SLOT_BREAKFAST.id, calories: 410, protein: 18 }),
          mockPlannedMeal({ id: 'd-m2', name: 'Chicken & Quinoa Bowl', slotId: MOCK_SLOT_LUNCH.id, calories: 540, protein: 42 }),
        ];
      }
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-xl mx-auto">
          <DayView
            day={day}
            slots={slots}
            meals={meals}
            editingMealId={null}
            creatingSlotId={null}
            onRegenerate={noop}
            onEdit={noop}
            onRemove={noop}
            onMove={noop}
            onCopy={noop}
            onAdd={noop}
            onEditTime={noop}
            busy={false}
            dayDate="2026-06-01"
          />
        </div>
      );
    }

    case 'week-view-panel': {
      const noop = () => {};
      const hasPlan = variant !== 'no-plan';
      const canGenerate = variant !== 'incomplete';
      const days = hasPlan ? MOCK_WEEK_HIGH : [];
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-xl mx-auto">
          <WeekViewPanel
            plan={hasPlan ? MOCK_PLAN : null}
            days={days}
            slots={[]}
            meals={[]}
            snapshot={MOCK_PLAN_SNAPSHOT}
            display={MOCK_PLAN_DISPLAY}
            canGenerate={canGenerate}
            missingReasons={canGenerate ? [] : ['Add your date of birth', 'Set your height and weight']}
            onGenerate={noop}
            generating={false}
            conflicts={variant === 'incomplete' ? MOCK_CONFLICTS : []}
            onApplyConflict={noop}
          />
        </div>
      );
    }

    case 'projected-nds-strip': {
      if (variant === 'empty') {
        return (
          <div className="bg-brand-900 px-4 py-8 max-w-xl mx-auto">
            <ProjectedNDSStrip planId="plan-preview" days={[]} mealCountByDay={{}} />
          </div>
        );
      }
      const days =
        variant === 'low' ? MOCK_WEEK_LOW : variant === 'mid' ? MOCK_WEEK_MID : MOCK_WEEK_HIGH;
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-xl mx-auto">
          <ProjectedNDSStrip planId="plan-preview" days={days} mealCountByDay={MOCK_WEEK_MEAL_COUNTS} />
        </div>
      );
    }

    case 'schedule-conflict-banner': {
      const noop = () => {};
      const conflicts = variant === 'expandable' ? MOCK_CONFLICTS_MANY : MOCK_CONFLICTS;
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-xl mx-auto">
          <ScheduleConflictBanner conflicts={conflicts} onApply={noop} />
        </div>
      );
    }

    case 'profile-defaults-banner': {
      if (variant === 'loading') {
        return (
          <div className="bg-brand-900 px-4 py-8 max-w-xl mx-auto">
            <ProfileDefaultsBanner snapshot={null} display={null} canGenerate={false} missingReasons={[]} />
          </div>
        );
      }
      const canGenerate = variant !== 'incomplete';
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-xl mx-auto">
          <ProfileDefaultsBanner
            snapshot={MOCK_PLAN_SNAPSHOT}
            display={MOCK_PLAN_DISPLAY}
            canGenerate={canGenerate}
            missingReasons={canGenerate ? [] : ['Add your date of birth', 'Set your height and weight']}
          />
        </div>
      );
    }

    case 'program-delivery-modules':
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-2xl mx-auto">
          <ProgramDeliveryModules runtimeSummary={null} modules={MOCK_DELIVERY_MODULES} />
        </div>
      );

    case 'baseline-prep-modules': {
      const access: BaselinePrepModuleAccess = variant === 'reference' ? 'reference' : 'primary';
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-2xl mx-auto">
          <BaselinePrepModules runtimeSummary={null} progressSummary={null} access={access} />
        </div>
      );
    }

    case 'logged-item-card': {
      const noop = () => {};
      const withUnits = variant === 'with-units';
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-md mx-auto">
          <LoggedItemCard
            id="preview-item"
            name="Grilled Chicken Breast"
            quantity={1}
            unit={withUnits ? 'cup' : 'serving'}
            quantityG={withUnits ? 240 : null}
            servingSizeG={withUnits ? 120 : null}
            measures={withUnits ? MOCK_MEASURES : null}
            protein={43}
            carbs={0}
            fat={5}
            editHref="#"
            onDelete={noop}
            onEntryChange={noop}
          />
        </div>
      );
    }

    case 'compact-logged-card': {
      const noop = () => {};
      const entry =
        variant === 'water'
          ? mockEntry({ id: 'c-water', type: 'water', block: 'morning', payload: { amount: 16, unit: 'oz' } })
          : variant === 'sleep'
          ? mockEntry({ id: 'c-sleep', type: 'sleep', block: 'morning', payload: { durationMinutes: 455, quality: 4 } })
          : mockEntry({ id: 'c-mood', type: 'mood', block: 'morning', payload: { score: 7, note: 'Steady energy through the afternoon' } });
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-md mx-auto">
          <CompactLoggedCard entry={entry} editHref="#" onDelete={noop} />
        </div>
      );
    }

    /* ── Packet 2C-C (Baseline weekly guidance + aurora wrapper) ──── */

    case 'baseline-week-one-modules': {
      const checkinDue = variant === 'checkin-due';
      const summary = mockRuntimeSummary({
        currentDay: checkinDue ? 7 : 3,
        capacity: baselineCapacityFromVariant(variant),
      });
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-2xl mx-auto">
          <BaselineWeekOneModules
            runtimeSummary={summary}
            checkinDue={checkinDue}
            checkinAnchorId="preview-checkin"
          />
        </div>
      );
    }

    case 'baseline-week-two-modules': {
      const checkinDue = variant === 'checkin-due';
      const summary = mockRuntimeSummary({
        currentDay: checkinDue ? 14 : 10,
        capacity: baselineCapacityFromVariant(variant),
      });
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-2xl mx-auto">
          <BaselineWeekTwoModules
            runtimeSummary={summary}
            checkinDue={checkinDue}
            checkinAnchorId="preview-checkin"
          />
        </div>
      );
    }

    case 'baseline-week-three-modules': {
      const checkinDue = variant === 'checkin-due';
      const recommendation = variant === 'recommendation';
      const summary = mockRuntimeSummary({
        currentDay: checkinDue || recommendation ? 21 : 17,
        capacity: baselineCapacityFromVariant(variant),
        latestCheckinResponse: recommendation ? mockCheckinResponse(21) : null,
      });
      return (
        <div className="bg-brand-900 px-4 py-8 max-w-2xl mx-auto">
          <BaselineWeekThreeModules
            runtimeSummary={summary}
            checkinDue={checkinDue}
            checkinAnchorId="preview-checkin"
            recommendationAnchorId="preview-recommendation"
          />
        </div>
      );
    }

    case 'aurora-page-wrapper': {
      const v: 'light' | 'dark' = variant === 'light' ? 'light' : 'dark';
      return (
        <AuroraPageWrapper variant={v}>
          <div className="relative z-10 px-6 py-20 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60 antialiased">
              Aurora Page Wrapper
            </p>
            <h2 className="mt-2 text-2xl font-semibold antialiased">Animated teal aurora layer</h2>
            <p className="mt-2 text-sm opacity-70 antialiased">
              Generic full-screen wrapper (components/ui/aurora-background) — distinct from the
              journal AuroraBackground ambient layer.
            </p>
          </div>
        </AuroraPageWrapper>
      );
    }

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
      <div className="min-h-0">
        <ModuleRender slug={slug} variant={variant} />
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Static generation                                                  */
/* ------------------------------------------------------------------ */

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = MODULE_STYLE_CATALOG.map((mod) => ({
    params: { slug: mod.slug },
  }));
  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<EmbedProps> = async ({ params }) => {
  const slug = params?.slug as string;
  const mod = MODULE_STYLE_CATALOG.find((m) => m.slug === slug);
  if (!mod) return { notFound: true };
  return { props: { slug } };
};
