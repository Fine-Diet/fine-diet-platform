/** @jest-environment jsdom */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { ProgramCheckinPanel } from '../ProgramCheckinPanel';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';

const summary = {
  enrollment: {
    id: 'enrollment-1', person_id: 'person-1', program_id: 'program-1',
    program_slug: 'gut-reset', program_version_id: 'version-3',
  },
  version: { id: 'version-3', duration_days: 14 },
  program: { id: 'program-1', slug: 'gut-reset', title: 'Gut Reset' },
  resolved_status: 'active', current_day: 7, timezone: 'UTC',
  next_checkin_template: {
    id: 'template-day-7', program_version_id: 'version-3', checkin_day: 7,
    title: 'Week one check-in', description: 'Review your first week.',
    prompt_md: null,
    questions_json: [{ key: 'energy', label: 'Energy this week', value_type: 'number' }],
    status: 'published', metadata: {},
  },
  latest_checkin_response: null, latest_recommendation: null,
  resolved_at: '2026-10-09T12:00:00Z',
} as unknown as ProgramRuntimeSummary;

describe('ProgramCheckinPanel rendered preview behavior', () => {
  let container: HTMLDivElement;
  let root: Root;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    (globalThis as typeof globalThis & { React?: typeof React }).React = React;
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock = jest.fn().mockResolvedValue({ ok: true } as Response);
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    delete (global as typeof globalThis & { fetch?: typeof fetch }).fetch;
    delete (globalThis as typeof globalThis & { React?: typeof React }).React;
  });

  test('renders the selected version/day template and records a local skipped state without a request', async () => {
    const onHandled = jest.fn();
    await act(async () => {
      root.render(
        <ProgramCheckinPanel runtimeSummary={summary} onHandled={onHandled} previewMode />,
      );
    });
    expect(container.textContent).toContain('Week one check-in');
    expect(container.textContent).toContain('Day 7');
    expect(container.textContent).toContain('Energy this week');
    expect(container.textContent).toContain('does not save check-in responses');
    expect(onHandled).not.toHaveBeenCalled();

    const skip = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent?.includes('Skip This Check-In'),
    );
    expect(skip).toBeTruthy();
    await act(async () => {
      skip!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onHandled).toHaveBeenCalledTimes(1);
    expect(onHandled.mock.calls[0][0]).toMatchObject({
      latest_checkin_response: {
        id: 'preview-checkin-response-7', enrollment_id: 'enrollment-1',
        checkin_template_id: 'template-day-7', checkin_day: 7,
        response_status: 'skipped',
        skipped_reason: 'Preview skipped response. No runtime data was written.',
        metadata: { preview: true },
      },
    });
  });

  test('renders nothing when the selected runtime day has no check-in template', async () => {
    await act(async () => {
      root.render(
        <ProgramCheckinPanel
          runtimeSummary={{ ...summary, next_checkin_template: null }}
          onHandled={jest.fn()}
          previewMode
        />,
      );
    });
    expect(container.textContent).toBe('');
  });
});
