import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserWithRoleFromMiddleware } from './lib/authServer';
import { isSafeRedirectTarget } from './lib/redirectHelpers';
import { resolveEffectiveAccessForAuthUser } from './lib/access/effectiveAccess';
import {
  APP_ROUTES,
  getCanonicalAppRouteForLegacyJournalPath,
  isCanonicalAppRoute,
  isLegacyJournalRoute,
} from './lib/routes/appRoutes';
import {
  buildOnboardingRedirectDestination,
  isOnboardingGateExempt,
  mustEnterOnboarding,
} from './lib/onboarding/onboardingGate';

/** Build redirect URL with original path+query for post-login/post-waitlist return */
function redirectParam(pathname: string, search: string): string {
  const full = search ? `${pathname}${search}` : pathname;
  return isSafeRedirectTarget(full) ? full : pathname;
}

function redirectToWaitlist(url: URL, pathname: string, search: string): NextResponse {
  url.pathname = '/journal-waitlist';
  url.searchParams.set('redirect', redirectParam(pathname, search));
  return NextResponse.redirect(url);
}

/**
 * Middleware for host-based routing, journal gating, and admin route protection
 *
 * Package 2: access and onboarding decisions come from the shared effective
 * access resolver (entitlements first, legacy subscription compat second;
 * skip vs completion are distinct onboarding states).
 */
export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;
  const search = request.nextUrl.search || '';
  const url = request.nextUrl.clone();

  // -------------------------------------------------------------------------
  // Journal subdomain routing: journal.myfinediet.com
  // -------------------------------------------------------------------------
  const isJournalSubdomain = host.startsWith('journal.myfinediet.com');
  if (isJournalSubdomain && pathname === '/') {
    const user = await getCurrentUserWithRoleFromMiddleware(request);

    if (!user) {
      url.pathname = '/login';
      url.searchParams.set('redirect', redirectParam('/', search));
      url.searchParams.set('ctx', 'generic');
      return NextResponse.redirect(url);
    }

    try {
      const decision = await resolveEffectiveAccessForAuthUser(user.id);
      if (!decision.allowed) {
        return redirectToWaitlist(url, '/', search);
      }

      if (mustEnterOnboarding({
        onboarding_completed_at: decision.onboarding.completedAt,
        onboarding_skipped_at: decision.onboarding.skippedAt,
        onboarding_started_at: decision.onboarding.startedAt,
        onboarding_last_step: decision.onboarding.lastStep,
      })) {
        const dest = buildOnboardingRedirectDestination(APP_ROUTES.log, '');
        const [destPath, destQuery] = dest.split('?');
        url.pathname = destPath;
        url.search = destQuery ? `?${destQuery}` : '';
        return NextResponse.redirect(url);
      }

      url.pathname = APP_ROUTES.log;
      return NextResponse.rewrite(url);
    } catch (err) {
      console.error('[Middleware] Journal subdomain access check failed:', err);
      return redirectToWaitlist(url, '/', search);
    }
  }

  // -------------------------------------------------------------------------
  // Signed-in app gate: /app, /app/*, /journal, and /journal/*
  // -------------------------------------------------------------------------
  const isSignedInAppRoute = isCanonicalAppRoute(pathname) || isLegacyJournalRoute(pathname);
  if (isSignedInAppRoute) {
    const user = await getCurrentUserWithRoleFromMiddleware(request);

    if (!user) {
      url.pathname = '/login';
      url.searchParams.set('redirect', redirectParam(pathname, search));
      url.searchParams.set('ctx', 'generic');
      return NextResponse.redirect(url);
    }

    try {
      const decision = await resolveEffectiveAccessForAuthUser(user.id);
      if (!decision.allowed) {
        return redirectToWaitlist(url, pathname, search);
      }

      const metadata = {
        onboarding_completed_at: decision.onboarding.completedAt,
        onboarding_skipped_at: decision.onboarding.skippedAt,
        onboarding_started_at: decision.onboarding.startedAt,
        onboarding_last_step: decision.onboarding.lastStep,
      };

      if (mustEnterOnboarding(metadata) && !isOnboardingGateExempt(pathname)) {
        const dest = buildOnboardingRedirectDestination(pathname, search);
        const [destPath, destQuery] = dest.split('?');
        url.pathname = destPath;
        url.search = destQuery ? `?${destQuery}` : '';
        return NextResponse.redirect(url);
      }
    } catch (err) {
      console.error('[Middleware] Journal access check failed:', err);
      return redirectToWaitlist(url, pathname, search);
    }

    const canonicalPath = getCanonicalAppRouteForLegacyJournalPath(pathname);
    if (canonicalPath) {
      url.pathname = canonicalPath;
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  // Protect /admin/* routes
  if (pathname.startsWith('/admin')) {
    try {
      const user = await getCurrentUserWithRoleFromMiddleware(request);

      if (process.env.NODE_ENV === 'development') {
        console.log('[Middleware] /admin route check:', {
          pathname,
          hasUser: !!user,
          userRole: user?.role,
          userEmail: user?.email,
        });
      }

      if (!user) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Middleware] No user, redirecting to /login');
        }
        url.pathname = '/login';
        url.searchParams.set('redirect', pathname);
        url.searchParams.set('ctx', 'generic');
        return NextResponse.redirect(url);
      }

      if (pathname.startsWith('/admin/people')) {
        if (user.role !== 'admin') {
          if (process.env.NODE_ENV === 'development') {
            console.log('[Middleware] /admin/people requires admin role, user has:', user.role);
          }
          url.pathname = '/admin';
          url.searchParams.delete('redirect');
          return NextResponse.redirect(url);
        }
        if (process.env.NODE_ENV === 'development') {
          console.log('[Middleware] Admin authorized for /admin/people');
        }
        return NextResponse.next();
      }

      if (user.role !== 'editor' && user.role !== 'admin') {
        if (process.env.NODE_ENV === 'development') {
          console.log('[Middleware] User role not allowed:', user.role, 'redirecting to /');
        }
        url.pathname = '/';
        url.searchParams.delete('redirect');
        return NextResponse.redirect(url);
      }

      return NextResponse.next();
    } catch (err) {
      console.error('[Middleware] Admin check failed:', err);
      url.pathname = '/login';
      url.searchParams.set('redirect', pathname);
      url.searchParams.set('ctx', 'generic');
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot)).*)',
  ],
};
