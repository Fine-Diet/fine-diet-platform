/**
 * Route: /integrative-care/[productSlug]
 *
 * Reusable product template for all Integrative Care offerings.
 *
 * Data layer (two independent lookups, both required):
 *   1. Product record  — identity, SEO, status gate
 *      Source: data/products/integrative-care/{slug}.json
 *      Getter: getIntegrativeCareProduct()
 *
 *   2. Composition     — ordered module content for the page
 *      Source: data/compositions/integrative-care--{slug}.json
 *      Getter: getComposition('integrative-care--{slug}')
 *
 * If either is missing, or product.status !== 'published', returns 404.
 *
 * Adding a new product requires:
 *   - data/products/integrative-care/{slug}.json  (product record)
 *   - data/products/integrative-care/index.json   (add slug entry)
 *   - data/compositions/integrative-care--{slug}.json  (module content)
 *   No code changes required.
 */

import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';

import {
  getIntegrativeCareProduct,
  getIntegrativeCareProductIndex,
  type IntegrativeCareProduct,
} from '@/lib/contentApi';
import { getComposition } from '@/lib/modules/compositionApi';
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
  const index = await getIntegrativeCareProductIndex();
  const paths = index.map((entry) => ({
    params: { productSlug: entry.slug },
  }));

  return {
    paths,
    fallback: 'blocking',
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async ({ params }) => {
  const productSlug = params?.productSlug as string;

  const [product, composition] = await Promise.all([
    getIntegrativeCareProduct(productSlug),
    getComposition(`integrative-care--${productSlug}`),
  ]);

  if (!product || !composition) {
    return { notFound: true };
  }

  return {
    props: { product, composition },
    revalidate: 300,
  };
};
