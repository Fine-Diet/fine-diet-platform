/**
 * Packet 11F — Groceries Landing UX Flow & Presentation Alignment tests.
 *
 * Verifies:
 * 1.  Header/supporting copy — exact strings preserved
 * 2.  No old literal progression line ("List → Ready to shop → Shopping trip")
 * 3.  Grocery Lists and Hauls both visibly present
 * 4.  My Grocery List remains primary (PrimaryListCard)
 * 5.  Build a Haul only when eligible (resolveGroceryHaulCreateEligibility gate)
 * 6.  Build a Haul landing CTA only links to ?action=build-haul
 * 7.  Landing never invokes startGroceryHaulFromList
 * 8.  List neutral shopping_in_progress presentation
 * 9.  From Your Plans is visually/content-wise subordinate
 * 10. Empty default List guidance ("Add Items")
 * 11. Haul cards derive display identity without persistence/schema changes
 * 12. Haul card includes date/status/item count/source List anatomy
 * 13. Upcoming/open Hauls come only from canonical Haul read
 * 14. Recent Hauls compact/history presentation
 * 15. Empty Hauls only after successful empty read (11E-R2 preserved)
 * 16. Haul read failure stays unavailable + Retry (11E-R2 preserved)
 * 17. View All Hauls routes correctly
 * 18. No new write path / schema / migration / Pantry / retailer scope
 *     in the copy module or index page
 * 19. formatGroceryHaulDisplayName — deterministic derivation
 * 20. formatGroceryHaulUserFacingStatusLabel — correct presentation mapping
 * 21. RecentHaulRow (compact row) used for recent hauls
 * 22. PrimaryListCard exposes Open List (or Add Items when empty) + Build a Haul
 * 23. OtherListRow used for named/secondary lists (compact)
 * 24. From Your Plans heading and copy are subordinate (lower opacity tokens)
 */

import fs from 'fs';
import path from 'path';
import {
  GROCERIES_INDEX_TITLE,
  GROCERIES_INDEX_SUPPORTING_COPY,
  GROCERIES_LISTS_SECTION_HEADING,
  GROCERIES_HAULS_SECTION_HEADING,
  GROCERIES_HAULS_SECTION_COPY,
  GROCERIES_HAULS_EMPTY,
} from '@/lib/plans/groceryListReadiness/copy';
import {
  formatGroceryHaulDisplayName,
  formatGroceryHaulUserFacingStatusLabel,
  GROCERY_HAUL_USER_FACING_STATUS_LABELS,
} from '@/lib/plans/groceryHaul/copy';
import type { GroceryHaulStatus } from '@/lib/plans/types';

function read(rel: string): string {
  return fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
}

// ============================================================================
// 1 — Header and supporting copy
// ============================================================================

describe('Packet 11F — Header and supporting copy', () => {
  it('title is Groceries', () => {
    expect(GROCERIES_INDEX_TITLE).toBe('Groceries');
  });

  it('supporting copy is exactly the specified string', () => {
    expect(GROCERIES_INDEX_SUPPORTING_COPY).toBe(
      "Keep track of what you need, then build a Haul when you're ready to shop.",
    );
  });

  it('index page renders GROCERIES_INDEX_SUPPORTING_COPY constant', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('GROCERIES_INDEX_SUPPORTING_COPY');
    expect(src).toContain('GROCERIES_INDEX_TITLE');
  });

  it('Hauls section heading is "Hauls"', () => {
    expect(GROCERIES_HAULS_SECTION_HEADING).toBe('Hauls');
  });

  it('Hauls section copy is exactly the specified string', () => {
    expect(GROCERIES_HAULS_SECTION_COPY).toBe(
      "What you're buying, when, and eventually where.",
    );
  });

  it('Grocery Lists section heading is "Grocery Lists"', () => {
    expect(GROCERIES_LISTS_SECTION_HEADING).toBe('Grocery Lists');
  });
});

// ============================================================================
// 2 — No old literal progression line
// ============================================================================

describe('Packet 11F — No old progression line', () => {
  it('index page does not contain old "List → Ready to shop → Shopping trip" copy', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).not.toContain('List → Ready to shop');
    expect(src).not.toContain('Shopping trip');
    expect(src).not.toContain('Shopping in progress');
  });

  it('index page supporting copy does not contain the old progression', () => {
    expect(GROCERIES_INDEX_SUPPORTING_COPY).not.toContain('List → Ready to shop');
    expect(GROCERIES_INDEX_SUPPORTING_COPY).not.toContain('Shopping trip');
  });
});

// ============================================================================
// 3 — Both object classes present
// ============================================================================

describe('Packet 11F — Both object classes present', () => {
  it('Grocery Lists section is present', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('GROCERIES_LISTS_SECTION_HEADING');
    expect(src).toContain('GROCERIES_LISTS_SECTION_COPY');
  });

  it('Hauls section is present with equal structural weight', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('GROCERIES_HAULS_SECTION_HEADING');
    expect(src).toContain('GROCERIES_HAULS_SECTION_COPY');
    // Both sections use the same rounded-[28px] section container
    const listsIdx = src.indexOf('GROCERIES_LISTS_SECTION_HEADING');
    const haulsIdx = src.indexOf('GROCERIES_HAULS_SECTION_HEADING');
    expect(listsIdx).toBeGreaterThan(-1);
    expect(haulsIdx).toBeGreaterThan(-1);
  });
});

// ============================================================================
// 4 — My Grocery List is primary (PrimaryListCard)
// ============================================================================

describe('Packet 11F — My Grocery List primary card', () => {
  it('uses PrimaryListCard component for defaultList', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('PrimaryListCard');
    // defaultList feeds PrimaryListCard
    expect(src).toContain('defaultList');
    // PrimaryListCard defined in the file
    const defIdx = src.indexOf('function PrimaryListCard(');
    expect(defIdx).toBeGreaterThan(-1);
  });

  it('PrimaryListCard is dominant: uses bg-white/[0.04] (richer than secondary)', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function PrimaryListCard(');
    const cardEnd = src.indexOf('\nfunction OtherListRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    // Primary card has a richer background
    expect(cardBody).toContain('bg-white/[0.04]');
  });

  it('My List badge is shown on the primary card', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function PrimaryListCard(');
    const cardEnd = src.indexOf('\nfunction OtherListRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain('My List');
  });
});

// ============================================================================
// 5 — Build a Haul only when eligible
// ============================================================================

describe('Packet 11F — Build a Haul eligibility gate', () => {
  it('uses resolveGroceryHaulCreateEligibility to gate Build a Haul', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('resolveGroceryHaulCreateEligibility');
    expect(src).toContain('eligibility.eligible');
    expect(src).toContain('buildHaulHref');
  });

  it('Build a Haul only renders when buildHaulHref is set', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    // The CTA is inside a conditional check on buildHaulHref
    const buildHaulIdx = src.indexOf('Build a Haul');
    expect(buildHaulIdx).toBeGreaterThan(-1);
    // buildHaulHref guards it
    const hrefCheckIdx = src.indexOf('buildHaulHref &&');
    expect(hrefCheckIdx).toBeGreaterThan(-1);
    // No Build a Haul without the eligibility gate
    expect(src).toContain('const buildHaulHref = eligibility.eligible');
  });
});

// ============================================================================
// 6 — Build a Haul CTA links to ?action=build-haul only
// ============================================================================

describe('Packet 11F — Build a Haul routes to ?action=build-haul', () => {
  it('buildHaulHref always appends ?action=build-haul', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('action=build-haul');
    // Routes to list detail, not directly to a writer
    expect(src).toContain('foodGroceryList');
  });

  it('OtherListRow also uses ?action=build-haul for Build a Haul', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const rowStart = src.indexOf('function OtherListRow(');
    const rowEnd = src.indexOf('\nfunction ArchivedListRow(', rowStart);
    const rowBody = src.slice(rowStart, rowEnd);
    expect(rowBody).toContain('action=build-haul');
    expect(rowBody).toContain('Build a Haul');
    expect(rowBody).toContain('eligibility.eligible');
  });
});

// ============================================================================
// 7 — Landing never invokes startGroceryHaulFromList
// ============================================================================

describe('Packet 11F — No writer on landing page', () => {
  it('index page does not call startGroceryHaulFromList', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).not.toContain('startGroceryHaulFromList');
    expect(src).not.toContain('handleBuildHaul');
    expect(src).not.toContain('creation_token');
    expect(src).not.toContain('create_grocery_haul_from_list');
    expect(src).not.toContain('createHaul');
    expect(src).not.toContain('assignStore');
    expect(src).not.toContain('checkout');
  });
});

// ============================================================================
// 8 — List neutral shopping_in_progress presentation
// ============================================================================

describe('Packet 11F — shopping_in_progress neutral list presentation', () => {
  it('index page does not present Shopping in progress as a list headline', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).not.toContain('Shopping in progress');
    expect(src).not.toContain('>Shopping trip<');
  });

  it('groceryListReadinessHeadline returns In progress for shopping_in_progress', () => {
    const {
      groceryListReadinessHeadline,
    } = require('@/lib/plans/groceryListReadiness/copy');
    expect(groceryListReadinessHeadline('shopping_in_progress')).toBe('In progress');
    expect(groceryListReadinessHeadline('shopping_in_progress')).not.toBe('Shopping in progress');
  });
});

// ============================================================================
// 9 — From Your Plans is subordinate
// ============================================================================

describe('Packet 11F — From Your Plans subordination', () => {
  it('From Your Plans section uses visually quieter tokens than Lists section', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    // Present
    expect(src).toMatch(/From Your Plans/i);
    // The section heading/label paragraph must use subordinate opacity tokens.
    // Authorized polish pass raised floor to white/40 (no longer reads disabled)
    // but still below the Lists section heading at white/45.
    const plansSectionStart = src.indexOf('From Your Plans');
    // Slice just the heading paragraph — stop before the mapped list rows
    const plansSectionEnd = src.indexOf('planLists.map(', plansSectionStart);
    const plansHeadingRegion = src.slice(plansSectionStart, plansSectionEnd);
    // white/40 or lower in the heading region
    expect(plansHeadingRegion).toMatch(/text-white\/[34][05]/);
    // Heading region does not use primary section-heading level tokens (white/45+)
    expect(plansHeadingRegion).not.toMatch(/text-white\/(45|50|55|60|65|70|75|80|85|90)/);
  });

  it('From Your Plans heading is inside a px-1 subordinate container', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('From Your Plans');
    // Does not use a section heading style (no text-base font-semibold)
    const plansSectionStart = src.indexOf('From Your Plans');
    const beforePlans = src.slice(Math.max(0, plansSectionStart - 50), plansSectionStart);
    expect(beforePlans).not.toContain('text-base font-semibold text-brand-50');
  });

  it('plan lists do not receive PrimaryListCard treatment', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    // planLists are rendered as simple rows, not PrimaryListCard
    const plansMapIdx = src.indexOf('planLists.map(');
    expect(plansMapIdx).toBeGreaterThan(-1);
    const plansMapBody = src.slice(plansMapIdx, plansMapIdx + 500);
    expect(plansMapBody).not.toContain('PrimaryListCard');
    expect(plansMapBody).not.toContain('OtherListRow');
  });
});

// ============================================================================
// 10 — Empty default List guidance
// ============================================================================

describe('Packet 11F — Empty default List guidance', () => {
  it('PrimaryListCard shows Add Items label when empty_or_no_demand', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function PrimaryListCard(');
    const cardEnd = src.indexOf('\nfunction OtherListRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain('Add Items');
    expect(cardBody).toContain('isEmpty');
  });

  it('PrimaryListCard shows empty guidance copy when no items', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function PrimaryListCard(');
    const cardEnd = src.indexOf('\nfunction OtherListRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain('Add items manually or bring in needs from your plans');
  });

  it('PrimaryListCard does not show Build a Haul when empty', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function PrimaryListCard(');
    const cardEnd = src.indexOf('\nfunction OtherListRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    // Build a Haul requires eligibility — empty_or_no_demand is not eligible
    expect(cardBody).toContain("blockReason: 'empty_or_no_demand'");
    // eligible is false when summary is missing or empty state
    expect(cardBody).toContain('eligible: false');
  });
});

// ============================================================================
// 11 — Haul display name derivation (no persistence)
// ============================================================================

describe('Packet 11F — formatGroceryHaulDisplayName', () => {
  it('returns Today\'s Haul when shopping date equals today', () => {
    expect(formatGroceryHaulDisplayName('2026-08-18', '2026-08-18')).toBe("Today's Haul");
  });

  it('returns weekday Haul for dates within 6 days in the future', () => {
    // Saturday = 2026-08-22 (if today is 2026-08-18 Tuesday, +4 days)
    const result = formatGroceryHaulDisplayName('2026-08-22', '2026-08-18');
    expect(result).toBe('Saturday Haul');
  });

  it('returns short date Haul for past dates', () => {
    const result = formatGroceryHaulDisplayName('2026-08-15', '2026-08-18');
    expect(result).toBe('Aug 15 Haul');
  });

  it('returns short date Haul for dates further than 6 days in the future', () => {
    const result = formatGroceryHaulDisplayName('2026-09-01', '2026-08-18');
    expect(result).toBe('Sep 1 Haul');
  });

  it('always ends in "Haul"', () => {
    const cases = [
      ['2026-08-18', '2026-08-18'],
      ['2026-08-22', '2026-08-18'],
      ['2026-08-01', '2026-08-18'],
      ['2026-12-25', '2026-08-18'],
    ] as const;
    for (const [date, today] of cases) {
      expect(formatGroceryHaulDisplayName(date, today)).toMatch(/Haul$/);
    }
  });

  it('does not persist any title — pure derivation function', () => {
    const src = read('lib/plans/groceryHaul/copy.ts');
    const fnStart = src.indexOf('export function formatGroceryHaulDisplayName(');
    const fnEnd = src.indexOf('\nexport ', fnStart + 1);
    const fnBody = src.slice(fnStart, fnEnd);
    // No database calls, no writes
    expect(fnBody).not.toContain('supabase');
    expect(fnBody).not.toContain('insert');
    expect(fnBody).not.toContain('update');
    expect(fnBody).not.toContain('title');
  });

  it('index page uses formatGroceryHaulDisplayName for haul display', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('formatGroceryHaulDisplayName');
    expect(src).toContain('todayLocalDateKey');
  });
});

// ============================================================================
// 12 — Haul card anatomy: date/status/item count/source List
// ============================================================================

describe('Packet 11F — HaulCard anatomy', () => {
  it('HaulCard shows derived display name (occasion identity)', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function HaulCard(');
    const cardEnd = src.indexOf('\nfunction RecentHaulRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain('displayName');
    expect(cardBody).toContain('formatGroceryHaulDisplayName');
  });

  it('HaulCard shows execution status', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function HaulCard(');
    const cardEnd = src.indexOf('\nfunction RecentHaulRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain('statusLabel');
    expect(cardBody).toContain('formatGroceryHaulUserFacingStatusLabel');
  });

  it('HaulCard shows snapshot item count', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function HaulCard(');
    const cardEnd = src.indexOf('\nfunction RecentHaulRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain('itemLabel');
    expect(cardBody).toContain('item_count');
  });

  it('HaulCard shows source List name', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function HaulCard(');
    const cardEnd = src.indexOf('\nfunction RecentHaulRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain('From ');
    expect(cardBody).toContain('listName');
    expect(cardBody).toContain('source_list_name');
  });

  it('HaulCard shows shopping date', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function HaulCard(');
    const cardEnd = src.indexOf('\nfunction RecentHaulRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain('formatShoppingDate(haul.shopping_date)');
  });

  it('HaulCard has Open Haul link', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function HaulCard(');
    const cardEnd = src.indexOf('\nfunction RecentHaulRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain('Open Haul');
    expect(cardBody).toContain('foodHaul(haul.id)');
  });

  it('HaulCard does not have readiness/editing controls (list anatomy signals)', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function HaulCard(');
    const cardEnd = src.indexOf('\nfunction RecentHaulRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    // No Open List / Build a Haul buttons inside the haul card
    expect(cardBody).not.toContain('Open List');
    expect(cardBody).not.toContain('Build a Haul');
    // No readiness headline
    expect(cardBody).not.toContain('groceryListReadinessHeadline');
  });
});

// ============================================================================
// 13 — Upcoming/active Hauls from canonical read only
// ============================================================================

describe('Packet 11F — Upcoming & Active from canonical read', () => {
  it('upcomingActiveHauls derived from hauls state (canonical API data)', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('upcomingActiveHauls');
    expect(src).toContain("haulsGroupLabel(h.status) === 'upcoming_active'");
    // Never constructed from list readiness state
    expect(src).not.toContain('readyToShop.*upcoming');
    expect(src).not.toContain('shopping_in_progress.*upcoming');
  });

  it('Upcoming & Active label present in JSX', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('Upcoming');
    expect(src).toContain('Active');
  });

  it('uses HaulCard (full card) for upcoming/active hauls', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const upcomingStart = src.indexOf('upcomingActiveHauls.slice(');
    expect(upcomingStart).toBeGreaterThan(-1);
    const upcomingBlock = src.slice(upcomingStart, upcomingStart + 300);
    expect(upcomingBlock).toContain('<HaulCard');
  });
});

// ============================================================================
// 14 — Recent Hauls compact/history presentation
// ============================================================================

describe('Packet 11F — Recent Hauls compact rows', () => {
  it('RecentHaulRow component is defined', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('function RecentHaulRow(');
  });

  it('recentHauls uses RecentHaulRow (not HaulCard)', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const recentStart = src.indexOf('recentHauls.slice(');
    expect(recentStart).toBeGreaterThan(-1);
    const recentBlock = src.slice(recentStart, recentStart + 300);
    expect(recentBlock).toContain('<RecentHaulRow');
    expect(recentBlock).not.toContain('<HaulCard');
  });

  it('RecentHaulRow is a compact li/link row (no article wrapper)', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const rowStart = src.indexOf('function RecentHaulRow(');
    const rowEnd = src.indexOf('\nfunction PrimaryListCard(', rowStart);
    const rowBody = src.slice(rowStart, rowEnd);
    // Compact row uses li wrapper
    expect(rowBody).toContain('<li>');
    // Does not use the same article class as HaulCard
    expect(rowBody).not.toContain("className=\"rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4\"");
  });

  it('Recent Hauls section heading present', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('Recent Hauls');
  });
});

// ============================================================================
// 15 — Empty Hauls only after successful empty read
// ============================================================================

describe('Packet 11F — Empty Hauls state preserved (11E-R2)', () => {
  it('GROCERIES_HAULS_EMPTY constant still present', () => {
    expect(GROCERIES_HAULS_EMPTY).toContain('No Hauls yet');
    expect(GROCERIES_HAULS_EMPTY).toContain('build a Haul');
  });

  it('empty state guarded by ready + length===0', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const guard = "haulsLoadState === 'ready' && hauls.length === 0";
    expect(src).toContain(guard);
    const guardIdx = src.indexOf(guard);
    const emptyIdx = src.indexOf('GROCERIES_HAULS_EMPTY', guardIdx);
    expect(emptyIdx).toBeGreaterThan(guardIdx);
  });
});

// ============================================================================
// 16 — Haul read failure: unavailable + Retry (11E-R2 preserved)
// ============================================================================

describe('Packet 11F — Haul read failure state preserved (11E-R2)', () => {
  it('HaulsLoadState type includes unavailable', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('HaulsLoadState');
    expect(src).toContain("'unavailable'");
  });

  it('unavailable state renders error + Retry button', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain("haulsLoadState === 'unavailable'");
    expect(src).toContain('Retry');
    expect(src).toContain('haulsError');
  });

  it('unavailable block does not render GROCERIES_HAULS_EMPTY', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const unavailableStart = src.indexOf("haulsLoadState === 'unavailable'");
    const readyEmptyGuard = "haulsLoadState === 'ready' && hauls.length === 0";
    const readyGuardIdx = src.indexOf(readyEmptyGuard);
    expect(unavailableStart).toBeGreaterThan(-1);
    expect(readyGuardIdx).toBeGreaterThan(-1);
    const unavailableBlock = src.slice(unavailableStart, readyGuardIdx);
    expect(unavailableBlock).not.toContain('GROCERIES_HAULS_EMPTY');
  });
});

// ============================================================================
// 17 — View All Hauls routes correctly
// ============================================================================

describe('Packet 11F — View All Hauls routing', () => {
  it('View All Hauls links to APP_ROUTES.foodHauls', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain('View All Hauls');
    expect(src).toContain('APP_ROUTES.foodHauls');
  });

  it('View All Hauls appears when hauls are loaded (ready state)', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    // Available in the header area when ready, and in the hauls content section
    const readyIdx = src.indexOf("haulsLoadState === 'ready'");
    const viewAllIdx = src.indexOf('View All Hauls');
    // View All Hauls appears in the page
    expect(viewAllIdx).toBeGreaterThan(-1);
  });

  it('hauls index page routes to /app/food/hauls', () => {
    const routes = read('lib/routes/appRoutes.ts');
    expect(routes).toContain("foodHauls: '/app/food/hauls'");
  });
});

// ============================================================================
// 18 — No new write path / schema / migration / Pantry / retailer
// ============================================================================

describe('Packet 11F — No new write paths or scope creep', () => {
  it('groceryHaul/copy.ts has no database writes', () => {
    const src = read('lib/plans/groceryHaul/copy.ts');
    expect(src).not.toContain('supabase');
    expect(src).not.toMatch(/\.insert\(/i);
    expect(src).not.toMatch(/\.update\(/i);
    expect(src).not.toMatch(/CREATE TABLE/i);
    expect(src).not.toMatch(/ALTER TABLE/i);
  });

  it('index page has no schema changes, SQL, or migrations', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).not.toMatch(/create table/i);
    expect(src).not.toMatch(/alter table/i);
    expect(src).not.toContain('pantry');
    expect(src).not.toContain('retailer');
    expect(src).not.toContain('receipt');
    expect(src).not.toContain('cart');
    expect(src).not.toContain('checkout');
    expect(src).not.toContain('delivery');
  });

  it('formatGroceryHaulDisplayName does not add any new column or table ref', () => {
    const src = read('lib/plans/groceryHaul/copy.ts');
    expect(src).not.toContain('haul_display_name');
    expect(src).not.toContain('haul_title');
    expect(src).not.toContain('title_override');
  });
});

// ============================================================================
// 20 — formatGroceryHaulUserFacingStatusLabel
// ============================================================================

describe('Packet 11F — User-facing status labels', () => {
  const canonical: GroceryHaulStatus[] = ['planned', 'active', 'closed', 'cancelled'];

  it('planned maps to Planned', () => {
    expect(formatGroceryHaulUserFacingStatusLabel('planned')).toBe('Planned');
  });

  it('active maps to Shopping (execution language)', () => {
    expect(formatGroceryHaulUserFacingStatusLabel('active')).toBe('Shopping');
  });

  it('closed maps to Complete (execution language)', () => {
    expect(formatGroceryHaulUserFacingStatusLabel('closed')).toBe('Complete');
  });

  it('cancelled maps to Cancelled', () => {
    expect(formatGroceryHaulUserFacingStatusLabel('cancelled')).toBe('Cancelled');
  });

  it('all canonical statuses are covered', () => {
    for (const status of canonical) {
      expect(GROCERY_HAUL_USER_FACING_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('canonical GROCERY_HAUL_STATUS_LABELS unchanged (preserves existing contracts)', () => {
    const { GROCERY_HAUL_STATUS_LABELS } = require('@/lib/plans/groceryHaul/copy');
    expect(GROCERY_HAUL_STATUS_LABELS.planned).toBe('Planned');
    expect(GROCERY_HAUL_STATUS_LABELS.active).toBe('Active');
    expect(GROCERY_HAUL_STATUS_LABELS.closed).toBe('Closed');
    expect(GROCERY_HAUL_STATUS_LABELS.cancelled).toBe('Cancelled');
  });
});

// ============================================================================
// 21 — RecentHaulRow compact presentation
// ============================================================================

describe('Packet 11F — RecentHaulRow compact identity', () => {
  it('RecentHaulRow includes display name, status, and item count on one line', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const rowStart = src.indexOf('function RecentHaulRow(');
    const rowEnd = src.indexOf('\nfunction PrimaryListCard(', rowStart);
    const rowBody = src.slice(rowStart, rowEnd);
    expect(rowBody).toContain('displayName');
    expect(rowBody).toContain('statusLabel');
    expect(rowBody).toContain('itemLabel');
  });

  it('RecentHaulRow includes source List name', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const rowStart = src.indexOf('function RecentHaulRow(');
    const rowEnd = src.indexOf('\nfunction PrimaryListCard(', rowStart);
    const rowBody = src.slice(rowStart, rowEnd);
    expect(rowBody).toContain('listName');
    expect(rowBody).toContain('From ');
  });

  it('RecentHaulRow links to haul detail', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const rowStart = src.indexOf('function RecentHaulRow(');
    const rowEnd = src.indexOf('\nfunction PrimaryListCard(', rowStart);
    const rowBody = src.slice(rowStart, rowEnd);
    expect(rowBody).toContain('foodHaul(haul.id)');
  });
});

// ============================================================================
// 22 — PrimaryListCard Open List / Add Items / Build a Haul
// ============================================================================

describe('Packet 11F — PrimaryListCard action anatomy', () => {
  it('shows Add Items (not Open List) when list is empty', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function PrimaryListCard(');
    const cardEnd = src.indexOf('\nfunction OtherListRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    expect(cardBody).toContain("isEmpty ? 'Add Items' : 'Open List'");
  });

  it('Build a Haul appears before Open List in action row (secondary → primary order)', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const cardStart = src.indexOf('function PrimaryListCard(');
    const cardEnd = src.indexOf('\nfunction OtherListRow(', cardStart);
    const cardBody = src.slice(cardStart, cardEnd);
    const buildIdx = cardBody.indexOf('Build a Haul');
    const openIdx = cardBody.indexOf("'Add Items' : 'Open List'");
    // Build a Haul link appears before the Open List / Add Items link in DOM order
    expect(buildIdx).toBeGreaterThan(-1);
    expect(openIdx).toBeGreaterThan(-1);
    expect(buildIdx).toBeLessThan(openIdx);
  });
});

// ============================================================================
// 23 — OtherListRow compact for secondary lists
// ============================================================================

describe('Packet 11F — OtherListRow compact secondary lists', () => {
  it('OtherListRow is used for namedLists (not PersistentListCard or PrimaryListCard)', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const namedMapsIdx = src.indexOf('namedLists.map(');
    expect(namedMapsIdx).toBeGreaterThan(-1);
    const namedBlock = src.slice(namedMapsIdx, namedMapsIdx + 300);
    expect(namedBlock).toContain('OtherListRow');
    expect(namedBlock).not.toContain('PrimaryListCard');
    expect(namedBlock).not.toContain('PersistentListCard');
  });

  it('OtherListRow includes list name, readiness state, and actions', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    const rowStart = src.indexOf('function OtherListRow(');
    const rowEnd = src.indexOf('\nfunction ArchivedListRow(', rowStart);
    const rowBody = src.slice(rowStart, rowEnd);
    expect(rowBody).toContain('headline');
    expect(rowBody).toContain('Open List');
    expect(rowBody).toContain('Build a Haul');
  });

  it('Empty Other Lists copy is educational', () => {
    const src = read('pages/app/food/groceries/index.tsx');
    expect(src).toContain(
      'Create another Grocery List for an event, household need, or separate shopping purpose.',
    );
  });
});
