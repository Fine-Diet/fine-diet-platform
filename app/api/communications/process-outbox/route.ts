import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { processPendingSmsMessages } from '@/lib/communications/communicationService';

const processSchema = z.object({
  limit: z.number().int().min(1).max(100).optional().default(10),
});

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const communicationsKey = process.env.COMMUNICATIONS_API_KEY;
  const fallbackEditorialKey = process.env.EDITORIAL_API_KEY;
  const expectedKeys = [communicationsKey, fallbackEditorialKey].filter(Boolean);

  if (expectedKeys.length === 0) {
    return false;
  }

  return expectedKeys.some((key) => authHeader === `Bearer ${key}`);
}

/**
 * POST /api/communications/process-outbox
 *
 * Processes due SMS messages from communication_outbox. Defaults to mock/log-only
 * delivery unless SMS_PROVIDER=twilio is set with Twilio credentials.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = processSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await processPendingSmsMessages(parsed.data.limit);
  return NextResponse.json(result);
}
