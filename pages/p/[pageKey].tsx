/**
 * Module-Composed Page
 * Route: /p/[pageKey]
 *
 * Renders any page expressed as a PageComposition — an ordered array of
 * typed module instances loaded from data/compositions/{pageKey}.json
 * (Phase 1) or the site_content CMS table (Phase 2).
 *
 * Returns 404 if no composition exists for the given key.
 *
 * SEO: getSeoForRoute will be wired in Phase 2 when real pages migrate
 * to this route. The proof composition (/p/integrative-care-preview) is
 * intentionally not indexed.
 */

import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';

import { getComposition } from '@/lib/modules/compositionApi';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition } from '@/lib/modules/types';

interface PageProps {
  composition: PageComposition;
}

export default function ModuleComposedPage({ composition }: PageProps) {
  return (
    <>
      <Head>
        {/* Proof route — suppress indexing until Phase 2 SEO wiring */}
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="min-h-screen bg-brand-900">
        <ModuleRenderer composition={composition} />
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    // No pre-rendered paths at build time. Pages are generated on first
    // request and then cached (ISR). New composition files become live
    // without a redeploy.
    paths: [],
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  const pageKey = params?.pageKey as string;

  const composition = await getComposition(pageKey);

  if (!composition) {
    return { notFound: true };
  }

  return {
    props: { composition },
    // Matches the ISR cadence used by other content-driven pages.
    revalidate: 300,
  };
};
