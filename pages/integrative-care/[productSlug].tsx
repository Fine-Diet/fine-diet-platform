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
 * Public render requires BOTH a published product record and a published
 * composition. Draft compositions remain admin-preview only.
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

const INTEGRATIVE_CARE_INDEX_SLUG = 'integrative-care-landing';
const RESERVED_ROOT_SLUGS = new Set([INTEGRATIVE_CARE_INDEX_SLUG, 'index']);

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
  // and JSON-seeded products in a single call. Root landing aliases are reserved
  // for /integrative-care and are not product pages.
  const products = (await listIntegrativeCareProducts(true)).filter(
    (p) => !RESERVED_ROOT_SLUGS.has(p.productSlug),
  );
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

  if (RESERVED_ROOT_SLUGS.has(productSlug)) {
    return {
      redirect: {
        destination: '/integrative-care',
        permanent: true,
      },
    };
  }

  const [product, composition] = await Promise.all([
    getIntegrativeCareProductRecord(productSlug, 'published'),
    getIntegrativeCareComposition(productSlug, 'published'),
  ]);

  if (!product || !composition) {
    return { notFound: true };
  }

  return {
    props: { product, composition },
    revalidate: 300,
  };
};
