/**
 * Auth Helpers
 * 
 * Client-side Supabase Auth utilities for session management and user state.
 */

import { supabase } from './supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Get the current session and user
 */
export async function getSession(): Promise<Session | null> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('Error getting session:', error);
    return null;
  }
  return session;
}

/**
 * Get the current user
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Sign up a new user with email and password
 */
export async function signUp(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
  });
  return { data, error };
}

/**
 * Sign in an existing user with email and password
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
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Subscribe to auth state changes
 * Returns a function to unsubscribe
 */
export function onAuthStateChange(
  callback: (event: string, session: Session | null) => void
) {
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    (event, session) => {
      callback(event, session);
    }
  );
  return () => subscription.unsubscribe();
}

