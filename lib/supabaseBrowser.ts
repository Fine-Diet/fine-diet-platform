/**
 * Browser-side Supabase client with cookie support
 * 
 * This client is used in client components and pages that need
 * to interact with Supabase Auth and automatically sync cookies.
 * 
 * Uses @supabase/ssr's createBrowserClient to ensure sessions are
 * stored in HTTP cookies (not localStorage) so middleware and SSR can read them.
 */

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

