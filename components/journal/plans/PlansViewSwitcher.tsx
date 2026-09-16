'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { cn } from '@/lib/utils';

export type PlansView = 'day' | 'week' | 'month';

const VIEW_OPTIONS: Array<{ id: PlansView; label: string; href: string }> = [
  { id: 'day', label: 'Day', href: APP_ROUTES.plansDay },
  { id: 'week', label: 'Week', href: APP_ROUTES.plansWeek },
  { id: 'month', label: 'Month', href: APP_ROUTES.plansMonth },
];

const EXPANDED_MAX_WIDTH = '14rem';

const optionClassName =
  'font-semibold decoration-2 underline-offset-[5px] transition-all duration-200 ease-out motion-reduce:transition-none focus-visible:outline-none';

export interface PlansViewSwitcherProps {
  currentView: PlansView;
  className?: string;
}

export function PlansViewSwitcher({ currentView, className }: PlansViewSwitcherProps) {
  const [expanded, setExpanded] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionsId = useId();

  const currentLabel = VIEW_OPTIONS.find((option) => option.id === currentView)?.label ?? currentView;
  const collapsedMaxWidth = `${Math.max(currentLabel.length, 3)}ch`;

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
    <div className={cn('flex items-start gap-2 text-2xl font-semibold text-white', className)}>
      <Link href={APP_ROUTES.plans}>Plans</Link>
      <span aria-hidden className="text-4xl font-light text-white">›</span>
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
                    optionClassName,
                    'text-white/45 hover:text-white hover:underline focus-visible:text-white focus-visible:underline',
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
