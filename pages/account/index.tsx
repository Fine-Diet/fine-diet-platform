import Link from 'next/link';
import Head from 'next/head';
import { useState } from 'react';

export default function AccountPage() {
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);

  const handleManageBilling = async () => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setBillingError(data.error || 'Failed to open billing portal');
        return;
      }
      window.location.href = data.url;
    } catch {
      setBillingError('Something went wrong. Please try again.');
    } finally {
      setBillingLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Account Settings &bull; Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-50 text-brand-900 flex flex-col items-center justify-center px-6">
        <h1 className="text-3xl font-semibold antialiased mb-2">Account Settings</h1>
        <p className="text-sm text-brand-900/60 antialiased mb-6">
          Manage your subscriptions, purchases, and account settings.
        </p>

        {/* Manage Billing */}
        <button
          onClick={handleManageBilling}
          disabled={billingLoading}
          className="mb-4 px-6 py-3 bg-brand-900 text-white rounded-full text-sm font-medium hover:bg-brand-800 transition-colors disabled:opacity-50 antialiased"
        >
          {billingLoading ? 'Opening...' : 'Manage Billing'}
        </button>
        {billingError && (
          <p className="text-sm text-red-600 mb-4 antialiased">{billingError}</p>
        )}

        <div className="flex flex-col items-center gap-3">
          <Link
            href="/journal"
            className="text-sm text-dark_accent-600 hover:text-dark_accent-500 transition-colors antialiased"
          >
            Back to Journal
          </Link>
          <Link
            href="/home"
            className="text-sm text-brand-900/50 hover:text-brand-900/70 transition-colors antialiased"
          >
            Home
          </Link>
        </div>
      </div>
    </>
  );
}
