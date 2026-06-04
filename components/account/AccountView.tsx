'use client';

import { useState } from 'react';
import Image from 'next/image';
import { signOut } from '@/lib/authHelpers';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'next/router';
import {
  SHARED_PROGRAM_CARDS,
  SHARED_ASSESSMENT_CARDS,
  type AccountCard,
} from '@/lib/config/accountCards';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

interface AccountViewProps {
  user: User;
  onClose: () => void;
  onNavigate?: (href: string) => void;
}

export const AccountView = ({ user, onClose, onNavigate }: AccountViewProps) => {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleNavigate = (href: string) => {
    onNavigate?.(href);
    onClose();
    router.push(href);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      onClose();
      router.reload();
    } catch (error) {
      console.error('Logout error:', error);
      setLoggingOut(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Your Programs */}
      <div className="px-6 pt-6 pb-2">
        <p className="text-xs font-semibold text-white/50 antialiased mb-4">
          Your Programs
        </p>
        <div className="space-y-0">
          {SHARED_PROGRAM_CARDS.map((card) => (
            <AccountCard
              key={card.id}
              card={card}
              showDivider={false}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
        <button
          onClick={() => handleNavigate('/integrative-care')}
          className="w-full text-right text-xs text-white/50 hover:text-white/80 antialiased py-2 transition-colors"
        >
          See More
        </button>
      </div>

      {/* Your Assessments */}
      <div className="border-t border-white/10 px-6 pt-4 pb-2">
        <p className="text-xs font-semibold text-white/50 antialiased mb-4">
          Your Assessments
        </p>
        <div className="space-y-0">
          {SHARED_ASSESSMENT_CARDS.map((card) => (
            <AccountCard
              key={card.id}
              card={card}
              showDivider={false}
              onNavigate={handleNavigate}
            />
          ))}
        </div>
        <button
          onClick={() => handleNavigate('/account/assessments')}
          className="w-full text-right text-sm text-white/50 hover:text-white/80 antialiased py-2 transition-colors"
        >
          See All
        </button>
      </div>

      {/* Utility links */}
      <div className="border-t border-white/10">
        <button
          onClick={() => handleNavigate(APP_ROUTES.home)}
          className="w-full text-left text-sm font-semibold text-white hover:bg-white/5 antialiased px-6 py-3.5 transition-colors border-b border-white/10"
        >
          Go to App
        </button>
        <button
          onClick={() => handleNavigate('/shop')}
          className="w-full text-left text-sm font-semibold text-white/70 hover:text-white hover:bg-white/5 antialiased px-6 py-3.5 transition-colors border-b border-white/10"
        >
          Shop
        </button>
        <button
          onClick={() => handleNavigate('/account')}
          className="w-full text-left text-sm text-white/50 hover:text-white/80 hover:bg-white/5 antialiased pl-10 pr-6 py-3 transition-colors border-b border-white/10"
        >
          Account Settings
        </button>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full text-left text-sm text-white/50 hover:text-white/80 hover:bg-white/5 antialiased pl-10 pr-6 py-3 transition-colors disabled:opacity-40"
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </div>
    </div>
  );
};

const AccountCard = ({
  card,
  showDivider,
  onNavigate,
}: {
  card: AccountCard;
  showDivider: boolean;
  onNavigate: (href: string) => void;
}) => (
  <div>
    {showDivider && <div className="border-t border-white/10 my-1" />}
    <div className="flex items-start gap-4 py-3">
      {/* Image */}
      <div
        className="relative flex-shrink-0 w-[80px] h-[80px] overflow-hidden rounded-2xl cursor-pointer"
        onClick={() => onNavigate(card.href)}
      >
        <Image src={card.image} alt={card.title} fill className="object-cover" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-white antialiased leading-tight">
          {card.title}
        </h4>
        <p className="text-xs text-white/60 antialiased mt-1 leading-relaxed line-clamp-2">
          {card.description}
        </p>
        <button
          onClick={() => onNavigate(card.href)}
          className="mt-2 w-full py-1.5 text-xs font-semibold text-white border border-white/30 rounded-full hover:bg-white/5 transition-colors antialiased"
        >
          {card.buttonLabel ?? 'Get Started'}
        </button>
      </div>
    </div>
  </div>
);
