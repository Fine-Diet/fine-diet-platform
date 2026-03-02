import Link from 'next/link';
import Head from 'next/head';
import BuyOfferButton from '@/components/checkout/BuyOfferButton';

export default function ProgramsPage() {
  return (
    <>
      <Head>
        <title>Programs &bull; Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-50 text-brand-900 flex flex-col items-center justify-center px-6">
        <h1 className="text-3xl font-semibold antialiased mb-2">Programs</h1>
        <p className="text-sm text-brand-900/60 antialiased mb-6">
          Explore personalized nutrition and wellness programs.
        </p>

        {/* Journal access purchase */}
        <div className="max-w-sm w-full bg-white rounded-2xl shadow-sm border border-brand-100 p-6 mb-8">
          <h2 className="text-lg font-semibold antialiased mb-1">Fine Diet Journal</h2>
          <p className="text-sm text-brand-900/60 antialiased mb-4">
            Your personal nutrition companion. Track meals, monitor trends, and build better habits.
          </p>
          <div className="flex flex-wrap gap-2">
            <BuyOfferButton
              offerKey="journal-annual"
              label="Annual"
              placement="programs"
              variant="primary"
              size="sm"
            />
            <BuyOfferButton
              offerKey="journal-monthly"
              label="Monthly"
              placement="programs"
              variant="secondary"
              size="sm"
            />
          </div>
        </div>

        <p className="text-sm text-brand-900/40 antialiased mb-8">More programs coming soon</p>
        <div className="flex flex-col items-center gap-3">
          <Link
            href="/journal"
            className="text-sm text-dark_accent-600 hover:text-dark_accent-500 transition-colors antialiased"
          >
            Back to Journal
          </Link>
          <Link
            href="/"
            className="text-sm text-brand-900/50 hover:text-brand-900/70 transition-colors antialiased"
          >
            Home
          </Link>
        </div>
      </div>
    </>
  );
}
