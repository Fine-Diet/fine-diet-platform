import fs from 'fs';
import path from 'path';
import {
  GROCERY_HAUL_CREATE_POLICY_ID,
  GROCERY_HAUL_CREATE_POLICY_VERSION,
  parseGroceryHaulDecisionEvent,
  toGroceryHaulEventMetadata,
} from '../events';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

function extractDecisionEventFetch(source: string): string {
  const start = source.indexOf("void fetch('/api/journal/decision-events'");
  expect(start).toBeGreaterThan(0);
  const end = source.indexOf('} catch {', start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const valid = {
  event: 'grocery_haul_create_committed' as const,
  policyId: GROCERY_HAUL_CREATE_POLICY_ID,
  policyVersion: GROCERY_HAUL_CREATE_POLICY_VERSION,
  path: 'primary' as const,
  reasonCodes: ['pending_items_remain'],
  listId: 'list-1',
  haulId: 'haul-1',
  shoppingDate: '2026-08-18',
  readinessState: 'ready_to_shop' as const,
  pendingCount: 3,
  outcome: 'created' as const,
  blockReason: null,
};

describe('parseGroceryHaulDecisionEvent', () => {
  it('accepts structured identifiers and drops grocery item names from metadata', () => {
    const parsed = parseGroceryHaulDecisionEvent({
      ...valid,
      itemName: 'Organic chicken thighs',
    });
    expect(parsed).toEqual(valid);
    const metadata = toGroceryHaulEventMetadata(parsed!);
    expect(JSON.stringify(metadata)).not.toMatch(/chicken|organic|thighs/i);
    expect(metadata.haul_id).toBe('haul-1');
    expect(metadata.shopping_date).toBe('2026-08-18');
    expect(metadata.outcome).toBe('created');
  });

  it('rejects unknown events and policy versions', () => {
    expect(
      parseGroceryHaulDecisionEvent({ ...valid, event: 'grocery_list_haul_created' }),
    ).toBeNull();
    expect(parseGroceryHaulDecisionEvent({ ...valid, policyVersion: 'v0' })).toBeNull();
    expect(
      parseGroceryHaulDecisionEvent({
        ...valid,
        event: 'grocery_haul_start_opened',
        outcome: 'none',
        haulId: null,
      }),
    ).not.toBeNull();
  });
});

describe('grocery haul telemetry source contract', () => {
  it('matches Packet 10 emitter credentials, JSON Content-Type, keepalive, and best-effort catch', () => {
    const haul = read('lib/plans/groceryHaul/emitEvent.ts');
    const packet10 = read('lib/plans/groceryListReadiness/emitEvent.ts');
    expect(haul).toContain("if (typeof window === 'undefined') return");
    expect(haul).toContain("credentials: 'include'");
    expect(haul).toContain("headers: { 'Content-Type': 'application/json' }");
    expect(haul).toContain('body: JSON.stringify(event)');
    expect(haul).toContain('keepalive: true');
    expect(haul).toContain('.catch(() => {');
    expect(extractDecisionEventFetch(haul)).toBe(extractDecisionEventFetch(packet10));
  });

  it('logs Grocery Haul decision-events with PEOPLE_EVENTS_COMPAT_TYPE and DECISION_EVENT_CHANNEL', () => {
    const source = read('pages/api/journal/decision-events.ts');
    const start = source.indexOf('const groceryHaulEvent = parseGroceryHaulDecisionEvent');
    expect(start).toBeGreaterThan(0);
    const end = source.indexOf("return res.status(400).json({ error: 'Invalid decision event payload.' })", start);
    const block = source.slice(start, end);
    expect(block).toContain('eventType: PEOPLE_EVENTS_COMPAT_TYPE');
    expect(block).toContain('channel: DECISION_EVENT_CHANNEL');
    expect(block).toContain('source: GROCERY_HAUL_EVENT_SOURCE');
  });
});
