/**
 * Behavioral coverage for Day Plan local-draft restore and Save choices.
 *
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import {
  dayPlanDraftStorageKey,
  saveDayPlanDraft,
} from '@/lib/plans/dayPlanDraftStore';
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
  replace: jest.fn(async (href: string) => {
    mockRouter.asPath = href;
    const dayPlanId = new URL(href, 'http://local.test').searchParams.get('dayPlanId');
    mockRouter.query = dayPlanId ? { dayPlanId } : {};
  }),
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
    ],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '2026-09-01T10:00:00.000Z',
    updated_at: '2026-09-10T10:00:00.000Z',
  };
}

function planACopyFromDraft(): PlanDayTemplate {
  return {
    ...planA(),
    id: 'day-plan-a-dirty-copy',
    name: 'Edited locally (Copy)',
    description: 'Changed description',
    created_at: '2026-09-15T18:00:00.000Z',
    updated_at: '2026-09-15T18:00:00.000Z',
  };
}

function findExactButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button as HTMLButtonElement;
}

function typeInto(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Day designer restore notice and Save choices', () => {
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
      if (id === planACopyFromDraft().id) return planACopyFromDraft();
      throw new Error(`unexpected template id ${id}`);
    });
    mockPlanService.duplicatePlanDayTemplate.mockResolvedValue({
      ...planA(),
      id: 'day-plan-a-copy',
      name: 'Training Day (Copy)',
    });
    mockPlanService.updatePlanDayTemplate.mockImplementation(async (id: string, patch) => ({
      ...planA(),
      ...patch,
      id,
      updated_at: '2026-09-15T18:30:00.000Z',
    }));
    mockPlanService.savePlanDayTemplate.mockResolvedValue(planACopyFromDraft());

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

  async function openSavedPlanA() {
    mockRouter.query = { dayPlanId: planA().id };
    mockRouter.asPath = APP_ROUTE_BUILDERS.planDayDesigner(planA().id);
    await mountDesigner();
  }

  it('opens a clean saved plan without a restore notice and with dirty false', async () => {
    await openSavedPlanA();
    expect(container.textContent).not.toContain(
      'Unsaved changes from your last session were restored.',
    );
    expect(findExactButton(container, 'Save').disabled).toBe(true);
    expect(findExactButton(container, 'Make a copy').disabled).toBe(false);
  });

  it('shows a restore notice and dirty Save when a valid local dirty draft exists', async () => {
    const saved = planA();
    const dirtyDraft = {
      ...saved,
      name: 'Edited locally',
      description: 'Changed description',
    };
    saveDayPlanDraft(
      window.localStorage,
      saved.person_id,
      saved.id,
      saved.updated_at,
      dirtyDraft,
    );

    await openSavedPlanA();

    expect(container.textContent).toContain(
      'Unsaved changes from your last session were restored.',
    );
    const name = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    expect(name.value).toBe('Edited locally');
    expect(findExactButton(container, 'Save').disabled).toBe(false);
    expect(findExactButton(container, 'Make a copy').disabled).toBe(true);
  });

  it('discards a restored draft back to the canonical saved plan', async () => {
    const saved = planA();
    saveDayPlanDraft(
      window.localStorage,
      saved.person_id,
      saved.id,
      saved.updated_at,
      { ...saved, name: 'Edited locally' },
    );
    await openSavedPlanA();

    await act(async () => {
      findExactButton(container, 'Discard changes').click();
    });
    await flush();

    const name = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    expect(name.value).toBe('Training Day');
    expect(container.textContent).not.toContain(
      'Unsaved changes from your last session were restored.',
    );
    expect(findExactButton(container, 'Save').disabled).toBe(true);
    expect(
      window.localStorage.getItem(dayPlanDraftStorageKey(saved.person_id, saved.id)),
    ).toBeNull();
  });

  it('opens a Save choice when an existing dirty Day Plan is saved', async () => {
    await openSavedPlanA();
    const name = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    await act(async () => {
      typeInto(name, 'Edited locally');
    });
    await flush();

    expect(findExactButton(container, 'Save').disabled).toBe(false);
    await act(async () => {
      findExactButton(container, 'Save').click();
    });

    const dialog = container.querySelector('[aria-labelledby="save-day-plan-title"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Save Day Plan');
    expect(dialog?.textContent).toContain(
      'Save these changes to this Day Plan, or create a new copy?',
    );
    expect(mockPlanService.updatePlanDayTemplate).not.toHaveBeenCalled();
    expect(mockPlanService.savePlanDayTemplate).not.toHaveBeenCalled();
  });

  it('Save changes PATCHes the same id and stays on the current route', async () => {
    await openSavedPlanA();
    const name = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    await act(async () => {
      typeInto(name, 'Edited locally');
    });
    await act(async () => {
      findExactButton(container, 'Save').click();
    });
    await act(async () => {
      findExactButton(container, 'Save changes').click();
    });
    await flush();

    expect(mockPlanService.updatePlanDayTemplate).toHaveBeenCalledTimes(1);
    expect(mockPlanService.updatePlanDayTemplate).toHaveBeenCalledWith('day-plan-a', {
      name: 'Edited locally',
      description: 'High-protein weekday with oats and salmon',
      slots: planA().slots,
      unassigned_meals: [],
    });
    expect(mockPlanService.savePlanDayTemplate).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.asPath).toBe(APP_ROUTE_BUILDERS.planDayDesigner('day-plan-a'));
    expect(container.querySelector('[aria-labelledby="save-day-plan-title"]')).toBeNull();
    expect(findExactButton(container, 'Save').disabled).toBe(true);
  });

  it('Save as a copy creates a new id from the current dirty draft', async () => {
    await openSavedPlanA();
    const name = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    const description = container.querySelector(
      'textarea[aria-label="Day Plan description"]',
    ) as HTMLTextAreaElement;
    await act(async () => {
      typeInto(name, 'Edited locally');
      typeInto(description, 'Changed description');
    });
    await act(async () => {
      findExactButton(container, 'Save').click();
    });
    await act(async () => {
      findExactButton(container, 'Save as a copy').click();
    });
    await flush();

    expect(mockPlanService.duplicatePlanDayTemplate).not.toHaveBeenCalled();
    expect(mockPlanService.savePlanDayTemplate).toHaveBeenCalledTimes(1);
    expect(mockPlanService.savePlanDayTemplate).toHaveBeenCalledWith({
      mode: 'draft',
      name: 'Edited locally (Copy)',
      description: 'Changed description',
      slots: planA().slots,
      unassigned_meals: [],
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      APP_ROUTE_BUILDERS.planDayDesigner('day-plan-a-dirty-copy'),
      undefined,
      { shallow: true },
    );
    expect((container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement).value).toBe(
      'Edited locally (Copy)',
    );
  });

  it('Make a copy still clones a clean saved plan', async () => {
    await openSavedPlanA();
    await act(async () => {
      findExactButton(container, 'Make a copy').click();
    });
    await flush();

    expect(mockPlanService.duplicatePlanDayTemplate).toHaveBeenCalledWith('day-plan-a');
    expect(mockPlanService.savePlanDayTemplate).not.toHaveBeenCalled();
    expect(mockRouter.push).toHaveBeenCalledWith(
      APP_ROUTE_BUILDERS.planDayDesigner('day-plan-a-copy'),
      undefined,
      { shallow: true },
    );
  });

  it('saves a brand-new unsaved Day Plan directly without a choice dialog', async () => {
    await mountDesigner();
    const name = container.querySelector('input[aria-label="Day Plan name"]') as HTMLInputElement;
    await act(async () => {
      typeInto(name, 'Brand new day');
    });
    await act(async () => {
      findExactButton(container, 'Save').click();
    });
    await flush();

    expect(container.querySelector('[aria-labelledby="save-day-plan-title"]')).toBeNull();
    expect(mockPlanService.updatePlanDayTemplate).not.toHaveBeenCalled();
    expect(mockPlanService.savePlanDayTemplate).toHaveBeenCalledWith({
      mode: 'draft',
      name: 'Brand new day',
      description: null,
      slots: SEED_SLOTS,
      unassigned_meals: [],
    });
  });
});
