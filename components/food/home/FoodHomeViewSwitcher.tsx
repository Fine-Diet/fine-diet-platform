'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { cn } from '@/lib/utils';

export type FoodHomeView = 'overview' | 'pantry' | 'recipes' | 'lists' | 'hauls';

const VIEW_OPTIONS: Array<{ id: FoodHomeView; label: string; href: string }> = [
  { id: 'overview', label: 'Overview', href: APP_ROUTES.food },
  { id: 'pantry', label: 'Pantry', href: APP_ROUTES.foodPantry },
  { id: 'recipes', label: 'Recipes', href: APP_ROUTES.foodMeals },
  { id: 'lists', label: 'Lists', href: APP_ROUTES.foodLists },
  { id: 'hauls', label: 'Hauls', href: APP_ROUTES.foodHauls },
];

const SIBLING_OPTIONS = VIEW_OPTIONS.filter((option) => option.id !== 'overview');

const EXPANDED_MAX_WIDTH = '32rem';

const COLLAPSED_MAX_WIDTH: Record<FoodHomeView, string> = {
  overview: '6rem',
  pantry: '4.5rem',
  recipes: '5.5rem',
  lists: '4rem',
  hauls: '4.5rem',
};

const optionClassName =
  'font-semibold decoration-2 underline-offset-[5px] transition-all duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none';

const siblingLinkClassName = cn(
  optionClassName,
  'text-white/45 hover:text-inherit hover:underline focus-visible:text-inherit focus-visible:underline',
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

export interface FoodHomeViewSwitcherProps {
  currentView: FoodHomeView;
  className?: string;
}

export function FoodHomeViewSwitcher({ currentView, className }: FoodHomeViewSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const mobileRailRef = useRef<HTMLDivElement>(null);
  const optionsId = useId();
  const isDesktop = useIsDesktop();

  const currentOption = VIEW_OPTIONS.find((option) => option.id === currentView) ?? VIEW_OPTIONS[0];
  const collapsedMaxWidth = COLLAPSED_MAX_WIDTH[currentView];

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
          'flex items-center gap-2 text-2xl font-semibold',
          expanded ? 'w-full max-w-full' : 'justify-center',
          className,
        )}
      >
        <div
          className={cn(
            'relative z-20 flex shrink-0 items-center gap-2',
            expanded && 'bg-[#342b20] pr-1',
          )}
        >
          <Link href={APP_ROUTES.food}>Food</Link>
          <span aria-hidden className="text-4xl font-light leading-none">›</span>
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={expanded}
            aria-controls={optionsId}
            onClick={() => setExpanded((open) => !open)}
            className={cn(optionClassName, 'text-inherit')}
          >
            {currentOption.label}
          </button>
        </div>

        {expanded && (
          <div className="relative z-10 min-w-0 flex-1 overflow-hidden">
            <div
              ref={mobileRailRef}
              id={optionsId}
              data-food-home-sibling-rail=""
              className="overflow-x-auto overflow-y-hidden whitespace-nowrap touch-pan-x scrollbar-hide [-ms-overflow-style:none] [scrollbar-width:none]"
            >
              <div className="flex w-max items-center gap-5">
                {SIBLING_OPTIONS.map((option) => (
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
      className={cn('flex items-center justify-center gap-2 text-2xl font-semibold', className)}
    >
      <Link href={APP_ROUTES.food}>Food</Link>
      <span aria-hidden className="text-4xl font-light leading-none">›</span>
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
                    className={cn(optionClassName, 'text-inherit')}
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
