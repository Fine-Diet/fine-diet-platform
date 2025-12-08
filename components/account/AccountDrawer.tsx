'use client';

import { useEffect, useState } from 'react';
import { getCurrentUser, onAuthStateChange } from '@/lib/authHelpers';
import type { User, Session } from '@supabase/supabase-js';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { AccountView } from './AccountView';
import { ResetPasswordForm } from './ResetPasswordForm';

interface AccountDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

/**
 * AccountDrawer Component
 * 
 * Right-aligned drawer (max-width: 375px) that shows:
 * - Logged OUT: Login/Signup forms
 * - Logged IN: Account navigation and profile info
 * 
 * Matches existing drawer styling from NavDrawer.
 */
export const AccountDrawer = ({ open, onClose, onSuccess }: AccountDrawerProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'login' | 'signup' | 'forgot-password'>('login');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState<string>('');

  // Load initial session
  useEffect(() => {
    const loadSession = async () => {
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      setLoading(false);
    };
    loadSession();
  }, []);

  // Subscribe to auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      
      // Switch to login view after successful signup (if not already signed in)
      if (event === 'SIGNED_IN') {
        setView('login');
      }
      
      // If user signs out, reset view
      if (event === 'SIGNED_OUT') {
        setView('login');
      }
    });

    return () => unsubscribe();
  }, []);

  // Close drawer when clicking outside
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is inside the drawer or its children
      const drawer = document.querySelector('[data-account-drawer]');
      if (drawer && drawer.contains(target)) {
        return; // Click is inside drawer, don't close
      }
      // Click is outside drawer, close it
      onClose();
    };

    // Small delay to prevent immediate close on open
    const timeout = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeout);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [open, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const transitionClasses = open
    ? 'translate-x-0 opacity-100'
    : 'translate-x-full opacity-0';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[50] bg-black/20 backdrop-blur-sm"
        onClick={(e) => {
          // Only close if clicking directly on backdrop, not if click originated from drawer
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      />

      {/* Drawer */}
      <div
        data-account-drawer
        onClick={(e) => e.stopPropagation()} // Prevent clicks inside drawer from bubbling to backdrop
        className={`fixed top-[100px] rounded-[2.5rem] left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-10 bottom-10 h-[80vh] w-full max-w-[375px] z-[60] bg-neutral-900/50 backdrop-blur-lg text-white shadow-large transform transition-all duration-300 ease-out ${transitionClasses}`}
      >
        <div className="flex flex-col h-full relative">
          {/* Mobile Close Button */}
          <button
            onClick={onClose}
            className="md:hidden absolute top-4 right-4 z-10 p-2 hover:bg-neutral-800/50 rounded-full transition-colors"
            aria-label="Close account drawer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Header */}
          

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-white/60 antialiased">Loading...</div>
              </div>
            ) : user && session ? (
              <AccountView user={user} onClose={onClose} />
            ) : view === 'login' ? (
              <LoginForm
                onSwitchToSignup={() => setView('signup')}
                onSuccess={() => {
                  onClose();
                  onSuccess?.();
                }}
                onForgotPassword={(email) => {
                  setForgotPasswordEmail(email);
                  setView('forgot-password');
                }}
              />
            ) : view === 'signup' ? (
              <SignupForm
                onSwitchToLogin={() => setView('login')}
                onSuccess={onClose}
              />
            ) : (
              <ResetPasswordForm
                initialEmail={forgotPasswordEmail}
                onBack={() => setView('login')}
              />
            )}
          </div>

          {/* Footer - Practice Better Link */}
          <div className="p-6 border-t border-neutral-700/50">
            <a
              href="https://practicebetter.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-white/70 hover:text-white/90 transition-colors antialiased flex items-center gap-2"
            >
              <span>Manage your care in Practice Better →</span>
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

