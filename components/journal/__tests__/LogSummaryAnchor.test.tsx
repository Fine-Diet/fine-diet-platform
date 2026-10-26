/** @jest-environment jsdom */

import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useRouter } from 'next/router';
import { LogSummaryAnchor, LOG_SUMMARY_SECTION_ID } from '@/components/journal/LogSummaryAnchor';

jest.mock('next/router', () => ({ useRouter: jest.fn() }));

describe('LogSummaryAnchor', () => {
  let container: HTMLDivElement;
  let root: Root;
  let routerState: { isReady: boolean; query: Record<string, string> };

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    routerState = { isReady: false, query: {} };
    (useRouter as jest.Mock).mockImplementation(() => routerState);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  it('scrolls to the rendered summary section after a summary deep link hydrates', async () => {
    await act(async () => {
      root.render(<LogSummaryAnchor><p>Daily summary</p></LogSummaryAnchor>);
    });
    const target = container.querySelector(`#${LOG_SUMMARY_SECTION_ID}`) as HTMLElement;
    target.scrollIntoView = jest.fn();
    expect(target.id).toBe('daily-summary');
    expect(target.scrollIntoView).not.toHaveBeenCalled();

    routerState = { isReady: true, query: { section: 'summary' } };
    await act(async () => {
      root.render(<LogSummaryAnchor><p>Daily summary</p></LogSummaryAnchor>);
    });
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
  });
});
