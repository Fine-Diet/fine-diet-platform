'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { cn } from '@/lib/utils';

export type PlansView = 'overview' | 'day' | 'week' | 'month' | 'library';

const VIEW_OPTIONS: Array<{ id: PlansView; label: string; href: string }> = [
  { id: 'overview', label: 'Overview', href: APP_ROUTES.plans },
  { id: 'day', label: 'Day', href: APP_ROUTES.plansDay },
  { id: 'week', label: 'Week', href: APP_ROUTES.plansWeek },
  { id: 'month', label: 'Month', href: APP_ROUTES.plansMonth },
  { id: 'library', label: 'Library', href: APP_ROUTES.plansLibrary },
];

const EXPANDED_MAX_WIDTH = '36rem';

const COLLAPSED_MAX_WIDTH: Record<PlansView, string> = {
  overview: '7.5rem',
  day: '3.25rem',
  week: '4.25rem',
  month: '5.25rem',
  library: '5.75rem',
};

const optionClassName =
  'font-semibold decoration-2 underline-offset-[5px] transition-all duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none';

const siblingLinkClassName = cn(
  optionClassName,
  'text-white/45 hover:text-white hover:underline focus-visible:text-white focus-visible:underline',
);

function resetMobileRailScroll(element: HTMLDivElement | null) {
  if (!element) return;
  if (typeof element.scrollTo === 'function') {
    element.scrollTo({ left: 0 });
    return;
  }
  element.scrollLeft = 0;
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia('(min-width: 640px)');
    const update = () => setIsDesktop(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  return isDesktop;
}

export interface PlansViewSwitcherProps {
  currentView: PlansView;
  align?: 'center' | 'left';
  anchorBackgroundClass?: string;
  className?: string;
}

export function PlansViewSwitcher({
  currentView,
  align = 'left',
  anchorBackgroundClass,
  className,
}: PlansViewSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileRailRef = useRef<HTMLDivElement>(null);
  const optionsId = useId();
  const isDesktop = useIsDesktop();

  const currentOption = VIEW_OPTIONS.find((option) => option.id === currentView) ?? VIEW_OPTIONS[0];
  const siblingOptions = VIEW_OPTIONS.filter((option) => option.id !== currentView);
  const collapsedMaxWidth = COLLAPSED_MAX_WIDTH[currentView];
  const isCentered = align === 'center';

  useEffect(() => {
    if (!expanded || isDesktop) return;
    resetMobileRailScroll(mobileRailRef.current);
  }, [expanded, isDesktop]);

  useEffect(() => {
    if (!expanded) return;

    function handlePointerDown(event: MouseEvent) {
      if (regionRef.current?.contains(event.target as Node)) return;
      setExpanded(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setExpanded(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [expanded]);

  function handleSiblingFocus(event: React.FocusEvent<HTMLAnchorElement>) {
    event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  if (!isDesktop) {
    return (
      <div
        ref={regionRef}
        className={cn(
          'flex items-center gap-2 text-2xl font-semibold text-white',
          expanded ? 'w-full max-w-full' : isCentered ? 'justify-center' : '',
          className,
        )}
        data-plans-section-align={align}
      >
        <div
          className={cn(
            'relative z-20 flex shrink-0 items-center gap-2',
            expanded && anchorBackgroundClass && cn(anchorBackgroundClass, 'pr-1'),
          )}
        >
          <Link href={APP_ROUTES.plans}>Plans</Link>
          <span aria-hidden className="text-4xl font-light leading-none">›</span>
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={optionsId}
            onClick={() => setExpanded((open) => !open)}
            className={cn(optionClassName, 'text-white')}
          >
            {currentOption.label}
          </button>
        </div>

        {expanded && (
          <div className="relative z-10 min-w-0 flex-1 overflow-hidden">
            <div
              ref={mobileRailRef}
              id={optionsId}
              data-plans-section-sibling-rail=""
              className="overflow-x-auto overflow-y-hidden whitespace-nowrap touch-pan-x scrollbar-hide [-ms-overflow-style:none] [scrollbar-width:none]"
            >
              <div className="flex w-max items-center gap-5">
                {siblingOptions.map((option) => (
                  <Link
                    key={option.id}
                    href={option.href}
                    onClick={() => setExpanded(false)}
                    onFocus={handleSiblingFocus}
                    className={siblingLinkClassName}
                  >
                    {option.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={regionRef}
      className={cn(
        'flex items-center gap-2 text-2xl font-semibold text-white',
        isCentered ? 'justify-center' : '',
        className,
      )}
      data-plans-section-align={align}
    >
      <Link href={APP_ROUTES.plans}>Plans</Link>
      <span aria-hidden className="text-4xl font-light leading-none text-white">›</span>
      <div className="min-w-0">
        <div
          id={optionsId}
          className="overflow-hidden whitespace-nowrap transition-[max-width] duration-200 ease-out motion-reduce:transition-none"
          style={{ maxWidth: expanded ? EXPANDED_MAX_WIDTH : collapsedMaxWidth }}
        >
          <div className="flex items-center gap-5">
            {VIEW_OPTIONS.map((option) => {
              const isCurrent = option.id === currentView;
              if (!expanded && !isCurrent) return null;

              if (isCurrent) {
                return (
                  <button
                    key={option.id}
                    ref={triggerRef}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={optionsId}
                    onClick={() => setExpanded((open) => !open)}
                    className={cn(optionClassName, 'text-white')}
                  >
                    {option.label}
                  </button>
                );
              }

              return (
                <Link
                  key={option.id}
                  href={option.href}
                  onClick={() => setExpanded(false)}
                  className={cn(
                    siblingLinkClassName,
                    expanded ? 'translate-x-0 opacity-100' : 'pointer-events-none -translate-x-1 opacity-0',
                  )}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
