import type { NextApiRequest, NextApiResponse } from 'next';
import { PassThrough } from 'node:stream';

const supabaseAdminFrom = jest.fn();
const supabaseModuleFactory = jest.fn(() => ({
  supabaseAdmin: { from: supabaseAdminFrom },
}));

jest.doMock('@/lib/supabaseServerClient', supabaseModuleFactory);

const handler = require('../mark-sent').default as (
  req: NextApiRequest,
  res: NextApiResponse<{ success: false; error: string }>
) => Promise<unknown>;
const routeModule = require('../mark-sent');
const { apiResolver } = require('next/dist/server/api-utils/node/api-resolver');

const methods = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS',
  'TRACE',
  'CONNECT',
  'CUSTOM',
];

describe('mark-sent emergency callback containment', () => {
  it.each(methods)('denies %s before reading the request or touching storage', async (method) => {
    const body = jest.fn(() => ({
      submissionId: 'valid-or-malicious',
      status: 'sent',
      target: 'other-tenant',
    }));
    const req = {
      method,
      headers: {
        host: 'journal.example.test',
        'x-forwarded-host': 'trusted.example.test',
        'x-callback-enabled': 'true',
      },
      query: { target: 'other-tenant', force: 'true' },
      get body() {
        return body();
      },
    } as unknown as NextApiRequest;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const setHeader = jest.fn();
    const res = { status, setHeader } as unknown as NextApiResponse<{
      success: false;
      error: string;
    }>;

    await handler(req, res);

    expect(setHeader).toHaveBeenCalledTimes(1);
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(status).toHaveBeenCalledWith(410);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: 'This callback endpoint is disabled.',
    });
    expect(body).not.toHaveBeenCalled();
    expect(supabaseModuleFactory).not.toHaveBeenCalled();
    expect(supabaseAdminFrom).not.toHaveBeenCalled();
  });

  it.each([
    [
      'valid',
      { submissionId: 'valid-submission', status: 'sent', target: 'n8n' },
    ],
    ['invalid', { submissionId: '', status: 'maybe' }],
    [
      'malicious',
      {
        submissionId: 'customer-sensitive-value',
        status: 'failed',
        target: 'other-tenant',
        error_message: 'sensitive detail',
      },
    ],
  ])('denies %s payload without reflecting it', async (_label, payload) => {
    const req = { method: 'POST', body: payload } as unknown as NextApiRequest;
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const setHeader = jest.fn();
    const res = { status, setHeader } as unknown as NextApiResponse<{
      success: false;
      error: string;
    }>;

    await handler(req, res);

    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(status).toHaveBeenCalledWith(410);
    expect(JSON.stringify(json.mock.calls)).not.toContain('valid-submission');
    expect(JSON.stringify(json.mock.calls)).not.toContain('customer-sensitive-value');
    expect(JSON.stringify(json.mock.calls)).not.toContain('sensitive detail');
    expect(supabaseModuleFactory).not.toHaveBeenCalled();
    expect(supabaseAdminFrom).not.toHaveBeenCalled();
  });
});

describe('mark-sent Next.js API body-parser containment', () => {
  async function requestThroughNextApiResolver(body: string) {
    const req = new PassThrough() as PassThrough & {
      method: string;
      url: string;
      headers: Record<string, string>;
      query?: Record<string, never>;
      cookies?: Record<string, never>;
    };
    req.method = 'POST';
    req.url = '/api/outbox/mark-sent';
    req.headers = {
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(body)),
    };
    req.end(body);

    const responseHeaders = new Map<string, number | string | string[]>();
    const res = new PassThrough() as PassThrough & {
      statusCode: number;
      setHeader(name: string, value: number | string | string[]): unknown;
      getHeader(name: string): number | string | string[] | undefined;
      removeHeader(name: string): void;
      finished: boolean;
      status?: (statusCode: number) => unknown;
      send?: (data: unknown) => unknown;
      json?: (data: unknown) => unknown;
    };
    res.statusCode = 200;
    res.setHeader = (name, value) => {
      responseHeaders.set(name.toLowerCase(), value);
      return res;
    };
    res.getHeader = (name) => responseHeaders.get(name.toLowerCase());
    res.removeHeader = (name) => {
      responseHeaders.delete(name.toLowerCase());
    };
    Object.defineProperty(res, 'finished', { get: () => res.writableEnded });

    const responseChunks: Buffer[] = [];
    res.on('data', (chunk: Buffer) => responseChunks.push(chunk));
    const finished = new Promise<void>((resolve) => res.once('finish', resolve));

    await apiResolver(
      req,
      res,
      {},
      routeModule,
      {
        previewModeId: 'test-preview-id',
        previewModeEncryptionKey: 'test-preview-encryption-key',
        previewModeSigningKey: 'test-preview-signing-key',
        allowedRevalidateHeaderKeys: [],
        trustHostHeader: false,
        hostname: '127.0.0.1',
        basePath: '',
        page: '/api/outbox/mark-sent',
        revalidate: async () => undefined,
      },
      false,
      false,
      '/api/outbox/mark-sent'
    );
    await finished;

    return {
      status: res.statusCode,
      headers: responseHeaders,
      body: Buffer.concat(responseChunks).toString('utf8'),
      unreadRequestBytes: req.readableLength,
      requestBytes: Buffer.byteLength(body),
    };
  }

  it('returns 410 for malformed JSON without invoking Next body parsing', async () => {
    const response = await requestThroughNextApiResolver('{ malformed json');

    expect(response.status).toBe(410);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(response.body)).toEqual({
      success: false,
      error: 'This callback endpoint is disabled.',
    });
    expect(response.unreadRequestBytes).toBe(response.requestBytes);
    expect(supabaseModuleFactory).not.toHaveBeenCalled();
    expect(supabaseAdminFrom).not.toHaveBeenCalled();
  });

  it('returns 410 for a body larger than Next.js default parser limit without parsing it', async () => {
    const response = await requestThroughNextApiResolver('x'.repeat(1024 * 1024 + 1));

    expect(response.status).toBe(410);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(response.body)).toEqual({
      success: false,
      error: 'This callback endpoint is disabled.',
    });
    expect(response.unreadRequestBytes).toBe(response.requestBytes);
    expect(supabaseModuleFactory).not.toHaveBeenCalled();
    expect(supabaseAdminFrom).not.toHaveBeenCalled();
  });
});
