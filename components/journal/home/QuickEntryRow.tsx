/**
 * QuickEntryRow — /journal/home "Quick Entry" action row.
 *
 * Extracted verbatim from pages/journal/home.tsx (Packet 2B-B). Self-contained
 * and presentational: a 5-up row of color-coded entry shortcuts that link into
 * the log-new flow. No props, no data, no auth.
 */

import Image from 'next/image';
import Link from 'next/link';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

interface QuickEntryItem {
  label: string;
  href: string;
  /** Colored fallback shown until a curated image is supplied. */
  accent: string;
  /**
   * Optional Jordan-curated icon/image (path or URL). When set, it replaces the
   * colored fallback. Left undefined until assets are supplied — do not
   * hard-code final asset URLs here before they exist.
   */
  image?: string;
}

const quickEntryItems: QuickEntryItem[] = [
  { label: 'Log Meal', href: `${APP_ROUTES.logNew}?tab=food`, accent: 'bg-[#f1eaa8] text-black/60' },
  { label: 'Hydration', href: `${APP_ROUTES.logNew}?tab=water`, accent: 'bg-[#9ccbdd] text-black/60' },
  { label: 'Mood', href: `${APP_ROUTES.logNew}?tab=mood`, accent: 'bg-[#cee5a8] text-black/60' },
  { label: 'Movement', href: `${APP_ROUTES.logNew}?tab=movement`, accent: 'bg-[#bfc2e1] text-black/60' },
  { label: 'More', href: APP_ROUTES.logNew, accent: 'bg-[#666663] text-white/70' },
];

export function QuickEntryRow() {
  return (
    <section className="w-full max-w-[1000px] mx-auto">
      <p className="text-sm mb-[5px] font-semibold text-brand-50 antialiased">
        Quick Entry
      </p>
      <h2 className="text-xl font-semibold text-white antialiased">What would you like to do?</h2>
      <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-6">
        {quickEntryItems.map((item) => (
          <Link key={item.label} href={item.href} className="group flex flex-col items-center gap-2">
            {item.image ? (
              <span className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full transition-transform group-hover:scale-[1.03] sm:h-16 sm:w-16">
                <Image
                  src={item.image}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                  aria-hidden
                />
              </span>
            ) : (
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full transition-transform group-hover:scale-[1.03] sm:h-16 sm:w-16 ${item.accent}`}
                aria-hidden
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              </span>
            )}
            <span className="text-center text-[10px] font-medium text-white/75 antialiased sm:text-xs">
              {item.label}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default QuickEntryRow;
