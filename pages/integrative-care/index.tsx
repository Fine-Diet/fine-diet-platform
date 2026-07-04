import type { GetStaticProps } from 'next';

import {
  getIntegrativeCareComposition,
  getIntegrativeCareProductRecord,
  type IntegrativeCareProduct,
} from '@/lib/integrativeCareApi';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition } from '@/lib/modules/types';
import { getSeoForRoute } from '@/lib/seo/getSeo';
import type { SeoMeta } from '@/lib/seo/getSeo';
import { SeoHead } from '@/components/seo/SeoHead';
import { composePageSeoOverride } from '@/lib/seo/seoSocialFields';

const INTEGRATIVE_CARE_INDEX_SLUG = 'integrative-care-landing';

interface PageProps {
  landingProduct: IntegrativeCareProduct | null;
  landingComposition: PageComposition | null;
  seo: SeoMeta;
}

export default function IntegrativeCareIndexPage({
  landingProduct,
  landingComposition,
  seo,
}: PageProps) {
  const hasManagedComposition = Boolean(
    landingProduct && landingComposition && landingComposition.modules.length > 0,
  );

  return (
    <>
      <SeoHead seo={seo} />
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

  // Compose the page override: the product record's `seo` block (full social
  // preview) with the legacy `seoTitle` / `seoDescription` as fallback for
  // title/description. Renders through the shared SeoHead pipeline.
  const pageOverride = landingProduct
    ? composePageSeoOverride({
        seo: landingProduct.seo ?? null,
        legacyTitle: landingProduct.seoTitle,
        legacyDescription: landingProduct.seoDescription,
      })
    : null;

  const seoResult = await getSeoForRoute({
    routePath: '/integrative-care',
    pageTitle: landingProduct?.title ?? 'Integrative Care',
    pageDescription:
      landingProduct?.seoDescription ??
      'Explore Fine Diet integrative care pathways and choose the support option that fits your current season.',
    pageOverride,
  });

  return {
    props: {
      landingProduct,
      landingComposition,
      seo: seoResult.seo,
    },
    revalidate: 300,
  };
};
