import type { PantryAcquisitionLot, PantryOnHandItem } from '@/lib/plans/types';

export type PerishabilityFilter = 'all' | 'evidence' | 'no_evidence';
export type InventoryFilter = 'all' | 'positive' | 'zero';

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

export function sortAcquisitionLots(
  lots: PantryAcquisitionLot[],
): PantryAcquisitionLot[] {
  return [...lots].sort((a, b) => {
    const depletion = Number(a.quantity_remaining === 0) - Number(b.quantity_remaining === 0);
    if (depletion !== 0) return depletion;
    const aEvidence = expirationEvidence(a);
    const bEvidence = expirationEvidence(b);
    if (aEvidence && bEvidence && aEvidence.date !== bEvidence.date) {
      return aEvidence.date.localeCompare(bEvidence.date);
    }
    if (aEvidence !== bEvidence) return aEvidence ? -1 : 1;
    return b.acquired_on.localeCompare(a.acquired_on) || b.created_at.localeCompare(a.created_at);
  });
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

export function filterAndSortPantryItems(args: {
  items: PantryOnHandItem[];
  lotsByPantryKey: Record<string, PantryAcquisitionLot[]>;
  query: string;
  perishability: PerishabilityFilter;
  inventory: InventoryFilter;
}): PantryOnHandItem[] {
  const { items, lotsByPantryKey, query, perishability, inventory } = args;
  return items
    .filter((item) => {
      const lots = lotsByPantryKey[item.key] ?? [];
      const hasEvidence = earliestExpirationEvidence(lots) !== null;
      if (perishability === 'evidence' && !hasEvidence) return false;
      if (perishability === 'no_evidence' && hasEvidence) return false;
      if (inventory === 'positive' && !(item.quantity != null && item.quantity > 0)) return false;
      if (inventory === 'zero' && item.quantity !== 0) return false;
      return pantryItemMatchesSearch(item, lots, query);
    })
    .sort((a, b) => {
      const aEvidence = earliestExpirationEvidence(lotsByPantryKey[a.key] ?? []);
      const bEvidence = earliestExpirationEvidence(lotsByPantryKey[b.key] ?? []);
      if (aEvidence && bEvidence && aEvidence.date !== bEvidence.date) {
        return aEvidence.date.localeCompare(bEvidence.date);
      }
      if (aEvidence !== bEvidence) return aEvidence ? -1 : 1;
      const inventoryOrder = Number(a.quantity === 0) - Number(b.quantity === 0);
      if (inventoryOrder !== 0) return inventoryOrder;
      return a.name.localeCompare(b.name);
    });
}
