'use client';

import { useState } from 'react';
import { signInWithOAuth } from '@/lib/authHelpers';
import { SOCIAL_PROVIDERS } from '@/lib/config/auth';

interface SocialLoginButtonsProps {
  redirectTo?: string;
}

/**
 * Renders the enabled social auth buttons (Apple, Google).
 *
 * Provider visibility is controlled by SOCIAL_PROVIDERS in lib/config/auth.ts.
 * Returns null if no providers are currently enabled — callers should gate
 * the surrounding divider on HAS_ACTIVE_SOCIAL_PROVIDERS from the same config.
 *
 * To re-enable Apple: set SOCIAL_PROVIDERS.apple = true after Apple Developer
 * account, Service ID, private key, and Supabase provider are all configured.
 */
export const SocialLoginButtons = ({ redirectTo }: SocialLoginButtonsProps) => {
  const [loadingProvider, setLoadingProvider] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleOAuth = async (provider: 'apple' | 'google') => {
    setError(null);
    setLoadingProvider(provider);
    try {
      const { error: oauthError } = await signInWithOAuth(provider, redirectTo);
      if (oauthError) {
        setError(oauthError.message || `Failed to continue with ${provider}.`);
        setLoadingProvider(null);
      }
      // On success, Supabase redirects the browser — no further action needed here.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoadingProvider(null);
    }
  };

  const hasAny = SOCIAL_PROVIDERS.apple || SOCIAL_PROVIDERS.google;
  if (!hasAny) return null;

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-400 antialiased text-center">{error}</p>
      )}

      {/* Apple — shown only when configured and enabled */}
      {SOCIAL_PROVIDERS.apple && (
        <button
          type="button"
          onClick={() => handleOAuth('apple')}
          disabled={loadingProvider !== null}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-full border border-white/30 bg-transparent text-white text-sm font-semibold antialiased hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <AppleIcon />
          <span>{loadingProvider === 'apple' ? 'Redirecting...' : 'Continue with Apple'}</span>
        </button>
      )}

      {/* Google — shown only when configured and enabled */}
      {SOCIAL_PROVIDERS.google && (
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={loadingProvider !== null}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-full border border-white/30 bg-transparent text-white text-sm font-semibold antialiased hover:bg-white/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <GoogleIcon />
          <span>{loadingProvider === 'google' ? 'Redirecting...' : 'Continue with Google'}</span>
        </button>
      )}
    </div>
  );
};

const AppleIcon = () => (
  <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.7 9.05 7.4c1.32.06 2.24.73 3.01.73.77 0 2.21-.9 3.72-.77 1.27.1 2.41.65 3.17 1.7-2.82 1.7-2.35 5.43.49 6.49-.57 1.56-1.32 3.11-2.39 4.73zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const GoogleIcon = () => (
  <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);
