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
    <div className="min-h-screen bg-neutral-900">
      <JournalProfilePage />

      <div className="mx-auto w-full max-w-[650px] px-5 pb-8 pt-5">
        {logoutError && (
          <p className="mb-2 text-center text-xs text-red-200 antialiased">{logoutError}</p>
        )}
        <button
          type="button"
          onClick={() => void handleLogout()}
          disabled={loggingOut}
          className="w-full rounded-full bg-[#3b332d]/50 px-6 py-5 text-center text-base font-bold text-white antialiased transition-colors duration-200 hover:bg-[#3b332d]/65 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loggingOut ? 'Logging out…' : 'Log Out'}
        </button>
      </div>
    </div>
  );
}
