'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getSession, onAuthStateChange } from '@/lib/authHelpers';
import type { User, Session } from '@supabase/supabase-js';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { AccountView } from './AccountView';
import { ResetPasswordForm } from './ResetPasswordForm';
import { type AuthContext } from '@/lib/auth/authContext';

interface AccountDrawerProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Redirect path after login/signup (e.g. from ?redirect=). Must be relative. */
  redirectTo?: string;
  /** Auth context parsed from the URL — drives initial tab, copy, and prefill. */
  context?: AuthContext;
}

type AuthView = 'login' | 'signup' | 'forgot-password';

/**
 * AccountDrawer
 *
 * Right-anchored panel (~375px) that shows:
 * - Logged OUT: tabbed Login / Create Account panel with social auth
 * - Logged IN:  card-based account surface (programs, assessments, utility)
 */
export const AccountDrawer = ({ open, onClose, onSuccess, redirectTo, context }: AccountDrawerProps) => {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<AuthView>(context?.intent === 'signup' ? 'signup' : 'login');
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const effectiveRedirect = context?.redirectTo || redirectTo;

  // Close on route change
  useEffect(() => {
    const handleRouteChange = () => { if (open) onClose(); };
    router.events.on('routeChangeStart', handleRouteChange);
    return () => router.events.off('routeChangeStart', handleRouteChange);
  }, [open, onClose, router.events]);

  useEffect(() => {
    const loadSession = async () => {
      const sess = await getSession();
      setUser(sess?.user ?? null);
      setSession(sess);
      setLoading(false);
    };
    loadSession();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChange((event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (event === 'SIGNED_IN') setView('login');
      if (event === 'SIGNED_OUT') setView('login');
    });
    return () => unsubscribe();
  }, []);

  // Click-outside is handled by the backdrop div's onClick below.
  // A separate document listener is intentionally omitted to avoid two
  // competing close paths that can race or conflict.

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const transitionClasses = open ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4';

  const isAuthenticated = !!(user && session);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[50] bg-black/20 backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* Drawer */}
      <div
        data-account-drawer
        onClick={(e) => e.stopPropagation()}
        className={`fixed top-[100px] rounded-[2.5rem] overflow-hidden left-0 right-0 mx-auto md:left-auto md:right-10 md:mx-0 w-full max-w-[420px] max-h-[calc(100vh-120px)] z-[60] bg-neutral-900/20 backdrop-blur-lg brightness-95 text-white shadow-large transform transition-all duration-300 ease-out flex flex-col ${transitionClasses}`}
      >
        <div className="flex-1 flex flex-col min-h-0 relative">

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="text-white/60 antialiased">Loading...</div>
            </div>
          ) : isAuthenticated ? (
            /* Logged-in account surface */
            <div className="flex-1 overflow-y-auto scrollbar-hide">
              <AccountView
                user={user}
                onClose={onClose}
                onNavigate={(href) => { onClose(); }}
              />
            </div>
          ) : view === 'forgot-password' ? (
            /* Forgot password — no tabs */
            <div className="flex-1 overflow-y-auto scrollbar-hide pt-6 px-6 pb-6">
              <ResetPasswordForm
                initialEmail={forgotPasswordEmail}
                onBack={() => setView('login')}
              />
            </div>
          ) : (
            /* Guest: tabbed Login / Create Account */
            <>
              {/* Tab switcher */}
              <div className="flex flex-shrink-0 rounded-t-[2.5rem] overflow-hidden border-b border-white/10">
                <button
                  onClick={() => setView('login')}
                  className={`flex-1 py-4 text-sm font-semibold antialiased transition-colors ${
                    view === 'login'
                      ? 'text-white bg-white/5'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  Login
                </button>
                <button
                  onClick={() => setView('signup')}
                  className={`flex-1 py-4 text-sm font-semibold antialiased transition-colors ${
                    view === 'signup'
                      ? 'text-white bg-white/5'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Form content */}
              <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-6">
                {view === 'login' ? (
                  <LoginForm
                    onSwitchToSignup={() => setView('signup')}
                    onSuccess={() => { onClose(); onSuccess?.(); }}
                    onForgotPassword={(email) => {
                      setForgotPasswordEmail(email);
                      setView('forgot-password');
                    }}
                    redirectTo={effectiveRedirect}
                    context={context ? { ...context, intent: 'login' } : undefined}
                    hideSwitchToSignup
                  />
                ) : (
                  <SignupForm
                    onSwitchToLogin={() => setView('login')}
                    onSuccess={onClose}
                    redirectTo={effectiveRedirect}
                    context={context ? { ...context, intent: 'signup' } : undefined}
                    hideSwitchToLogin
                  />
                )}
              </div>
            </>
          )}

          {/* Practice Better footer */}
          {!isAuthenticated && view !== 'forgot-password' && (
            <div className="flex-shrink-0 px-6 py-4 border-t border-white/5">
              <a
                href="https://myfinediet.practicebetter.io/#/signin"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-white/50 hover:text-white/80 transition-colors antialiased"
              >
                Practice Better Login →
              </a>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
