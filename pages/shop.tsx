import Link from 'next/link';
import Head from 'next/head';

export default function ShopPage() {
  return (
    <>
      <Head>
        <title>Shop &bull; Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-50 text-brand-900 flex flex-col items-center justify-center px-6">
        <h1 className="text-3xl font-semibold antialiased mb-2">Shop</h1>
        <p className="text-sm text-brand-900/60 antialiased mb-6">
          Browse Fine Diet products and supplements.
        </p>
        <p className="text-sm text-brand-900/40 antialiased mb-8">Coming soon</p>
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
