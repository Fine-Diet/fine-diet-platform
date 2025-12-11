/**
 * Debug Auth Endpoint
 * 
 * Returns detailed authentication information from the server's perspective.
 * Useful for debugging authentication issues, especially cookie/session problems.
 * 
 * WARNING: This is a debug endpoint. Remove or lock it down in production.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return res.status(500).json({
        error: 'Missing Supabase environment variables',
        cookiesSeen: Object.keys(req.cookies || {}),
      });
    }

    // Create server client using @supabase/ssr for proper cookie handling
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return req.cookies[name] ?? undefined;
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            // Next.js Pages Router API routes use res.setHeader for cookies
            const cookieString = `${name}=${value}; Path=/; ${options.httpOnly ? 'HttpOnly;' : ''} ${options.secure ? 'Secure;' : ''} ${options.sameSite ? `SameSite=${options.sameSite};` : ''} ${options.maxAge ? `Max-Age=${options.maxAge};` : ''}`;
            res.setHeader('Set-Cookie', cookieString);
          } catch (error) {
            // Ignore errors - cookie setting may fail in some contexts
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            // Next.js Pages Router API routes use res.setHeader for cookies
            const cookieString = `${name}=; Path=/; Max-Age=0; ${options.httpOnly ? 'HttpOnly;' : ''} ${options.secure ? 'Secure;' : ''}`;
            res.setHeader('Set-Cookie', cookieString);
          } catch (error) {
            // Ignore errors - cookie removal may fail in some contexts
          }
        },
      },
    });

    // Get session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    // Get user
    const { data: userData, error: authError } = await supabase.auth.getUser();

    // Try to read profile if we have a user
    let profileData: { role: string } | null = null;
    let profileError: Error | null = null;
    if (userData?.user) {
      const profileResult = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .single();
      profileData = profileResult.data;
      profileError = profileResult.error;
    }

    return res.status(200).json({
      cookiesSeen: Object.keys(req.cookies || {}),
      session: {
        hasSession: !!sessionData?.session,
        sessionError: sessionError?.message ?? null,
        sessionData: sessionData?.session ? {
          access_token: sessionData.session.access_token?.substring(0, 20) + '...',
          expires_at: sessionData.session.expires_at,
          user: {
            id: sessionData.session.user?.id,
            email: sessionData.session.user?.email,
          },
        } : null,
      },
      auth: {
        hasUser: !!userData?.user,
        authError: authError?.message ?? null,
        user: userData?.user ? {
          id: userData.user.id,
          email: userData.user.email,
          email_confirmed_at: userData.user.email_confirmed_at,
          created_at: userData.user.created_at,
        } : null,
      },
      profile: {
        found: !!profileData,
        profileError: profileError?.message ?? null,
        role: profileData?.role ?? null,
      },
    });
  } catch (error) {
    console.error('Debug auth endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      cookiesSeen: Object.keys(req.cookies || {}),
    });
  }
}

