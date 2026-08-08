'use client';

import Link from 'next/link';

import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { cn } from '@/lib/utils';

const RAIL_ITEMS: { id: string; label: string; href: string; active?: boolean }[] = [
  { id: 'meal-guidance', label: 'Meal Guidance', href: APP_ROUTES.plans, active: true },
  { id: 'daily', label: 'Create Daily Plans', href: APP_ROUTES.todayPlan },
  { id: 'weekly', label: 'Create Weekly Plans', href: `${APP_ROUTES.plansWeek}?action=generate` },
  { id: 'multi', label: 'Create Multi-Week Plans', href: APP_ROUTES.plansWeekPatterns },
];

export function PlanningRouteRail({
  dailyHref,
  weeklyHref = `${APP_ROUTES.plansWeek}?action=generate`,
  multiWeekHref = APP_ROUTES.plansWeekPatterns,
}: {
  dailyHref: string;
  weeklyHref?: string;
  multiWeekHref?: string;
}) {
  const items = RAIL_ITEMS.map((item) => {
    if (item.id === 'daily') return { ...item, href: dailyHref };
    if (item.id === 'weekly') return { ...item, href: weeklyHref };
    if (item.id === 'multi') return { ...item, href: multiWeekHref };
    return item;
  });

  return (
    <nav
      aria-label="Planning routes"
      className="relative z-[1] border-y border-white/20 bg-[#463c2f]"
    >
      <div className="flex overflow-x-auto snap-x snap-mandatory [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item, index) => (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              'relative flex min-w-[11rem] flex-1 snap-start items-center justify-center px-4 py-6 text-center text-sm font-semibold antialiased transition-colors sm:min-w-0',
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
