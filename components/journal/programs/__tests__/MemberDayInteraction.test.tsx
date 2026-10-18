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
    expect(container.textContent).toContain('saved note');
    expect(container.textContent).toContain('Day 07 completed');
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).not.toContain('Save observation');
    expect(container.textContent).not.toContain('Mark day 07 completed');
    expect(container.textContent).not.toContain('Complete or skip this day’s check-in');
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

  it('persists Day 0, reloads it, and shows a rejected completion', async () => {
    const savedCompletion = {
      id: 'completion-day-0',
      enrollment_id: ENROLLMENT_ID,
      program_version_id: VERSION_ID,
      program_day: 0,
      completed_at: '2026-10-17T18:30:00.000Z',
    };
    let stored: typeof savedCompletion | null = null;
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (String(url).includes('observations')) {
        if (method === 'GET') {
          return jsonResponse({
            draft_text: 'ready',
            response_text: 'ready',
            saved_at: '2026-10-17T18:20:00.000Z',
            updated_at: '2026-10-17T18:20:00.000Z',
          });
        }
        const body = JSON.parse(String(init?.body));
        return jsonResponse({
          draft_text: body.text,
          response_text: body.text,
          saved_at: '2026-10-17T18:21:00.000Z',
          updated_at: '2026-10-17T18:21:00.000Z',
        });
      }
      if (method === 'GET') return jsonResponse(stored);
      const body = JSON.parse(String(init?.body));
      if (body.day !== 0) {
        return jsonResponse({
          error: 'Only Day 0 is available before the Program starts.',
          code: 'PROGRAM_DAY_NOT_UNLOCKED',
        }, 409);
      }
      stored = savedCompletion;
      return jsonResponse(stored);
    });

    const dayZero = panel({
      day: 0,
      observation: {
        contentKey: 'baseline-candidate-day-0-note',
        prompt: 'What do you want ready before Day 1?',
        required: true,
      },
      checkinRequired: false,
      checkinHandled: true,
    });
    await renderPanel(dayZero);
    expect(container.querySelector('textarea')?.value).toBe('ready');
    expect(container.textContent).toContain('Saved response: ready');

    const complete = () => Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Mark day 00 completed');
    await act(async () => {
      complete()?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('Day 00 completed');
    expect(JSON.parse(String(fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')?.[1].body))).toEqual({ day: 0 });

    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await renderPanel(dayZero);
    expect(container.textContent).toContain('Day 00 completed');
    expect(container.textContent).toContain('Saved response: ready');
    expect(fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
  });

  it('keeps a rejected Day 0 completion uncommitted', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes('observations')) {
        return jsonResponse({
          draft_text: 'ready',
          response_text: 'ready',
          saved_at: '2026-10-17T18:20:00.000Z',
          updated_at: '2026-10-17T18:20:00.000Z',
        });
      }
      if ((init?.method ?? 'GET') === 'GET') return jsonResponse(null);
      return jsonResponse({
        error: 'This day has no published delivery content and cannot be completed.',
        code: 'PROGRAM_DAY_REQUIREMENTS_UNMET',
      }, 409);
    });

    await renderPanel(panel({
      day: 0,
      checkinRequired: false,
      checkinHandled: true,
      observation: null,
    }));
    const complete = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === 'Mark day 00 completed');
    await act(async () => {
      complete?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain('no published delivery content');
    expect(container.textContent).not.toContain('Day 00 completed');
  });

  it.each([
    ['required', 7, false],
    ['completed', 7, true],
    ['skipped', 14, true],
    ['stale', 21, false],
  ] as const)('%s check-in on day %s is actionable: %s', async (state, day, actionable) => {
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
      return jsonResponse({
        id: 'completion-1',
        enrollment_id: ENROLLMENT_ID,
        program_version_id: VERSION_ID,
        program_day: day,
        completed_at: '2026-10-17T18:04:00.000Z',
      });
    });

    await renderPanel(panel({
      day,
      checkinRequired: true,
      checkinHandled: actionable,
      observation: {
        contentKey: `baseline-candidate-day-${day}-reflection`,
        prompt: 'What pattern do you want to carry forward?',
        required: true,
      },
    }));
    const complete = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent === `Mark day ${String(day).padStart(2, '0')} completed`) as HTMLButtonElement;
    expect(['required', 'completed', 'skipped', 'stale']).toContain(state);
    expect(complete.disabled).toBe(!actionable);
    if (!actionable) {
      expect(container.textContent).toContain('Complete or skip this day’s check-in');
    }
    await act(async () => {
      complete.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const posts = fetchMock.mock.calls.filter((call) => call[1]?.method === 'POST');
    if (actionable) {
      expect(posts).toHaveLength(1);
      expect(JSON.parse(String(posts[0][1].body))).toEqual({ day });
      expect(container.textContent).toContain(`Day ${String(day).padStart(2, '0')} completed`);
    } else {
      expect(posts).toHaveLength(0);
      expect(container.textContent).not.toContain(`Day ${String(day).padStart(2, '0')} completed`);
    }
  });

  test('historical review shows a saved observation without write controls or check-in actions', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes('observations')) {
        return jsonResponse({
          draft_text: 'saved note',
          response_text: 'saved note',
          saved_at: '2026-10-17T18:00:00.000Z',
          updated_at: '2026-10-17T18:00:00.000Z',
        });
      }
      return jsonResponse(null);
    });
    await renderPanel(panel({
      writable: false,
      readOnlyReason: 'This enrollment is paused. Saved responses stay available to read.',
      checkinRequired: true,
      checkinHandled: false,
    }));
    expect(container.textContent).toContain('saved note');
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).not.toContain('Complete or skip this day’s check-in');
    expect(fetchMock.mock.calls.every((call) => (call[1]?.method ?? 'GET') === 'GET')).toBe(true);
  });
});
