/**
 * Auth Helpers
 * 
 * Client-side Supabase Auth utilities for session management and user state.
 * 
 * All functions use the cookie-based client from lib/supabaseBrowser.ts to ensure
 * sessions are stored in HTTP cookies (not localStorage) so middleware and SSR can read them.
 */

import { createClient } from './supabaseBrowser';
import type { User, Session } from '@supabase/supabase-js';
import { NEUTRAL_POST_AUTH_TARGET } from './auth/authContext';
import { getSafeRedirectTarget } from './redirectHelpers';

/**
 * Get the current session and user
 * Uses cookie-based client to read sessions stored in cookies
 */
export async function getSession(): Promise<Session | null> {
  const supabase = createClient();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return session;
}

/**
 * Get the current user
 * Uses cookie-based client to read sessions stored in cookies
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Sign up a new user with email and password
 * Uses cookie-based client to ensure sessions are stored in cookies.
 *
 * When email confirmation is enabled, the confirmation link returns the user
 * to /auth/callback?next=<redirect>, preserving their intended destination
 * (or the neutral /account/start landing when no context exists).
 */
export async function signUp(email: string, password: string, redirectTo?: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const supabase = createClient();

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');
  const next = getSafeRedirectTarget(redirectTo, NEUTRAL_POST_AUTH_TARGET);
  const emailRedirectTo = siteUrl
    ? `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`
    : undefined;

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: emailRedirectTo ? { emailRedirectTo } : undefined,
  });
  return { data, error };
}

/**
 * Sign in an existing user with email and password
 * 
 * Uses cookie-based client to ensure sessions are stored in HTTP cookies
 * (not localStorage) so middleware and SSR can read them.
 * 
 * Note: Supabase handles email case-insensitivity internally,
 * but we normalize here for consistency with our People System.
 */
export async function signIn(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  
  // Ensure password is not empty
  if (!password || password.length === 0) {
    return {
      data: null,
      error: { message: 'Password is required', status: 400, name: 'AuthError' } as any,
    };
  }
  
  // Use cookie-based client for login to ensure sessions are in cookies
  const supabase = createClient();
  
  // Use signInWithPassword - this will work even if email confirmation is required
  // The error will indicate if email needs confirmation
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password, // Pass password directly without modification
  });
  
  // Log errors for debugging (production-safe)
  if (error) {
    console.error('Sign in error:', {
      message: error.message,
      status: error.status,
      code: (error as any).code,
    });
  }
  
  return { data, error };
}

/**
 * Sign out the current user
 * Uses cookie-based client to clear cookie-based sessions
 */
export async function signOut() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Subscribe to auth state changes
 * Uses cookie-based client to listen to cookie-based session changes
 * Returns a function to unsubscribe
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  const supabase = createClient();
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      callback(event, session);
    }
  );
  return () => subscription.unsubscribe();
}

/**
 * Request password reset email
 * 
 * Sends a password reset email to the user. The email will contain
 * a link that redirects to the reset password page.
 * Uses cookie-based client for consistency.
 */
export async function resetPasswordForEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  
  // Get the site URL for the redirect
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
    (typeof window !== 'undefined' ? window.location.origin : '');
  
  if (!siteUrl) {
    if (process.env.NODE_ENV === 'development') {
      console.error('NEXT_PUBLIC_SITE_URL is not set. Password reset redirect may not work correctly.');
    }
  }
  
  const redirectTo = `${siteUrl}/auth/reset-password`;
  
  const supabase = createClient();
  const { data, error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
    redirectTo,
  });
  
  return { data, error };
}

/**
 * Update user password
 * 
 * Used after the user clicks the reset link and is on the reset password page.
 * Requires a valid recovery session from the reset link.
 * Uses cookie-based client to ensure any new sessions are stored in cookies.
 */
export async function updateUserPassword(newPassword: string) {
  const supabase = createClient();
  const { data, error } = await supabase.auth.updateUser({
    password: newPassword,
  });
  
  return { data, error };
}

/**
 * Get the current user (including recovery sessions)
 * 
 * Useful for checking if a user has a valid recovery session
 * when they land on the reset password page.
 * Uses cookie-based client to read sessions stored in cookies.
 */
export async function getUser() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return { user, error };
}

/**
 * Sign in with an OAuth provider (Apple or Google).
 *
 * Redirects the browser to the provider's consent screen.
 * On return, Supabase redirects to /auth/callback which exchanges
 * the code for a session and calls /api/account/link-person.
 *
 * Requires the provider to be enabled in the Supabase project dashboard.
 * Buttons should degrade gracefully when a provider is not configured.
 */
export async function signInWithOAuth(
  provider: 'apple' | 'google',
  redirectTo?: string
) {
  const supabase = createClient();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  const callbackUrl = new URL('/auth/callback', siteUrl);
  if (redirectTo) {
    callbackUrl.searchParams.set('next', redirectTo);
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: callbackUrl.toString(),
    },
  });

  return { data, error };
}

