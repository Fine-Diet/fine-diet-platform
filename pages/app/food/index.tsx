'use client';

/**
 * Food Home — navigation shell for the Food service (Packet:
 * FD-PLATFORM food-architecture-v1).
 *
 * Food owns possibility, preparedness, pantry truth, and acquisition:
 * Pantry, Meals & Recipes, and Groceries. This is a stable landing shell
 * only — the final Food Home (action-led hero, Build Ahead Meals module,
 * date-range Grocery generation module) is explicitly deferred to a later
 * packet. Do not add hero copy, hover/touch behavior, or Explore surfaces
 * here.
 */

import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { APP_ROUTES } from '@/lib/routes/appRoutes';
import { FoodIcon } from '@/components/icons';

const destinations = [
  {
    id: 'pantry',
    label: 'Pantry',
    description: 'Track what you have on hand and stay ahead of shopping gaps.',
    href: APP_ROUTES.foodPantry,
  },
  {
    id: 'meals',
    label: 'Meals & Recipes',
    description: 'Browse, build, and reuse the meals and recipes you cook from.',
    href: APP_ROUTES.foodMeals,
  },
  {
    id: 'groceries',
    label: 'Groceries',
    description: 'Shopping lists rolled up from your plans, pantry, and manual adds.',
    href: APP_ROUTES.foodGroceries,
  },
];

export default function FoodHomePage() {
  return (
    <div className="min-h-screen bg-[#16110d] text-white flex flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-28 pt-6 sm:px-5">
        <div className="mx-auto max-w-[760px]">
          <section className="rounded-[28px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large sm:p-7">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#d7ecff] text-black">
                <FoodIcon className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-200/70 antialiased">
                  Food
                </p>
                <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-50 antialiased sm:text-4xl">
                  Am I prepared to follow through?
                </h1>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/60 antialiased">
                  Pantry, Meals & Recipes, and Groceries live here. Plans owns intention and
                  timing — Food owns possibility, preparedness, and acquisition.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {destinations.map((destination) => (
              <Link
                key={destination.id}
                href={destination.href}
                className="group flex flex-col rounded-[24px] border border-white/[0.06] bg-white/[0.035] p-5 shadow-large transition-colors hover:bg-white/[0.06]"
              >
                <h2 className="text-lg font-semibold text-brand-50 antialiased">
                  {destination.label}
                </h2>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-white/55 antialiased">
                  {destination.description}
                </p>
                <span className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-200/70 antialiased transition-colors group-hover:text-emerald-100">
                  Open →
                </span>
              </Link>
            ))}
          </section>
        </div>
      </main>

      <JournalFooterNav />
    </div>
  );
}
