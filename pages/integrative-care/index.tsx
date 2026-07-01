import type { GetStaticProps } from 'next';
import Head from 'next/head';

import {
  getIntegrativeCareComposition,
  getIntegrativeCareProductRecord,
  type IntegrativeCareProduct,
} from '@/lib/integrativeCareApi';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition } from '@/lib/modules/types';

const INTEGRATIVE_CARE_INDEX_SLUG = 'integrative-care-landing';

interface PageProps {
  landingProduct: IntegrativeCareProduct | null;
  landingComposition: PageComposition | null;
}

export default function IntegrativeCareIndexPage({
  landingProduct,
  landingComposition,
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
          <ModuleRenderer composition={landingComposition} />
        ) : (
          <FallbackHero />
        )}
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
        <p className="mx-auto mt-6 max-w-2xl text-base font-light leading-5 text-white/76 sm:text-lg">
          Explore Fine Diet care pathways and choose the support option that fits
          your current season. Public pages explain the path; product records and
          care systems own the details.
        </p>
        <div className="mt-10">
          <a
            href="/integrative-care"
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-white px-8 text-sm font-semibold text-brand-900 transition hover:bg-white/90"
          >
            Explore care pathways
          </a>
        </div>
      </div>
    </section>
  );
}

export const getStaticProps: GetStaticProps<PageProps> = async () => {
  const [landingProduct, landingComposition] = await Promise.all([
    getIntegrativeCareProductRecord(INTEGRATIVE_CARE_INDEX_SLUG, 'published'),
    getIntegrativeCareComposition(INTEGRATIVE_CARE_INDEX_SLUG, 'published'),
  ]);

  return {
    props: {
      landingProduct,
      landingComposition,
    },
    revalidate: 300,
  };
};
