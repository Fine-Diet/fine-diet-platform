import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: false,
  },
};

interface MarkSentResponse {
  success: false;
  error: string;
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<MarkSentResponse>
) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(410).json({
    success: false,
    error: 'This callback endpoint is disabled.',
  });
}

