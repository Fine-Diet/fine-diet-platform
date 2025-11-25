import Link from 'next/link';

import { NavigationData } from './types';
import { NavCategoryButton } from './NavCategoryButton';
import { ArrowUpRightIcon } from '@heroicons/react/24/outline';

interface DesktopNavProps {
  navigation: NavigationData;
  activeCategoryId: string | null;
  onCategorySelect: (categoryId: string) => void;
  onCategoryHover?: (categoryId: string) => void;
}

export const DesktopNav = ({
  navigation,
  activeCategoryId,
  onCategorySelect,
  onCategoryHover,
}: DesktopNavProps) => {
  return (
    <div className="hidden flex-1 items-center justify-between gap-2 md:flex">
      <div className="flex flex-1 items-center justify-end lg:gap-10 md:gap-1 md:pr-0 lg:pr-10">
        {navigation.categories.map((category) => (
          <NavCategoryButton
            key={category.id}
            label={category.label}
            isActive={activeCategoryId === category.id}
            onClick={() => onCategorySelect(category.id)}
            onMouseEnter={() => onCategoryHover?.(category.id)}
          />
        ))}
      </div>
      <div className="flex items-center gap-9 text-base font-semibold text-white antialiased">
        <div className="relative flex">
          <span className="pointer-events-none absolute inset-y-[-6px] inset-x-[-4px] rounded-[2.5rem] backdrop-blur-sm bg-gradient-to-r from-accent-300/50 via-dark_accent-700/50 to-neutral-500/50 transition" style={{ animation: 'pulse 4s cubic-bezier(0.4, 0.2, 0.4, 0.6) infinite' }} />
          <a
            href={navigation.topLinks.journal.href}
            className="relative flex items-center gap-1 px-4 py-2 text-gray-200 transition hover:opacity-90 antialiased"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>{navigation.topLinks.journal.label.replace(/\s*↗$/, '')}</span>
            <ArrowUpRightIcon className="h-3 w-3 -translate-y-[1px]" strokeWidth={3.5} />
          </a>
        </div>
        <Link href={navigation.topLinks.account.href} className="hover:text-white/70 antialiased">
          {navigation.topLinks.account.label}
        </Link>
      </div>
    </div>
  );
};
