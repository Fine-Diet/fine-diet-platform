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

export interface FoodHomeViewSwitcherProps {
  currentView: FoodHomeView;
  className?: string;
}

export function FoodHomeViewSwitcher({ currentView, className }: FoodHomeViewSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsId = useId();

  const collapsedMaxWidth = COLLAPSED_MAX_WIDTH[currentView];

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

  return (
    <div className={cn('flex items-center justify-center gap-2 text-2xl font-semibold', className)}>
      <Link href={APP_ROUTES.food}>Food</Link>
      <span aria-hidden className="text-4xl font-light leading-none">›</span>
      <div ref={regionRef} className="min-w-0">
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
                    optionClassName,
                    'text-white/45 hover:text-inherit hover:underline focus-visible:text-inherit focus-visible:underline',
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
