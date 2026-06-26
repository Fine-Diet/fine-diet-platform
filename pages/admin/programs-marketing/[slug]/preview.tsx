/**
 * Admin preview: /admin/programs-marketing/[slug]/preview
 *
 * Server-side rendered (not ISR) so draft content is always fresh.
 * Admin-only. Loads draft product/composition first, falls back to published.
 *
 * Renders the composition-driven page (ModuleRenderer) inside a preview banner.
 * When no composition exists yet, shows a notice instead of the renderer.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import {
  getProgramsMarketingProductRecord,
  getProgramsMarketingComposition,
  type ProgramsMarketingProduct,
} from '@/lib/programs/programsMarketingApi';
import { ModuleRenderer } from '@/components/modules/ModuleRenderer';
import type { PageComposition } from '@/lib/modules/types';

interface Props {
  product: ProgramsMarketingProduct;
  composition: PageComposition | null;
}

export default function ProgramsMarketingPreview({ product, composition }: Props) {
  const isDraft = product.status === 'draft';

  return (
    <>
      <Head>
        <title>[Preview] {product.seoTitle || product.title || product.slug}</title>
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
          <span className="font-mono text-xs opacity-70">{product.slug}</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`/admin/programs-marketing/${product.slug}`} className="hover:underline">
            Edit metadata
          </Link>
          <Link href={`/admin/programs-marketing/${product.slug}/composition`} className="hover:underline">
            Edit composition
          </Link>
          <Link href="/admin/programs-marketing" className="hover:underline">
            ← All records
          </Link>
        </div>
      </div>

      {/* Full page render */}
      <main className="min-h-screen bg-neutral-0">
        {composition && composition.modules.length > 0 ? (
          <ModuleRenderer composition={composition} />
        ) : (
          <div className="max-w-2xl mx-auto px-6 py-20 text-center">
            <h1 className="text-xl font-semibold text-gray-900">No composition yet</h1>
            <p className="mt-2 text-sm text-gray-500">
              This record has no modules. Add modules in the composition editor to preview the page.
            </p>
            <Link
              href={`/admin/programs-marketing/${product.slug}/composition`}
              className="mt-6 inline-block px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700"
            >
              Edit composition →
            </Link>
          </div>
        )}
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || user.role !== 'admin') {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  const slug = context.params?.slug as string;

  const [product, composition] = await Promise.all([
    (async () =>
      (await getProgramsMarketingProductRecord(slug, 'draft')) ??
      (await getProgramsMarketingProductRecord(slug, 'published')))(),
    (async () =>
      (await getProgramsMarketingComposition(slug, 'draft')) ??
      (await getProgramsMarketingComposition(slug, 'published')))(),
  ]);

  if (!product) return { notFound: true };

  return { props: { product, composition: composition ?? null } };
};
