/**
 * @jest-environment jsdom
 */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';

import { APP_ROUTES } from '@/lib/routes/appRoutes';

import { PlansViewSwitcher } from '../PlansViewSwitcher';

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

describe('PlansViewSwitcher', () => {
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

  it('renders collapsed Day as Plans › Day', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    expect(container.textContent).toContain('Plans');
    expect(container.textContent).toContain('›');
    expect(container.textContent).toContain('Day');
    expect(container.textContent).not.toContain('Week');
    expect(container.textContent).not.toContain('Month');
  });

  it('does not expose Week or Month as visible collapsed choices', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    expect(container.querySelector('a[href="' + APP_ROUTES.plansWeek + '"]')).toBeNull();
    expect(container.querySelector('a[href="' + APP_ROUTES.plansMonth + '"]')).toBeNull();
  });

  it('expands when the current view trigger is clicked', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    act(() => findButton(container, 'Day').click());
    expect(findButton(container, 'Day').getAttribute('aria-expanded')).toBe('true');
    expect(findLink(container, 'Week')).toBeTruthy();
    expect(findLink(container, 'Month')).toBeTruthy();
  });

  it('shows expanded options in canonical Day, Week, Month order', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    act(() => findButton(container, 'Day').click());
    const labels = Array.from(container.querySelectorAll('button, a'))
      .map((node) => node.textContent?.trim())
      .filter((label) => label === 'Day' || label === 'Week' || label === 'Month');
    expect(labels).toEqual(['Day', 'Week', 'Month']);
  });

  it('styles the current Day view as active', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    act(() => findButton(container, 'Day').click());
    expect(findButton(container, 'Day').className).toContain('text-white');
    expect(findLink(container, 'Week').className).toContain('text-white/45');
  });

  it('collapses on Escape and returns focus to the trigger', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    const trigger = findButton(container, 'Day');
    act(() => trigger.click());
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('collapses on outside click', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    const trigger = findButton(container, 'Day');
    act(() => trigger.click());
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('collapses without navigation when selecting the current Day view', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    const trigger = findButton(container, 'Day');
    act(() => trigger.click());
    act(() => trigger.click());
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('links Week to the canonical week route', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    act(() => findButton(container, 'Day').click());
    expect(findLink(container, 'Week').getAttribute('href')).toBe(APP_ROUTES.plansWeek);
  });

  it('links Month to the canonical month route', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    act(() => findButton(container, 'Day').click());
    expect(findLink(container, 'Month').getAttribute('href')).toBe(APP_ROUTES.plansMonth);
  });

  it('does not render a dropdown or popover panel', () => {
    act(() => root.render(<PlansViewSwitcher currentView="day" />));
    act(() => findButton(container, 'Day').click());
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[aria-haspopup]')).toBeNull();
    expect(container.querySelector('.rounded-xl.border')).toBeNull();
  });
});
