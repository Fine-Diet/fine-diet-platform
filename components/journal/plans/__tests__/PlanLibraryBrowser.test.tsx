/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import {
  PlanLibraryBrowser,
  filterPlanLibraryItems,
  sortPlanLibraryItems,
  type PlanLibraryBrowserItem,
} from '../PlanLibraryBrowser';

function items(): PlanLibraryBrowserItem[] {
  return [
    {
      id: 'b',
      title: 'Busy Workweek',
      description: 'Saved week notes',
      metadata: '7 days',
      updatedAt: '2026-09-10T10:00:00.000Z',
      onSelect: jest.fn(),
    },
    {
      id: 'a',
      title: 'Standard Breakfast',
      description: null,
      metadata: '5 occasions · 4 Meals',
      updatedAt: '2026-09-15T10:00:00.000Z',
      onSelect: jest.fn(),
    },
    {
      id: 'c',
      title: 'Alpha Plan',
      description: 'Alpha description',
      updatedAt: '2026-09-01T10:00:00.000Z',
      onSelect: jest.fn(),
    },
  ];
}

describe('PlanLibraryBrowser sorting and search', () => {
  it('sorts recent by updatedAt descending', () => {
    const sorted = sortPlanLibraryItems(items(), 'recent');
    expect(sorted.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts A–Z and Z–A by title', () => {
    expect(sortPlanLibraryItems(items(), 'az').map((item) => item.title)).toEqual([
      'Alpha Plan',
      'Busy Workweek',
      'Standard Breakfast',
    ]);
    expect(sortPlanLibraryItems(items(), 'za').map((item) => item.title)).toEqual([
      'Standard Breakfast',
      'Busy Workweek',
      'Alpha Plan',
    ]);
  });

  it('filters by title and saved description independently of sort', () => {
    const filtered = filterPlanLibraryItems(items(), 'alpha');
    expect(filtered.map((item) => item.id)).toEqual(['c']);
    const sorted = sortPlanLibraryItems(filtered, 'recent');
    expect(sorted.map((item) => item.id)).toEqual(['c']);
  });
});

describe('PlanLibraryBrowser rendering', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { React: typeof React }).React = React;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders title and saved description without inventing fallback copy', () => {
    act(() =>
      root.render(
        <PlanLibraryBrowser
          query=""
          onQueryChange={() => undefined}
          items={items()}
          emptyMessage="No matching plans."
        />,
      ),
    );

    expect(container.textContent).toContain('Busy Workweek');
    expect(container.textContent).toContain('Saved week notes');
    expect(container.textContent).toContain('Standard Breakfast');
    expect(container.textContent).toContain('5 occasions · 4 Meals');
    expect(container.querySelector('select[aria-label="Sort library"]')).not.toBeNull();
    expect(container.querySelector('input[placeholder="Search"]')).not.toBeNull();
  });

  it('keeps library items as buttons', () => {
    const onSelect = jest.fn();
    act(() =>
      root.render(
        <PlanLibraryBrowser
          query=""
          onQueryChange={() => undefined}
          items={[
            {
              id: 'one',
              title: 'One',
              description: null,
              updatedAt: '2026-09-15T00:00:00.000Z',
              onSelect,
            },
          ]}
          emptyMessage="No matching plans."
        />,
      ),
    );

    const button = container.querySelector('button');
    act(() => button?.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
