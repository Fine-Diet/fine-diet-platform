import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { navigationContentSchema } from '@/lib/contentValidators';

type ResponseBody = { success: boolean; error?: string };

type PricingPatch = {
  categoryId: string;
  subcategoryId: string;
  itemId: string;
  price?: string;
  priceDescription?: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<ResponseBody>) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const patch = req.body as PricingPatch;
  if (!patch?.categoryId || !patch?.subcategoryId || !patch?.itemId) {
    return res.status(400).json({ success: false, error: 'categoryId, subcategoryId, and itemId are required' });
  }

  try {
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('site_content')
      .select('data')
      .eq('key', 'navigation')
      .eq('status', 'published')
      .single();

    if (fetchError || !existing?.data) {
      return res.status(404).json({ success: false, error: 'Navigation content not found' });
    }

    const validation = navigationContentSchema.safeParse(existing.data);
    if (!validation.success) {
      return res.status(400).json({ success: false, error: `Existing navigation validation failed: ${validation.error.message}` });
    }

    let updated = false;
    const nextContent = {
      ...validation.data,
      categories: validation.data.categories.map((category) => {
        if (category.id !== patch.categoryId) return category;
        return {
          ...category,
          subcategories: category.subcategories.map((subcategory) => {
            if (subcategory.id !== patch.subcategoryId) return subcategory;
            return {
              ...subcategory,
              items: subcategory.items.map((item) => {
                if (item.id !== patch.itemId) return item;
                updated = true;
                return {
                  ...item,
                  price: patch.price ?? '',
                  priceDescription: patch.priceDescription ?? '',
                };
              }),
            };
          }),
        };
      }),
    };

    if (!updated) {
      return res.status(404).json({ success: false, error: 'Navigation item not found' });
    }

    const nextValidation = navigationContentSchema.safeParse(nextContent);
    if (!nextValidation.success) {
      return res.status(400).json({ success: false, error: `Updated navigation validation failed: ${nextValidation.error.message}` });
    }

    const { error: upsertError } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: 'navigation',
          status: 'published',
          data: nextValidation.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key,status' },
      );

    if (upsertError) {
      return res.status(500).json({ success: false, error: `Database error: ${upsertError.message}` });
    }

    try {
      await res.revalidate('/');
      for (const category of nextValidation.data.categories) {
        try {
          await res.revalidate(`/${category.id}`);
        } catch {
          // continue
        }
      }
    } catch {
      // content saved; cache may refresh later
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error occurred' });
  }
}
