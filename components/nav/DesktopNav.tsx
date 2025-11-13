import Link from 'next/link';

import { NavigationData } from './types';
import { NavCategoryButton } from './NavCategoryButton';

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
        <div className="px-10 bg-gradient-to-r from-indigo-500/50 via-purple-500/50 to-pink-500/50 w-full">
        <a
          href={navigation.topLinks.journal.href}
          className="hover:text-white/70"
          target="_blank"
          rel="noopener noreferrer"
        >
          {navigation.topLinks.journal.label}
        </a>
        </div>
        <Link href={navigation.topLinks.account.href} className="hover:text-white/70">
          {navigation.topLinks.account.label}
        </Link>
      </div>
    </div>
  );
};
