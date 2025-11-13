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
    <div className="hidden flex-1 items-center justify-between gap-1 md:flex">
      <div className="flex flex-1 items-center justify-center gap-10">
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
      <div className="flex items-center gap-4 text-base font-semibold text-white">
        <div className="relative flex">
          <span className="pointer-events-none absolute inset-y-[-16px] inset-x-[-24px] rounded-full bg-gradient-to-r from-indigo-500/40 via-purple-500/40 to-pink-500/40" />
          <a
            href={navigation.topLinks.journal.href}
            className="relative flex items-center gap-2 px-6 py-2 transition hover:opacity-90"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>{navigation.topLinks.journal.label.replace(/\s*↗$/, '')}</span>
            <ArrowUpRightIcon className="h-3 w-3 -translate-y-[1px]" strokeWidth={3.5} />
          </a>
        </div>
        <Link href={navigation.topLinks.account.href} className="hover:text-white/70">
          {navigation.topLinks.account.label}
        </Link>
      </div>
    </div>
  );
};
