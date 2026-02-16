/**
 * Personal Home — /home
 *
 * Authenticated dashboard that surfaces access status, quick actions,
 * and recommendations. SSR-gated: redirects to /login if not authenticated.
 */

import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';

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
  return 'text-dark_accent-400';
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function AccessCard({
  title,
  status,
  statusColor,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  status: string;
  statusColor: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700/50 p-5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-white antialiased">{title}</h3>
        <span className={`text-xs font-medium antialiased ${statusColor}`}>
          {status}
        </span>
      </div>
      <Link
        href={ctaHref}
        className="self-start text-sm font-medium text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased"
      >
        {ctaLabel} &rarr;
      </Link>
    </div>
  );
}

function QuickActionButton({
  href,
  label,
  sub,
  accent,
}: {
  href: string;
  label: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center justify-center rounded-2xl py-5 px-4 transition-colors ${
        accent
          ? 'bg-dark_accent-500/20 hover:bg-dark_accent-500/30 active:bg-dark_accent-500/40'
          : 'bg-neutral-800/50 hover:bg-neutral-800/70 active:bg-neutral-800/90'
      }`}
    >
      <span
        className={`text-base font-semibold antialiased ${
          accent ? 'text-dark_accent-300' : 'text-white'
        }`}
      >
        {label}
      </span>
      <span
        className={`text-[11px] antialiased mt-1 ${
          accent ? 'text-dark_accent-500/70' : 'text-white/40'
        }`}
      >
        {sub}
      </span>
    </Link>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  return (
    <div className="rounded-2xl bg-neutral-800/50 border border-neutral-700/50 p-5 flex flex-col gap-2">
      <h4 className="text-sm font-semibold text-white antialiased">{rec.title}</h4>
      <p className="text-xs text-white/50 antialiased leading-relaxed">
        {rec.description}
      </p>
      <Link
        href={rec.ctaHref}
        className="self-start mt-1 text-sm font-medium text-dark_accent-400 hover:text-dark_accent-300 transition-colors antialiased"
      >
        {rec.ctaLabel} &rarr;
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function HomePage({ userEmail }: HomePageProps) {
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

  return (
    <>
      <Head>
        <title>Home &bull; Fine Diet</title>
      </Head>

      <div className="min-h-screen bg-brand-900 text-white">
        <div className="max-w-2xl mx-auto px-5 pt-14 pb-20">
          {/* ── Hero ──────────────────────────────────────────────── */}
          <div className="mb-10">
            <h1 className="text-3xl font-semibold antialiased">
              Welcome back{loading ? '' : `, ${displayName}`}
            </h1>
            <p className="text-sm text-white/50 antialiased mt-1">
              Your personal dashboard
            </p>
          </div>

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
              {/* Your Access */}
              <section className="mb-8">
                <h2 className="text-xs font-semibold text-white/40 antialiased uppercase tracking-wider mb-3 px-1">
                  Your Access
                </h2>
                <div className="flex flex-col gap-3">
                  <AccessCard
                    title="Journal"
                    status={journalStatusLabel(journal)}
                    statusColor={journalStatusColor(journal)}
                    ctaLabel={journal.hasAccess ? 'Open Journal' : 'Get Journal Access'}
                    ctaHref={journal.hasAccess ? '/journal' : '/journal-waitlist'}
                  />
                  <AccessCard
                    title="Programs"
                    status="Explore"
                    statusColor="text-white/40"
                    ctaLabel="View Programs"
                    ctaHref="/programs"
                  />
                  <AccessCard
                    title="Assessments"
                    status="Available"
                    statusColor="text-white/40"
                    ctaLabel="My Assessments"
                    ctaHref="/account/assessments"
                  />
                </div>
              </section>

              {/* Quick Actions */}
              <section className="mb-8">
                <h2 className="text-xs font-semibold text-white/40 antialiased uppercase tracking-wider mb-3 px-1">
                  Quick Actions
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {journal.hasAccess && (
                    <>
                      <QuickActionButton
                        href="/journal/log"
                        label="Log Food"
                        sub="Fast add meals & snacks"
                        accent
                      />
                      <QuickActionButton
                        href="/journal/insights"
                        label="Insights"
                        sub="View your trends"
                      />
                    </>
                  )}
                  <QuickActionButton
                    href="/gut-check"
                    label="Gut Check"
                    sub="Quick assessment"
                  />
                  <QuickActionButton
                    href="/shop"
                    label="Shop"
                    sub="Products & supplements"
                  />
                </div>
              </section>

              {/* Recommended for You */}
              {data.recommendations.length > 0 && (
                <section className="mb-8">
                  <h2 className="text-xs font-semibold text-white/40 antialiased uppercase tracking-wider mb-3 px-1">
                    Recommended for You
                  </h2>
                  <div className="flex flex-col gap-3">
                    {data.recommendations.map((rec, i) => (
                      <RecommendationCard key={i} rec={rec} />
                    ))}
                  </div>
                </section>
              )}
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
  const user = await getCurrentUserWithRoleFromSSR(context);

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
    },
  };
};
