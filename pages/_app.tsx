import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { AppContext } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { NavBar } from '@/components/nav/NavBar';
import { Footer } from '@/components/footer';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AppShell } from '@/components/journal/AppShell';
import { getNavigationContent, getFooterContent, getGlobalContent } from '@/lib/contentApi';
import { NavigationContent, FooterContent, GlobalContent } from '@/lib/contentTypes';
import { onAuthStateChange } from '@/lib/authHelpers';
import { isAppShellRoute } from '@/lib/routes/appRoutes';
import Link from 'next/link';

interface MyAppProps extends AppProps {
  navigation: NavigationContent;
  footerContent: FooterContent;
  globalContent: GlobalContent;
}

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  exchange_failed: "We couldn\u2019t complete sign-in. Please try again.",
  missing_code: 'Sign-in was cancelled or the link expired. Please try again.',
};

function MyApp({ Component, pageProps, navigation, footerContent, globalContent }: MyAppProps) {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);

  // Surface OAuth error from ?auth_error= query param and clear it from the URL
  useEffect(() => {
    const { auth_error, ...rest } = router.query;
    if (typeof auth_error === 'string') {
      setAuthError(AUTH_ERROR_MESSAGES[auth_error] ?? 'Sign-in failed. Please try again.');
      router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    }
  }, [router.query]);

  // Post-OAuth assessment claim: fire once when a SIGNED_IN event fires (covers OAuth redirect)
  useEffect(() => {
    const unsubscribe = onAuthStateChange(async (event) => {
      if (event !== 'SIGNED_IN') return;
      try {
        const claimToken = localStorage.getItem('fd_gc_claimToken:last');
        if (!claimToken) return;
        const res = await fetch('/api/assessments/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ claimToken }),
        });
        if (res.ok || res.status === 204) {
          localStorage.removeItem('fd_gc_claimToken:last');
        } else {
          console.warn('[_app] Failed to claim assessment after sign-in:', res.status);
        }
      } catch (err) {
        console.warn('[_app] Error claiming assessment after sign-in:', err);
      }
    });
    return unsubscribe;
  }, []);

  // Check if current route is an admin route
  const isAdminRoute = router.pathname.startsWith('/admin') || router.asPath.startsWith('/admin');
  
  // Check if current route is an assessment/results flow route.
  // Includes both the legacy /gut-check alias and the canonical /assessments/ family,
  // so the global header and footer are suppressed for the full assessment experience.
  const isAssessmentFlow =
    router.asPath.startsWith('/gut-check') ||
    router.asPath.startsWith('/assessments/') ||
    router.asPath.startsWith('/gut-pattern-breakdown') ||
    router.asPath.startsWith('/results/');

  // Check if current route is a dev/internal route (no header/footer)
  const isDevRoute = router.pathname.startsWith('/dev') || router.asPath.startsWith('/dev');

  // Check if current route is under style-guide (standalone, no header/footer)
  const isStyleGuide = router.pathname.startsWith('/style-guide');

  // Check if current route is a signed-in app route (uses its own navigation)
  const isSignedInAppRoute = isAppShellRoute(router.asPath);

  // For admin routes, use AdminLayout (no public header/footer)
  if (isAdminRoute) {
    return (
      <AdminLayout>
        <Component {...pageProps} />
      </AdminLayout>
    );
  }

  // For assessment flow routes, render without Header/Footer
  if (isAssessmentFlow) {
    return (
      <main className="bg-brand-900 min-h-screen">
        <Component {...pageProps} />
      </main>
    );
  }

  // For dev routes, render without Header/Footer
  if (isDevRoute) {
    return (
      <main className="bg-brand-900 min-h-screen">
        <Component {...pageProps} />
      </main>
    );
  }

  // For style-guide pages, render standalone (no header/footer)
  if (isStyleGuide) {
    return <Component {...pageProps} />;
  }

  // For signed-in app routes, render without global Header/Footer (uses own navigation)
  if (isSignedInAppRoute) {
    return (
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
    );
  }

  // For all other routes, render with full layout (Header/Footer)
  return (
    <>
      {/* OAuth / auth error banner */}
      {authError && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 bg-red-900/90 backdrop-blur-sm text-white text-sm px-5 py-3 rounded-full shadow-lg max-w-sm w-[calc(100%-2rem)]">
          <span className="flex-1 antialiased">{authError}</span>
          <button
            type="button"
            onClick={() => setAuthError(null)}
            className="text-white/70 hover:text-white transition-colors antialiased flex-shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}
      {/* Announcement Bar */}
      {globalContent.announcementBar?.enabled && (
        <div className="bg-denim-500 text-neutral-900 text-center py-2 px-4">
          {globalContent.announcementBar.href ? (
            <Link
              href={globalContent.announcementBar.href}
              className="hover:underline font-medium"
            >
              {globalContent.announcementBar.message}
            </Link>
          ) : (
            <p className="font-medium">{globalContent.announcementBar.message}</p>
          )}
        </div>
      )}
      <NavBar navigation={navigation} />
      <main className="bg-brand-900 min-h-screen">
        <Component {...pageProps} />
      </main>
      <Footer footerContent={footerContent} />
    </>
  );
}

MyApp.getInitialProps = async (appContext: AppContext) => {
  // Fetch global content (navigation, footer, and global settings) for all pages
  const [navigation, footerContent, globalContent] = await Promise.all([
    getNavigationContent(),
    getFooterContent(),
    getGlobalContent(),
  ]);

  // Call the page's getInitialProps if it exists
  let pageProps = {};
  if (appContext.Component.getInitialProps) {
    pageProps = await appContext.Component.getInitialProps(appContext.ctx);
  }

  // Merge global props with page-specific props
  return {
    pageProps,
    navigation,
    footerContent,
    globalContent,
  };
};

export default MyApp;
