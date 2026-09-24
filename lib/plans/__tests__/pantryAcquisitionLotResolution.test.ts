import { readFileSync } from 'fs';
import { join } from 'path';

import { createFakeSupabase, type Row } from './testSupabaseFake';

const PERSON = 'person-1';
const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock('@/lib/supabaseServerClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import {
  resolvePantryAcquisitionLot,
  updatePantryAcquisitionLot,
} from '../pantryAcquisitionLotService';

const migrationSql = readFileSync(
  join(process.cwd(), 'scripts/sql/addPantryAcquisitionLotResolution.sql'),
  'utf8',
);

function installFake(initial: Record<string, Row[]>) {
  const fake = createFakeSupabase(initial);
  mockFrom.mockImplementation((table: string) => fake.from(table));
  return fake;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('addPantryAcquisitionLotResolution.sql contract', () => {
  it('locks owner-scoped RPC, lifecycle invariants, and terminal update guard', () => {
    expect(migrationSql).toContain('resolve_pantry_acquisition_lot');
    expect(migrationSql).toMatch(/person_id\s*=\s*p_person_id/);
    expect(migrationSql).toContain('FOR UPDATE');
    expect(migrationSql).toContain("resolution_status = 'completed'");
    expect(migrationSql).toContain('quantity_remaining = 0');
    expect(migrationSql).toContain('disposed_quantity = v_row.quantity_remaining');
    expect(migrationSql).toContain("THEN 'expired'");
    expect(migrationSql).toContain("ELSE 'manual'");
    expect(migrationSql).toContain('REVOKE ALL ON FUNCTION public.resolve_pantry_acquisition_lot');
    expect(migrationSql).toContain('FROM anon');
    expect(migrationSql).toContain('FROM authenticated');
    expect(migrationSql).toContain('GRANT EXECUTE ON FUNCTION public.resolve_pantry_acquisition_lot');
    expect(migrationSql).toContain('TO service_role');
    expect(migrationSql).toContain('guard_pantry_acquisition_lot_update');
    expect(migrationSql).toContain('TERMINAL_LOT_IMMUTABLE');
    expect(migrationSql).toContain('LIFECYCLE_UPDATE_FORBIDDEN');
    expect(migrationSql).toContain("set_config('app.pantry_lot_lifecycle', '1', true)");
    expect(migrationSql).toContain('pantry_acquisition_lots_guard_update');
  });
});

describe('resolvePantryAcquisitionLot', () => {
  it('delegates to the owner-scoped RPC', async () => {
    mockRpc.mockResolvedValue({
      data: {
        id: 'lot-1',
        pantry_item_id: 'pantry-1',
        person_id: PERSON,
        acquired_on: '2026-09-01',
        quantity_acquired: 2,
        quantity_remaining: 0,
        resolution_status: 'completed',
        resolved_at: '2026-09-18T12:00:00.000Z',
        disposed_quantity: null,
        disposition_reason: null,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-18T12:00:00.000Z',
      },
      error: null,
    });

    const lot = await resolvePantryAcquisitionLot({
      personId: PERSON,
      lotId: 'lot-1',
      outcome: 'completed',
    });

    expect(mockRpc).toHaveBeenCalledWith('resolve_pantry_acquisition_lot', {
      p_person_id: PERSON,
      p_lot_id: 'lot-1',
      p_outcome: 'completed',
    });
    expect(lot.resolution_status).toBe('completed');
    expect(lot.quantity_remaining).toBe(0);
  });

  it('maps zero-row open-filtered updates to a controlled no-longer-open conflict', async () => {
    installFake({
      pantry_acquisition_lots: [{
        id: 'lot-1',
        pantry_item_id: 'pantry-1',
        person_id: PERSON,
        acquired_on: '2026-09-01',
        quantity_acquired: 2,
        quantity_remaining: 2,
        unit: 'lb',
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-01T00:00:00.000Z',
      }],
    });

    await expect(updatePantryAcquisitionLot({
      personId: PERSON,
      lotId: 'lot-1',
      patch: { quantityRemaining: 1 },
    })).rejects.toThrow('no longer open for edit');
  });

  it('blocks editing terminal lots', async () => {
    installFake({
      pantry_acquisition_lots: [{
        id: 'lot-1',
        pantry_item_id: 'pantry-1',
        person_id: PERSON,
        acquired_on: '2026-09-01',
        quantity_acquired: 2,
        quantity_remaining: 0,
        resolution_status: 'completed',
        resolved_at: '2026-09-18T12:00:00.000Z',
        disposed_quantity: null,
        disposition_reason: null,
        created_at: '2026-09-01T00:00:00.000Z',
        updated_at: '2026-09-18T12:00:00.000Z',
      }],
    });

    await expect(updatePantryAcquisitionLot({
      personId: PERSON,
      lotId: 'lot-1',
      patch: { quantityRemaining: 1 },
    })).rejects.toThrow('cannot be edited');
  });
});
