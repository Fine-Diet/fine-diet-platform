/**
 * Admin preview: /admin/integrative-care/[productSlug]/preview
 *
 * Server-side rendered (not ISR) so draft content is always fresh.
 * Auth-protected — editor/admin only.
 * Loads draft composition first, falls back to published.
 * Loads draft product record first, falls back to published.
 *
 * Renders the full public page (ModuleRenderer) inside a preview banner.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import {
  getIntegrativeCareProductRecord,
  getIntegrativeCareComposition,
  type IntegrativeCareProduct,
} from '@/lib/integrativeCareApi';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition } from '@/lib/modules/types';

interface Props {
  product: IntegrativeCareProduct;
  composition: PageComposition;
}

export default function IntegrativeCarePreview({ product, composition }: Props) {
  const isDraft = product.status === 'draft';

  return (
    <>
      <Head>
        <title>[Preview] {product.seoTitle}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>

      {/* Preview banner — sits above the page content */}
      <div className="sticky top-0 z-[999] flex items-center justify-between gap-4 bg-amber-400 px-4 py-2 text-sm font-medium text-amber-900">
        <div className="flex items-center gap-3">
          <span className="font-semibold">Admin Preview</span>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
            isDraft ? 'bg-amber-600 text-white' : 'bg-green-700 text-white'
          }`}>
            {product.status}
          </span>
          <span className="font-mono text-xs opacity-70">{product.productSlug}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href={`/admin/integrative-care/${product.productSlug}`}
            className="hover:underline"
          >
            Edit metadata
          </Link>
          <Link
            href={`/admin/integrative-care/${product.productSlug}/composition`}
            className="hover:underline"
          >
            Edit composition
          </Link>
          <Link
            href="/admin/integrative-care"
            className="hover:underline"
          >
            ← All products
          </Link>
        </div>
      </div>

      {/* Full page render */}
      <main className="min-h-screen bg-neutral-0">
        <ModuleRenderer composition={composition} />
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  const slug = context.params?.productSlug as string;

  // Draft-first for both record and composition
  const [product, composition] = await Promise.all([
    (async () =>
      (await getIntegrativeCareProductRecord(slug, 'draft')) ??
      (await getIntegrativeCareProductRecord(slug, 'published')))(),
    (async () =>
      (await getIntegrativeCareComposition(slug, 'draft')) ??
      (await getIntegrativeCareComposition(slug, 'published')))(),
  ]);

  if (!product || !composition) return { notFound: true };

  return { props: { product, composition } };
};
