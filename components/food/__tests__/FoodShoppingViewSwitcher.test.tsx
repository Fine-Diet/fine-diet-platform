/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { APP_ROUTES } from '@/lib/routes/appRoutes';

import { FoodShoppingViewSwitcher } from '../FoodShoppingViewSwitcher';

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

describe('FoodShoppingViewSwitcher', () => {
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

  it('renders collapsed Lists as Food › Lists', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="lists" />));
    expect(container.textContent).toContain('Food');
    expect(container.textContent).toContain('›');
    expect(container.textContent).toContain('Lists');
    expect(container.textContent).not.toContain('Hauls');
  });

  it('does not expose Hauls as a visible collapsed choice on Lists', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="lists" />));
    expect(container.querySelector('a[href="' + APP_ROUTES.foodHauls + '"]')).toBeNull();
  });

  it('expands when the current Lists trigger is clicked', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="lists" />));
    act(() => findButton(container, 'Lists').click());
    expect(findButton(container, 'Lists').getAttribute('aria-expanded')).toBe('true');
    expect(findLink(container, 'Hauls')).toBeTruthy();
  });

  it('links Hauls to the canonical hauls route', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="lists" />));
    act(() => findButton(container, 'Lists').click());
    expect(findLink(container, 'Hauls').getAttribute('href')).toBe(APP_ROUTES.foodHauls);
  });

  it('renders collapsed Hauls as Food › Hauls', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="hauls" />));
    expect(container.textContent).toContain('Food');
    expect(container.textContent).toContain('Hauls');
    expect(container.textContent).not.toContain('Lists');
  });

  it('reveals Lists when Hauls is expanded', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="hauls" />));
    act(() => findButton(container, 'Hauls').click());
    expect(findLink(container, 'Lists').getAttribute('href')).toBe(APP_ROUTES.foodLists);
  });

  it('links Food to the canonical food route', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="lists" />));
    expect(findLink(container, 'Food').getAttribute('href')).toBe(APP_ROUTES.food);
  });

  it('collapses on Escape and returns focus to the trigger', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="lists" />));
    const trigger = findButton(container, 'Lists');
    act(() => trigger.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('collapses on outside click', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="lists" />));
    const trigger = findButton(container, 'Lists');
    act(() => trigger.click());
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not render a dropdown or popover panel', () => {
    act(() => root.render(<FoodShoppingViewSwitcher currentView="lists" />));
    act(() => findButton(container, 'Lists').click());
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[aria-haspopup]')).toBeNull();
    expect(container.querySelector('.rounded-xl.border')).toBeNull();
  });
});
