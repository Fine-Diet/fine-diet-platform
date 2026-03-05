import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRoleFromApi } from '@/lib/authServer';
import { journalPageContentSchema } from '@/lib/contentValidators';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ success: boolean; error?: string }>
) {
  const user = await requireRoleFromApi(req, res, ['editor', 'admin']);
  if (!user) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const validationResult = journalPageContentSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: `Validation failed: ${validationResult.error.message}`,
      });
    }

    const validatedContent = validationResult.data;
    const { supabaseAdmin } = await import('@/lib/supabaseServerClient');

    const { error } = await supabaseAdmin
      .from('site_content')
      .upsert(
        {
          key: 'journal',
          status: 'published',
          data: validatedContent,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key,status' }
      );

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ success: false, error: `Database error: ${error.message}` });
    }

    try {
      await res.revalidate('/journal');
    } catch (revalidateError) {
      console.warn('Revalidation warning (content still saved):', revalidateError);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}
