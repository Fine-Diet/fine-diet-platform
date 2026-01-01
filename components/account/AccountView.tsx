'use client';

import { useEffect, useState } from 'react';
import { signOut } from '@/lib/authHelpers';
import { Button } from '@/components/ui/Button';
import type { User } from '@supabase/supabase-js';
import { useRouter } from 'next/router';

interface AccountViewProps {
  user: User;
  onClose: () => void;
}

/**
 * AccountView Component
 * 
 * Shows the logged-in user's account information and navigation shortcuts.
 * Displays greeting, navigation links, and logout button.
 */
export const AccountView = ({ user, onClose }: AccountViewProps) => {
  const router = useRouter();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // Fetch person data to get first_name
  useEffect(() => {
    const fetchPersonData = async () => {
      try {
        // Try to get person data from API
        // For now, we'll just use the email from the user object
        // In the future, we can create an API endpoint to fetch person data
        setLoading(false);
      } catch (error) {
        console.warn('Failed to fetch person data:', error);
        setLoading(false);
      }
    };

    fetchPersonData();
  }, [user]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut();
      onClose();
      // Refresh the page to clear any cached state
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

  // Display name: first_name if available, otherwise email
  const displayName = firstName || user.email?.split('@')[0] || 'there';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-white/60 antialiased">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h3 className="text-lg font-semibold antialiased mb-1">
          Hi, {displayName}
        </h3>
        <p className="text-sm text-white/70 antialiased">
          {user.email}
        </p>
      </div>

      {/* Navigation Shortcuts */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-white/80 antialiased uppercase tracking-wide">
          Quick Links
        </h4>
        
        <nav className="space-y-2">
          <button
            onClick={() => handleNavigate('/account/assessments')}
            className="w-full text-left px-4 py-3 bg-neutral-800/50 hover:bg-neutral-800/70 rounded-xl text-white transition-colors antialiased"
          >
            My assessments
          </button>
          
          <button
            onClick={() => handleNavigate('/programs')}
            className="w-full text-left px-4 py-3 bg-neutral-800/50 hover:bg-neutral-800/70 rounded-xl text-white transition-colors antialiased"
          >
            My programs
          </button>
          
          <button
            onClick={() => handleNavigate('/journal')}
            className="w-full text-left px-4 py-3 bg-neutral-800/50 hover:bg-neutral-800/70 rounded-xl text-white transition-colors antialiased"
          >
            My journal
          </button>
          
          <button
            onClick={() => handleNavigate('/orders')}
            className="w-full text-left px-4 py-3 bg-neutral-800/50 hover:bg-neutral-800/70 rounded-xl text-white transition-colors antialiased"
          >
            My orders
          </button>
        </nav>
      </div>

      {/* Divider */}
      <div className="border-t border-neutral-700/50 my-6"></div>

      {/* Logout Button */}
      <Button
        type="button"
        variant="secondary"
        size="lg"
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full"
      >
        {loggingOut ? 'Logging out...' : 'Log out'}
      </Button>
    </div>
  );
};

