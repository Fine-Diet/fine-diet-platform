/**
 * On-Demand Revalidation API Route
 * 
 * Allows manual cache invalidation for ISR pages after CMS updates.
 * 
 * Usage:
 * POST /api/revalidate?path=/the-fine-diet-method
 * POST /api/revalidate?path=/&secret=YOUR_SECRET
 * 
 * TODO: Add proper authentication/authorization
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ revalidated: boolean; message?: string; error?: string }>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      revalidated: false, 
      error: 'Method not allowed. Use POST.' 
    });
  }

  try {
    // Get the path to revalidate from query string
    const path = req.query.path as string;
    const secret = req.query.secret as string;

    // Optional: Add a secret token for security (set in env vars)
    const expectedSecret = process.env.REVALIDATION_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      return res.status(401).json({
        revalidated: false,
        error: 'Invalid secret token',
      });
    }

    if (!path) {
      return res.status(400).json({
        revalidated: false,
        error: 'Path is required. Use ?path=/category-name or ?path=/ for homepage',
      });
    }

    // Revalidate the path
    // This will trigger a regeneration of the page on the next request
    await res.revalidate(path);

    return res.json({
      revalidated: true,
      message: `Path ${path} revalidated successfully. The page will be regenerated on the next request.`,
    });
  } catch (error) {
    console.error('Revalidation error:', error);
    return res.status(500).json({
      revalidated: false,
      error: error instanceof Error ? error.message : 'Error revalidating path',
    });
  }
}

