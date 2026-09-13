/**
 * @jest-environment jsdom
 */
import React, { useState } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import {
  MonthCalendarProjection,
  type MonthCalendarProjectionProps,
} from '../MonthCalendarProjection';
import {
  WeekPlanningWorkspace,
  type WeekPlanningWorkspaceProps,
} from '../WeekPlanningWorkspace';
import { PlanContextModal } from '../PlanContextModal';
import { getVisibleCalendarDates } from '@/lib/plans/monthProjection';
import { defaultWeekPlanName } from '@/lib/plans/weekWorkspace';
import type { PlanDayTemplate } from '@/lib/plans';

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

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function findTab(container: HTMLElement, label: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll('[role="tab"]')).find(
    (tab) => tab.textContent === label,
  ) as HTMLButtonElement;
}

function daySeed(): PlanDayTemplate {
  return {
    id: '',
    person_id: 'person-1',
    name: 'Unnamed Day Plan',
    scope: 'day',
    source_plan_id: '',
    source_plan_day_id: 'seed',
    source_date_local: '',
    slots: [],
    unassigned_meals: [],
    apply_policy: 'append',
    created_at: '',
    updated_at: '',
  };
}

function monthProps(
  overrides: Partial<MonthCalendarProjectionProps> = {},
): MonthCalendarProjectionProps {
  const seed = daySeed();
  return {
    loadState: 'ready',
    monthKey: '2026-10',
    visibleDates: getVisibleCalendarDates('2026-10'),
    planDays: [],
    planSlots: [],
    meals: [],
    dayPlans: [{
      ...seed,
      id: 'template-1',
      name: 'Training Day',
      updated_at: '2026-10-04T08:15:00.000Z',
    }],
    dayDraftSeed: seed,
    blankTemplateForDate: () => ({
      ...seed,
      source_plan_day_id: `month-modal-draft:${Math.random()}`,
    }),
    busy: false,
    modalError: null,
    isCurrentMonth: false,
    onPreviousMonth: jest.fn(),
    onCurrentMonth: jest.fn(),
    onNextMonth: jest.fn(),
    onApplyReusable: jest.fn().mockResolvedValue('applied'),
    onCreateAndApply: jest.fn().mockResolvedValue({ outcome: 'applied' }),
    onSaveDated: jest.fn().mockResolvedValue('applied'),
    onDayPlanCommitted: jest.fn(),
    ...overrides,
  };
}

function weekProps(
  overrides: Partial<WeekPlanningWorkspaceProps> = {},
): WeekPlanningWorkspaceProps {
  return {
    loadState: 'ready',
    selectedRange: { start: '2026-09-06', end: '2026-09-12' },
    isCurrentWeek: false,
    planDays: [],
    planSlots: [],
    meals: [],
    dayPlans: [],
    dayDraftSeed: daySeed(),
    personId: 'person-1',
    weekPlans: [{
      id: 'week-1',
      person_id: 'person-1',
      name: 'Training Week',
      scope: 'week_pattern',
      source_plan_id: 'source-1',
      source_date_start: null,
      source_date_end: null,
      days: [],
      apply_policy: 'append',
      created_at: '2026-09-11T00:00:00.000Z',
      updated_at: '2026-09-11T00:00:00.000Z',
    }],
    selectedWeekPlan: null,
    busy: false,
    error: null,
    message: null,
    onPreviousWeek: jest.fn(),
    onThisWeek: jest.fn(),
    onNextWeek: jest.fn(),
    onAddDayPlan: jest.fn(),
    onCreateAndApplyDayPlan: jest.fn(),
    onSaveDatedDay: jest.fn(),
    onSaveCurrentWeek: jest.fn(),
    onOpenWeekPlan: jest.fn(),
    onNewWeekPlan: jest.fn(),
    onRenameWeekPlan: jest.fn(),
    onCopyWeekPlan: jest.fn(),
    onApplyWeekPlan: jest.fn(),
    ...overrides,
  };
}

function RecreatingCloseParent({ dirty }: { dirty: boolean }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(true);
  const openerRef = React.useRef<HTMLButtonElement>(null);
  const closeCalls = React.useRef<Array<{ dirty: boolean; query: string }>>([]);

  return (
    <div>
      <button ref={openerRef} type="button" aria-label="Open plans">
        Open
      </button>
      {open ? (
        <PlanContextModal
          title="Day Plan"
          titleId="focus-lifecycle-title"
          closeLabel="Close Day Plan"
          tablistLabel="Day planning tools"
          libraryTabLabel="Day Plan Library"
          createEditTabLabel="Create or Edit"
          activeTab="library"
          onTabChange={() => undefined}
          onClose={() => {
            closeCalls.current.push({ dirty, query });
            if (dirty && !window.confirm('Close without saving your Day Plan draft?')) return;
            setOpen(false);
          }}
          returnFocusRef={openerRef}
          libraryPanel={
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Day Plans"
            />
          }
          createEditPanel={<div>editor</div>}
        />
      ) : (
        <pre data-testid="close-trace">{JSON.stringify(closeCalls.current)}</pre>
      )}
    </div>
  );
}

describe('Packet 19 Correction C3 — modal focus lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { React: typeof React }).React = React;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.confirm = jest.fn(() => true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps Month library search focused while the parent recreates onClose', () => {
    const opener = document.createElement('button');
    opener.textContent = 'calendar-cell';
    document.body.appendChild(opener);
    opener.focus();

    act(() => root.render(<MonthCalendarProjection {...monthProps()} />));
    act(() => {
      (container.querySelector('[data-date="2026-10-05"]') as HTMLButtonElement).click();
    });
    act(() => {
      findTab(container, 'Day Plan Library').click();
    });

    const search = container.querySelector('input[placeholder="Search Day Plans"]') as HTMLInputElement;
    act(() => {
      search.focus();
    });
    expect(document.activeElement).toBe(search);

    act(() => {
      typeInto(search, 'a');
    });
    expect(document.activeElement).toBe(search);
    act(() => {
      typeInto(search, 'ab');
    });
    expect(document.activeElement).toBe(search);
    act(() => {
      typeInto(search, 'abc');
    });
    expect(document.activeElement).toBe(search);

    opener.remove();
  });

  it('keeps Week library search focused across parent rerenders', () => {
    act(() => root.render(<WeekPlanningWorkspace {...weekProps()} />));
    act(() => {
      (Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Open',
      ) as HTMLButtonElement).click();
    });

    const search = container.querySelector('input[placeholder="Search Week Plans"]') as HTMLInputElement;
    act(() => {
      search.focus();
    });
    expect(document.activeElement).toBe(search);
    act(() => {
      typeInto(search, 'a');
    });
    expect(document.activeElement).toBe(search);
    act(() => {
      typeInto(search, 'ab');
    });
    expect(document.activeElement).toBe(search);
    act(() => {
      typeInto(search, 'abc');
    });
    expect(document.activeElement).toBe(search);
    expect(defaultWeekPlanName('2026-09-06')).toBeTruthy();
  });

  it('uses the latest dirty close handler on Escape and restores focus only after close', () => {
    const openerHost = document.createElement('div');
    document.body.appendChild(openerHost);

    act(() => root.render(<RecreatingCloseParent dirty={false} />));
    const search = container.querySelector('input[placeholder="Search Day Plans"]') as HTMLInputElement;
    act(() => {
      search.focus();
      typeInto(search, 'abc');
    });
    expect(document.activeElement).toBe(search);

    act(() => root.render(<RecreatingCloseParent dirty />));
    const searchAfter = container.querySelector('input[placeholder="Search Day Plans"]') as HTMLInputElement;
    act(() => {
      searchAfter.focus();
    });
    expect(document.activeElement).toBe(searchAfter);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(window.confirm).toHaveBeenCalledWith('Close without saving your Day Plan draft?');
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    const opener = container.querySelector('[aria-label="Open plans"]');
    expect(document.activeElement).toBe(opener);
    expect(container.querySelector('[data-testid="close-trace"]')?.textContent).toContain('"dirty":true');
    openerHost.remove();
  });
});
