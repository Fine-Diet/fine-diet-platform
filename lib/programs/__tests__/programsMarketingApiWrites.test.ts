/**
 * Programs Marketing API — write/delete adapter + public-path helper.
 *
 * supabaseAdmin is mocked with a chainable builder that records the calls so we
 * can assert the exact site_content key/status/onConflict envelope used by the
 * admin endpoints, without a real database. Validates that writes are encoded
 * correctly and that invalid input is rejected before any Supabase call.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockCalls: {
  upserts: Array<{ row: any; opts: any }>;
  deletes: number;
  eqs: Array<{ col: string; val: string }>;
} = { upserts: [], deletes: 0, eqs: [] };

jest.mock('../../supabaseServerClient', () => ({
  supabaseAdmin: {
    from: () => {
      const builder: any = {
        upsert: (row: any, opts: any) => {
          mockCalls.upserts.push({ row, opts });
          return Promise.resolve({ error: null });
        },
        delete: () => {
          mockCalls.deletes += 1;
          return builder;
        },
        eq: (col: string, val: string) => {
          mockCalls.eqs.push({ col, val });
          return builder;
        },
        // thenable so `await builder` (delete().eq().eq()) resolves cleanly
        then: (resolve: (v: { error: null }) => void) => resolve({ error: null }),
      };
      return builder;
    },
  },
}));

import {
  upsertProgramsMarketingProduct,
  upsertProgramsMarketingComposition,
  deleteProgramsMarketingProduct,
  programMarketingPublicPath,
  productKey,
  compositionKey,
  type ProgramsMarketingProduct,
} from '../programsMarketingApi';
import type { PageComposition } from '../../modules/types';

const validCollectionRecord: ProgramsMarketingProduct = {
  slug: 'nutrition',
  category: 'programs',
  templateFamily: 'programs',
  kind: 'collection',
  collectionSlug: 'nutrition',
  status: 'draft',
  title: 'Nutrition Foundations',
  seoTitle: 'Nutrition Foundations • Fine Diet',
  seoDescription: 'A staged nutrition pathway.',
  sortOrder: 10,
};

const sampleComposition: PageComposition = {
  key: 'composition:programs:nutrition',
  version: 1,
  modules: [],
};

beforeEach(() => {
  mockCalls.upserts = [];
  mockCalls.deletes = 0;
  mockCalls.eqs = [];
});

describe('programMarketingPublicPath', () => {
  it('maps a collection slug to /programs/{collection}', () => {
    expect(programMarketingPublicPath('nutrition')).toBe('/programs/nutrition');
  });

  it('maps a program slug to /programs/{collection}/{program}', () => {
    expect(programMarketingPublicPath('nutrition--baseline')).toBe(
      '/programs/nutrition/baseline',
    );
  });
});

describe('upsertProgramsMarketingProduct', () => {
  it('writes the product record under product:programs:{slug} at its status with key,status conflict', async () => {
    const result = await upsertProgramsMarketingProduct(validCollectionRecord);

    expect(result).toEqual({ success: true });
    expect(mockCalls.upserts).toHaveLength(1);
    const { row, opts } = mockCalls.upserts[0];
    expect(row.key).toBe(productKey('nutrition'));
    expect(row.status).toBe('draft');
    expect(row.data).toMatchObject({ slug: 'nutrition', kind: 'collection' });
    expect(typeof row.updated_at).toBe('string');
    expect(opts).toEqual({ onConflict: 'key,status' });
  });

  it('writes a published record when status is published', async () => {
    await upsertProgramsMarketingProduct({
      ...validCollectionRecord,
      status: 'published',
    });
    expect(mockCalls.upserts[0].row.status).toBe('published');
  });

  it('rejects an invalid record without calling Supabase', async () => {
    const result = await upsertProgramsMarketingProduct({
      ...validCollectionRecord,
      // @ts-expect-error intentional invalid category
      category: 'not-programs',
    });
    expect(result.success).toBe(false);
    expect(mockCalls.upserts).toHaveLength(0);
  });

  it('rejects an unsafe slug without calling Supabase', async () => {
    const result = await upsertProgramsMarketingProduct({
      ...validCollectionRecord,
      slug: 'bad slug!',
    });
    expect(result.success).toBe(false);
    expect(mockCalls.upserts).toHaveLength(0);
  });
});

describe('upsertProgramsMarketingComposition', () => {
  it('writes the composition under composition:programs:{slug} at draft by default', async () => {
    const result = await upsertProgramsMarketingComposition('nutrition', sampleComposition);

    expect(result).toEqual({ success: true });
    expect(mockCalls.upserts).toHaveLength(1);
    const { row, opts } = mockCalls.upserts[0];
    expect(row.key).toBe(compositionKey('nutrition'));
    expect(row.status).toBe('draft');
    expect(row.data).toBe(sampleComposition);
    expect(opts).toEqual({ onConflict: 'key,status' });
  });

  it('writes a published composition when status is published', async () => {
    await upsertProgramsMarketingComposition('nutrition--baseline', sampleComposition, 'published');
    expect(mockCalls.upserts[0].row.key).toBe(
      compositionKey('nutrition--baseline'),
    );
    expect(mockCalls.upserts[0].row.status).toBe('published');
  });

  it('rejects an unsafe slug without calling Supabase', async () => {
    const result = await upsertProgramsMarketingComposition('../etc/passwd', sampleComposition);
    expect(result.success).toBe(false);
    expect(mockCalls.upserts).toHaveLength(0);
  });
});

describe('deleteProgramsMarketingProduct', () => {
  it('deletes the product record scoped to key + status', async () => {
    const result = await deleteProgramsMarketingProduct('nutrition', 'draft');

    expect(result).toEqual({ success: true });
    expect(mockCalls.deletes).toBe(1);
    expect(mockCalls.eqs).toEqual([
      { col: 'key', val: productKey('nutrition') },
      { col: 'status', val: 'draft' },
    ]);
  });

  it('rejects an unsafe slug without calling Supabase', async () => {
    const result = await deleteProgramsMarketingProduct('bad slug!', 'draft');
    expect(result.success).toBe(false);
    expect(mockCalls.deletes).toBe(0);
  });
});
