/**
 * Behavioral coverage for Day Plans Library open + Make a copy.
 *
 * These tests mount the canonical Day designer and exercise the real
 * Open → select → hydrate and Make a copy flows instead of scanning source.
 *
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { dayPlanDraftSignature } from '@/lib/plans/dayPlanDraftStore';
import type { PlanDayTemplate, PlanDayTemplateMeal } from '@/lib/plans/types';

const mockRouter = {
  isReady: true,
  query: {} as Record<string, string | string[] | undefined>,
  asPath: '/app/plans/day',
  pathname: '/app/plans/day',
  push: jest.fn(async (href: string) => {
    mockRouter.asPath = href;
    const dayPlanId = new URL(href, 'http://local.test').searchParams.get('dayPlanId');
    mockRouter.query = dayPlanId ? { dayPlanId } : {};
  }),
  replace: jest.fn(),
};

const mockPlanService = {
  listPlanDayTemplates: jest.fn(),
  getPlanDayTemplate: jest.fn(),
  getPlanDayDraftSeed: jest.fn(),
  duplicatePlanDayTemplate: jest.fn(),
  updatePlanDayTemplate: jest.fn(),
  savePlanDayTemplate: jest.fn(),
};

jest.mock('next/router', () => ({
  useRouter: () => mockRouter,
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => React.createElement('a', { href, ...rest }, children),
}));

jest.mock('@/lib/plans', () => {
  const actual = jest.requireActual('@/lib/plans');
  return {
    ...actual,
    planService: mockPlanService,
  };
});

jest.mock('@/components/journal/JournalFooterNav', () => ({
  JournalFooterNav: () =>
    React.createElement('nav', { 'data-testid': 'journal-footer-nav' }, 'footer'),
}));

jest.mock('@/components/journal/plans/reusable/TemplateMealComposerPanel', () => ({
  TemplateMealComposerPanel: (props: {
    mode: 'create' | 'edit';
    meal?: PlanDayTemplateMeal;
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'meal-composer',
        'data-mode': props.mode,
        'data-meal-id': props.meal?.source_planned_meal_id ?? '',
      },
      props.mode === 'edit' ? props.meal?.name ?? 'edit' : 'create-empty',
    ),
}));

import DayPlanDesignerPage from '@/pages/journal/plans/day';

function savedMeal(
  id: string,
  name: string,
  mealType: PlanDayTemplateMeal['meal_type'],
): PlanDayTemplateMeal {
  return {
    source_planned_meal_id: id,
    name,
    meal_type: mealType,
    payload: {
      items: [{ food_id: `food-${id}`, quantity_g: 120 }],
      totals: { calories: 410, protein_g: 28, carbs_g: 32, fat_g: 12 },
      source_meal_document_id: `doc-${id}`,
    },
    protein_score_10: 7.1,
    is_main_meal: true,
    psq_multiplier: 1,
    meal_derived_data: {
      protein_score_10: 7.1,
      is_main_meal: true,
      meal_calories: 410,
      meal_protein_g: 28,
      psq_multiplier: 1,
    },
    nds_confidence: 'high',
    source_template_id: `doc-${id}`,
    source_imported_meal_id: null,
    nds_version: 'nds_daily_2026-01-26.v10',
    classifier_version: 'processing_classifier_2026-02-08.v2',
  };
}

const SEED_SLOTS: PlanDayTemplate['slots'] = [
  {
    source_plan_slot_id: 'seed-slot-morning',
    slot_ordinal: 1,
    slot_block: 'morning',
    slot_label: 'Breakfast',
    target_time: '08:00',
    meals: [],
  },
  {
    source_plan_slot_id: 'seed-slot-midday',
    slot_ordinal: 2,
    slot_block: 'midday',
    slot_label: 'Lunch',
    target_time: '12:30',
    meals: [],
  },
];

function planA(): PlanDayTemplate {
  return {
    id: 'day-plan-a',
    person_id: 'person-1',
    name: 'Training Day',
    description: 'High-protein weekday with oats and salmon',
    scope: 'day',
    source_plan_id: 'plan-source',
    source_plan_day_id: 'source-day-a',
    source_date_local: '2026-09-01',
    slots: [
      {
        source_plan_slot_id: 'slot-breakfast',
        slot_ordinal: 1,
        slot_block: 'morning',
        slot_label: 'Breakfast',
        target_time: '08:00',
        meals: [savedMeal('meal-oats', 'Overnight oats', 'breakfast')],
      },
      {
        source_plan_slot_id: 'slot-lunch',
        slot_ordinal: 2,
        slot_block: 'midday',
        slot_label: 'Lunch',
        target_time: '12:30',
        meals: [savedMeal('meal-salmon', 'Salmon bowl', 'lunch')],
      },
      {
        source_plan_slot_id: 'slot-dinner',
        slot_ordinal: 3,
        slot_block: 'evening',
        slot_label: 'Dinner',
        target_time: '18:30',
        meals: [],
      },
    ],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-10T10:00:00.000Z',
  };
}

function planACopy(): PlanDayTemplate {
  const original = planA();
  return {
    ...original,
    id: 'day-plan-a-copy',
    name: 'Training Day (Copy)',
    created_at: '2026-09-15T17:00:00.000Z',
    updated_at: '2026-09-15T17:00:00.000Z',
  };
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button as HTMLButtonElement;
}

function findByAriaLabel(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    (candidate.getAttribute('aria-label') || '').includes(label),
  );
  if (!button) throw new Error(`Labeled button not found: ${label}`);
  return button as HTMLButtonElement;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Day designer Open and Make a copy behavior', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { React: typeof React }).React = React;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    window.confirm = jest.fn(() => true);
    mockRouter.isReady = true;
    mockRouter.query = {};
    mockRouter.asPath = '/app/plans/day';
    mockRouter.push.mockClear();
    mockRouter.replace.mockClear();
    jest.clearAllMocks();

    mockPlanService.listPlanDayTemplates.mockResolvedValue([planA()]);
    mockPlanService.getPlanDayDraftSeed.mockResolvedValue({
      person_id: 'person-1',
      slots: SEED_SLOTS,
    });
    mockPlanService.getPlanDayTemplate.mockImplementation(async (id: string) => {
      if (id === planA().id) return planA();
      if (id === planACopy().id) return planACopy();
      throw new Error(`unexpected template id ${id}`);
    });
    mockPlanService.duplicatePlanDayTemplate.mockResolvedValue(planACopy());

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function mountDesigner() {
    await act(async () => {
      root.render(React.createElement(DayPlanDesignerPage));
    });
    await flush();
  }

  async function openSavedPlanA(options?: { delayGet?: boolean }) {
    let releaseGet: ((value: PlanDayTemplate) => void) | null = null;
    if (options?.delayGet) {
      mockPlanService.getPlanDayTemplate.mockImplementation(
        () =>
          new Promise<PlanDayTemplate>((resolve) => {
            releaseGet = resolve;
          }),
      );
    }

    act(() => {
      findButton(container, 'Open').click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      findButton(container, 'Training Day').click();
    });
    await flush();

    return {
      async completeGet(template: PlanDayTemplate) {
        await act(async () => {
          releaseGet?.(template);
          await Promise.resolve();
          await Promise.resolve();
        });
      },
    };
  }

  it('opens a saved Day Plan with meals into the designer without dropping slot meals', async () => {
    await mountDesigner();
    const pending = await openSavedPlanA({ delayGet: true });

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(mockRouter.push).toHaveBeenCalledWith(
      APP_ROUTE_BUILDERS.planDayDesigner('day-plan-a'),
      undefined,
      { shallow: true },
    );
    expect(mockRouter.asPath).toBe('/app/plans/day?dayPlanId=day-plan-a');

    const name = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    const description = container.querySelector(
      'textarea[aria-label="Day Plan description"]',
    ) as HTMLTextAreaElement;
    expect(name.value).toBe('Training Day');
    expect(description.value).toBe('High-protein weekday with oats and salmon');
    expect(container.textContent).toContain('Breakfast');
    expect(container.textContent).toContain('Lunch');
    expect(container.textContent).toContain('Dinner');
    expect(container.textContent).toContain('Planned 2 of 3');
    expect(container.textContent).toContain('2 Meals');
    expect(container.querySelectorAll('span.bg-current').length).toBe(2);
    expect(container.querySelectorAll('span.border-current').length).toBe(1);

    await pending.completeGet(planA());
    await flush();

    expect(mockPlanService.getPlanDayTemplate).toHaveBeenCalledWith('day-plan-a');
    expect(name.value).toBe('Training Day');
    expect(container.textContent).toContain('Planned 2 of 3');
    expect(container.textContent).toContain('2 Meals');
  });

  it('opens a planned occasion in edit mode and keeps Make a copy enabled', async () => {
    await mountDesigner();
    await openSavedPlanA();
    await flush();

    const copyButton = findButton(container, 'Make a copy');
    expect(copyButton.disabled).toBe(false);

    act(() => {
      findByAriaLabel(container, 'Expand Breakfast').click();
    });

    const composer = container.querySelector('[data-testid="meal-composer"]') as HTMLElement;
    expect(composer).not.toBeNull();
    expect(composer.getAttribute('data-mode')).toBe('edit');
    expect(composer.getAttribute('data-meal-id')).toBe('meal-oats');
    expect(composer.textContent).toContain('Overnight oats');
    expect(findButton(container, 'Make a copy').disabled).toBe(false);

    act(() => {
      findByAriaLabel(container, 'Collapse Breakfast').click();
    });
    act(() => {
      findByAriaLabel(container, 'Expand Dinner').click();
    });
    const createComposer = container.querySelector('[data-testid="meal-composer"]') as HTMLElement;
    expect(createComposer.getAttribute('data-mode')).toBe('create');
    expect(findButton(container, 'Make a copy').disabled).toBe(false);
  });

  it('keeps a freshly opened saved plan clean so accordion open does not dirty it', async () => {
    await mountDesigner();
    await openSavedPlanA();
    await flush();

    expect(dayPlanDraftSignature(planA())).toBe(dayPlanDraftSignature(planA()));
    expect(findButton(container, 'Make a copy').disabled).toBe(false);
    expect(findButton(container, 'Save').disabled).toBe(true);

    act(() => {
      findByAriaLabel(container, 'Expand Lunch').click();
    });
    act(() => {
      findByAriaLabel(container, 'Collapse Lunch').click();
    });

    expect(findButton(container, 'Make a copy').disabled).toBe(false);
    expect(findButton(container, 'Save').disabled).toBe(true);
    expect(window.localStorage.length).toBe(0);
  });

  it('copies the loaded Day Plan, preserves meals, and makes the copy the active designer object', async () => {
    await mountDesigner();
    await openSavedPlanA();
    await flush();

    let releaseGet: ((value: PlanDayTemplate) => void) | null = null;
    mockPlanService.getPlanDayTemplate.mockImplementation(
      () =>
        new Promise<PlanDayTemplate>((resolve) => {
          releaseGet = resolve;
        }),
    );

    await act(async () => {
      findButton(container, 'Make a copy').click();
    });
    await flush();

    expect(mockPlanService.duplicatePlanDayTemplate).toHaveBeenCalledTimes(1);
    expect(mockPlanService.duplicatePlanDayTemplate).toHaveBeenCalledWith('day-plan-a');
    expect(mockRouter.push).toHaveBeenLastCalledWith(
      APP_ROUTE_BUILDERS.planDayDesigner('day-plan-a-copy'),
      undefined,
      { shallow: true },
    );
    expect(mockRouter.asPath).toBe('/app/plans/day?dayPlanId=day-plan-a-copy');

    const name = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    const description = container.querySelector(
      'textarea[aria-label="Day Plan description"]',
    ) as HTMLTextAreaElement;
    expect(name.value).toBe('Training Day (Copy)');
    expect(description.value).toBe('High-protein weekday with oats and salmon');
    expect(container.textContent).toContain('Planned 2 of 3');
    expect(container.textContent).toContain('2 Meals');

    act(() => {
      findByAriaLabel(container, 'Expand Lunch').click();
    });
    const composer = container.querySelector('[data-testid="meal-composer"]') as HTMLElement;
    expect(composer.getAttribute('data-mode')).toBe('edit');
    expect(composer.getAttribute('data-meal-id')).toBe('meal-salmon');

    await act(async () => {
      releaseGet?.(planACopy());
      await Promise.resolve();
      await Promise.resolve();
    });
    await flush();

    expect(name.value).toBe('Training Day (Copy)');
    expect(container.textContent).toContain('Planned 2 of 3');
    expect(findButton(container, 'Make a copy').disabled).toBe(false);
  });
});
