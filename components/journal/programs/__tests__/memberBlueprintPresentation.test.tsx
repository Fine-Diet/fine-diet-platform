/** @jest-environment jsdom */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemberBlueprintUnavailable } from '../MemberBlueprintUnavailable';
import { ProgramDeliveryExperience } from '../ProgramDeliveryExperience';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '@/lib/programs/baselineDay0To21Candidate';
import { BASELINE_MEMBER_DRAFT_VERSION_LABEL } from '@/lib/programs/baselineMemberBinding';
import { programBlueprintRuntimeConfig } from '@/lib/programs/programBlueprint';
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

const GENERATED_VERSION_KEY = 'v3-a1b2c3d4';
const FUTURE_LESSON = 'The final check-in organizes your observations for review; it does not replace individualized care.';
const PHASE_LABEL = 'Week One · Rhythm';

const library = {
  slug: 'baseline',
  title: 'Baseline',
  has_entitlement: true,
  access_state: 'entitled',
  managed_content: null,
  modules: [],
} as unknown as ProgramLibraryDetail;

function serverModule(day: number, body: string): ProgramDeliveryModuleDefinition {
  return {
    id: `server-day-${day}`,
    programSlug: 'baseline',
    moduleType: day === 0 ? 'prep' : 'practice_card',
    title: `Server day ${day}`,
    body,
    dayStart: day,
    dayEnd: day,
    statusVisibility: ['active', 'pre_start'],
  };
}

function memberSummary(): ProgramRuntimeSummary {
  return {
    enrollment: {
      id: 'enrollment-1',
      person_id: '10000000-0000-4000-8000-000000000001',
      program_slug: 'baseline',
      program_version_id: '20000000-0000-4000-8000-000000000021',
      status: 'active',
    },
    version: {
      id: '20000000-0000-4000-8000-000000000021',
      version_key: GENERATED_VERSION_KEY,
      version_label: BASELINE_MEMBER_DRAFT_VERSION_LABEL,
      status: 'published',
      duration_days: 21,
    },
    program: { id: 'program-1', slug: 'baseline', title: 'Baseline' },
    resolved_status: 'active',
    current_day: 3,
    timezone: 'America/Chicago',
    next_checkin_template: null,
    latest_checkin_response: null,
    latest_recommendation: null,
    resolved_at: '2026-10-16T00:00:00.000Z',
  } as unknown as ProgramRuntimeSummary;
}

const memberConfig = {
  ...programBlueprintRuntimeConfig(BASELINE_DAY_0_TO_21_BLUEPRINT),
  version: {
    key: GENERATED_VERSION_KEY,
    label: BASELINE_MEMBER_DRAFT_VERSION_LABEL,
    durationDays: 21,
  },
};

describe('member blueprint presentation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { React?: typeof React }).React = React;
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollIntoView = jest.fn();
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => null,
    })) as unknown as typeof fetch;
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

  it('renders the developed presentation for a published member config without preview mode', async () => {
    await act(async () => {
      root.render(
        <ProgramDeliveryExperience
          data={library}
          runtimeSummary={memberSummary()}
          progressSummary={null}
          deliveryModules={[
            serverModule(0, 'Server day zero body'),
            serverModule(3, 'Server day three body'),
          ]}
          blueprint={memberConfig}
          initialStartGateOpen={false}
          onRuntimeSummaryUpdate={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain(PHASE_LABEL);
    expect(container.textContent).toContain('Let’s focus on Find a routine that works');
    expect(container.textContent).toContain('Mark day 03 completed');
    expect(container.textContent).not.toContain('Day completion is not available');
    expect(container.textContent).not.toContain(FUTURE_LESSON);
    expect(container.innerHTML).toContain('rgb(7, 23, 15)');
  });

  it('keeps Baseline v1 on the previous member layout and still uses real day completion', async () => {
    const summary = memberSummary();
    summary.version.version_key = 'baseline-v1';
    summary.version.id = '71fdd834-8a79-4272-bb30-aaa0cf8ab2d7';
    summary.enrollment.program_version_id = summary.version.id;
    await act(async () => {
      root.render(
        <ProgramDeliveryExperience
          data={library}
          runtimeSummary={summary}
          progressSummary={null}
          deliveryModules={[
            serverModule(3, 'Existing member day'),
          ]}
          initialStartGateOpen={false}
          onRuntimeSummaryUpdate={() => undefined}
        />,
      );
    });

    expect(container.textContent).toContain('Day 03 in Baseline');
    expect(container.textContent).toContain('Mark day 03 completed');
    expect(container.textContent).not.toContain(PHASE_LABEL);
    expect(container.textContent).not.toContain('Let’s focus on Find a routine that works');
    expect(container.innerHTML).not.toContain('rgb(7, 23, 15)');
  });

  it('suppresses lessons and actions when the version is unavailable', () => {
    act(() => {
      root.render(<MemberBlueprintUnavailable />);
    });
    expect(container.textContent).toContain('This Program version is unavailable');
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toContain(FUTURE_LESSON);
    expect(container.textContent).not.toContain('Server day');
  });
});
