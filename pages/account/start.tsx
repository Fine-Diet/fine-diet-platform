import Head from 'next/head';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';

/**
 * /account/start — neutral post-account-creation landing.
 *
 * This is the fallback destination for signups with NO safe redirect/context.
 * It intentionally performs NO automatic onward routing into onboarding,
 * checkout, the Baseline Program, or the app dashboard. The user chooses
 * their own next step from here.
 */

interface NextStep {
  href: string;
  title: string;
  description: string;
}

const NEXT_STEPS: NextStep[] = [
  {
    href: '/shop',
    title: 'Explore programs',
    description: 'Browse Fine Diet programs and find the right fit for your goals.',
  },
  {
    href: '/gut-check',
    title: 'Take an assessment',
    description: 'Get a personalized starting point with a quick assessment.',
  },
  {
    href: '/home',
    title: 'Go to your dashboard',
    description: 'See your programs, assessments, and account in one place.',
  },
  {
    href: '/account',
    title: 'Account settings',
    description: 'Manage your subscriptions, billing, and account details.',
  },
];

export default function AccountStartPage() {
  return (
    <>
      <Head>
        <title>Welcome to Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-900 text-white flex items-center justify-center px-6 py-16">
        <div className="max-w-xl w-full">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold antialiased mb-2">You&rsquo;re all set</h1>
            <p className="text-sm text-white/70 antialiased">
              Your account is ready. Pick where you&rsquo;d like to go next.
            </p>
          </div>

          <div className="space-y-3">
            {NEXT_STEPS.map((step) => (
              <Link
                key={step.href}
                href={step.href}
                className="block rounded-2xl border border-white/10 bg-neutral-900/60 p-5 transition-colors hover:bg-neutral-800/60"
              >
                <h2 className="text-base font-semibold antialiased">{step.title}</h2>
                <p className="text-sm text-white/60 antialiased mt-1">{step.description}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user) {
    return {
      redirect: {
        destination: `/login?redirect=${encodeURIComponent('/account/start')}`,
        permanent: false,
      },
    };
  }

  return { props: {} };
};
