/** @jest-environment jsdom */

import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemberDayInteraction } from '../MemberDayInteraction';

const ENROLLMENT_ID = 'a7c40dd7-f660-4eb9-a04f-d0a7593fe1a2';
const VERSION_ID = 'f5c52fd9-b8a0-48bc-a7bb-2100d21b0021';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function panel(overrides: Partial<React.ComponentProps<typeof MemberDayInteraction>> = {}) {
  return (
    <MemberDayInteraction
      enrollmentId={ENROLLMENT_ID}
      versionId={VERSION_ID}
      day={7}
      writable
      readOnlyReason={null}
      observation={{
        contentKey: 'baseline-candidate-day-7-reflection',
        prompt: 'What pattern do you want to carry forward?',
        required: true,
      }}
      checkinRequired
      checkinHandled={false}
      {...overrides}
    />
  );
}

describe('MemberDayInteraction', () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = jest.fn();

  beforeEach(() => {
    (globalThis as typeof globalThis & { React?: typeof React }).React = React;
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });

  async function renderPanel(node: React.ReactElement) {
    await act(async () => {
      root.render(node);
    });
  }

  it('reloads the saved response, autosaves a draft, and saves explicitly', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (String(url).includes('complete-day')) return jsonResponse(null);
      if (method === 'GET') {
        return jsonResponse({
          draft_text: 'saved note',
          response_text: 'saved note',
          saved_at: '2026-10-17T18:00:00.000Z',
          updated_at: '2026-10-17T18:00:00.000Z',
        });
      }
      const body = JSON.parse(String(init?.body));
      return jsonResponse({
        draft_text: body.text,
        response_text: body.action === 'save' ? body.text : 'saved note',
        saved_at: '2026-10-17T18:00:00.000Z',
        updated_at: '2026-10-17T18:01:00.000Z',
      });
    });

    await renderPanel(panel());
    const editor = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(editor.value).toBe('saved note');
    expect(container.textContent).toContain('Saved response: saved note');
    expect(container.textContent).toContain('Complete or skip this day’s check-in');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(editor, 'newer draft');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      jest.advanceTimersByTime(500);
    });

    const save = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save observation');
    await act(async () => {
      save?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const writes = fetchMock.mock.calls.filter((call) => call[1]?.method === 'PUT');
    const actions = writes.map((call) => JSON.parse(String(call[1].body)).action);
    expect(actions).toContain('draft');
    expect(actions).toContain('save');
    expect(writes.every((call) => !String(call[1].body).includes(VERSION_ID))).toBe(true);
  });

  it('keeps a paused enrollment readable and blocks a new completion', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('complete-day')) {
        return jsonResponse({
          id: 'completion-1',
          enrollment_id: ENROLLMENT_ID,
          program_version_id: VERSION_ID,
          program_day: 7,
          completed_at: '2026-10-17T18:00:00.000Z',
        });
      }
      return jsonResponse({
        draft_text: 'saved note',
        response_text: 'saved note',
        saved_at: '2026-10-17T17:00:00.000Z',
        updated_at: '2026-10-17T17:00:00.000Z',
      });
    });

    await renderPanel(panel({
      writable: false,
      readOnlyReason: 'This enrollment is paused. Saved responses stay available to read.',
    }));

    expect(container.textContent).toContain('This enrollment is paused');
    expect(container.textContent).toContain('Day 07 completed');
    expect(container.querySelector('textarea')?.readOnly).toBe(true);
    expect(container.textContent).not.toContain('Save observation');
    expect(container.textContent).not.toContain('Mark day 07 completed');
  });

  it('shows a published-content failure and retries the same completion', async () => {
    let completions = 0;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('observations')) {
        return jsonResponse({
          draft_text: 'saved note',
          response_text: 'saved note',
          saved_at: '2026-10-17T18:00:00.000Z',
          updated_at: '2026-10-17T18:00:00.000Z',
        });
      }
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse(null);
      completions += 1;
      if (completions === 1) {
        return jsonResponse({
          error: 'This day has no published delivery content and cannot be completed.',
          code: 'PROGRAM_DAY_REQUIREMENTS_UNMET',
        }, 409);
      }
      return jsonResponse({
        id: 'completion-1',
        enrollment_id: ENROLLMENT_ID,
        program_version_id: VERSION_ID,
        program_day: 7,
        completed_at: '2026-10-17T18:04:00.000Z',
      });
    });

    await renderPanel(panel({ checkinRequired: false, checkinHandled: true }));
    const complete = () => Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Mark day'));
    await act(async () => {
      complete()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('no published delivery content');
    const retry = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Retry');
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Day 07 completed');
    expect(completions).toBe(2);
  });
});
