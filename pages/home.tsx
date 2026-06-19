/**
 * Personal Home — /home
 *
 * Authenticated dashboard that surfaces access status, quick actions,
 * and recommendations. SSR-gated: redirects to /login if not authenticated.
 */

import { useEffect, useState, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { getHomeContent } from '@/lib/contentApi';
import { HeroMediumSection } from '@/components/home/HeroMediumSection';
import { GridMediumSection } from '@/components/home/GridMediumSection';
import type { HomeContent } from '@/lib/contentTypes';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

/* ------------------------------------------------------------------ */
/*  Types (mirror API response)                                       */
/* ------------------------------------------------------------------ */

interface JournalAccess {
  hasAccess: boolean;
  source: 'subscription' | 'entitlement' | null;
  endsAt: string | null;
}

interface Recommendation {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

interface DashboardData {
  user: { email: string | null; role: string };
  person: { id: string; first_name: string | null; last_name: string | null } | null;
  access: { journal: JournalAccess };
  recommendations: Recommendation[];
}

interface HomePageProps {
  userEmail: string | null;
  homeContent: HomeContent;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function journalStatusLabel(j: JournalAccess): string {
  if (!j.hasAccess) return 'No access';
  if (j.endsAt) {
    const d = new Date(j.endsAt);
    const now = new Date();
    const daysLeft = Math.ceil((d.getTime() - now.getTime()) / 86_400_000);
    if (daysLeft <= 14) return `Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
  }
  return 'Active';
}

function journalStatusColor(j: JournalAccess): string {
  if (!j.hasAccess) return 'text-white/40';
  if (j.endsAt) {
    const d = new Date(j.endsAt);
    const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
    if (daysLeft <= 14) return 'text-amber-400';
  }
  return 'text-denim-400';
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/*
 * AccessCard, QuickActionButton, and RecommendationCard were extracted into
 * reusable components (Packet 2B-A) so the style guide can render them live:
 *   - components/app/cards/AccessCard.tsx
 *   - components/app/actions/QuickActionButton.tsx
 *   - components/app/cards/RecommendationCard.tsx
 * They are not currently rendered on this page (the Quick Actions / Recommended
 * sections are held back — see the markers in the Page body), so no import is
 * wired here yet. Import from the paths above when those sections are re-enabled;
 * the rendered dashboard UI is unchanged by the extraction.
 */

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HomePage({ userEmail, homeContent }: HomePageProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/account/dashboard');
        if (!res.ok) throw new Error('Failed to load dashboard');
        const json: DashboardData = await res.json();
        setData(json);
      } catch (err) {
        console.error('[Home] Dashboard fetch error:', err);
        setError('Unable to load your dashboard. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const displayName =
    data?.person?.first_name || data?.user?.email?.split('@')[0] || userEmail?.split('@')[0] || 'there';

  const journal = data?.access.journal ?? { hasAccess: false, source: null, endsAt: null };

  const heroContent: HomeContent = useMemo(() => {
    const title = loading
      ? 'Welcome back.'
      : `Welcome back,\n${displayName}.`;

    const description = journal.hasAccess
      ? 'Log a meal, manage your programs, or pick up where you left off.'
      : 'Track what you eat, how you feel, and start connecting the dots.';

    const buttons = journal.hasAccess
      ? [
          { label: 'Open Journal', variant: 'primary' as const, href: APP_ROUTES.log },
          { label: 'View Programs', variant: 'tertiary' as const, href: APP_ROUTES.programs },
        ]
      : [
          { label: 'Get Journal Access', variant: 'primary' as const, href: '/journal-waitlist' },
          { label: 'Explore Programs', variant: 'tertiary' as const, href: '/programs' },
        ];

    return {
      ...homeContent,
      hero: {
        ...homeContent.hero,
        title,
        description,
        buttons,
      },
    };
  }, [loading, displayName, journal.hasAccess, homeContent]);

  return (
    <>
      <Head>
        <title>Home &bull; Fine Diet</title>
      </Head>

      <div className="min-h-screen bg-brand-900 text-white">
        {/* ── Hero Medium ─────────────────────────────────────────── */}
        <div className="pb-1.5">
          <HeroMediumSection homeContent={heroContent} />
        </div>

        <div className="mx-auto px-4 pt-2">
          {/* ── Loading state ─────────────────────────────────────── */}
          {loading && (
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-24 rounded-2xl bg-neutral-800/30 animate-pulse"
                />
              ))}
            </div>
          )}

          {/* ── Error state ───────────────────────────────────────── */}
          {error && !loading && (
            <div className="rounded-2xl bg-semantic-error/20 border border-semantic-error/50 p-5 mb-8">
              <p className="text-sm text-white antialiased">{error}</p>
            </div>
          )}

          {/* ── Dashboard content ─────────────────────────────────── */}
          {data && !loading && (
            <>
              {/* Access grid — Journal, Programs, Assessments, Plans */}
              <section className="mb-8">
                <GridMediumSection
                  section={{
                    items: [
                      {
                        title: 'Journal',
                        description: journal.hasAccess
                          ? 'Track meals, moods, and patterns.'
                          : 'Your personal nutrition companion.',
                        image: '/images/home/integrative-care-desktop.jpg',
                        button: {
                          label: journal.hasAccess ? 'Open Journal' : 'Get Access',
                          variant: 'primary',
                          href: journal.hasAccess ? APP_ROUTES.log : '/journal-waitlist',
                        },
                      },
                      {
                        title: 'Programs',
                        description: 'Guided frameworks for lasting change.',
                        image: '/images/home/health-reset-desktop.jpg',
                        button: {
                          label: 'Explore',
                          variant: 'tertiary',
                          href: '/programs',
                        },
                      },
                      {
                        title: 'Assessments',
                        description: 'Quick check-ins that reveal your patterns.',
                        image: '/images/home/intelligence-journal-desktop.jpg',
                        button: {
                          label: 'Take Assessment',
                          variant: 'tertiary',
                          href: '/assessments',
                        },
                      },
                      {
                        title: 'Plans',
                        description: 'Meal plans and nutrition strategies.',
                        image: '/images/home/fine-diet-approved-desktop.jpg',
                        button: {
                          label: 'View Plans',
                          variant: 'tertiary',
                          href: APP_ROUTES.plans,
                        },
                      },
                    ],
                  }}
                />
              </section>

              {/* Subscribe — shown when user lacks app access */}
              {!journal.hasAccess && (
                <section className="mb-8">
                  <h2 className="text-xs font-semibold text-white/40 antialiased uppercase tracking-wider mb-3 px-1">
                    Subscribe to Fine Diet
                  </h2>
                  <div className="flex flex-col gap-3">
                    <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700/50 p-5">
                      <p className="text-sm text-white/70 antialiased mb-4">
                        One subscription unlocks the full Fine Diet app and programs as they run.
                      </p>
                      <Link
                        href="/start"
                        className="inline-flex items-center justify-center rounded-full bg-denim-500 px-5 py-2.5 text-sm font-medium text-white antialiased transition-colors hover:bg-denim-400"
                      >
                        See subscription options
                      </Link>
                    </div>
                  </div>
                </section>
              )}

              {/* Quick Actions — hidden for now */}
              {/* Recommended for You — hidden for now */}
            </>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  SSR: auth gate                                                     */
/* ------------------------------------------------------------------ */

export const getServerSideProps: GetServerSideProps<HomePageProps> = async (context) => {
  const [user, homeContent] = await Promise.all([
    getCurrentUserWithRoleFromSSR(context),
    getHomeContent(),
  ]);

  if (!user) {
    return {
      redirect: {
        destination: '/login?redirect=/home',
        permanent: false,
      },
    };
  }

  return {
    props: {
      userEmail: user.email,
      homeContent,
    },
  };
};
