/**
 * TEMP / DEV ONLY - Products List
 * 
 * This page lists all products and allows creating new ones.
 * 
 * TODO: Protect this route with Supabase Auth and role-based access.
 * TEMP/DEV ONLY: Products list
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';

interface Product {
  key: string;
  slug: string;
  updated_at: string;
}

interface ProductsListProps {
  user: AuthenticatedUser;
  products: Product[];
}

export default function ProductsList({ products: initialProducts }: ProductsListProps) {
  const [products] = useState<Product[]>(initialProducts);
  const [newSlug, setNewSlug] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreateProduct = async () => {
    if (!newSlug.trim()) {
      alert('Please enter a product slug');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/admin/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ slug: newSlug.trim() }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        window.location.href = `/admin/products/${newSlug.trim()}/hero`;
      } else {
        alert(data.error || 'Failed to create product');
      }
    } catch (error) {
      alert('Network error. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <Head>
        <title>Products • Admin • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-gray-50 px-8 pt-[120px]">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-bold text-gray-900">Products</h1>
            </div>
          </div>

          {/* Create New Product */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Create New Product</h2>
            <div className="flex gap-4">
              <input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="product-slug (e.g., metabolic-reset)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && handleCreateProduct()}
              />
              <button
                type="button"
                onClick={handleCreateProduct}
                disabled={isCreating}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {isCreating ? 'Creating...' : 'Create Product'}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Slug will be used in the URL: /products/[slug]
            </p>
          </section>

          {/* Products List */}
          <section className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Existing Products</h2>
            {products.length > 0 ? (
              <div className="space-y-2">
                {products.map((product) => (
                  <Link
                    key={product.key}
                    href={`/admin/products/${product.slug}/hero`}
                    className="block p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">{product.slug}</h3>
                        <p className="text-sm text-gray-500">
                          Last updated: {new Date(product.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="text-gray-400">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 italic">No products yet. Create one above.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<ProductsListProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);

  if (!user) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/products',
        permanent: false,
      },
    };
  }

  if (user.role !== 'admin') {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    
    const { data, error } = await supabaseAdmin
      .from('site_content')
      .select('key, updated_at')
      .like('key', 'product:%')
      .eq('status', 'published')
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Error fetching products:', error);
      return { props: { user, products: [] } };
    }

    const products: Product[] = (data || []).map((item) => ({
      key: item.key,
      slug: item.key.replace('product:', ''),
      updated_at: item.updated_at,
    }));

    return { props: { user, products } };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { props: { user, products: [] } };
  }
};

