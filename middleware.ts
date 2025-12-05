import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware for host-based routing
 * 
 * Rewrites journal.myfinediet.com/ to /journal-waitlist
 * while preserving all other routes and static assets.
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const pathname = request.nextUrl.pathname;

  // Check if the host starts with journal.myfinediet.com
  const isJournalSubdomain = host.startsWith('journal.myfinediet.com');

  // Only rewrite if:
  // 1. It's the journal subdomain
  // 2. The path is exactly "/"
  if (isJournalSubdomain && pathname === '/') {
    // Rewrite to /journal-waitlist
    const url = request.nextUrl.clone();
    url.pathname = '/journal-waitlist';
    return NextResponse.rewrite(url);
  }

  // For all other cases, continue normally
  return NextResponse.next();
}

/**
 * Middleware configuration
 * 
 * Matches all routes except:
 * - Static files (_next/static, favicon, etc.)
 * - API routes (/api)
 * - Image optimization (_next/image)
 * - Other Next.js internal routes
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, fonts, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|eot)).*)',
  ],
};

