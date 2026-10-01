'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';

import { FoodSectionViewSwitcher } from '@/components/food/FoodSectionViewSwitcher';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import { SignedInPageScroll, SIGNED_IN_FOOTER_CLEARANCE_CLASS } from '@/components/layout/SignedInPageShell';
import { ItemManagementDialog } from '@/components/food/itemManagement/ItemManagementDialog';
import { CreateResourceDialogFooter } from '@/components/food/itemManagement/CreateResourceDialogFooter';
import { APP_ROUTE_BUILDERS, APP_ROUTES } from '@/lib/routes/appRoutes';
import { planService } from '@/lib/plans';
import type {
  GeneratedGroceryList,
  GroceryHaulDetail,
  GroceryHaulExecutionReadiness,
  GroceryHaulExecutionItemState,
  GroceryHaulItem,
} from '@/lib/plans/types';
import type { GroceryListReadinessDecision } from '@/lib/plans/groceryListReadiness/policy';
import { HaulContributorItemDialog } from './HaulContributorItemDialog';
import { HaulExecutionReadinessDialog } from './HaulExecutionReadinessDialog';
import { HaulInviteDialog } from './HaulInviteDialog';
import { HaulItemEditor } from './HaulItemEditor';
import { HaulSourceListPicker } from './HaulSourceListPicker';
import { HaulStoreManagementDialog } from './HaulStoreManagementDialog';
import type { HaulInvitationRecord } from '@/lib/plans/groceryHaul/haulCollaborationClientTypes';
import {
  canMutateHaulContributorItem,
  contributorNamesFromInvitations,
  haulContributorAttributionLabel,
  isHaulContributorOriginItem,
  type HaulBuilderViewerRole,
} from '@/lib/plans/groceryHaul/haulBuilderCollaboration';
import {
  computeGroceryHaulPreparationEstimate,
} from '@/lib/plans/groceryHaul/estimate';
import { buildEligibleHaulSourceCandidates } from '@/lib/plans/groceryHaul/sourceListSelection';
import {
  formatHaulCurrency,
  formatHaulDate,
  groceryListTitle,
  haulStatusLabel,
  itemStoreLabel,
  sourceDemandLabel,
  summarizeHaulStoreItems,
} from './presentation';

const HAUL_ONLY_ITEM_BUCKET = '__haul_only__';

type LoadState = 'loading' | 'ready' | 'error';

const FOOD_PAGE_BACKGROUND_CLASS =
  'bg-gradient-to-b from-[#17130f] via-brand-900 to-neutral-700 bg-[length:100%_100vh] bg-no-repeat bg-top bg-neutral-700';

interface MetadataDraft {
  title: string;
  shoppingDate: string;
  budgetAmount: string;
  currency: string;
}

function metadataFromDetail(detail: GroceryHaulDetail): MetadataDraft {
  return {
    title: detail.haul.title ?? `Haul · ${formatHaulDate(detail.haul.shopping_date)}`,
    shoppingDate: detail.haul.shopping_date,
    budgetAmount: detail.haul.budget_amount == null ? '' : String(detail.haul.budget_amount),
    currency: detail.haul.currency,
  };
}

function buildContributorNameMap(
  items: GroceryHaulItem[],
  invitations: HaulInvitationRecord[],
  sharedContributors: Array<{ person_id: string; display_name: string | null }>,
): Map<string, string | null> {
  const map = contributorNamesFromInvitations(invitations);
  for (const contributor of sharedContributors) {
    if (contributor.display_name || !map.has(contributor.person_id)) {
      map.set(contributor.person_id, contributor.display_name);
    }
  }
  for (const item of items) {
    if (item.added_by_person_id && !map.has(item.added_by_person_id)) {
      map.set(item.added_by_person_id, null);
    }
  }
  return map;
}

function isGroceryHaulNotFound(err: unknown): boolean {
  return err instanceof Error && /not found/i.test(err.message);
}

function HistoricalHaul({
  detail,
  contributorNames,
}: {
  detail: GroceryHaulDetail;
  contributorNames: Map<string, string | null>;
}) {
  return (
    <div className="mx-auto w-full max-w-[900px]">
      <Link href={APP_ROUTES.foodHauls} className="text-xs font-semibold text-white/45 hover:text-white/75">
        ← Hauls
      </Link>
      <header className="mt-5">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl font-light text-brand-50">
            {detail.haul.title || `Haul · ${formatHaulDate(detail.haul.shopping_date)}`}
          </h1>
          <span className="rounded-full border border-white/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
            {haulStatusLabel(detail.haul.status)}
          </span>
        </div>
        <p className="mt-2 text-[14px] leading-[20.4px] text-white/50">
          {formatHaulDate(detail.haul.shopping_date)} · Read-only Haul history
        </p>
      </header>
      <div className="mt-8 divide-y divide-white/10 border-y border-white/15">
        {detail.items.map((item) => (
          <div key={item.id} className="py-5">
            <p className="text-base font-semibold text-brand-50">{item.name_snapshot}</p>
            {haulContributorAttributionLabel(item, contributorNames) && (
              <p className="mt-1 text-xs text-white/40">
                {haulContributorAttributionLabel(item, contributorNames)}
              </p>
            )}
            <p className="mt-1 text-xs text-white/45">{sourceDemandLabel(item)}</p>
            {item.product_title && <p className="mt-2 text-sm text-white/70">{item.product_title}</p>}
            {itemStoreLabel(item) && <p className="mt-1 text-xs text-white/45">{itemStoreLabel(item)}</p>}
            <p className="mt-2 text-sm text-white/65">Final quantity: {item.final_quantity}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HaulBuilder({ haulId }: { haulId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<GroceryHaulDetail | null>(null);
  const [lists, setLists] = useState<GeneratedGroceryList[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<GroceryHaulExecutionReadiness | null>(null);
  const [readinessOpen, setReadinessOpen] = useState(false);
  const [activationBusy, setActivationBusy] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<MetadataDraft | null>(null);
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [retryAutosave, setRetryAutosave] = useState(0);
  const lastSavedMetadata = useRef('');
  const [openSourceId, setOpenSourceId] = useState<string | null>(null);
  const sourceHeaders = useRef(new Map<string, HTMLButtonElement>());
  const [itemBusy, setItemBusy] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<GroceryHaulItem | null>(null);
  const [chooseProductFirst, setChooseProductFirst] = useState(false);
  const [addListsOpen, setAddListsOpen] = useState(false);
  const [storesOpen, setStoresOpen] = useState(false);
  const [addListQuery, setAddListQuery] = useState('');
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);
  const [addingLists, setAddingLists] = useState(false);
  const [addListsError, setAddListsError] = useState<string | null>(null);
  const [persistentListSummaries, setPersistentListSummaries] = useState<
    Record<string, GroceryListReadinessDecision>
  >({});
  const [defaultListId, setDefaultListId] = useState<string | null>(null);
  const [executionStateByItemId, setExecutionStateByItemId] = useState(
    () => new Map<string, GroceryHaulExecutionItemState>(),
  );
  const [viewerRole, setViewerRole] = useState<HaulBuilderViewerRole>('owner');
  const [viewerPersonId, setViewerPersonId] = useState<string | null>(null);
  const [contributorNames, setContributorNames] = useState(
    () => new Map<string, string | null>(),
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const [contributorItemOpen, setContributorItemOpen] = useState(false);
  const [editingContributorItem, setEditingContributorItem] = useState<GroceryHaulItem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      let nextDetail: GroceryHaulDetail;
      let role: HaulBuilderViewerRole = 'owner';
      let personId: string | null = null;
      let sharedContributors: Array<{ person_id: string; display_name: string | null }> = [];
      let invitations: HaulInvitationRecord[] = [];

      try {
        nextDetail = await planService.getGroceryHaul(haulId);
        invitations = await planService.listHaulInvitations(haulId).catch(() => []);
      } catch (err) {
        if (!isGroceryHaulNotFound(err)) throw err;
        const shared = await planService.getSharedGroceryHaul(haulId);
        nextDetail = shared.detail;
        role = shared.viewer.role === 'owner' ? 'owner' : 'contributor';
        personId = shared.viewer.person_id;
        sharedContributors = shared.contributors;
      }

      setViewerRole(role);
      setViewerPersonId(personId);
      setContributorNames(buildContributorNameMap(nextDetail.items, invitations, sharedContributors));
      setDetail(nextDetail);
      const nextMetadata = metadataFromDetail(nextDetail);
      setMetadata(nextMetadata);
      lastSavedMetadata.current = JSON.stringify(nextMetadata);

      if (role === 'owner') {
        const overview = await planService.getGroceryListsOverview();
        setLists([overview.default_list, ...overview.named_lists].filter(
          (list): list is GeneratedGroceryList =>
            Boolean(list && list.status === 'active' && !list.archived_at),
        ));
        setPersistentListSummaries(overview.persistent_list_summaries);
        setDefaultListId(overview.default_list?.id ?? null);
      } else {
        setLists([]);
        setPersistentListSummaries({});
        setDefaultListId(null);
      }

      setOpenSourceId((current) =>
        current && nextDetail.source_lists.some((source) => source.grocery_list_id === current)
          ? current
          : nextDetail.source_lists[0]?.grocery_list_id ?? null,
      );
      if (nextDetail.haul.status === 'active' && role === 'owner') {
        const execution = await planService.getGroceryHaulExecution(haulId);
        setExecutionStateByItemId(new Map(
          execution.items.map((item) => [item.haul_item_id, item.state]),
        ));
      } else {
        setExecutionStateByItemId(new Map());
      }
      setLoadState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this Haul.');
      setLoadState('error');
    }
  }, [haulId]);

  const reloadDetail = useCallback(async () => {
    if (viewerRole === 'contributor') {
      const shared = await planService.getSharedGroceryHaul(haulId);
      setDetail(shared.detail);
      setContributorNames(buildContributorNameMap(shared.detail.items, [], shared.contributors));
      return;
    }
    const nextDetail = await planService.getGroceryHaul(haulId);
    const invitations = await planService.listHaulInvitations(haulId).catch(() => []);
    setDetail(nextDetail);
    setContributorNames(buildContributorNameMap(nextDetail.items, invitations, []));
  }, [haulId, viewerRole]);

  useEffect(() => {
    setLoadState('loading');
    void load();
  }, [load]);

  const prepareView = router.isReady && router.query.prepare === '1';
  const isOwner = viewerRole === 'owner';
  const metadataReadOnly = !isOwner || detail?.haul.status !== 'planned';
  const activePrepareView = isOwner && detail?.haul.status === 'active' && prepareView;
  const canInvite = isOwner && detail?.haul.status === 'planned' && !activePrepareView;
  const showPreparationSummary = Boolean(
    loadState === 'ready'
    && detail
    && metadata
    && !(isOwner && detail.haul.status === 'active' && !prepareView)
    && (detail.haul.status === 'planned' || activePrepareView),
  );

  function itemPreparationLocked(itemId: string): boolean {
    if (detail?.haul.status === 'planned') return false;
    if (activePrepareView) {
      return executionStateByItemId.get(itemId) !== 'pending';
    }
    return true;
  }

  useEffect(() => {
    if (!router.isReady || !isOwner) return;
    if (detail?.haul.status !== 'active') return;
    if (router.query.prepare === '1') return;
    void router.replace(APP_ROUTE_BUILDERS.foodHaulShop(haulId));
  }, [detail, haulId, isOwner, router, router.isReady, router.query.prepare]);

  useEffect(() => {
    if (!isOwner || !detail || detail.haul.status !== 'planned' || !metadata) return;
    const serialized = JSON.stringify(metadata);
    if (serialized === lastSavedMetadata.current) return;
    const budget = metadata.budgetAmount.trim() === '' ? null : Number(metadata.budgetAmount);
    if (
      !metadata.title.trim()
      || !metadata.shoppingDate
      || !/^[A-Z]{3}$/.test(metadata.currency)
      || (budget != null && (!Number.isFinite(budget) || budget < 0))
    ) {
      setAutosaveError('Enter a title, valid date, three-letter currency, and nonnegative budget.');
      return;
    }
    const timer = window.setTimeout(async () => {
      setAutosaveError(null);
      try {
        const updated = await planService.updateGroceryHaul(haulId, {
          title: metadata.title.trim(),
          shopping_date: metadata.shoppingDate,
          budget_amount: budget,
          currency: metadata.currency,
        });
        lastSavedMetadata.current = serialized;
        setDetail((current) => current ? { ...current, haul: updated } : current);
      } catch (err) {
        setAutosaveError(err instanceof Error ? err.message : 'Changes could not be saved.');
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [detail, haulId, isOwner, metadata, retryAutosave]);

  const itemsBySource = useMemo(() => {
    const grouped = new Map<string, GroceryHaulItem[]>();
    for (const item of detail?.items ?? []) {
      // Haul-only (contributor) items have no source List; keep them out of every
      // source panel until Phase B2 presents them.
      const key = item.source_grocery_list_id ?? HAUL_ONLY_ITEM_BUCKET;
      const bucket = grouped.get(key) ?? [];
      bucket.push(item);
      grouped.set(key, bucket);
    }
    return grouped;
  }, [detail?.items]);

  const haulOnlyItems = itemsBySource.get(HAUL_ONLY_ITEM_BUCKET) ?? [];
  const canAddHaulOnlyItem = viewerRole === 'contributor' && detail?.haul.status === 'planned';

  const rosterStoreCount = detail?.stores.length ?? 0;
  const rosterStoreLabel = rosterStoreCount === 1 ? '1 Store' : `${rosterStoreCount} Stores`;
  const canManageStores = isOwner && detail?.haul.status === 'planned' && !activePrepareView;

  const memberIds = useMemo(
    () => new Set(detail?.source_lists.map((source) => source.grocery_list_id) ?? []),
    [detail?.source_lists],
  );

  const addableSourceLists = useMemo(
    () =>
      buildEligibleHaulSourceCandidates(lists, persistentListSummaries, {
        excludeListIds: memberIds,
      }),
    [lists, persistentListSummaries, memberIds],
  );

  function switchSource(sourceId: string) {
    const next = openSourceId === sourceId ? null : sourceId;
    setOpenSourceId(next);
    if (!next) return;
    window.requestAnimationFrame(() => {
      const header = sourceHeaders.current.get(next);
      if (!header) return;
      const rect = header.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        header.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  async function changeQuantity(item: GroceryHaulItem, delta: number) {
    if (!canEditPreparationItem(item) || isHaulContributorOriginItem(item) || itemBusy) return;
    const nextQuantity = Math.max(0, item.final_quantity + delta);
    if (nextQuantity === item.final_quantity) return;
    setItemBusy(item.id);
    setError(null);
    setDetail((current) => current ? {
      ...current,
      items: current.items.map((candidate) =>
        candidate.id === item.id ? { ...candidate, final_quantity: nextQuantity } : candidate,
      ),
    } : current);
    try {
      // Deliberately patch final_quantity only. quantity_snapshot is immutable provenance.
      await planService.updateGroceryHaulItem(haulId, item.id, {
        final_quantity: nextQuantity,
      });
      await reloadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update final quantity.');
      await reloadDetail().catch(() => undefined);
    } finally {
      setItemBusy(null);
    }
  }

  async function requestShoppingView() {
    if (activationBusy) return;
    setActivationBusy(true);
    setActivationError(null);
    try {
      const nextReadiness = await planService.getGroceryHaulExecutionReadiness(haulId);
      setReadiness(nextReadiness);
      const needsReview = nextReadiness.blockers.length > 0
        || nextReadiness.warnings.length > 0
        || nextReadiness.deferred_findings.length > 0
        || !nextReadiness.can_start;
      if (needsReview) {
        setReadinessOpen(true);
        return;
      }
      await activateShoppingView();
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : 'Unable to check Shopping View readiness.');
    } finally {
      setActivationBusy(false);
    }
  }

  async function activateShoppingView() {
    setActivationBusy(true);
    setActivationError(null);
    try {
      await planService.startGroceryHaulExecution(haulId);
      await router.push(APP_ROUTE_BUILDERS.foodHaulShop(haulId));
    } catch (err) {
      setActivationError(err instanceof Error ? err.message : 'Unable to open Shopping View.');
    } finally {
      setActivationBusy(false);
    }
  }

  function continueFromReadiness() {
    if (!readiness?.can_start) return;
    setReadinessOpen(false);
    void activateShoppingView();
  }

  function canEditPreparationItem(item: GroceryHaulItem): boolean {
    if (!detail) return false;
    if (isHaulContributorOriginItem(item)) {
      return canMutateHaulContributorItem(
        item,
        { role: viewerRole, personId: viewerPersonId ?? '' },
        detail.haul.status,
      );
    }
    if (viewerRole === 'contributor') return false;
    return !itemPreparationLocked(item.id);
  }

  async function removeHaulOnlyItem(item: GroceryHaulItem) {
    if (!canEditPreparationItem(item) || itemBusy) return;
    setItemBusy(item.id);
    setError(null);
    try {
      await planService.removeHaulContributorItem(haulId, item.id);
      await reloadDetail();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to remove this item.');
    } finally {
      setItemBusy(null);
    }
  }

  async function addSelectedLists() {
    if (selectedListIds.length === 0 || addingLists) return;
    setAddingLists(true);
    setAddListsError(null);
    try {
      await planService.addGroceryListsToHaul(haulId, selectedListIds);
      await reloadDetail();
      setSelectedListIds([]);
      setAddListQuery('');
      setAddListsOpen(false);
    } catch (err) {
      setAddListsError(err instanceof Error ? err.message : 'Unable to add these Lists.');
    } finally {
      setAddingLists(false);
    }
  }

  if (loadState === 'loading') {
    return (
      <div className={`flex min-h-screen flex-col text-white ${FOOD_PAGE_BACKGROUND_CLASS}`}>
        <SignedInPageScroll className="px-6 pt-10 sm:px-12 sm:pt-14 xl:pt-[114px]">
          <div className="mx-auto max-w-[950px] space-y-4">
            <div className="h-12 w-2/3 animate-pulse rounded-xl bg-white/[0.05]" />
            <div className="h-64 animate-pulse rounded-2xl bg-white/[0.04]" />
          </div>
        </SignedInPageScroll>
        <JournalFooterNav />
      </div>
    );
  }

  return (
    <div className={`flex min-h-screen flex-col text-white ${FOOD_PAGE_BACKGROUND_CLASS}`}>
      <SignedInPageScroll
        reserveFooter={!showPreparationSummary}
        className={`px-6 pt-10 sm:px-12 sm:pt-14 xl:pt-[114px] ${showPreparationSummary ? 'flex flex-col' : ''}`}
      >
        {loadState === 'error' || !detail || !metadata ? (
          <div className="mx-auto max-w-[800px]">
            <p role="alert" className="rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error || 'Unable to load this Haul.'}
            </p>
            <button type="button" onClick={() => void load()} className="mt-4 rounded-full border border-white/20 px-5 py-2 text-sm font-semibold">
              Try again
            </button>
          </div>
        ) : isOwner && detail.haul.status === 'active' && !prepareView ? (
          <div className="mx-auto max-w-[950px] space-y-4">
            <div className="h-12 w-2/3 animate-pulse rounded-xl bg-white/[0.05]" />
            <p className="text-[14px] leading-[20.4px] text-white/50">Continue to Shopping View…</p>
          </div>
        ) : detail.haul.status !== 'planned' && !activePrepareView ? (
          <HistoricalHaul detail={detail} contributorNames={contributorNames} />
        ) : (
          <div className="mx-auto flex min-h-full w-full max-w-[1036px] flex-1 flex-col">
            <div className="w-full xl:max-w-[950px] xl:pl-[60px]">
            {activePrepareView && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
                <p>Pending items can be edited here. Return in-basket or skipped items to pending in Shopping View first.</p>
                <Link
                  href={APP_ROUTE_BUILDERS.foodHaulShop(haulId)}
                  className="font-semibold text-brand-50 hover:text-brand-50/80"
                >
                  Back to Shopping View
                </Link>
              </div>
            )}
            <header className="flex min-h-[113px] flex-col pb-[25px]">
              <p className="sr-only">Haul Builder</p>
              <div className="h-11 shrink-0">
                <FoodSectionViewSwitcher
                  currentView="hauls"
                  align="left"
                  anchorBackgroundClass="bg-[#17130f]"
                />
              </div>
              <h1 className="max-w-[890px] text-[32px] font-regular leading-tight text-brand-50 sm:text-[44px] sm:leading-[44px]">
                Prepare your next shopping trip
              </h1>
            </header>

            <section
              className="flex w-full flex-col items-stretch border-b border-white/25 sm:flex-row"
              aria-label="Haul builder controls"
            >
              {isOwner && !activePrepareView && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedListIds([]);
                    setAddListsError(null);
                    setAddListsOpen(true);
                  }}
                  disabled={addableSourceLists.length === 0}
                  className="flex min-h-11 min-w-0 flex-1 items-center justify-start px-0 text-left text-sm font-medium text-white/80 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Add lists ({detail.source_lists.length})
                </button>
              )}
              {isOwner && (
                <div className={`grid min-h-11 grid-cols-[minmax(0,163fr)_minmax(0,151fr)] items-stretch sm:basis-[35%] sm:min-w-[18rem] sm:max-w-[314px] ${activePrepareView ? 'sm:ml-auto' : ''}`}>
                  <div className="flex min-w-0 flex-1 items-stretch">
                    <span className="inline-flex min-w-0 flex-1 items-center justify-center rounded-tl-[12px] border border-b-0 border-white/25 px-3 text-[14.4px] font-semibold text-white/70">
                      {rosterStoreLabel}
                    </span>
                    <button
                      type="button"
                      disabled={!canManageStores}
                      title={canManageStores ? 'Manage Haul stores' : 'Stores can only be edited on Draft Hauls.'}
                      onClick={() => setStoresOpen(true)}
                      aria-label="Manage Haul stores"
                      className="inline-flex min-h-11 w-11 shrink-0 items-center justify-center rounded-tr-[12px] rounded-bl-none rounded-br-none border border-b-0 border-l-0 border-white/25 text-sm font-semibold text-white/80 disabled:cursor-not-allowed disabled:text-white/35"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={!canInvite}
                    title={canInvite ? 'Invite someone to this Haul' : 'People can only be invited while the Haul is a Draft.'}
                    onClick={() => setInviteOpen(true)}
                    className="inline-flex min-h-11 min-w-0 items-center justify-center rounded-t-[12px] rounded-b-none bg-brand-50 px-3 text-[14.4px] font-semibold text-[#16110d] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    + Invite to haul
                  </button>
                </div>
              )}
            </section>

            {autosaveError && (
              <div role="alert" className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                <span>{autosaveError}</span>
                <button type="button" onClick={() => setRetryAutosave((value) => value + 1)} className="font-semibold underline">
                  Retry
                </button>
              </div>
            )}
            {error && <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{error}</p>}
            {activationError && (
              <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                {activationError}
              </p>
            )}

            <section aria-label="Haul source lists">
              <div>
                {detail.source_lists.map((source) => {
                  const sourceItems = itemsBySource.get(source.grocery_list_id) ?? [];
                  const open = openSourceId === source.grocery_list_id;
                  const sourceEstimate = computeGroceryHaulPreparationEstimate(
                    detail.haul.currency,
                    sourceItems,
                  ).estimated_total;
                  return (
                    <div key={source.grocery_list_id} className="border-b border-white/15">
                      <button
                        ref={(node) => {
                          if (node) sourceHeaders.current.set(source.grocery_list_id, node);
                          else sourceHeaders.current.delete(source.grocery_list_id);
                        }}
                        type="button"
                        aria-expanded={open}
                        onClick={() => switchSource(source.grocery_list_id)}
                        className={`flex w-full items-center justify-between gap-4 text-left ${open ? 'min-h-[78px] py-4' : 'min-h-[85px] py-3'}`}
                      >
                        <span className="min-w-0 break-words">
                          <span className="block text-[20px] font-semibold leading-[27.2px] text-brand-50">{source.title?.trim() || 'Source List'}</span>
                          <span className="mt-1 block text-[11px] text-white/45">
                            {sourceItems.length} items · {formatHaulCurrency(sourceEstimate, detail.haul.currency)} estimated
                          </span>
                        </span>
                        {open ? <ChevronUp className="h-5 w-5 text-white/55" /> : <ChevronDown className="h-5 w-5 text-white/55" />}
                      </button>
                      {open && (
                        <div className="pb-2">
                          {sourceItems.length === 0 ? (
                            <p className="border-t border-white/10 px-0 py-5 text-sm text-white/45">No captured demand in this source snapshot.</p>
                          ) : sourceItems.map((item) => {
                            const excluded = item.final_quantity === 0;
                            const store = itemStoreLabel(item);
                            const haulCurrency = detail.haul.currency;
                            const priceIsCurrent = item.price_amount != null
                              && item.price_source != null
                              && item.price_currency === haulCurrency;
                            const productLabel = [item.brand_name, item.product_title].filter(Boolean).join(' · ');
                            return (
                              <article
                                key={item.id}
                                className={`relative py-7 pl-3 first:border-t first:border-white/15 ${excluded ? 'opacity-45' : ''}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0 flex-1 space-y-0.5 break-words">
                                    <h3 className="text-[20px] font-semibold leading-[27.2px] text-brand-50">{item.name_snapshot}</h3>
                                    <div>
                                      {item.product_title ? (
                                        <p className="text-[14px] leading-[20.4px] text-white/50">{productLabel}</p>
                                      ) : canEditPreparationItem(item) ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setChooseProductFirst(true);
                                            setEditingItem(item);
                                          }}
                                          className="text-sm font-semibold text-brand-50 underline-offset-2 hover:underline"
                                        >
                                          Choose Product
                                        </button>
                                      ) : (
                                        <p className="text-sm text-white/45">Product not set</p>
                                      )}
                                    </div>
                                    <p className="text-[14px] leading-[20.4px] text-white/50">
                                      {store ?? (item.product_title ? 'Store not set' : '—')}
                                    </p>
                                    <p className="text-[20px] font-semibold leading-[27.2px] text-white/50">
                                      {priceIsCurrent ? (
                                        formatHaulCurrency(item.price_amount!, item.price_currency ?? haulCurrency)
                                      ) : item.product_title && item.final_quantity > 0 ? (
                                        <span className="text-sm font-normal text-amber-100/70">Price needed</span>
                                      ) : (
                                        <span className="text-white/30">—</span>
                                      )}
                                    </p>
                                    <div className="inline-flex h-9 w-[110px] items-center rounded-full border border-white/20">
                                      {canEditPreparationItem(item) && (
                                        <button
                                          type="button"
                                          aria-label={`Decrease ${item.name_snapshot} final Haul quantity`}
                                          onClick={() => void changeQuantity(item, -1)}
                                          disabled={itemBusy === item.id}
                                          className="h-9 w-9 text-sm text-white/60 disabled:opacity-35"
                                        >
                                          −
                                        </button>
                                      )}
                                      <span className="min-w-9 flex-1 text-center text-[20px] font-semibold text-white/50" aria-label={`Final Haul quantity ${item.final_quantity}`}>
                                        {item.final_quantity}
                                      </span>
                                      {canEditPreparationItem(item) && (
                                        <button
                                          type="button"
                                          aria-label={`Increase ${item.name_snapshot} final Haul quantity`}
                                          onClick={() => void changeQuantity(item, 1)}
                                          disabled={itemBusy === item.id}
                                          className="h-9 w-9 text-sm text-white/60 disabled:opacity-35"
                                        >
                                          +
                                        </button>
                                      )}
                                    </div>
                                    {excluded && (
                                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">
                                        Excluded from estimate and shopping execution
                                      </p>
                                    )}
                                  </div>
                                  {canEditPreparationItem(item) && (
                                    <details className="relative shrink-0">
                                      <summary aria-label={`More actions for ${item.name_snapshot}`} className="cursor-pointer list-none px-1 py-1 text-lg tracking-widest text-white/65">
                                        •••
                                      </summary>
                                      <div className="absolute right-0 z-20 mt-1 w-28 rounded-xl border border-white/15 bg-[#2a2119] p-1 shadow-xl">
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open');
                                            setChooseProductFirst(false);
                                            setEditingItem(item);
                                          }}
                                          className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold hover:bg-white/[0.06]"
                                        >
                                          Edit
                                        </button>
                                      </div>
                                    </details>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-8 border-b border-white/15 pb-6" aria-label="Haul-only items">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-[20px] font-semibold text-brand-50">Added to Haul</h2>
                {canAddHaulOnlyItem && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingContributorItem(null);
                      setContributorItemOpen(true);
                    }}
                    className="rounded-full border border-white/25 px-4 py-2 text-xs font-semibold text-white/80"
                  >
                    Add item
                  </button>
                )}
              </div>
              {haulOnlyItems.length === 0 ? (
                <p className="mt-4 text-sm text-white/45">No Haul-only items yet.</p>
              ) : (
                <ul className="mt-4 divide-y divide-white/10">
                  {haulOnlyItems.map((item) => {
                    const attribution = haulContributorAttributionLabel(item, contributorNames);
                    const mutable = canEditPreparationItem(item);
                    const qtyLabel = [item.final_quantity, item.unit_snapshot].filter(Boolean).join(' ');
                    return (
                      <li key={item.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-brand-50">{item.name_snapshot}</p>
                          {attribution && <p className="mt-0.5 text-xs text-white/40">{attribution}</p>}
                          <p className="mt-1 text-sm text-white/50">{qtyLabel || '—'}</p>
                        </div>
                        {mutable && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={itemBusy === item.id}
                              onClick={() => {
                                setEditingContributorItem(item);
                                setContributorItemOpen(true);
                              }}
                              className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/80"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={itemBusy === item.id}
                              onClick={() => void removeHaulOnlyItem(item)}
                              className="rounded-full border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/80"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            </div>

            <section className={`mt-12 flex w-full max-w-[1036px] flex-1 flex-col rounded-t-[24px] border border-b-0 border-white/25 bg-transparent px-6 pt-8 xl:pl-[60px] xl:pr-[26px] ${SIGNED_IN_FOOTER_CLEARANCE_CLASS}`} aria-labelledby="shopping-summary-title" data-shopping-summary>
              <h2 id="shopping-summary-title" className="text-[20px] font-semibold text-brand-50">Shopping Summary</h2>
              {isOwner ? (
                <>
                  <label className="mt-4 block text-sm text-white/70">
                    <span className="sr-only">Haul name</span>
                    <input
                      value={metadata.title}
                      readOnly={metadataReadOnly}
                      onChange={(event) => setMetadata({ ...metadata, title: event.target.value })}
                      className="mt-1 w-full max-w-md border-0 border-b border-white/30 bg-transparent px-0 py-1 text-sm font-medium text-white/80 outline-none focus:border-white/60"
                    />
                  </label>
                  <div className="mt-4 space-y-2 text-sm text-white/70">
                    <label className="flex flex-wrap items-baseline gap-2">
                      <span className="text-white/50">Date:</span>
                      <input
                        type="date"
                        value={metadata.shoppingDate}
                        readOnly={metadataReadOnly}
                        onChange={(event) => setMetadata({ ...metadata, shoppingDate: event.target.value })}
                        className="min-w-0 flex-1 border-0 border-b border-white/30 bg-transparent px-0 py-0.5 text-sm text-white outline-none focus:border-white/60 max-w-[12rem]"
                      />
                    </label>
                    <label className="flex flex-wrap items-baseline gap-2">
                      <span className="text-white/50">Budget:</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={metadata.budgetAmount}
                        readOnly={metadataReadOnly}
                        onChange={(event) => setMetadata({ ...metadata, budgetAmount: event.target.value })}
                        placeholder="Optional"
                        className="min-w-0 flex-1 border-0 border-b border-white/30 bg-transparent px-0 py-0.5 text-sm text-white outline-none focus:border-white/60 max-w-[12rem]"
                      />
                    </label>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-white/70">
                  {metadata.title}
                  {' · '}
                  {formatHaulDate(metadata.shoppingDate)}
                </p>
              )}
              {detail.estimate.by_store.length > 0 && (
                <div className="mt-6 space-y-4 border-t border-white/15 pt-5">
                  {detail.estimate.by_store.map((store) => {
                    const counts = summarizeHaulStoreItems(
                      detail.items,
                      store.store_key,
                      detail.estimate.currency,
                    );
                    return (
                    <div key={store.store_key} className="border-l border-white/25 pl-4">
                      <p className="text-sm text-white/70">
                        {[store.retailer, store.store_location].filter(Boolean).join(' · ') || 'Store not set'}
                        {' · '}
                        {formatHaulCurrency(store.estimated_subtotal, detail.estimate.currency)}
                      </p>
                      <p className="mt-1 text-xs text-white/45">
                        {counts.itemCount} items · {counts.pricedCount} priced · {counts.unpricedCount} unpriced
                      </p>
                    </div>
                    );
                  })}
                </div>
              )}
              <p className="mt-6 text-[20px] font-semibold leading-[27.2px] text-brand-50">
                Haul Estimate · {formatHaulCurrency(detail.estimate.estimated_total, detail.estimate.currency)}
              </p>
              <p className="mt-2 text-xs text-white/45">
                {detail.estimate.execution_item_count > 0
                  ? `${Math.round((detail.estimate.priced_item_count / detail.estimate.execution_item_count) * 100)}% priced · `
                  : ''}
                Tax not included
              </p>
              {detail.haul.budget_amount != null && (
                <p className="mt-3 text-sm text-white/65">
                  Budget {formatHaulCurrency(detail.haul.budget_amount, detail.haul.currency)} ·{' '}
                  {detail.estimate.estimated_total <= detail.haul.budget_amount
                    ? `${formatHaulCurrency(detail.haul.budget_amount - detail.estimate.estimated_total, detail.haul.currency)} remaining`
                    : `${formatHaulCurrency(detail.estimate.estimated_total - detail.haul.budget_amount, detail.haul.currency)} over`}
                </p>
              )}
              {(detail.estimate.missing_product_count > 0 || detail.estimate.missing_store_count > 0) && (
                <p className="mt-6 rounded-xl border border-amber-300/15 bg-amber-300/[0.05] px-4 py-3 text-sm text-amber-100/75">
                  Review: {detail.estimate.missing_product_count} without a product · {detail.estimate.missing_store_count} without a store.
                </p>
              )}
              {activePrepareView ? (
                <div className="mt-6 flex w-full max-w-[880px] items-center gap-1.5">
                  <Link
                    href={APP_ROUTE_BUILDERS.foodHaulShop(haulId)}
                    className="inline-flex h-[37px] min-w-0 flex-1 max-w-[789px] items-center justify-center rounded-full bg-brand-50 px-3 max-sm:min-h-11 max-sm:h-auto max-sm:py-2 text-sm font-semibold text-[#16110d]"
                  >
                    Continue to Shopping View
                  </Link>
                  <span className="inline-flex h-[37px] w-[85px] max-sm:min-h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-[#16110d] opacity-40" aria-hidden>
                    •••
                  </span>
                </div>
              ) : isOwner ? (
                <div className="mt-6 flex w-full max-w-[880px] items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void requestShoppingView()}
                    disabled={activationBusy}
                    className="inline-flex h-[37px] min-w-0 flex-1 max-w-[789px] items-center justify-center rounded-full bg-brand-50 px-3 max-sm:min-h-11 max-sm:h-auto max-sm:py-2 text-sm font-semibold text-[#16110d] disabled:opacity-50"
                  >
                    {activationBusy ? 'Checking readiness…' : 'Open Shopping View'}
                  </button>
                  <span className="inline-flex h-[37px] w-[85px] max-sm:min-h-11 max-sm:w-11 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-[#16110d] opacity-40" aria-hidden>
                    •••
                  </span>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </SignedInPageScroll>
      <JournalFooterNav />

      {isOwner && (
        <HaulStoreManagementDialog
          open={storesOpen}
          haulId={haulId}
          stores={detail?.stores ?? []}
          items={detail?.items ?? []}
          onClose={() => setStoresOpen(false)}
          onChanged={reloadDetail}
        />
      )}

      {isOwner && (
        <HaulItemEditor
          haulId={haulId}
          haulCurrency={detail?.haul.currency ?? 'USD'}
          rosterStores={detail?.stores ?? []}
          item={editingItem}
          openInProductSearch={chooseProductFirst}
          onClose={() => {
            setChooseProductFirst(false);
            setEditingItem(null);
          }}
          onSaved={reloadDetail}
        />
      )}

      {isOwner && (
        <HaulInviteDialog
          open={inviteOpen}
          haulId={haulId}
          onClose={() => setInviteOpen(false)}
        />
      )}

      <HaulContributorItemDialog
        open={contributorItemOpen}
        haulId={haulId}
        item={editingContributorItem}
        onClose={() => {
          setContributorItemOpen(false);
          setEditingContributorItem(null);
        }}
        onSaved={reloadDetail}
      />

      <HaulExecutionReadinessDialog
        open={readinessOpen}
        readiness={readiness}
        items={detail?.items ?? []}
        starting={activationBusy}
        onClose={() => setReadinessOpen(false)}
        onContinue={continueFromReadiness}
      />

      {isOwner && (
      <ItemManagementDialog
        open={addListsOpen}
        onClose={() => setAddListsOpen(false)}
        labelledBy="add-lists-title"
        busy={addingLists}
        shell="create-resource"
        footer={(
          <CreateResourceDialogFooter
            primaryLabel={addingLists ? 'Adding…' : 'Add Lists'}
            onPrimary={() => void addSelectedLists()}
            primaryDisabled={selectedListIds.length === 0}
            primaryBusy={addingLists}
            onSecondary={() => setAddListsOpen(false)}
            secondaryDisabled={addingLists}
          />
        )}
      >
        <h2 id="add-lists-title" className="text-2xl font-semibold text-white">Add source Lists</h2>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
          <input
            type="search"
            value={addListQuery}
            onChange={(event) => setAddListQuery(event.target.value)}
            placeholder="Search Lists"
            aria-label="Search Lists"
            className="min-h-11 w-full rounded-full border border-white/20 bg-transparent pl-10 pr-4 text-base outline-none focus:border-white/60 sm:text-xl"
          />
        </div>
        <div className="mt-3">
          <HaulSourceListPicker
            lists={lists}
            summaries={persistentListSummaries}
            defaultListId={defaultListId}
            selectedIds={selectedListIds}
            onToggle={(listId) => setSelectedListIds((current) =>
              current.includes(listId)
                ? current.filter((id) => id !== listId)
                : [...current, listId],
            )}
            searchQuery={addListQuery}
            excludeListIds={Array.from(memberIds)}
            emptyMessage="No additional active Lists with pending demand found."
          />
        </div>
        {addListsError && <p role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">{addListsError}</p>}
      </ItemManagementDialog>
      )}
    </div>
  );
}
