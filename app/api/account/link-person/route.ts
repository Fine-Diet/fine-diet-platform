import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  linkPersonForVerifiedUser,
  PersonIdentityConflictError,
} from '@/lib/account/linkPersonForVerifiedUser';

/**
 * POST /api/account/link-person
 * Link only the Supabase identity authenticated by this request's session.
 * The request body is deliberately ignored; identity comes from auth.getUser().
 */
export async function POST(_request: Request): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[link-person] Missing Supabase environment configuration.');
    return NextResponse.json({ ok: false, linked: false }, { status: 500 });
  }

  try {
    const cookieStore = cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, linked: false }, { status: 401 });
    }

    await linkPersonForVerifiedUser(user);
    return NextResponse.json({ ok: true, linked: true });
  } catch (error) {
    if (error instanceof PersonIdentityConflictError) {
      return NextResponse.json({ ok: false, linked: false }, { status: 409 });
    }
    console.error('[link-person] Account linkage failed:', error);
    return NextResponse.json({ ok: false, linked: false }, { status: 500 });
  }
}
