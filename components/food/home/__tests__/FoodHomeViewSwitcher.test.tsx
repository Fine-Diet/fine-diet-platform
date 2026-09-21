/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { APP_ROUTES } from '@/lib/routes/appRoutes';

import { FoodHomeViewSwitcher } from '../FoodHomeViewSwitcher';

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    onClick,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
  }) =>
    React.createElement(
      'a',
      {
        href,
        onClick: (event: { preventDefault: () => void }) => {
          event.preventDefault();
          onClick?.();
        },
        ...rest,
      },
      children,
    ),
}));

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

function findButton(container: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`Button not found: ${label}`);
  return button;
}

function findLink(container: HTMLElement, label: string): HTMLAnchorElement {
  const link = Array.from(container.querySelectorAll('a')).find(
    (candidate) => candidate.textContent === label,
  );
  if (!link) throw new Error(`Link not found: ${label}`);
  return link as HTMLAnchorElement;
}

describe('FoodHomeViewSwitcher', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (global as unknown as { React: typeof React }).React = React;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    mockMatchMedia(true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders collapsed Overview as Food › Overview', async () => {
    await act(async () => {
      root.render(<FoodHomeViewSwitcher currentView="overview" />);
    });
    expect(container.textContent).toContain('Food');
    expect(container.textContent).toContain('›');
    expect(container.textContent).toContain('Overview');
    expect(container.textContent).not.toContain('Pantry');
    expect(container.textContent).not.toContain('Recipes');
  });

  it('expands to Pantry, Recipes, Lists, and Hauls in canonical order on desktop', async () => {
    await act(async () => {
      root.render(<FoodHomeViewSwitcher currentView="overview" />);
    });
    await act(async () => findButton(container, 'Overview').click());
    const labels = Array.from(container.querySelectorAll('button, a'))
      .map((node) => node.textContent?.trim())
      .filter((label) =>
        ['Overview', 'Pantry', 'Recipes', 'Lists', 'Hauls'].includes(label ?? ''),
      );
    expect(labels).toEqual(['Overview', 'Pantry', 'Recipes', 'Lists', 'Hauls']);
  });

  it('links Food to the canonical food route', async () => {
    await act(async () => {
      root.render(<FoodHomeViewSwitcher currentView="overview" />);
    });
    expect(findLink(container, 'Food').getAttribute('href')).toBe(APP_ROUTES.food);
  });

  it('links Pantry, Recipes, Lists, and Hauls to canonical routes', async () => {
    await act(async () => {
      root.render(<FoodHomeViewSwitcher currentView="overview" />);
    });
    await act(async () => findButton(container, 'Overview').click());
    expect(findLink(container, 'Pantry').getAttribute('href')).toBe(APP_ROUTES.foodPantry);
    expect(findLink(container, 'Recipes').getAttribute('href')).toBe(APP_ROUTES.foodMeals);
    expect(findLink(container, 'Lists').getAttribute('href')).toBe(APP_ROUTES.foodLists);
    expect(findLink(container, 'Hauls').getAttribute('href')).toBe(APP_ROUTES.foodHauls);
  });

  it('collapses on Escape and returns focus to the trigger', async () => {
    await act(async () => {
      root.render(<FoodHomeViewSwitcher currentView="overview" />);
    });
    const trigger = findButton(container, 'Overview');
    await act(async () => trigger.click());
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('collapses on outside click', async () => {
    await act(async () => {
      root.render(<FoodHomeViewSwitcher currentView="overview" />);
    });
    const trigger = findButton(container, 'Overview');
    await act(async () => trigger.click());
    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not render a dropdown or popover panel', async () => {
    await act(async () => {
      root.render(<FoodHomeViewSwitcher currentView="overview" />);
    });
    await act(async () => findButton(container, 'Overview').click());
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[aria-haspopup]')).toBeNull();
    expect(container.querySelector('.rounded-xl.border')).toBeNull();
  });

  describe('mobile sibling rail', () => {
    beforeEach(() => {
      mockMatchMedia(false);
    });

    it('keeps Overview outside the sibling scroll rail', async () => {
      await act(async () => {
        root.render(<FoodHomeViewSwitcher currentView="overview" />);
      });
      await act(async () => findButton(container, 'Overview').click());
      const rail = container.querySelector('[data-food-home-sibling-rail]');
      expect(rail).toBeTruthy();
      expect(rail?.textContent).toContain('Pantry');
      expect(rail?.textContent).not.toContain('Overview');
    });

    it('renders sibling rail with horizontal overflow classes when expanded', async () => {
      await act(async () => {
        root.render(<FoodHomeViewSwitcher currentView="overview" />);
      });
      await act(async () => findButton(container, 'Overview').click());
      const rail = container.querySelector('[data-food-home-sibling-rail]');
      expect(rail?.className).toContain('overflow-x-auto');
      expect(rail?.className).toContain('scrollbar-hide');
      expect(rail?.className).toContain('touch-pan-x');
    });

    it('hides sibling rail while collapsed', async () => {
      await act(async () => {
        root.render(<FoodHomeViewSwitcher currentView="overview" />);
      });
      expect(container.querySelector('[data-food-home-sibling-rail]')).toBeNull();
    });

    it('resets sibling rail scroll position when reopened', async () => {
      await act(async () => {
        root.render(<FoodHomeViewSwitcher currentView="overview" />);
      });
      await act(async () => findButton(container, 'Overview').click());
      const rail = container.querySelector('[data-food-home-sibling-rail]') as HTMLDivElement;
      rail.scrollLeft = 120;
      await act(async () => findButton(container, 'Overview').click());
      await act(async () => findButton(container, 'Overview').click());
      const reopenedRail = container.querySelector('[data-food-home-sibling-rail]') as HTMLDivElement;
      expect(reopenedRail.scrollLeft).toBe(0);
    });
  });
});
