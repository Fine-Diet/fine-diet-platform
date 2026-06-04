'use client';

import { useState } from 'react';
import { type AuthContext } from '@/lib/auth/authContext';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { LoginForm } from './LoginForm';
import { SignupForm } from './SignupForm';
import { ResetPasswordForm } from './ResetPasswordForm';

interface AuthPanelProps {
  /** Drives initial tab, copy, prefill, and post-auth target. */
  context: AuthContext;
  /**
   * Where an existing user lands after login when no redirect/context exists.
   * Defaults to /home (existing-user dashboard). Signups always fall back to
   * the neutral /account/start landing regardless of this value.
   */
  loginFallback?: string;
  /** Called after a successful login/signup (forms also handle redirect). */
  onSuccess?: () => void;
}

type AuthView = 'login' | 'signup' | 'forgot-password';

/**
 * AuthPanel
 *
 * Shared tabbed Login / Create Account surface used by the dedicated
 * /create-account and /login pages. Reuses LoginForm + SignupForm (which
 * carry their own Google OAuth buttons) and the full AuthContext so copy,
 * prefill, and post-auth routing stay consistent with the drawer/mobile nav.
 */
export const AuthPanel = ({ context, loginFallback = '/home', onSuccess }: AuthPanelProps) => {
  const [view, setView] = useState<AuthView>(
    context.intent === 'signup' ? 'signup' : 'login'
  );
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState(context.email ?? '');

  // Existing-user login always needs a destination on a dedicated page.
  const loginRedirect = getSafeRedirectTarget(context.redirectTo, loginFallback);

  if (view === 'forgot-password') {
    return (
      <ResetPasswordForm
        initialEmail={forgotPasswordEmail}
        onBack={() => setView('login')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Tab switcher */}
      <div className="flex rounded-full overflow-hidden border border-white/10">
        <button
          type="button"
          onClick={() => setView('login')}
          className={`flex-1 py-3 text-sm font-semibold antialiased transition-colors ${
            view === 'login' ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setView('signup')}
          className={`flex-1 py-3 text-sm font-semibold antialiased transition-colors ${
            view === 'signup' ? 'text-white bg-white/10' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Create Account
        </button>
      </div>

      {view === 'login' ? (
        <LoginForm
          context={{ ...context, intent: 'login', redirectTo: loginRedirect }}
          onSwitchToSignup={() => setView('signup')}
          onSuccess={() => onSuccess?.()}
          onForgotPassword={(email) => {
            setForgotPasswordEmail(email);
            setView('forgot-password');
          }}
          redirectTo={loginRedirect}
          hideSwitchToSignup
          showHeader
        />
      ) : (
        <SignupForm
          context={{ ...context, intent: 'signup' }}
          onSwitchToLogin={() => setView('login')}
          onSuccess={() => onSuccess?.()}
          redirectTo={context.redirectTo || undefined}
          hideSwitchToLogin
        />
      )}
    </div>
  );
};
