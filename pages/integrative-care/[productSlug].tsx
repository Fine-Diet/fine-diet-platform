/**
 * Route: /integrative-care/[productSlug]
 *
 * Reusable product template for all Integrative Care offerings.
 *
 * Data layer (two independent lookups, both required):
 *   1. Product record  — identity, SEO, status gate
 *      Source: Supabase site_content (product:integrative-care:{slug})
 *              falls back to data/products/integrative-care/{slug}.json
 *      Getter: getIntegrativeCareProductRecord()
 *
 *   2. Composition     — ordered module content for the page
 *      Source: Supabase site_content (composition:integrative-care:{slug})
 *              falls back to data/compositions/integrative-care--{slug}.json
 *      Getter: getIntegrativeCareComposition()
 *
 * getStaticPaths merges Supabase + JSON index so admin-created products
 * and JSON-seeded products are both pre-rendered.
 *
 * If either lookup returns null, or product.status !== 'published', returns 404.
 */

import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';

import {
  getIntegrativeCareProductRecord,
  getIntegrativeCareComposition,
  listIntegrativeCareProducts,
  type IntegrativeCareProduct,
} from '@/lib/integrativeCareApi';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition } from '@/lib/modules/types';

interface PageProps {
  product: IntegrativeCareProduct;
  composition: PageComposition;
}

export default function IntegrativeCareProductPage({ product, composition }: PageProps) {
  return (
    <>
      <Head>
        <title>{product.seoTitle}</title>
        <meta name="description" content={product.seoDescription} />
      </Head>
      <main className="min-h-screen bg-neutral-0">
        <ModuleRenderer composition={composition} />
      </main>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  // listIntegrativeCareProducts merges Supabase + JSON — covers admin-created
  // and JSON-seeded products in a single call.
  const products = await listIntegrativeCareProducts(true);
  const paths = products.map((p) => ({
    params: { productSlug: p.productSlug },
  }));

  return {
    paths,
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  const productSlug = params?.productSlug as string;

  const [product, publishedComposition] = await Promise.all([
    getIntegrativeCareProductRecord(productSlug, 'published'),
    getIntegrativeCareComposition(productSlug, 'published'),
  ]);

  // Fall back to draft composition if no published one exists yet — handles
  // products whose composition was scaffolded only as draft before this fix.
  const composition =
    publishedComposition ?? (await getIntegrativeCareComposition(productSlug, 'draft'));

  if (!product || !composition) {
    return { notFound: true };
  }

  return {
    props: { product, composition },
    revalidate: 300,
  };
};
