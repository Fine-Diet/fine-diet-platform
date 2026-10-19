/** @jest-environment jsdom */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import JournalProgramDetailBySlugPage from '@/pages/journal/programs/[slug]';
import { BASELINE_DAY_0_TO_21_BLUEPRINT } from '@/lib/programs/baselineDay0To21Candidate';
import { PROGRAM_BLUEPRINT_METADATA_KEY, toProgramBlueprintVersionFields } from '@/lib/programs/programBlueprint';
import type { ProgramDeliveryModuleDefinition } from '@/lib/programs/deliveryModuleTypes';
import type { ProgramLibraryDetail } from '@/lib/programs/programLibraryServerService';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';

jest.mock('next/router', () => ({
  useRouter: () => ({ query: { slug: 'baseline' } }),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: (props: { href?: string; children?: React.ReactNode }) => {
    const ReactRuntime = require('react') as typeof React;
    return ReactRuntime.createElement('a', { href: props.href }, props.children);
  },
}));
jest.mock('next/image', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/components/journal/programs/ProgramDeliveryExperience', () => ({
  ProgramDeliveryExperience: (props: {
    runtimeSummary: ProgramRuntimeSummary;
    onRuntimeSummaryUpdate?: (summary: ProgramRuntimeSummary) => void;
  }) => (
    <button onClick={() => props.onRuntimeSummaryUpdate?.(props.runtimeSummary)}>
      Refresh enrollment content
    </button>
  ),
}));
jest.mock('@/components/journal/JournalFooterNav', () => ({ JournalFooterNav: () => null }));

const PERSON_ID = '10000000-0000-4000-8000-000000000001';
const VERSION_ID = '20000000-0000-4000-8000-000000000021';

function library(): ProgramLibraryDetail {
  return {
    slug: 'baseline',
    title: 'Baseline',
    tagline: null,
    description: null,
    is_catalogue_stub: false,
    storefront_href: null,
    has_entitlement: true,
    access_state: 'entitled',
    primary_assignment: null,
    runtime_state: 'none',
    impact_headline: null,
    progress: null,
    assignments: [],
    modules: [],
    managed_content: null,
    impact_bullets: [],
    progress_summary: null,
  };
}

function enrolledSummary(): ProgramRuntimeSummary {
  return {
    enrollment: {
      id: 'enrollment-v3',
      person_id: PERSON_ID,
      program_id: 'program-baseline',
      program_slug: 'baseline',
      program_version_id: VERSION_ID,
      source_type: 'entitlement',
      source_ref: null,
      entitlement_key: 'program:baseline',
      assignment_id: null,
      purchase_date: null,
      selected_start_date: '2026-10-20',
      started_at: null,
      completed_at: null,
      status: 'pre_start',
      timezone: 'America/Chicago',
      current_capacity: 'steady',
      paused_days_total: 0,
      pause_until: null,
      input_snapshot_json: {},
      computed_metrics_snapshot_json: {},
      metadata: {},
      created_by_user_id: null,
      created_at: '2026-10-19T00:00:00.000Z',
      updated_at: '2026-10-19T00:00:00.000Z',
    },
    version: {
      id: VERSION_ID,
      program_id: 'program-baseline',
      version_key: 'v3-a1b2c3d4',
      version_label: 'Baseline — Day 0–21 member draft',
      version_number: 3,
      status: 'published',
      duration_days: 21,
      default_unlock_day: 0,
      published_at: '2026-10-18T00:00:00.000Z',
      metadata: {
        [PROGRAM_BLUEPRINT_METADATA_KEY]: toProgramBlueprintVersionFields(BASELINE_DAY_0_TO_21_BLUEPRINT),
      },
      created_by_user_id: null,
      created_at: '2026-10-18T00:00:00.000Z',
      updated_at: '2026-10-18T00:00:00.000Z',
    },
    program: {
      id: 'program-baseline',
      slug: 'baseline',
      title: 'Baseline',
      tagline: null,
      description: null,
      storefront_href: null,
    },
    resolved_status: 'pre_start',
    current_day: 0,
    timezone: 'America/Chicago',
    next_checkin_template: null,
    latest_checkin_response: null,
    latest_recommendation: null,
    resolved_at: '2026-10-19T00:00:00.000Z',
  };
}

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('/journal/programs/[slug] delivery transition', () => {
  let container: HTMLDivElement;
  let root: Root;
  let deliveryResponse: Promise<Response> | null;
  let resolveDeliveryResponse: ((value: Response) => void) | null;
  let rejectDeliveryResponse: ((reason?: unknown) => void) | null;
  let enrollSummary: ProgramRuntimeSummary;
  let dayZeroModules: ProgramDeliveryModuleDefinition[];
  let versionedDeliveryRequestCount: number;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    Element.prototype.scrollIntoView = jest.fn();
    deliveryResponse = null;
    resolveDeliveryResponse = null;
    rejectDeliveryResponse = null;
    enrollSummary = enrolledSummary();
    versionedDeliveryRequestCount = 0;
    dayZeroModules = BASELINE_DAY_0_TO_21_BLUEPRINT.modules.filter(
      (module) => module.dayStart === 0,
    );
    global.fetch = jest.fn(async (input, init) => {
      const url = String(input);
      if (url === '/api/journal/programs/baseline') {
        return response(200, library());
      }
      if (url === '/api/journal/programs/runtime-summary') {
        return response(200, { person_id: PERSON_ID, summaries: [enrollSummary] });
      }
      if (url.startsWith('/api/journal/programs/baseline/delivery-modules')) {
        if (url.includes('version_id=')) {
          versionedDeliveryRequestCount += 1;
          if (versionedDeliveryRequestCount === 1) {
            return response(200, {
              source: 'admin',
              modules: BASELINE_DAY_0_TO_21_BLUEPRINT.modules,
            });
          }
          return deliveryResponse ?? response(500, { error: 'Unexpected delivery request.' });
        }
        return response(200, { source: 'admin', modules: dayZeroModules });
      }
      return response(404, { error: `Unexpected request: ${url}` });
    }) as unknown as typeof fetch;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  async function renderPage() {
    await act(async () => {
      root.render(<JournalProgramDetailBySlugPage />);
    });
  }

  async function startEnrollmentWithPendingDelivery() {
    await renderPage();
    const startButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Refresh enrollment content',
    );
    expect(startButton).toBeDefined();

    await act(async () => {
      startButton?.click();
    });

    expect(container.textContent).toContain('Loading your Program…');
    expect(container.textContent).not.toContain('This Program version is unavailable');
  }

  it('keeps the member in a neutral loading state until enrollment content is validated', async () => {
    deliveryResponse = new Promise<Response>((resolve, reject) => {
      resolveDeliveryResponse = resolve;
      rejectDeliveryResponse = reject;
    });
    await startEnrollmentWithPendingDelivery();

    await act(async () => {
      resolveDeliveryResponse?.(response(200, {
        source: 'admin',
        modules: BASELINE_DAY_0_TO_21_BLUEPRINT.modules,
      }));
    });

    expect(container.textContent).toContain('Refresh enrollment content');
    expect(container.textContent).not.toContain('Loading your Program…');
    expect(container.textContent).not.toContain('This Program version is unavailable');
  });

  it('fails closed on a successful response with incomplete published content', async () => {
    deliveryResponse = new Promise<Response>((resolve) => {
      resolveDeliveryResponse = resolve;
    });
    await startEnrollmentWithPendingDelivery();
    await act(async () => {
      resolveDeliveryResponse?.(response(200, { source: 'admin', modules: [] }));
    });

    expect(container.textContent).toContain('This Program version is unavailable');
    expect(container.textContent).not.toContain('Program content could not be loaded');
  });

  it('keeps HTTP 409 unavailable while treating authorization failures as load errors', async () => {
    deliveryResponse = new Promise<Response>((resolve) => {
      resolveDeliveryResponse = resolve;
    });
    await startEnrollmentWithPendingDelivery();
    await act(async () => {
      resolveDeliveryResponse?.(response(409, { error: 'Content unavailable.' }));
    });
    expect(container.textContent).toContain('This Program version is unavailable');

    act(() => root.unmount());
    root = createRoot(container);
    versionedDeliveryRequestCount = 0;
    deliveryResponse = new Promise<Response>((resolve) => {
      resolveDeliveryResponse = resolve;
    });
    await startEnrollmentWithPendingDelivery();
    await act(async () => {
      resolveDeliveryResponse?.(response(403, { error: 'Access denied.' }));
    });
    expect(container.textContent).toContain('Program content could not be loaded');
    expect(container.textContent).not.toContain('This Program version is unavailable');
  });

  it('shows a load error instead of a content-corruption error after a network failure', async () => {
    deliveryResponse = new Promise<Response>((_resolve, reject) => {
      rejectDeliveryResponse = reject;
    });
    await startEnrollmentWithPendingDelivery();
    await act(async () => {
      rejectDeliveryResponse?.(new Error('network unavailable'));
    });

    expect(container.textContent).toContain('Program content could not be loaded');
    expect(container.textContent).not.toContain('This Program version is unavailable');
  });
});
