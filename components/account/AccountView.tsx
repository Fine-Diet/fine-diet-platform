'use client';

import { useState } from 'react';
import { signOut } from '@/lib/authHelpers';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'next/router';

interface AccountViewProps {
  user: User;
  onClose: () => void;
}

export const AccountView = ({ user, onClose }: AccountViewProps) => {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

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

  const handleNavigate = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div>
      {/* Navigation Shortcuts */}
      <nav className="-mx-6 -mt-6">
        <button
          onClick={() => handleNavigate('/programs')}
          className="w-full text-base text-left px-10 pt-[24px] font-semibold pb-3 bg-transparent hover:bg-neutral-800/70 rounded-t-[2.5rem] text-white transition-colors antialiased"
        >
          Programs
        </button>
        <button
          onClick={() => handleNavigate('/journal')}
          className="w-full text-base text-left px-10 py-3 border-t font-semibold border-brand-50/5 bg-transparent hover:bg-neutral-800/70 text-white transition-colors antialiased"
        >
          Journal
        </button>
        <button
          onClick={() => handleNavigate('/account/assessments')}
          className="w-full text-base text-left px-10 py-3 border-t font-semibold border-brand-50/5 bg-transparent hover:bg-neutral-800/70 text-white transition-colors antialiased"
        >
          Assessments
        </button>
        <button
          onClick={() => handleNavigate('/shop')}
          className="w-full text-base text-left px-10 py-3 border-t font-semibold border-brand-50/5 bg-transparent hover:bg-neutral-800/70 text-white transition-colors antialiased"
        >
          Shop
        </button>
        <button
          onClick={() => handleNavigate('/account')}
          className="w-full text-base text-left pl-[56px] pr-10 py-3 border-t border-brand-50/5 bg-transparent hover:bg-neutral-800/70 text-white transition-colors antialiased"
        >
          Account Settings
        </button>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className={`w-full text-base text-left pl-[56px] pr-10 py-3 border-t border-brand-50/5 bg-transparent hover:bg-neutral-800/70 text-white transition-colors antialiased ${loggingOut ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {loggingOut ? 'Logging out...' : 'Log out'}
        </button>
      </nav>
    </div>
  );
};

