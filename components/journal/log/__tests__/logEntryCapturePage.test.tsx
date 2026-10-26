/** @jest-environment jsdom */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useRouter } from 'next/router';
import { journalService } from '@/lib/journal';
import { onAuthStateChange } from '@/lib/authHelpers';
import { LogEntryCapturePage } from '@/components/journal/log/LogEntryCapturePage';

jest.mock('next/router', () => ({ useRouter: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
jest.mock('@/lib/authHelpers', () => ({ onAuthStateChange: jest.fn(() => () => {}) }));
jest.mock('@/lib/journal', () => ({
  journalService: { createEntry: jest.fn() },
  parseLocalDate: (value?: string) => {
    if (!value) return new Date(2026, 9, 25);
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  },
  setTimeOnDate: (date: Date, time: string) => {
    const [hour, minute] = time.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hour, minute, 0, 0);
    return result;
  },
  formatTime: (date: Date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`,
  TIME_BLOCK_DEFAULTS: { morning: '08:00', midday: '12:00', evening: '18:00' },
  toDateKey: (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
  deriveBlock: (date: Date) => date.getHours() < 12 ? 'morning' : date.getHours() < 17 ? 'midday' : 'evening',
}));

describe('LogEntryCapturePage', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    (useRouter as jest.Mock).mockReturnValue({
      isReady: true,
      query: { date: '2026-10-24', time: '09:15' },
    });
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ enabled_tracking_keys: ['water'] }),
    });
    (journalService.createEntry as jest.Mock).mockResolvedValue({ id: 'synthetic-entry' });
  });

  const setInputValue = (input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) => {
    act(() => {
      const prototype = input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : input instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('shows WaterForm and sends a dated water entry through journalService', async () => {
    await act(async () => {
      root.render(<LogEntryCapturePage tab="water" />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Hydration');
    expect(container.textContent).toContain('Custom Amount');
    expect(container.textContent).not.toContain('Search foods');

    await act(async () => {
      const form = container.querySelector('form');
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(journalService.createEntry).toHaveBeenCalledWith(expect.objectContaining({
      type: 'water',
      date: expect.any(Date),
      occurredAt: expect.any(Date),
      time: '09:15',
      payload: { amount: 8, unit: 'oz' },
      block: 'morning',
    }));
    expect(container.textContent).toContain('Hydration entry saved.');
  });

  it('shows a visible save error when the journal API rejects the entry', async () => {
    (journalService.createEntry as jest.Mock).mockRejectedValueOnce(new Error('Save denied'));
    await act(async () => {
      root.render(<LogEntryCapturePage tab="water" />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Save denied');
  });

  it('preserves unfinished Hydration input while a focus preference refresh is pending', async () => {
    let resolveRefresh!: (response: { ok: boolean; json: () => Promise<{ enabled_tracking_keys: string[] }> }) => void;
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled_tracking_keys: ['water'] }) })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    await act(async () => { root.render(<LogEntryCapturePage tab="water" />); await Promise.resolve(); });
    const amount = container.querySelector('input[type="number"]') as HTMLInputElement;
    setInputValue(amount, '20');
    const form = container.querySelector('form');
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(container.querySelector('form')).toBe(form);
    expect((container.querySelector('form button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('20');
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(journalService.createEntry).not.toHaveBeenCalled();
    await act(async () => { resolveRefresh({ ok: true, json: async () => ({ enabled_tracking_keys: ['water'] }) }); await Promise.resolve(); });
    expect(container.querySelector('form')).toBe(form);
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('20');
  });

  it('preserves unfinished Supplement input while same-account preferences refresh', async () => {
    let resolveRefresh!: (response: { ok: boolean; json: () => Promise<{ enabled_tracking_keys: string[] }> }) => void;
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled_tracking_keys: ['supplements'] }) })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    await act(async () => { root.render(<LogEntryCapturePage tab="supplements" />); await Promise.resolve(); });
    const name = container.querySelector('input[type="text"]') as HTMLInputElement;
    setInputValue(name, 'Vitamin C');
    const form = container.querySelector('form');
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(container.querySelector('form')).toBe(form);
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Vitamin C');
    await act(async () => { resolveRefresh({ ok: true, json: async () => ({ enabled_tracking_keys: ['supplements'] }) }); await Promise.resolve(); });
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Vitamin C');
  });

  it('preserves the draft and pauses saves after a failed same-account refresh until retry succeeds', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled_tracking_keys: ['water'] }) })
      .mockRejectedValueOnce(new Error('Temporary preference check failure'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled_tracking_keys: ['water'] }) });
    await act(async () => { root.render(<LogEntryCapturePage tab="water" />); await Promise.resolve(); });
    setInputValue(container.querySelector('input[type="number"]') as HTMLInputElement, '32');
    const form = container.querySelector('form');

    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(container.querySelector('form')).toBe(form);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('permission could not be revalidated');
    expect((container.querySelector('form button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('32');
    await act(async () => { form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(journalService.createEntry).not.toHaveBeenCalled();
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('32');

    await act(async () => { (container.querySelector('[role="alert"] button') as HTMLButtonElement).click(); await Promise.resolve(); });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('form')).toBe(form);
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('32');
    await act(async () => { form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(journalService.createEntry).toHaveBeenCalledTimes(1);
  });

  it('discards a draft when a successful same-account refresh confirms tracking is disabled', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled_tracking_keys: ['water'] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ enabled_tracking_keys: ['sleep'] }) });
    await act(async () => { root.render(<LogEntryCapturePage tab="water" />); await Promise.resolve(); });
    setInputValue(container.querySelector('input[type="number"]') as HTMLInputElement, '24');
    await act(async () => { window.dispatchEvent(new Event('focus')); await Promise.resolve(); });
    expect(container.textContent).toContain('Hydration is turned off');
    expect(container.querySelector('form')).toBeNull();
    await act(async () => { container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(journalService.createEntry).not.toHaveBeenCalled();
  });

  it.each([
    { tab: 'sleep', key: 'sleep', selector: 'textarea', value: 'Night waking', extra: [] },
    { tab: 'mood', key: 'mood', selector: 'textarea', value: 'Feeling steady', extra: [] },
    { tab: 'bowel', key: 'bowel', selector: 'input[type="text"]', value: 'Mild cramping', extra: [] },
    { tab: 'cycle', key: 'cycle', selector: 'input[type="text"]', value: 'Fatigue', extra: [] },
    { tab: 'movement', key: 'movement', selector: 'input[type="text"]', value: 'Yoga', extra: [] },
    { tab: 'blood_pressure', key: 'blood_pressure', selector: 'input[type="number"]', value: '122', extra: [{ selector: 'input[type="number"]', index: 1, value: '81' }] },
  ])('%s keeps entered values after a failed save and clears them after retry', async ({ tab, key, selector, value, extra = [] }) => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ enabled_tracking_keys: [key] }) });
    (journalService.createEntry as jest.Mock)
      .mockRejectedValueOnce(new Error(`${tab} save failed`))
      .mockResolvedValueOnce({ id: `${tab}-retry` });
    await act(async () => { root.render(<LogEntryCapturePage tab={tab} />); await Promise.resolve(); });
    const field = container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
    expect(field).not.toBeNull();
    setInputValue(field!, value);
    for (const { selector: extraSelector, index = 0, value: extraValue } of extra) {
      setInputValue(container.querySelectorAll(extraSelector)[index] as HTMLInputElement, extraValue);
    }
    const form = container.querySelector('form');

    await act(async () => { form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(`${tab} save failed`);
    expect((container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement).value).toBe(value);

    await act(async () => { form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(journalService.createEntry).toHaveBeenCalledTimes(2);
    expect((container.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement).value).toBe('');
  });

  it('invalidates the previous account draft immediately when auth changes', async () => {
    let authCallback: ((event: string, session: { user: { id: string } } | null) => void) | undefined;
    (onAuthStateChange as jest.Mock).mockImplementation((callback) => { authCallback = callback; return () => {}; });
    await act(async () => { root.render(<LogEntryCapturePage tab="water" />); await Promise.resolve(); });
    await act(async () => { authCallback?.('SIGNED_IN', { user: { id: 'current-account' } }); await Promise.resolve(); });
    setInputValue(container.querySelector('input[type="number"]') as HTMLInputElement, '20');
    let resolveRefresh!: (response: { ok: boolean; json: () => Promise<{ enabled_tracking_keys: string[] }> }) => void;
    (global.fetch as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
    await act(async () => { authCallback?.('SIGNED_IN', { user: { id: 'different-account' } }); await Promise.resolve(); });
    expect(container.querySelector('form')).toBeNull();
    await act(async () => { resolveRefresh({ ok: true, json: async () => ({ enabled_tracking_keys: ['water'] }) }); await Promise.resolve(); });
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('8');
    await act(async () => { authCallback?.('SIGNED_OUT', null); await Promise.resolve(); });
    expect(container.querySelector('form')).toBeNull();
    expect(journalService.createEntry).not.toHaveBeenCalled();
  });

  it('keeps Water values after a failed save and clears them only after retry succeeds', async () => {
    (journalService.createEntry as jest.Mock)
      .mockRejectedValueOnce(new Error('Water save failed'))
      .mockResolvedValueOnce({ id: 'water-retry' });
    await act(async () => { root.render(<LogEntryCapturePage tab="water" />); await Promise.resolve(); });
    setInputValue(container.querySelector('input[type="number"]') as HTMLInputElement, '20');
    await act(async () => { container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Water save failed');
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('20');
    await act(async () => { container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(journalService.createEntry).toHaveBeenCalledTimes(2);
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('8');
  });

  it('keeps Supplement values after a failed save and allows a successful retry', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ enabled_tracking_keys: ['supplements'] }) });
    (journalService.createEntry as jest.Mock)
      .mockRejectedValueOnce(new Error('Supplement save failed'))
      .mockResolvedValueOnce({ id: 'supplement-retry' });
    await act(async () => { root.render(<LogEntryCapturePage tab="supplements" />); await Promise.resolve(); });
    setInputValue(container.querySelector('input[type="text"]') as HTMLInputElement, 'Vitamin C');
    setInputValue(container.querySelector('input[type="number"]') as HTMLInputElement, '500');
    await act(async () => { container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Supplement save failed');
    expect((container.querySelector('input[type="text"]') as HTMLInputElement).value).toBe('Vitamin C');
    expect((container.querySelector('input[type="number"]') as HTMLInputElement).value).toBe('500');
    await act(async () => { container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(journalService.createEntry).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('entry saved');
  });

  it.each(['24:00', '25:15', '99:99', '12:60'])('rejects invalid route time %s without calling the journal service', async (time) => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { date: '2026-10-24', time } });
    await act(async () => {
      root.render(<LogEntryCapturePage tab="water" />);
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('selected time is invalid');

    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(journalService.createEntry).not.toHaveBeenCalled();
  });

  it.each(['00:00', '23:59'])('keeps a valid boundary time on the selected historical date: %s', async (time) => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { date: '2024-02-29', time } });
    await act(async () => {
      root.render(<LogEntryCapturePage tab="water" />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    const payload = (journalService.createEntry as jest.Mock).mock.calls[0]?.[0];
    expect(payload.date.getFullYear()).toBe(2024);
    expect(payload.date.getMonth()).toBe(1);
    expect(payload.date.getDate()).toBe(29);
    expect(payload.occurredAt.getFullYear()).toBe(2024);
    expect(payload.occurredAt.getMonth()).toBe(1);
    expect(payload.occurredAt.getDate()).toBe(29);
    expect(payload.time).toBe(time);
  });

  it('uses the requested block default time for historical Daily Summary links', async () => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { date: '2024-06-18', block: 'midday' } });
    await act(async () => {
      root.render(<LogEntryCapturePage tab="water" />);
      await Promise.resolve();
    });
    expect((container.querySelector('input[type="time"]') as HTMLInputElement).value).toBe('12:00');

    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(journalService.createEntry).toHaveBeenCalledWith(expect.objectContaining({
      date: expect.objectContaining({ getFullYear: expect.any(Function) }),
      time: '12:00',
      block: 'midday',
      occurredAt: expect.any(Date),
    }));
    const saved = (journalService.createEntry as jest.Mock).mock.calls[0]?.[0];
    expect(saved.date.toISOString()).toContain('2024-06-18');
    expect(saved.occurredAt.getHours()).toBe(12);
  });

  it('rejects a calendar date that would otherwise roll into another day', async () => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { date: '2026-02-31', time: '08:00' } });
    await act(async () => {
      root.render(<LogEntryCapturePage tab="water" />);
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('selected date is invalid');
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(journalService.createEntry).not.toHaveBeenCalled();
  });

  it('resets dated context and save feedback when switching tracker routes', async () => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { date: '2026-10-20', time: '10:30' } });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ enabled_tracking_keys: ['water', 'sleep'] }) });
    (journalService.createEntry as jest.Mock).mockRejectedValueOnce(new Error('Save denied'));
    await act(async () => {
      root.render(<LogEntryCapturePage tab="water" />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Save denied');

    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { tab: 'sleep' } });
    await act(async () => {
      root.render(<LogEntryCapturePage tab="sleep" />);
      await Promise.resolve();
    });
    const date = (container.querySelector('input[type="date"]') as HTMLInputElement).value;
    const today = new Date();
    expect(date).toBe(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    expect((container.querySelector('input[type="time"]') as HTMLInputElement).value).toBe('08:00');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('clears a prior success message when switching tracker routes', async () => {
    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { date: '2026-10-20', time: '10:30' } });
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ enabled_tracking_keys: ['water', 'sleep'] }) });
    await act(async () => {
      root.render(<LogEntryCapturePage tab="water" />);
      await Promise.resolve();
    });
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain('entry saved');

    (useRouter as jest.Mock).mockReturnValue({ isReady: true, query: { tab: 'sleep' } });
    await act(async () => {
      root.render(<LogEntryCapturePage tab="sleep" />);
      await Promise.resolve();
    });
    expect(container.querySelector('[role="status"]')).toBeNull();
  });

  it('fails closed when the requested tracker is not enabled', async () => {
    await act(async () => {
      root.render(<LogEntryCapturePage tab="mood" />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Mood is turned off');
    expect(container.textContent).not.toContain('Search foods');
    expect(journalService.createEntry).not.toHaveBeenCalled();
  });

  it('explains reserved tracking add-ons without offering an entry route', async () => {
    await act(async () => {
      root.render(<LogEntryCapturePage tab="glucose" />);
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Glucose capture is coming soon');
    expect(journalService.createEntry).not.toHaveBeenCalled();
  });
});
