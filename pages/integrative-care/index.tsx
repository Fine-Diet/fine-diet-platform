import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';

import {
  getIntegrativeCareComposition,
  getIntegrativeCareProductRecord,
  listIntegrativeCareProducts,
  type IntegrativeCareProduct,
} from '@/lib/integrativeCareApi';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition } from '@/lib/modules/types';

const INTEGRATIVE_CARE_INDEX_SLUG = 'integrative-care-landing';

interface PageProps {
  landingProduct: IntegrativeCareProduct | null;
  landingComposition: PageComposition | null;
  products: IntegrativeCareProduct[];
}

export default function IntegrativeCareIndexPage({
  landingProduct,
  landingComposition,
  products,
}: PageProps) {
  const hasManagedComposition = Boolean(
    landingProduct && landingComposition && landingComposition.modules.length > 0,
  );

  return (
    <>
      <Head>
        <title>{landingProduct?.seoTitle ?? 'Integrative Care · Fine Diet'}</title>
        <meta
          name="description"
          content={
            landingProduct?.seoDescription ??
            'Explore Fine Diet integrative care pathways and choose the support option that fits your current season.'
          }
        />
      </Head>

      <main className="min-h-screen bg-brand-50 text-brand-900">
        {hasManagedComposition && landingComposition ? (
          <ModuleRenderer composition={landingComposition} layout="stacked" />
        ) : (
          <FallbackHero />
        )}

        <CareProductDirectory products={products} />
      </main>
    </>
  );
}

function FallbackHero() {
  return (
    <section className="relative isolate flex min-h-[72vh] items-center overflow-hidden bg-brand-900 px-6 py-20 text-white sm:px-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_32rem)]" />
      <div className="relative mx-auto max-w-3xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">
          Integrative Care
        </p>
        <h1 className="mt-5 text-5xl font-semibold leading-none antialiased sm:text-7xl">
          Care that starts with your real life
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base font-light leading-relaxed text-white/76 sm:text-lg">
          Explore Fine Diet care pathways and choose the support option that fits
          your current season. Public pages explain the path; product records and
          care systems own the details.
        </p>
        <div className="mt-10">
          <a
            href="#programs"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-semibold text-brand-900 transition hover:bg-white/90"
          >
            View care options
          </a>
        </div>
      </div>
    </section>
  );
}

function CareProductDirectory({ products }: { products: IntegrativeCareProduct[] }) {
  return (
    <section id="programs" className="bg-brand-50 px-6 py-16 sm:px-10 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-brand-900/50">
            Care options
          </p>
          <h2 className="mt-4 text-3xl font-semibold leading-tight antialiased sm:text-5xl">
            Choose the support path that fits this season.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base font-light leading-relaxed text-brand-900/64">
            These cards resolve from Integrative Care product records. Pricing,
            checkout, booking, grants, entitlements, and care delivery stay in the
            product/source-of-truth layer rather than module copy.
          </p>
        </div>

        {products.length > 0 ? (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <article
                key={product.productSlug}
                className="flex min-h-[18rem] flex-col rounded-3xl border border-brand-900/10 bg-white p-6 shadow-sm"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-900/45">
                  Integrative Care
                </p>
                <h3 className="mt-4 text-2xl font-semibold leading-tight antialiased">
                  {product.title}
                </h3>
                <p className="mt-4 flex-1 text-sm font-light leading-relaxed text-brand-900/64">
                  {product.seoDescription}
                </p>
                <Link
                  href={`/integrative-care/${product.productSlug}`}
                  className="mt-8 inline-flex min-h-11 items-center justify-center rounded-full bg-brand-900 px-5 text-sm font-semibold text-white transition hover:bg-brand-900/90"
                >
                  Explore pathway
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="mx-auto mt-12 max-w-2xl rounded-3xl border border-brand-900/10 bg-white p-8 text-center shadow-sm">
            <h3 className="text-xl font-semibold">
              Care options are being prepared.
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-brand-900/60">
              Add and publish Integrative Care product records to populate this
              section. The page no longer needs a separate waitlist placeholder.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export const getStaticProps: GetStaticProps<PageProps> = async () => {
  const [landingProduct, landingComposition, products] = await Promise.all([
    getIntegrativeCareProductRecord(INTEGRATIVE_CARE_INDEX_SLUG, 'published'),
    getIntegrativeCareComposition(INTEGRATIVE_CARE_INDEX_SLUG, 'published'),
    listIntegrativeCareProducts(true),
  ]);

  return {
    props: {
      landingProduct,
      landingComposition,
      products: products.filter(
        (product) => product.productSlug !== INTEGRATIVE_CARE_INDEX_SLUG,
      ),
    },
    revalidate: 300,
  };
};
