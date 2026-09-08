'use client';

import Link from 'next/link';

import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { cn } from '@/lib/utils';

const RAIL_ITEMS: { id: string; label: string; href: string; active?: boolean }[] = [
  { id: 'meals', label: 'Meals', href: APP_ROUTES.foodMeals },
  { id: 'day-plans', label: 'Day Plans', href: APP_ROUTES.plansDayTemplates },
  { id: 'week-plans', label: 'Week Plans', href: APP_ROUTES.plansWeekPatterns },
];

export function PlanningRouteRail() {
  return (
    <nav
      aria-label="Planning routes"
      className="relative z-[1] border-y border-white/20 bg-[#463c2f]"
    >
      <div className="flex overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {RAIL_ITEMS.map((item, index) => (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              'relative flex min-w-[11rem] flex-1 snap-start items-center justify-center px-4 py-5 text-center text-sm font-semibold antialiased transition-colors sm:min-w-0',
              item.active
                ? 'bg-[#3f362b] text-white'
                : 'text-white/70 hover:bg-white/5 hover:text-white',
              index > 0 && 'border-l border-white/15',
            )}
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
