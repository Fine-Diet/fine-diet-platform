/**
 * SMS Provider Adapter
 *
 * Default behavior is mock/log-only so SMS infrastructure can be built before
 * Twilio is activated. Set SMS_PROVIDER=twilio and provide Twilio env vars to
 * switch live sending on later.
 */

export type SmsProviderName = 'mock' | 'twilio';

export interface SendSmsArgs {
  to: string;
  body: string;
  statusCallbackUrl?: string | null;
  metadata?: Record<string, unknown>;
}

export interface SendSmsResult {
  provider: SmsProviderName;
  providerMessageId: string;
  raw?: unknown;
}

function getSmsProviderName(): SmsProviderName {
  return process.env.SMS_PROVIDER === 'twilio' ? 'twilio' : 'mock';
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} environment variable`);
  }
  return value;
}

async function sendViaMock(args: SendSmsArgs): Promise<SendSmsResult> {
  return {
    provider: 'mock',
    providerMessageId: `mock_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    raw: {
      to: args.to,
      body: args.body,
      statusCallbackUrl: args.statusCallbackUrl ?? null,
      metadata: args.metadata ?? {},
    },
  };
}

async function sendViaTwilio(args: SendSmsArgs): Promise<SendSmsResult> {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  const messagingServiceSid = requireEnv('TWILIO_MESSAGING_SERVICE_SID');

  const params = new URLSearchParams();
  params.set('To', args.to);
  params.set('MessagingServiceSid', messagingServiceSid);
  params.set('Body', args.body);

  const callbackUrl = args.statusCallbackUrl || process.env.TWILIO_STATUS_CALLBACK_URL;
  if (callbackUrl) {
    params.set('StatusCallback', callbackUrl);
  }

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    },
  );

  const raw = await response.json().catch(async () => ({ text: await response.text() }));

  if (!response.ok) {
    const message = typeof raw === 'object' && raw && 'message' in raw
      ? String((raw as { message?: unknown }).message)
      : `Twilio send failed with status ${response.status}`;
    throw new Error(message);
  }

  const sid = typeof raw === 'object' && raw && 'sid' in raw
    ? String((raw as { sid?: unknown }).sid)
    : `twilio_${Date.now()}`;

  return {
    provider: 'twilio',
    providerMessageId: sid,
    raw,
  };
}

export async function sendSms(args: SendSmsArgs): Promise<SendSmsResult> {
  const provider = getSmsProviderName();
  if (provider === 'twilio') {
    return sendViaTwilio(args);
  }
  return sendViaMock(args);
}

export function getActiveSmsProvider(): SmsProviderName {
  return getSmsProviderName();
}
