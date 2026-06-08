import { GetServerSideProps } from 'next';
import Head from 'next/head';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, hasRole } from '@/lib/authServer';
import { getNavigationContent } from '@/lib/contentApi';
import type { NavigationContent } from '@/lib/contentTypes';

interface Props {
  initialContent: NavigationContent;
}

type ItemWithPricing = NavigationContent['categories'][number]['subcategories'][number]['items'][number] & {
  price?: string;
  priceDescription?: string;
};

type Status = { type: 'success' | 'error'; text: string } | null;

export default function NavigationPricingPage({ initialContent }: Props) {
  const [content, setContent] = useState(initialContent);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);

  function updateLocal(categoryIndex: number, subcategoryIndex: number, itemIndex: number, field: 'price' | 'priceDescription', value: string) {
    setContent((previous) => ({
      ...previous,
      categories: previous.categories.map((category, cIdx) =>
        cIdx !== categoryIndex
          ? category
          : {
              ...category,
              subcategories: category.subcategories.map((subcategory, sIdx) =>
                sIdx !== subcategoryIndex
                  ? subcategory
                  : {
                      ...subcategory,
                      items: subcategory.items.map((item, iIdx) =>
                        iIdx === itemIndex ? { ...item, [field]: value } : item,
                      ),
                    },
              ),
            },
      ),
    }));
  }

  async function saveItem(categoryId: string, subcategoryId: string, item: ItemWithPricing) {
    setStatus(null);
    setSavingKey(item.id);
    try {
      const response = await fetch('/api/admin/navigation-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId,
          subcategoryId,
          itemId: item.id,
          price: item.price || '',
          priceDescription: item.priceDescription || '',
        }),
      });
      const data = await response.json();
      setStatus(response.ok && data.success ? { type: 'success', text: 'Saved.' } : { type: 'error', text: data.error || 'Save failed.' });
    } catch {
      setStatus({ type: 'error', text: 'Save failed.' });
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <>
      <Head><title>Navigation Pricing</title></Head>
      <main className="min-h-screen bg-gray-50 px-8 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Navigation Dropdown Pricing</h1>
            <p className="mt-2 text-sm text-gray-600">Optional pricing lines for dropdown cards. Empty values do not render on the site.</p>
          </div>
          {status && <div className={`mb-6 rounded p-3 text-sm ${status.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{status.text}</div>}
          <div className="space-y-6">
            {content.categories.map((category, categoryIndex) => (
              <section key={category.id} className="rounded-lg bg-white p-6 shadow">
                <h2 className="mb-4 text-xl font-semibold text-gray-900">{category.label}</h2>
                <div className="space-y-4">
                  {category.subcategories.map((subcategory, subcategoryIndex) => (
                    <div key={subcategory.id} className="rounded border border-gray-200 p-4">
                      <h3 className="mb-3 text-sm font-semibold text-gray-700">{subcategory.name}</h3>
                      <div className="space-y-3">
                        {subcategory.items.map((rawItem, itemIndex) => {
                          const item = rawItem as ItemWithPricing;
                          return (
                            <div key={item.id} className="rounded border border-gray-200 bg-gray-50 p-4">
                              <div className="mb-3 text-sm font-semibold text-gray-900">{item.title}</div>
                              <div className="grid gap-3 md:grid-cols-2">
                                <label className="block text-xs font-medium text-gray-600">
                                  Price
                                  <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900" value={item.price || ''} onChange={(event) => updateLocal(categoryIndex, subcategoryIndex, itemIndex, 'price', event.target.value)} />
                                </label>
                                <label className="block text-xs font-medium text-gray-600">
                                  Price description
                                  <input className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-900" value={item.priceDescription || ''} onChange={(event) => updateLocal(categoryIndex, subcategoryIndex, itemIndex, 'priceDescription', event.target.value)} />
                                </label>
                              </div>
                              <button className="mt-3 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50" disabled={savingKey === item.id} onClick={() => saveItem(category.id, subcategory.id, item)}>
                                {savingKey === item.id ? 'Saving...' : 'Save Item'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!hasRole(user, ['editor', 'admin'])) return { notFound: true };
  const initialContent = await getNavigationContent();
  return { props: { initialContent } };
};
