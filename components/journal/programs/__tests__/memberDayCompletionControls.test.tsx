/** @jest-environment jsdom */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ProgramDeliveryExperience } from '../ProgramDeliveryExperience';
import { BASELINE_MEMBER_DRAFT_VERSION_LABEL } from '@/lib/programs/baselineMemberBinding';
import { programBlueprintRuntimeConfig } from '@/lib/programs/programBlueprint';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '@/lib/programs/baselineDay0To21Candidate';
import type { ProgramDeliveryModuleDefinition } from '@/lib/programs/deliveryModuleTypes';
import type { ProgramLibraryDetail } from '@/lib/programs/programLibraryServerService';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';

jest.mock('@/components/journal/JournalFooterNav', () => ({
  JournalFooterNav: () => null,
}));
jest.mock('next/image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: (props: { href?: string; children?: React.ReactNode }) => {
    const ReactRuntime = require('react') as typeof React;
    return ReactRuntime.createElement('a', { href: props.href }, props.children);
  },
}));

const VERSION_ID = '20000000-0000-4000-8000-000000000021';
const VERSION_KEY = 'v3-a1b2c3d4';
const FUTURE_DAY = 'Day 21 stays closed before the program starts.';

const library = {
  slug: 'baseline',
  title: 'Baseline',
  has_entitlement: true,
  access_state: 'entitled',
  managed_content: null,
  modules: [],
} as unknown as ProgramLibraryDetail;

const memberConfig = {
  ...programBlueprintRuntimeConfig(BASELINE_DAY_0_TO_21_BLUEPRINT),
  version: {
    key: VERSION_KEY,
    label: BASELINE_MEMBER_DRAFT_VERSION_LABEL,
    durationDays: 21,
  },
};

function moduleFor(day: number, body: string): ProgramDeliveryModuleDefinition {
  return {
    id: day === 0 ? 'baseline-candidate-day-0-orientation' : `baseline-candidate-day-${day}-reflection`,
    programSlug: 'baseline',
    moduleType: day === 0 ? 'prep' : 'guide',
    title: `Server day ${day}`,
    body,
    dayStart: day,
    dayEnd: day,
    statusVisibility: ['active', 'pre_start'],
  };
}

function summary(status: ProgramRuntimeSummary['resolved_status'], day: number): ProgramRuntimeSummary {
  return {
    enrollment: {
      id: 'enrollment-1',
      person_id: '10000000-0000-4000-8000-000000000001',
      program_slug: 'baseline',
      program_version_id: VERSION_ID,
      status,
    },
    version: {
      id: VERSION_ID,
      version_key: VERSION_KEY,
      version_label: BASELINE_MEMBER_DRAFT_VERSION_LABEL,
      status: 'published',
      duration_days: 21,
    },
    program: { id: 'program-1', slug: 'baseline', title: 'Baseline' },
    resolved_status: status,
    current_day: day,
    timezone: 'America/Chicago',
    next_checkin_template: null,
    latest_checkin_response: null,
    latest_recommendation: null,
    resolved_at: '2026-10-16T00:00:00.000Z',
  } as unknown as ProgramRuntimeSummary;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function completeButton(container: HTMLElement, day: number) {
  const label = `Mark day ${String(day).padStart(2, '0')} completed`;
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent === label) as HTMLButtonElement | undefined;
}

describe('signed-in day completion controls', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { React?: typeof React }).React = React;
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollIntoView = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  async function renderExperience(props: Partial<React.ComponentProps<typeof ProgramDeliveryExperience>> & {
    runtimeSummary: ProgramRuntimeSummary | null;
  }) {
    await act(async () => {
      root.render(
        <ProgramDeliveryExperience
          data={library}
          progressSummary={null}
          deliveryModules={[moduleFor(0, 'Day 0 setup body'), moduleFor(21, FUTURE_DAY)]}
          blueprint={memberConfig}
          initialStartGateOpen={false}
          onRuntimeSummaryUpdate={() => undefined}
          {...props}
        />,
      );
    });
  }

  it('completes signed-in Day 0, reloads the record, and leaves the enrollment where it is', async () => {
    const runtimeSummary = summary('pre_start', 0);
    const onRuntimeSummaryUpdate = jest.fn();
    const completion = {
      id: 'completion-day-0',
      enrollment_id: 'enrollment-1',
      program_version_id: VERSION_ID,
      program_day: 0,
      completed_at: '2026-10-17T18:30:00.000Z',
    };
    let stored: typeof completion | null = null;
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        stored = completion;
        return jsonResponse(stored);
      }
      return jsonResponse(stored);
    }) as unknown as typeof fetch;

    await renderExperience({ runtimeSummary, onRuntimeSummaryUpdate });
    expect(container.textContent).toContain('Day 0 setup body');
    expect(container.textContent).not.toContain(FUTURE_DAY);
    const button = completeButton(container, 0);
    expect(button?.disabled).toBe(false);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(JSON.parse(String((global.fetch as jest.Mock).mock.calls.find((call) => call[1]?.method === 'POST')?.[1].body))).toEqual({ day: 0 });
    expect(container.textContent).toContain('Day 00 completed');
    expect(onRuntimeSummaryUpdate).not.toHaveBeenCalled();
    expect(runtimeSummary.resolved_status).toBe('pre_start');
    expect(runtimeSummary.current_day).toBe(0);
    expect(container.textContent).not.toContain(FUTURE_DAY);

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await renderExperience({ runtimeSummary, onRuntimeSummaryUpdate });
    expect(container.textContent).toContain('Day 00 completed');
    expect((global.fetch as jest.Mock).mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
  });

  it('shows a Day 0 published-content rejection without completing the day', async () => {
    const onRuntimeSummaryUpdate = jest.fn();
    global.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') {
        return jsonResponse({
          error: 'This day has no published delivery content and cannot be completed.',
          code: 'PROGRAM_DAY_REQUIREMENTS_UNMET',
        }, 409);
      }
      return jsonResponse(null);
    }) as unknown as typeof fetch;

    await renderExperience({
      runtimeSummary: summary('pre_start', 0),
      onRuntimeSummaryUpdate,
    });
    await act(async () => {
      completeButton(container, 0)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('no published delivery content');
    expect(container.textContent).not.toContain('Day 00 completed');
    expect(onRuntimeSummaryUpdate).not.toHaveBeenCalled();
  });

  it('keeps admin preview and an enrollment-less Day 0 read-only', async () => {
    global.fetch = jest.fn() as unknown as typeof fetch;
    await renderExperience({
      runtimeSummary: summary('pre_start', 0),
      previewMode: true,
    });
    expect(completeButton(container, 0)).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await renderExperience({ runtimeSummary: null });
    expect(completeButton(container, 0)).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('opens completion only after the viewed check-in is completed or skipped', async () => {
    const runtimeSummary = summary('active', 7);
    global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('observations')) {
        return jsonResponse({
          draft_text: 'saved note',
          response_text: 'saved note',
          saved_at: '2026-10-17T18:00:00.000Z',
          updated_at: '2026-10-17T18:00:00.000Z',
        });
      }
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse(null);
      return jsonResponse({
        id: 'completion-day-7',
        enrollment_id: 'enrollment-1',
        program_version_id: VERSION_ID,
        program_day: 7,
        completed_at: '2026-10-17T18:40:00.000Z',
      });
    }) as unknown as typeof fetch;

    const renderDay = (latest: ProgramRuntimeSummary['latest_checkin_response']) => renderExperience({
      runtimeSummary: { ...runtimeSummary, latest_checkin_response: latest },
      deliveryModules: [moduleFor(7, 'Day 7 observation body'), moduleFor(21, FUTURE_DAY)],
    });

    await renderDay(null);
    expect(completeButton(container, 7)?.disabled).toBe(true);
    expect(container.textContent).toContain('Complete or skip this day’s check-in');
    expect(container.textContent).not.toContain(FUTURE_DAY);

    await renderDay({ checkin_day: 14, response_status: 'completed' } as ProgramRuntimeSummary['latest_checkin_response']);
    expect(completeButton(container, 7)?.disabled).toBe(true);

    await renderDay({ checkin_day: 7, response_status: 'skipped' } as ProgramRuntimeSummary['latest_checkin_response']);
    expect(completeButton(container, 7)?.disabled).toBe(false);

    await renderDay({ checkin_day: 7, response_status: 'completed' } as ProgramRuntimeSummary['latest_checkin_response']);
    const button = completeButton(container, 7);
    expect(button?.disabled).toBe(false);
    await act(async () => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Day 07 completed');
    expect(runtimeSummary.current_day).toBe(7);
    expect(runtimeSummary.resolved_status).toBe('active');
  });
});
