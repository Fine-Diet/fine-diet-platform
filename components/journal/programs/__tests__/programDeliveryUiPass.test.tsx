/** @jest-environment jsdom */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ProgramDeliveryExperience } from '../ProgramDeliveryExperience';
import {
  BASELINE_DAY_0_TO_21_BLUEPRINT,
  BASELINE_DAY_0_TO_21_CANDIDATE,
} from '@/lib/programs/baselineDay0To21Candidate';
import { PROGRAM_PREVIEW_TEST_AUDIO_PATH } from '@/lib/programs/deliveryComposition';
import { selectHistoricalReviewModules } from '@/lib/programs/historicalReviewPolicy';
import type { ProgramDeliveryModuleDefinition } from '@/lib/programs/deliveryModuleTypes';
import { SYNTHETIC_PROGRAM_BLUEPRINT } from '@/lib/programs/programBlueprintExamples';
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

jest.mock('@/components/journal/programs/ProgramCheckinPanel', () => ({
  ProgramCheckinPanel: () => {
    const ReactRuntime = require('react') as typeof React;
    return ReactRuntime.createElement('div', null, 'Check-in due');
  },
}));

const library = {
  slug: 'baseline',
  title: 'Baseline',
  has_entitlement: true,
  access_state: 'entitled',
  managed_content: null,
  modules: [],
} as unknown as ProgramLibraryDetail;

function runtime(
  status: ProgramRuntimeSummary['resolved_status'],
  day: number,
  duration = 21,
): ProgramRuntimeSummary {
  return {
    enrollment: {
      id: 'enrollment-1',
      program_slug: 'baseline',
      selected_start_date: '2026-10-01',
    },
    version: {
      id: 'version-1',
      duration_days: duration,
      version_key: 'baseline-day-0-21-candidate',
    },
    program: {
      id: 'program-1',
      slug: 'baseline',
      title: 'Baseline',
      tagline: null,
      description: null,
      storefront_href: null,
    },
    resolved_status: status,
    current_day: day,
    timezone: 'America/Chicago',
    next_checkin_template:
      day === 7
        ? {
            id: 'template-day-7',
            program_version_id: 'version-1',
            checkin_day: 7,
            title: 'Week one check-in',
            description: null,
            prompt_md: null,
            questions_json: [],
            status: 'published',
            metadata: {},
          }
        : null,
    latest_checkin_response: null,
    latest_recommendation: null,
    resolved_at: '2026-10-15T12:00:00.000Z',
  } as unknown as ProgramRuntimeSummary;
}

function buttonByLabel(container: HTMLElement, label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.getAttribute('aria-label') === label,
  );
}

function renderExperience(
  root: Root,
  props: Partial<React.ComponentProps<typeof ProgramDeliveryExperience>> & {
    runtimeSummary: ProgramRuntimeSummary | null;
    deliveryModules: ProgramDeliveryModuleDefinition[];
  },
) {
  const data = props.data ?? library;
  const defaultBlueprint = data.slug === 'synthetic-denim-example'
    ? SYNTHETIC_PROGRAM_BLUEPRINT
    : BASELINE_DAY_0_TO_21_BLUEPRINT;
  return act(async () => {
    root.render(
      <ProgramDeliveryExperience
        data={library}
        progressSummary={null}
        previewMode
        initialStartGateOpen={false}
        onRuntimeSummaryUpdate={() => undefined}
        {...props}
        blueprint={props.blueprint === undefined ? defaultBlueprint : props.blueprint}
      />,
    );
  });
}

describe('Program delivery UI pass', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { React?: typeof React }).React = React;
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollIntoView = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  test('hides both navigation rows on Setup and keeps an unavailable player', async () => {
    await renderExperience(root, {
      runtimeSummary: runtime('pre_start', 0),
      deliveryModules: BASELINE_DAY_0_TO_21_CANDIDATE.modules,
      initialSelectedDay: 0,
    });

    expect(container.querySelector('[aria-label="Program days"]')).toBeNull();
    expect(container.querySelector('[aria-label="Day content and schedule"]')).toBeNull();
    expect(container.querySelector('[aria-label="Program schedule and days"]')).toBeNull();
    expect(container.textContent).toContain('← Programs');
    expect(container.textContent).not.toContain('Return to today');
    expect(container.textContent).toContain('Audio unavailable');
    expect(container.querySelector('audio')).toBeNull();
    expect(container.textContent).not.toContain('Hero commentary');
    expect(container.textContent).not.toContain('Diets Will Fail You');
    expect(container.textContent).toContain(
      'Use this space to get oriented and make a simple plan for the days ahead.',
    );
    expect(container.textContent).toContain(
      'Review what you already have and note anything you may want to pick up.',
    );
    expect(container.textContent).toContain(
      'There is no standalone pantry-readiness flow in the current app.',
    );
    expect(container.textContent).not.toContain('Available in a future update.');
    expect(container.textContent).not.toContain('Save response');
    expect(container.textContent).not.toContain('Mark Day');
  });

  test('returns an active member from Setup without moving the runtime day', async () => {
    const summary = runtime('active', 7);
    await renderExperience(root, {
      runtimeSummary: summary,
      deliveryModules: BASELINE_DAY_0_TO_21_CANDIDATE.modules,
      initialSelectedDay: 0,
    });

    expect(container.textContent).toContain('Return to today');
    expect(container.querySelector('audio')).toBeNull();
    const back = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Return to today',
    );
    await act(async () => {
      back?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(summary.current_day).toBe(7);
    expect(buttonByLabel(container, 'Day 7, selected, current day')).toBeTruthy();
    expect(container.querySelector('[aria-label="Day content and schedule"]')).toBeTruthy();

    await act(async () => {
      buttonByLabel(container, 'Day 3, available to review')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(buttonByLabel(container, 'Day 3, selected, available to review')).toBeTruthy();
    expect(buttonByLabel(container, 'Day 7, current day')).toBeTruthy();
    expect(summary.current_day).toBe(7);

    await act(async () => {
      buttonByLabel(container, 'Day 8, locked')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(container.textContent).toContain('Day 8 unlocks on its Program date.');
    expect(buttonByLabel(container, 'Day 3, selected, available to review')).toBeTruthy();
    expect(summary.current_day).toBe(7);

    const twoDigitLockedDay = buttonByLabel(container, 'Day 12, locked');
    expect(twoDigitLockedDay?.textContent).toBe('12');
    expect(twoDigitLockedDay?.querySelector('svg')).toBeNull();
    expect(twoDigitLockedDay?.className).toContain('h-11 w-11');
    expect(twoDigitLockedDay?.className).toContain('md:h-8 md:w-8');

    const schedule = container.querySelector(
      '[aria-label="Day content and schedule"] [aria-selected="false"]',
    );
    await act(async () => {
      schedule?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(buttonByLabel(container, 'Day 3, selected, available to review')).toBeTruthy();
    const setup = Array.from(container.querySelectorAll('button')).find(
      (button) => button.querySelector('p')?.textContent === 'Setup',
    );
    expect(setup?.textContent).toContain('Get oriented and choose a comfortable starting point.');
    await act(async () => {
      setup?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('[aria-label="Program days"]')).toBeNull();
    expect(container.textContent).toContain('Audio unavailable');
    expect(container.textContent).toContain('Return to today');
  });

  test('renders a locked two-digit member day as a fixed circle without a padlock', async () => {
    await renderExperience(root, {
      previewMode: false,
      blueprint: null,
      runtimeSummary: runtime('active', 7),
      deliveryModules: BASELINE_DAY_0_TO_21_CANDIDATE.modules,
      initialSelectedDay: 7,
    });

    const day12 = Array.from(
      container.querySelectorAll('[aria-label="Program days"] button'),
    ).find((button) => button.textContent === '12') as HTMLButtonElement | undefined;
    expect(day12?.textContent).toBe('12');
    expect(day12?.querySelector('svg')).toBeNull();
    expect(day12?.className).toContain('h-11 w-11');
    expect(day12?.className).toContain('md:h-8 md:w-8');
    expect(day12?.className).toContain('flex-none');

    await act(async () => {
      day12?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Day 12 unlocks on its Program date.');
  });

  test('offers reached Setup review when paused and keeps future days locked', async () => {
    await renderExperience(root, {
      runtimeSummary: runtime('paused', 4),
      deliveryModules: BASELINE_DAY_0_TO_21_CANDIDATE.modules,
      initialSelectedDay: 4,
    });
    const schedule = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Schedule',
    );
    await act(async () => {
      schedule?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const setup = Array.from(container.querySelectorAll('button')).find(
      (button) => button.querySelector('p')?.textContent === 'Setup',
    );
    expect(setup).toBeTruthy();
    expect(container.textContent).not.toContain('Check-in due');
    await act(async () => {
      buttonByLabel(container, 'Day 5, locked')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    expect(container.textContent).toContain('Day 5 unlocks on its Program date.');
  });

  test('locks historical days beyond Day 0 when a paused reached day is unknown', async () => {
    const reachedModules = selectHistoricalReviewModules(
      BASELINE_DAY_0_TO_21_CANDIDATE.modules,
      0,
    );
    expect(reachedModules.map((module) => module.id)).not.toContain(
      'baseline-candidate-week-1-context',
    );

    await renderExperience(root, {
      runtimeSummary: runtime('paused', 0),
      deliveryModules: reachedModules,
      initialSelectedDay: 0,
    });

    expect(container.textContent).toContain(
      'Use this space to get oriented and make a simple plan for the days ahead.',
    );
    expect(container.textContent).not.toContain('Find a routine that works');
    expect(container.textContent).not.toContain('Add context to your observations');
    expect(container.querySelector('[aria-label="Program days"]')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('button')).some((button) =>
        button.getAttribute('aria-label')?.includes('available to review'),
      ),
    ).toBe(false);
  });

  test('plays authored Day 0 audio and ignores another day or the development file', async () => {
    const modules: ProgramDeliveryModuleDefinition[] = [
      {
        id: 'day-0-audio',
        programSlug: 'baseline',
        moduleType: 'prep',
        title: 'Orientation',
        body: 'Day 0 orientation explanation.',
        statusVisibility: ['pre_start', 'active'],
        blocks: [
          {
            type: 'audio',
            id: 'day-0-commentary',
            url: 'https://example.com/day-0-commentary.mp3',
            title: 'Day zero commentary',
            description: 'Authored day zero description',
          },
        ],
      },
      {
        id: 'day-1-audio',
        programSlug: 'baseline',
        moduleType: 'guide',
        title: 'Later recording',
        body: 'This recording belongs to day 1.',
        dayStart: 1,
        dayEnd: 1,
        statusVisibility: ['active'],
        blocks: [
          {
            type: 'audio',
            id: 'day-1-commentary',
            url: 'https://example.com/day-1-only.mp3',
            title: 'Day one recording',
          },
        ],
      },
    ];
    await renderExperience(root, {
      runtimeSummary: runtime('active', 1),
      deliveryModules: modules,
      initialSelectedDay: 0,
    });
    const audio = container.querySelector('audio');
    expect(audio?.getAttribute('src')).toBe('https://example.com/day-0-commentary.mp3');
    expect(container.textContent).toContain('Day zero commentary');
    expect(container.textContent).toContain('Authored day zero description');
    expect(container.textContent).not.toContain('day-1-only.mp3');
    expect(container.textContent).not.toContain('Audio unavailable');
    const play = Array.from(container.querySelectorAll('button')).find((button) =>
      button.getAttribute('aria-label')?.startsWith('Play '),
    );
    expect(play?.hasAttribute('disabled')).toBe(false);

    await renderExperience(root, {
      runtimeSummary: runtime('active', 1),
      deliveryModules: [
        {
          ...modules[0],
          blocks: [
            {
              type: 'audio',
              id: 'dev-file',
              url: PROGRAM_PREVIEW_TEST_AUDIO_PATH,
              title: 'Development recording',
            },
          ],
        },
      ],
      initialSelectedDay: 0,
    });
    expect(container.querySelector('audio')).toBeNull();
    expect(container.textContent).toContain('Audio unavailable');
    expect(container.textContent).not.toContain('Development recording');
    expect(container.textContent).not.toContain(PROGRAM_PREVIEW_TEST_AUDIO_PATH);
  });

  test('uses one numbered rail for a synthetic program duration', async () => {
    await renderExperience(root, {
      data: { ...library, slug: 'synthetic-denim-example', title: 'Sample Program' },
      runtimeSummary: runtime('active', 2, 5),
      deliveryModules: SYNTHETIC_PROGRAM_BLUEPRINT.modules,
      initialSelectedDay: 2,
    });
    const labels = Array.from(container.querySelectorAll('button'))
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => Boolean(label?.startsWith('Day ')));
    expect(labels).toEqual([
      'Day 1, available to review',
      'Day 2, selected, current day',
      'Day 3, locked',
      'Day 4, locked',
      'Day 5, locked',
    ]);
    expect(labels.some((label) => label.startsWith('Day 0'))).toBe(false);
  });
});
