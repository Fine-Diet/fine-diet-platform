import type { PantryAcquisitionLot, PantryOnHandItem } from '@/lib/plans/types';

export type PerishabilityFilter = 'all' | 'evidence' | 'no_evidence';
export type InventoryFilter = 'all' | 'positive' | 'zero';

export const LOW_STOCK_RATIO = 0.25;
export const PANTRY_PERISHING_HORIZON_DAYS = 7;

export type PantryParentStatusKind =
  | 'expired_unresolved'
  | 'expires_today'
  | 'expires_soon'
  | 'use_soon'
  | 'restock_soon'
  | 'in_stock';

export interface PantryParentStatus {
  kind: PantryParentStatusKind;
  label: string;
}

export type PantryFeedSectionId = 'attention' | 'inventory';

export interface PantryFeedSections {
  attention: PantryOnHandItem[];
  inventory: PantryOnHandItem[];
  attentionCount: number;
  inventoryCount: number;
  showSearchEmpty: boolean;
}

export interface ExpirationEvidence {
  date: string;
  kind: 'exact' | 'expected';
}

export type ExpirationEvidenceTense = 'expired' | 'today' | 'future' | 'expected';

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function localTodayYmd(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatExpirationDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

export function expirationEvidenceTense(
  evidence: ExpirationEvidence,
  todayYmd: string,
): ExpirationEvidenceTense {
  if (!isValidYmd(evidence.date) || !isValidYmd(todayYmd)) {
    return evidence.kind === 'expected' ? 'expected' : 'future';
  }
  if (evidence.kind === 'expected') {
    return evidence.date === todayYmd ? 'today' : 'expected';
  }
  if (evidence.date < todayYmd) return 'expired';
  if (evidence.date === todayYmd) return 'today';
  return 'future';
}

export function formatExpirationEvidenceLabel(
  evidence: ExpirationEvidence,
  todayYmd: string,
): string {
  const tense = expirationEvidenceTense(evidence, todayYmd);
  if (evidence.kind === 'expected') {
    return tense === 'today'
      ? 'Expected expiration today'
      : `Expected expiration ${formatExpirationDate(evidence.date)}`;
  }
  switch (tense) {
    case 'expired':
      return `Expired ${formatExpirationDate(evidence.date)}`;
    case 'today':
      return 'Expires today';
    default:
      return `Expires ${formatExpirationDate(evidence.date)}`;
  }
}

export function expirationEvidence(
  lot: PantryAcquisitionLot,
): ExpirationEvidence | null {
  if (lot.expires_on) return { date: lot.expires_on, kind: 'exact' };
  if (!lot.acquired_on || lot.expected_shelf_life_days == null) return null;
  const [year, month, day] = lot.acquired_on.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + lot.expected_shelf_life_days);
  return { date: date.toISOString().slice(0, 10), kind: 'expected' };
}

export function lotResolutionStatus(
  lot: PantryAcquisitionLot,
): PantryAcquisitionLot['resolution_status'] {
  return lot.resolution_status ?? 'open';
}

export function isPantryLotTerminal(lot: PantryAcquisitionLot): boolean {
  const status = lotResolutionStatus(lot);
  return status === 'completed' || status === 'disposed';
}

export function isExactExpiredLot(
  lot: PantryAcquisitionLot,
  todayYmd: string,
): boolean {
  if (!lot.expires_on) return false;
  return lot.expires_on < todayYmd;
}

export function isLotExpiredUnresolved(
  lot: PantryAcquisitionLot,
  todayYmd: string,
): boolean {
  return (
    lotResolutionStatus(lot) === 'open'
    && lot.quantity_remaining > 0
    && isExactExpiredLot(lot, todayYmd)
  );
}

export function isLotUsableOpen(
  lot: PantryAcquisitionLot,
  todayYmd: string,
): boolean {
  return (
    lotResolutionStatus(lot) === 'open'
    && lot.quantity_remaining > 0
    && !isExactExpiredLot(lot, todayYmd)
  );
}

export function activeAcquisitionLots(
  lots: PantryAcquisitionLot[],
): PantryAcquisitionLot[] {
  return lots.filter((lot) => lot.quantity_remaining > 0);
}

export function eligibleUsableAcquisitionLots(
  lots: PantryAcquisitionLot[],
  todayYmd: string,
): PantryAcquisitionLot[] {
  return lots.filter((lot) => isLotUsableOpen(lot, todayYmd));
}

function normalizeComparableUnit(unit: string | null | undefined): string | null {
  const trimmed = unit?.trim();
  return trimmed ? trimmed.toLocaleLowerCase() : null;
}

function daysBetween(startYmd: string, endYmd: string): number {
  const [sy, sm, sd] = startYmd.split('-').map(Number);
  const [ey, em, ed] = endYmd.split('-').map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

function isEvidenceWithinHorizon(
  evidence: ExpirationEvidence,
  todayYmd: string,
  horizonDays: number,
): boolean {
  const delta = daysBetween(todayYmd, evidence.date);
  return delta >= 0 && delta <= horizonDays;
}

export interface EligibleComparableLotSummary {
  remainingTotal: number;
  acquiredTotal: number;
  unitLabel: string;
}

export function eligibleComparableLotSummary(
  lots: PantryAcquisitionLot[],
  itemUnit: string | null,
  todayYmd: string,
): EligibleComparableLotSummary | null {
  const normalizedItemUnit = normalizeComparableUnit(itemUnit);
  if (!normalizedItemUnit) return null;
  const eligible = eligibleUsableAcquisitionLots(lots, todayYmd);
  if (eligible.length === 0) return null;
  const matching = eligible.filter(
    (lot) => normalizeComparableUnit(lot.unit) === normalizedItemUnit,
  );
  if (matching.length === 0 || matching.length !== eligible.length) return null;
  const acquiredTotal = matching.reduce((sum, lot) => sum + lot.quantity_acquired, 0);
  if (acquiredTotal <= 0) return null;
  const remainingTotal = matching.reduce((sum, lot) => sum + lot.quantity_remaining, 0);
  const unitLabel = itemUnit?.trim() || matching[0].unit?.trim() || '';
  return { remainingTotal, acquiredTotal, unitLabel };
}

/** @deprecated Prefer eligibleComparableLotSummary for paired numerator/denominator. */
export function comparableAcquiredDenominator(
  lots: PantryAcquisitionLot[],
  itemUnit: string | null,
  todayYmd: string,
): number | null {
  return eligibleComparableLotSummary(lots, itemUnit, todayYmd)?.acquiredTotal ?? null;
}

export function isPantryItemLowStock(
  item: PantryOnHandItem,
  lots: PantryAcquisitionLot[],
  todayYmd: string,
): boolean {
  if (item.quantity === 0) return true;
  const summary = eligibleComparableLotSummary(lots, item.unit, todayYmd);
  if (!summary) return false;
  return summary.remainingTotal / summary.acquiredTotal <= LOW_STOCK_RATIO;
}

export function pantryInventoryReading(
  item: PantryOnHandItem,
  lots: PantryAcquisitionLot[],
  todayYmd: string,
): string {
  const unit = item.unit?.trim() || null;
  const summary = eligibleComparableLotSummary(lots, item.unit, todayYmd);
  if (summary) {
    const unitLabel = summary.unitLabel || unit || '';
    return `${summary.remainingTotal} / ${summary.acquiredTotal} ${unitLabel} remaining`.trim();
  }
  if (item.quantity == null) {
    return unit ? `Amount saved · ${unit}` : 'Amount saved';
  }
  return unit ? `${item.quantity} ${unit}` : String(item.quantity);
}

function expiredUnresolvedLots(
  lots: PantryAcquisitionLot[],
  todayYmd: string,
): PantryAcquisitionLot[] {
  return lots
    .filter((lot) => isLotExpiredUnresolved(lot, todayYmd))
    .sort((a, b) => {
      const aDate = a.expires_on ?? '';
      const bDate = b.expires_on ?? '';
      return aDate.localeCompare(bDate) || a.acquired_on.localeCompare(b.acquired_on);
    });
}

function mostUrgentEligibleEvidence(
  lots: PantryAcquisitionLot[],
  todayYmd: string,
): ExpirationEvidence | null {
  const eligible = eligibleUsableAcquisitionLots(lots, todayYmd);
  const evidence = eligible
    .map(expirationEvidence)
    .filter((value): value is ExpirationEvidence => value !== null);
  if (evidence.length === 0) return null;

  const exactToday = evidence.find(
    (entry) =>
      entry.kind === 'exact'
      && expirationEvidenceTense(entry, todayYmd) === 'today',
  );
  if (exactToday) return exactToday;

  const exactSoon = evidence
    .filter(
      (entry) =>
        entry.kind === 'exact'
        && isEvidenceWithinHorizon(entry, todayYmd, PANTRY_PERISHING_HORIZON_DAYS),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (exactSoon.length > 0) return exactSoon[0];

  const expectedSoon = evidence
    .filter(
      (entry) =>
        entry.kind === 'expected'
        && isEvidenceWithinHorizon(entry, todayYmd, PANTRY_PERISHING_HORIZON_DAYS),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (expectedSoon.length > 0) return expectedSoon[0];

  return null;
}

export function parentPantryStatus(
  item: PantryOnHandItem,
  lots: PantryAcquisitionLot[],
  todayYmd: string,
): PantryParentStatus {
  const unresolved = expiredUnresolvedLots(lots, todayYmd);
  if (unresolved.length > 0) {
    const date = unresolved[0].expires_on!;
    return {
      kind: 'expired_unresolved',
      label: `Expired ${formatExpirationDate(date)}`,
    };
  }

  const urgent = mostUrgentEligibleEvidence(lots, todayYmd);
  if (urgent?.kind === 'exact') {
    const tense = expirationEvidenceTense(urgent, todayYmd);
    if (tense === 'today') {
      return { kind: 'expires_today', label: 'Expires today' };
    }
    if (isEvidenceWithinHorizon(urgent, todayYmd, PANTRY_PERISHING_HORIZON_DAYS)) {
      return {
        kind: 'expires_soon',
        label: `Expires ${formatExpirationDate(urgent.date)}`,
      };
    }
  }
  if (urgent?.kind === 'expected') {
    return { kind: 'use_soon', label: 'Use Soon' };
  }
  if (isPantryItemLowStock(item, lots, todayYmd)) {
    return { kind: 'restock_soon', label: 'Restock Soon' };
  }
  return { kind: 'in_stock', label: 'In stock' };
}

export function isPantryItemInAttentionSection(
  item: PantryOnHandItem,
  lots: PantryAcquisitionLot[],
  todayYmd: string,
): boolean {
  if (expiredUnresolvedLots(lots, todayYmd).length > 0) return true;
  const urgent = mostUrgentEligibleEvidence(lots, todayYmd);
  if (urgent && isEvidenceWithinHorizon(urgent, todayYmd, PANTRY_PERISHING_HORIZON_DAYS)) {
    return true;
  }
  return isPantryItemLowStock(item, lots, todayYmd);
}

function attentionSortKey(
  item: PantryOnHandItem,
  lots: PantryAcquisitionLot[],
  todayYmd: string,
): [number, string, string, number, string] {
  const status = parentPantryStatus(item, lots, todayYmd);
  const priority: Record<PantryParentStatusKind, number> = {
    expired_unresolved: 0,
    expires_today: 1,
    expires_soon: 2,
    use_soon: 3,
    restock_soon: 4,
    in_stock: 5,
  };
  const unresolved = expiredUnresolvedLots(lots, todayYmd)[0];
  const urgent = mostUrgentEligibleEvidence(lots, todayYmd);
  const dateKey = unresolved?.expires_on
    ?? urgent?.date
    ?? '9999-12-31';
  const summary = eligibleComparableLotSummary(lots, item.unit, todayYmd);
  const ratio = summary && summary.acquiredTotal > 0
    ? summary.remainingTotal / summary.acquiredTotal
    : 1;
  return [priority[status.kind], dateKey, status.kind, ratio, item.name];
}

export function buildPantryFeedSections(args: {
  items: PantryOnHandItem[];
  lotsByPantryKey: Record<string, PantryAcquisitionLot[]>;
  query: string;
  todayYmd: string;
}): PantryFeedSections {
  const { items, lotsByPantryKey, query, todayYmd } = args;
  const searched = items.filter((item) =>
    pantryItemMatchesSearch(item, lotsByPantryKey[item.key] ?? [], query),
  );
  const attention: PantryOnHandItem[] = [];
  const inventory: PantryOnHandItem[] = [];
  for (const item of searched) {
    const lots = lotsByPantryKey[item.key] ?? [];
    if (isPantryItemInAttentionSection(item, lots, todayYmd)) {
      attention.push(item);
    } else {
      inventory.push(item);
    }
  }
  attention.sort((a, b) => {
    const aKey = attentionSortKey(a, lotsByPantryKey[a.key] ?? [], todayYmd);
    const bKey = attentionSortKey(b, lotsByPantryKey[b.key] ?? [], todayYmd);
    return aKey[0] - bKey[0]
      || aKey[1].localeCompare(bKey[1])
      || aKey[2].localeCompare(bKey[2])
      || aKey[3] - bKey[3]
      || aKey[4].localeCompare(bKey[4]);
  });
  inventory.sort((a, b) => a.name.localeCompare(b.name));
  const hasQuery = query.trim().length > 0;
  return {
    attention,
    inventory,
    attentionCount: attention.length,
    inventoryCount: inventory.length,
    showSearchEmpty: hasQuery && attention.length === 0 && inventory.length === 0,
  };
}

export function sortPurchaseHistoryLots(
  lots: PantryAcquisitionLot[],
): PantryAcquisitionLot[] {
  return [...lots].sort(
    (a, b) =>
      b.acquired_on.localeCompare(a.acquired_on)
      || b.created_at.localeCompare(a.created_at),
  );
}

/** @deprecated Prefer sortPurchaseHistoryLots for display ordering. */
export function sortAcquisitionLots(
  lots: PantryAcquisitionLot[],
): PantryAcquisitionLot[] {
  return sortPurchaseHistoryLots(lots);
}

export function earliestExpirationEvidence(
  lots: PantryAcquisitionLot[],
): ExpirationEvidence | null {
  const evidence = lots
    .map(expirationEvidence)
    .filter((value): value is ExpirationEvidence => value !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return evidence[0] ?? null;
}

export function earliestActiveExpirationEvidence(
  lots: PantryAcquisitionLot[],
): ExpirationEvidence | null {
  return earliestExpirationEvidence(activeAcquisitionLots(lots));
}

export function parentDisplayExpirationEvidence(
  lots: PantryAcquisitionLot[],
  todayYmd: string,
): ExpirationEvidence | null {
  const unresolved = expiredUnresolvedLots(lots, todayYmd);
  if (unresolved.length > 0 && unresolved[0].expires_on) {
    return { date: unresolved[0].expires_on, kind: 'exact' };
  }
  return mostUrgentEligibleEvidence(lots, todayYmd);
}

export function parentExpirationShortState(
  evidence: ExpirationEvidence,
  todayYmd: string,
): 'Expired' | 'Expires today' | null {
  if (evidence.kind !== 'exact') return null;
  const tense = expirationEvidenceTense(evidence, todayYmd);
  if (tense === 'expired') return 'Expired';
  if (tense === 'today') return 'Expires today';
  return null;
}

export function formatPurchaseStateLabel(
  lot: PantryAcquisitionLot,
  todayYmd: string,
): string {
  const status = lotResolutionStatus(lot);
  if (status === 'completed' && lot.resolved_at) {
    return `Completed · ${formatExpirationDate(lot.resolved_at.slice(0, 10))}`;
  }
  if (status === 'disposed' && lot.resolved_at) {
    const dateLabel = formatExpirationDate(lot.resolved_at.slice(0, 10));
    const disposed = lot.disposed_quantity;
    const unit = lot.unit?.trim();
    const quantitySuffix = disposed != null && unit
      ? ` · ${disposed} ${unit} disposed`
      : '';
    const reasonSuffix = lot.disposition_reason === 'expired' ? ' · Expired' : '';
    return `Disposed · ${dateLabel}${quantitySuffix}${reasonSuffix}`;
  }
  if (lot.quantity_remaining === 0 && status === 'open') return 'Used up';
  if (isLotExpiredUnresolved(lot, todayYmd) && lot.expires_on) {
    return `Expired ${formatExpirationDate(lot.expires_on)} · disposition needed`;
  }
  const evidence = expirationEvidence(lot);
  if (!evidence) return 'Expiration not set';
  return formatExpirationEvidenceLabel(evidence, todayYmd);
}

export function pantryItemMatchesSearch(
  item: PantryOnHandItem,
  lots: PantryAcquisitionLot[],
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [
    item.name,
    ...lots.flatMap((lot) => [lot.product_title, lot.brand_name, lot.retailer]),
  ].some((value) => value?.toLocaleLowerCase().includes(normalized));
}

/** @deprecated Use buildPantryFeedSections for Pantry feed classification. */
export function filterAndSortPantryItems(args: {
  items: PantryOnHandItem[];
  lotsByPantryKey: Record<string, PantryAcquisitionLot[]>;
  query: string;
  perishability?: PerishabilityFilter;
  inventory?: InventoryFilter;
}): PantryOnHandItem[] {
  const { items, lotsByPantryKey, query } = args;
  return items
    .filter((item) =>
      pantryItemMatchesSearch(item, lotsByPantryKey[item.key] ?? [], query),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}
