import Link from 'next/link';

import { NavigationData } from './types';
import { NavCategoryButton } from './NavCategoryButton';
import { ArrowUpRightIcon } from '@heroicons/react/24/outline';

interface DesktopNavProps {
  navigation: NavigationData;
  activeCategoryId: string | null;
  onCategorySelect: (categoryId: string) => void;
  onCategoryHover?: (categoryId: string) => void;
  onCategoryHoverCancel?: () => void;
  onAccountClick: () => void;
  isAuthed?: boolean;
}

export const DesktopNav = ({
  navigation,
  activeCategoryId,
  onCategorySelect,
  onCategoryHover,
  onCategoryHoverCancel,
  onAccountClick,
  isAuthed,
}: DesktopNavProps) => {
  return (
    <div className="hidden flex-1 items-center justify-between gap-2 md:flex">
      <div className="flex flex-1 items-center justify-end lg:gap-6 md:gap-1 md:pr-0 lg:pr-4">
        {navigation.categories.map((category) => (
          <NavCategoryButton
            key={category.id}
            label={category.label}
            isActive={activeCategoryId === category.id}
            onClick={() => onCategorySelect(category.id)}
            onMouseEnter={() => onCategoryHover?.(category.id)}
            onMouseLeave={() => onCategoryHoverCancel?.()}
          />
        ))}
      </div>
      <div className="flex items-center gap-9 text-base font-semibold text-white antialiased">
        <div className="relative flex">
          <span className="pointer-events-none absolute inset-y-[-6px] inset-x-[-4px] rounded-[2.5rem] backdrop-blur-sm bg-gradient-to-r from-accent-300 via-dark_accent-700 to-neutral-500 transition" style={{ animation: 'pulse 2s cubic-bezier(1, 1, .8, .8) infinite' }} />
          <a
            href={navigation.topLinks.journal.href}
            className="relative flex items-center gap-1 px-4 py-2 text-brand-900 transition hover:opacity-90 antialiased"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>{navigation.topLinks.journal.label.replace(/\s*↗$/, '')}</span>
            <ArrowUpRightIcon className="h-3 w-3 -translate-y-[1px]" strokeWidth={3.5} />
          </a>
        </div>
        <button
          onClick={onAccountClick}
          className="hover:text-white/70 antialiased"
        >
          {isAuthed ? 'Account' : 'Login'}
        </button>
      </div>
    </div>
  );
};
