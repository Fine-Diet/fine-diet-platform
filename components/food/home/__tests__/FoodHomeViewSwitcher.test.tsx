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
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('renders collapsed Overview as Food › Overview', () => {
    act(() => root.render(<FoodHomeViewSwitcher currentView="overview" />));
    expect(container.textContent).toContain('Food');
    expect(container.textContent).toContain('›');
    expect(container.textContent).toContain('Overview');
    expect(container.textContent).not.toContain('Pantry');
    expect(container.textContent).not.toContain('Recipes');
  });

  it('expands to Pantry, Recipes, Lists, and Hauls in canonical order', () => {
    act(() => root.render(<FoodHomeViewSwitcher currentView="overview" />));
    act(() => findButton(container, 'Overview').click());
    const labels = Array.from(container.querySelectorAll('button, a'))
      .map((node) => node.textContent?.trim())
      .filter((label) =>
        ['Overview', 'Pantry', 'Recipes', 'Lists', 'Hauls'].includes(label ?? ''),
      );
    expect(labels).toEqual(['Overview', 'Pantry', 'Recipes', 'Lists', 'Hauls']);
  });

  it('links Food to the canonical food route', () => {
    act(() => root.render(<FoodHomeViewSwitcher currentView="overview" />));
    expect(findLink(container, 'Food').getAttribute('href')).toBe(APP_ROUTES.food);
  });

  it('links Pantry, Recipes, Lists, and Hauls to canonical routes', () => {
    act(() => root.render(<FoodHomeViewSwitcher currentView="overview" />));
    act(() => findButton(container, 'Overview').click());
    expect(findLink(container, 'Pantry').getAttribute('href')).toBe(APP_ROUTES.foodPantry);
    expect(findLink(container, 'Recipes').getAttribute('href')).toBe(APP_ROUTES.foodMeals);
    expect(findLink(container, 'Lists').getAttribute('href')).toBe(APP_ROUTES.foodLists);
    expect(findLink(container, 'Hauls').getAttribute('href')).toBe(APP_ROUTES.foodHauls);
  });

  it('collapses on Escape and returns focus to the trigger', () => {
    act(() => root.render(<FoodHomeViewSwitcher currentView="overview" />));
    const trigger = findButton(container, 'Overview');
    act(() => trigger.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('collapses on outside click', () => {
    act(() => root.render(<FoodHomeViewSwitcher currentView="overview" />));
    const trigger = findButton(container, 'Overview');
    act(() => trigger.click());
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not render a dropdown or popover panel', () => {
    act(() => root.render(<FoodHomeViewSwitcher currentView="overview" />));
    act(() => findButton(container, 'Overview').click());
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[aria-haspopup]')).toBeNull();
    expect(container.querySelector('.rounded-xl.border')).toBeNull();
  });
});
