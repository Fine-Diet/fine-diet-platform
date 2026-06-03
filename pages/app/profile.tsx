'use client';

import { useState } from 'react';
import { useRouter } from 'next/router';
import JournalProfilePage from '../journal/profile';
import { signOut } from '@/lib/authHelpers';

export default function AppProfilePage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const { error } = await signOut();
      if (error) throw error;
      router.reload();
    } catch (error) {
      console.error('[AppProfilePage] Logout error:', error);
      setLogoutError('Could not log out. Please try again.');
      setLoggingOut(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-neutral-900">
      <JournalProfilePage />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-neutral-900 via-neutral-900/95 to-transparent px-5 pb-8 pt-6">
        <div className="pointer-events-auto mx-auto w-full max-w-[650px] space-y-2">
          {logoutError && (
            <p className="text-center text-xs text-red-200 antialiased">{logoutError}</p>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="w-full rounded-full bg-white/16 px-6 py-4 text-center text-base font-semibold text-white/90 antialiased transition-colors hover:bg-white/22 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loggingOut ? 'Logging out…' : 'Log Out'}
          </button>
        </div>
      </div>
    </div>
  );
}
