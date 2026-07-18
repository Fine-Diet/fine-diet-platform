/**
 * Admin Support: Planning/Grocery Snapshot
 *
 * Packet 60 read-only UI over Packet 59's snapshot endpoint. This page does
 * not query Supabase directly and does not expose planning/grocery mutations.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type { PlanningGrocerySupportSnapshot } from '@/lib/admin/planningSupportSnapshotService';

interface Props {
  user: AuthenticatedUser | null;
  initialPersonId: string | null;
}

type Snapshot = PlanningGrocerySupportSnapshot;
type StorageBucket = Snapshot['storage_summary']['reusable_day_templates'];
type StorageSource = 'table_direct' | 'legacy_metadata' | 'unknown';
type DayTemplateRow = Snapshot['reusable_planning']['day_templates'][number];
type WeekPatternRow = Snapshot['reusable_planning']['week_patterns'][number];
type PantryRow = Snapshot['grocery_state']['pantry_on_hand_items'][number];
type ResolutionRow = Snapshot['grocery_state']['ingredient_resolutions'][number];
type PlanRow = Snapshot['active_planning']['plans'][number];
type PlannedMealRow = Snapshot['active_planning']['recent_planned_meals'][number];
type GroceryListRow = Snapshot['grocery_lists'][number];
type GroceryItemRow = GroceryListRow['items'][number];

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function shortId(value: string | null | undefined): string {
  if (!value) return '-';
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function formatFoodLabel(food: { canonical_name: string | null; brand_name: string | null } | null): string {
  if (!food) return '-';
  return [food.brand_name, food.canonical_name].filter(Boolean).join(' - ') || '-';
}

function sourceBadgeClasses(source: StorageSource): string {
  if (source === 'legacy_metadata') return 'bg-amber-50 border-amber-200 text-amber-800';
  if (source === 'table_direct') return 'bg-emerald-50 border-emerald-200 text-emerald-800';
  return 'bg-gray-50 border-gray-200 text-gray-700';
}

function StorageBadge({ source }: { source: StorageSource }) {
  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${sourceBadgeClasses(source)}`}>
      {source}
    </span>
  );
}

function StatusBadge({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: 'gray' | 'green' | 'amber' | 'red' | 'blue';
}) {
  const classes = {
    gray: 'bg-gray-50 border-gray-200 text-gray-700',
    green: 'bg-green-50 border-green-200 text-green-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    red: 'bg-red-50 border-red-200 text-red-800',
    blue: 'bg-blue-50 border-blue-200 text-blue-800',
  }[tone];

  return (
    <span className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${classes}`}>
      {children}
    </span>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-600">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-500">
      {label}
    </div>
  );
}

function StorageSummaryCard({
  title,
  bucket,
}: {
  title: string;
  bucket: StorageBucket;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <span className="rounded bg-white px-2 py-1 text-xs font-medium text-gray-700">
          total {bucket.total}
        </span>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-gray-500">table_direct</dt>
          <dd className="mt-1 font-semibold text-emerald-700">{bucket.table_direct}</dd>
        </div>
        <div>
          <dt className="text-gray-500">legacy_metadata</dt>
          <dd className="mt-1 font-semibold text-amber-700">{bucket.legacy_metadata}</dd>
        </div>
        <div>
          <dt className="text-gray-500">unknown</dt>
          <dd className="mt-1 font-semibold text-gray-700">{bucket.unknown}</dd>
        </div>
      </dl>
    </div>
  );
}

function IdBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs text-gray-800">{value}</dd>
    </div>
  );
}

function ReusableProvenanceBlock({
  provenance,
}: {
  provenance: PlannedMealRow['reusable_provenance'];
}) {
  if (!provenance) {
    return <span className="text-xs text-gray-400">None</span>;
  }

  return (
    <div className="rounded border border-blue-100 bg-blue-50 p-2 text-xs text-blue-900">
      <div className="font-semibold">{provenance.kind.replace(/_/g, ' ')}</div>
      <div>{provenance.name ?? 'Unnamed reusable source'}</div>
      <div className="mt-1 font-mono text-[11px] text-blue-700">{provenance.id}</div>
      <div className="mt-1 text-blue-700">
        Source meal {shortId(provenance.source_planned_meal_id)} on {provenance.source_date_local}
      </div>
    </div>
  );
}

function Overview({ snapshot }: { snapshot: Snapshot }) {
  const { person, storage_summary: storage } = snapshot;
  return (
    <div className="space-y-5">
      <Section title="Snapshot Overview" description="Read-only support view over authoritative planning and grocery tables.">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 lg:col-span-1">
            <h3 className="text-sm font-semibold text-gray-900">Person</h3>
            <dl className="mt-3 space-y-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Name</dt>
                <dd className="mt-1 text-sm text-gray-900">{person.name ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Email</dt>
                <dd className="mt-1 text-sm text-gray-900">{person.email ?? '-'}</dd>
              </div>
              <IdBlock label="Person ID" value={person.id} />
              <IdBlock label="Auth user ID" value={person.auth_user_id} />
              <div>
                <dt className="text-xs uppercase tracking-wide text-gray-500">Status</dt>
                <dd className="mt-1 text-sm text-gray-900">{person.status ?? '-'}</dd>
              </div>
            </dl>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:col-span-2">
            <StorageSummaryCard title="Reusable day templates" bucket={storage.reusable_day_templates} />
            <StorageSummaryCard title="Reusable week patterns" bucket={storage.reusable_week_patterns} />
            <StorageSummaryCard title="Pantry/on-hand items" bucket={storage.pantry_on_hand_items} />
            <StorageSummaryCard title="Grocery ingredient resolutions" bucket={storage.grocery_ingredient_resolutions} />
          </div>
        </div>
      </Section>

      {snapshot.warnings.length > 0 && (
        <Section title="Warnings" description="Inspectability notes surfaced by the Packet 59 snapshot service.">
          <ul className="space-y-2">
            {snapshot.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`} className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {warning}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function ReusablePlanning({ snapshot }: { snapshot: Snapshot }) {
  const dayTemplates = snapshot.reusable_planning.day_templates;
  const weekPatterns = snapshot.reusable_planning.week_patterns;

  return (
    <Section title="Reusable Planning" description="Compact summaries from table-backed reusable planning state.">
      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Day templates ({dayTemplates.length})
          </h3>
          {dayTemplates.length === 0 ? (
            <EmptyState label="No reusable day templates found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Template</th>
                    <th className="py-2 pr-3">Counts</th>
                    <th className="py-2 pr-3">Storage</th>
                    <th className="py-2 pr-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {dayTemplates.map((row: DayTemplateRow) => (
                    <tr key={row.id} className="border-t border-gray-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{row.name}</div>
                        <div className="mt-1 font-mono text-xs text-gray-500">{row.id}</div>
                        <div className="mt-1 text-xs text-gray-500">source day {shortId(row.source_plan_day_id)}</div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-700">
                        <div>{row.slots_count} slots</div>
                        <div>{row.meals_count} meals</div>
                        <div>{row.unassigned_meals_count} unassigned</div>
                      </td>
                      <td className="py-2 pr-3">
                        <StorageBadge source={row.storage_source} />
                        <div className="mt-1 text-xs text-gray-500">
                          backfilled {formatTimestamp(row.legacy_metadata_backfilled_at)}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">
                        <div>{formatTimestamp(row.updated_at)}</div>
                        <div className="text-gray-400">created {formatTimestamp(row.created_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Week patterns ({weekPatterns.length})
          </h3>
          {weekPatterns.length === 0 ? (
            <EmptyState label="No reusable week patterns found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Pattern</th>
                    <th className="py-2 pr-3">Counts</th>
                    <th className="py-2 pr-3">Storage</th>
                    <th className="py-2 pr-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {weekPatterns.map((row: WeekPatternRow) => (
                    <tr key={row.id} className="border-t border-gray-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{row.name}</div>
                        <div className="mt-1 font-mono text-xs text-gray-500">{row.id}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {row.source_date_start && row.source_date_end
                            ? `${row.source_date_start} to ${row.source_date_end}`
                            : 'Blank pattern (no calendar anchor)'}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-700">
                        <div>{row.days_count} days</div>
                        <div>{row.slots_count} slots</div>
                        <div>{row.meals_count} meals</div>
                      </td>
                      <td className="py-2 pr-3">
                        <StorageBadge source={row.storage_source} />
                        <div className="mt-1 text-xs text-gray-500">
                          backfilled {formatTimestamp(row.legacy_metadata_backfilled_at)}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">
                        <div>{formatTimestamp(row.updated_at)}</div>
                        <div className="text-gray-400">created {formatTimestamp(row.created_at)}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function GroceryState({ snapshot }: { snapshot: Snapshot }) {
  const pantryRows = snapshot.grocery_state.pantry_on_hand_items;
  const resolutionRows = snapshot.grocery_state.ingredient_resolutions;

  return (
    <Section title="Grocery-State Learning" description="Table-backed pantry/on-hand items and grocery ingredient resolutions.">
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Pantry/on-hand items ({pantryRows.length})
          </h3>
          {pantryRows.length === 0 ? (
            <EmptyState label="No pantry/on-hand items found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Amount</th>
                    <th className="py-2 pr-3">Linked food</th>
                    <th className="py-2 pr-3">Storage</th>
                    <th className="py-2 pr-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {pantryRows.map((row: PantryRow) => (
                    <tr key={row.id} className="border-t border-gray-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{row.name}</div>
                        <div className="mt-1 font-mono text-xs text-gray-500">{row.key}</div>
                      </td>
                      <td className="py-2 pr-3 text-gray-700">
                        {row.quantity ?? '-'} {row.unit ?? ''}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-700">
                        <div>{formatFoodLabel(row.food)}</div>
                        <div className="mt-1 font-mono text-gray-500">{shortId(row.food_object_id)}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <StorageBadge source={row.storage_source} />
                        <div className="mt-1 text-xs text-gray-500">
                          backfilled {formatTimestamp(row.legacy_metadata_backfilled_at)}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{formatTimestamp(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Ingredient resolutions ({resolutionRows.length})
          </h3>
          {resolutionRows.length === 0 ? (
            <EmptyState label="No grocery ingredient resolutions found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Original</th>
                    <th className="py-2 pr-3">Canonical mapping</th>
                    <th className="py-2 pr-3">Storage</th>
                    <th className="py-2 pr-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {resolutionRows.map((row: ResolutionRow) => (
                    <tr key={row.id} className="border-t border-gray-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{row.raw_name}</div>
                        <div className="mt-1 text-xs text-gray-500">unit {row.unit ?? '-'}</div>
                        <div className="mt-1 font-mono text-xs text-gray-500">{row.key}</div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-700">
                        <div className="font-medium text-gray-900">{row.canonical_name}</div>
                        <div>{formatFoodLabel(row.food)}</div>
                        <div className="mt-1 font-mono text-gray-500">{shortId(row.food_object_id)}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <StorageBadge source={row.storage_source} />
                        <div className="mt-1 text-xs text-gray-500">
                          backfilled {formatTimestamp(row.legacy_metadata_backfilled_at)}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{formatTimestamp(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function ActivePlanning({ snapshot }: { snapshot: Snapshot }) {
  const plans = snapshot.active_planning.plans;
  const meals = snapshot.active_planning.recent_planned_meals;

  return (
    <Section title="Active / Recent Planning" description="Recent plans and planned meals, preserving import ancestry separately from reusable provenance.">
      <div className="space-y-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">Plans ({plans.length})</h3>
          {plans.length === 0 ? (
            <EmptyState label="No recent plans found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Plan</th>
                    <th className="py-2 pr-3">Shape/source</th>
                    <th className="py-2 pr-3">Dates</th>
                    <th className="py-2 pr-3">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((row: PlanRow) => (
                    <tr key={row.id} className="border-t border-gray-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{row.title ?? 'Untitled plan'}</div>
                        <div className="mt-1 font-mono text-xs text-gray-500">{row.id}</div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-700">
                        <div>{row.plan_shape}</div>
                        <div>{row.source}</div>
                        <StatusBadge tone={row.status === 'active' ? 'green' : 'gray'}>{row.status}</StatusBadge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-700">
                        {row.start_date} to {row.end_date ?? '-'}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-600">{formatTimestamp(row.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-900">
            Recent planned meals ({meals.length})
          </h3>
          {meals.length === 0 ? (
            <EmptyState label="No recent planned meals found." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="py-2 pr-3">Meal</th>
                    <th className="py-2 pr-3">Execution</th>
                    <th className="py-2 pr-3">Import ancestry</th>
                    <th className="py-2 pr-3">Reusable provenance</th>
                  </tr>
                </thead>
                <tbody>
                  {meals.map((row: PlannedMealRow) => (
                    <tr key={row.id} className="border-t border-gray-100 align-top">
                      <td className="py-2 pr-3">
                        <div className="font-medium text-gray-900">{row.name ?? 'Unnamed meal'}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {row.meal_type} · slot {shortId(row.plan_slot_id)} · day {shortId(row.plan_day_id)}
                        </div>
                        <div className="mt-1 font-mono text-xs text-gray-500">{row.id}</div>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="mb-1">
                          <StatusBadge tone={row.execution_state === 'pending' ? 'blue' : 'gray'}>
                            {row.execution_state}
                          </StatusBadge>
                        </div>
                        <StatusBadge tone={row.active_grocery_demand ? 'green' : 'gray'}>
                          {row.active_grocery_demand ? 'active demand' : 'handled / inactive demand'}
                        </StatusBadge>
                        <div className="mt-1 text-xs text-gray-500">
                          journal {shortId(row.journal_entry_id)}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        <div className="rounded border border-gray-200 bg-gray-50 p-2">
                          <div className="text-gray-500">source_imported_meal_id</div>
                          <div className="mt-1 break-all font-mono text-gray-800">
                            {row.source_imported_meal_id ?? '-'}
                          </div>
                          <div className="mt-2 text-gray-500">source_template_id</div>
                          <div className="mt-1 break-all font-mono text-gray-800">
                            {row.source_template_id ?? '-'}
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <ReusableProvenanceBlock provenance={row.reusable_provenance} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function GroceryItemCard({ item }: { item: GroceryItemRow }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-medium text-gray-900">{item.name}</div>
          <div className="mt-1 font-mono text-xs text-gray-500">{item.id}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge tone={item.grounded ? 'green' : 'amber'}>
            {item.grounded ? 'grounded' : 'unresolved'}
          </StatusBadge>
          <StatusBadge>{item.status}</StatusBadge>
        </div>
      </div>
      <dl className="mt-3 grid gap-3 text-xs md:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-gray-500">Required amount</dt>
          <dd className="mt-1 font-medium text-gray-900">{item.required.label}</dd>
        </div>
        <div>
          <dt className="text-gray-500">On hand</dt>
          <dd className="mt-1 font-medium text-gray-900">{item.on_hand?.label ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Still to buy</dt>
          <dd className="mt-1 font-medium text-gray-900">
            {item.still_to_buy.label ?? item.still_to_buy.note ?? '-'}
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">Buy suggestion</dt>
          <dd className="mt-1 font-medium text-gray-900">{item.buy_suggestion ?? '-'}</dd>
        </div>
      </dl>
      {(item.review_notes.length > 0 || item.source_planned_meal_ids.length > 0) && (
        <div className="mt-3 grid gap-3 text-xs md:grid-cols-2">
          <div>
            <div className="text-gray-500">Review notes</div>
            {item.review_notes.length === 0 ? (
              <div className="mt-1 text-gray-400">-</div>
            ) : (
              <ul className="mt-1 list-inside list-disc text-gray-700">
                {item.review_notes.map((note, index) => (
                  <li key={`${note}-${index}`}>{note}</li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-gray-500">Source planned meal IDs</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {item.source_planned_meal_ids.map((id) => (
                <span key={id} className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-gray-700">
                  {shortId(id)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GroceryLists({ snapshot }: { snapshot: Snapshot }) {
  const lists = snapshot.grocery_lists;

  return (
    <Section title="Grocery Lists and Items" description="Displayed from Packet 59 snapshot read-model fields; no grocery truth is recomputed here.">
      {lists.length === 0 ? (
        <EmptyState label="No generated grocery lists found." />
      ) : (
        <div className="space-y-4">
          {lists.map((list: GroceryListRow) => (
            <div key={list.id} className="rounded-lg border border-gray-200 p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{list.title ?? 'Untitled grocery list'}</h3>
                  <div className="mt-1 font-mono text-xs text-gray-500">{list.id}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    scope {list.date_range_start ?? '-'} to {list.date_range_end ?? '-'} · plan {shortId(list.plan_id)}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-600">
                  <div>{list.items_count} items · {list.unresolved_items_count} unresolved</div>
                  <div>{list.mode} · {list.status}</div>
                  <div>updated {formatTimestamp(list.updated_at)}</div>
                </div>
              </div>
              {list.items.length === 0 ? (
                <EmptyState label="This grocery list has no items." />
              ) : (
                <div className="grid gap-3">
                  {list.items.map((item: GroceryItemRow) => (
                    <GroceryItemCard key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export default function PlanningGrocerySupportPage({ user, initialPersonId }: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState(initialPersonId ?? '');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoLoadedPersonIdRef = useRef<string | null>(null);

  const currentUrlPersonId =
    typeof router.query.person_id === 'string' ? router.query.person_id : '';
  const routePersonId = currentUrlPersonId || initialPersonId || '';

  const loadSnapshot = useCallback(
    async (requestedPersonId: string, options: { syncUrl?: boolean } = {}) => {
      const trimmed = requestedPersonId.trim();
      if (!trimmed) {
        setSnapshot(null);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/admin/support/planning-grocery-snapshot?person_id=${encodeURIComponent(trimmed)}`,
        );
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? 'Failed to load planning/grocery snapshot.');
        }
        setSnapshot(body as Snapshot);
        if (options.syncUrl) {
          autoLoadedPersonIdRef.current = trimmed;
        }
        if (options.syncUrl && currentUrlPersonId !== trimmed) {
          void router.replace(
            {
              pathname: router.pathname,
              query: { person_id: trimmed },
            },
            undefined,
            { shallow: true },
          );
        }
      } catch (err) {
        setSnapshot(null);
        setError(err instanceof Error ? err.message : 'Failed to load planning/grocery snapshot.');
      } finally {
        setLoading(false);
      }
    },
    [currentUrlPersonId, router.pathname, router.replace],
  );

  useEffect(() => {
    if (!routePersonId || autoLoadedPersonIdRef.current === routePersonId) return;
    autoLoadedPersonIdRef.current = routePersonId;
    setPersonId(routePersonId);
    void loadSnapshot(routePersonId, { syncUrl: false });
  }, [loadSnapshot, routePersonId]);

  const sectionCounts = useMemo(() => {
    if (!snapshot) return null;
    return {
      dayTemplates: snapshot.reusable_planning.day_templates.length,
      weekPatterns: snapshot.reusable_planning.week_patterns.length,
      pantry: snapshot.grocery_state.pantry_on_hand_items.length,
      resolutions: snapshot.grocery_state.ingredient_resolutions.length,
      plans: snapshot.active_planning.plans.length,
      meals: snapshot.active_planning.recent_planned_meals.length,
      groceryLists: snapshot.grocery_lists.length,
    };
  }, [snapshot]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadSnapshot(personId, { syncUrl: true });
  }

  if (!user || user.role !== 'admin') {
    return (
      <>
        <Head>
          <title>Planning/Grocery Support · Fine Diet Admin</title>
        </Head>
        <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
          <div className="max-w-md text-center">
            <h1 className="mb-4 text-3xl font-bold text-gray-900">Access Denied</h1>
            <p className="mb-8 text-lg text-gray-600">
              Only administrators can inspect planning/grocery support snapshots.
            </p>
            <Link href="/admin" className="inline-block rounded-md bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700">
              Return to Admin Dashboard
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Planning/Grocery Support · Fine Diet Admin</title>
      </Head>
      <div className="min-h-screen bg-gray-100 pt-[100px] pb-12">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="mb-6">
            <Link href="/admin" className="mb-4 inline-flex text-sm text-gray-600 hover:text-gray-900">
              Back to Admin Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Planning/Grocery Support</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Read-only inspection over Packet 59 snapshot data. This page calls the admin snapshot
              endpoint and displays authoritative table-backed state without mutation controls.
            </p>
            <p className="mt-2 text-xs text-gray-500">
              Signed in as <span className="font-medium text-gray-700">{user.email ?? 'Unknown'}</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <label htmlFor="person_id" className="block text-sm font-medium text-gray-700">
              Person ID
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <input
                id="person_id"
                type="text"
                value={personId}
                onChange={(event) => setPersonId(event.target.value)}
                placeholder="Paste a person UUID..."
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={loading || !personId.trim()}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Loading...' : 'Load snapshot'}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              The only network call from this page is the read-only Packet 59 snapshot endpoint.
            </p>
          </form>

          {error && (
            <div
              role="alert"
              className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
            >
              {error}
            </div>
          )}

          {loading && (
            <div className="mb-6 rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 shadow-sm">
              Loading planning/grocery snapshot...
            </div>
          )}

          {!loading && !snapshot && !error && (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">No snapshot loaded</h2>
              <p className="mt-2 text-sm text-gray-600">
                Enter a person ID to inspect reusable planning, pantry/on-hand, grocery resolutions,
                recent planning, and grocery list state.
              </p>
            </div>
          )}

          {snapshot && (
            <div className="space-y-6">
              {sectionCounts && (
                <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm shadow-sm md:grid-cols-4 lg:grid-cols-7">
                  <div><span className="font-semibold">{sectionCounts.dayTemplates}</span> day templates</div>
                  <div><span className="font-semibold">{sectionCounts.weekPatterns}</span> week patterns</div>
                  <div><span className="font-semibold">{sectionCounts.pantry}</span> pantry rows</div>
                  <div><span className="font-semibold">{sectionCounts.resolutions}</span> resolutions</div>
                  <div><span className="font-semibold">{sectionCounts.plans}</span> plans</div>
                  <div><span className="font-semibold">{sectionCounts.meals}</span> meals</div>
                  <div><span className="font-semibold">{sectionCounts.groceryLists}</span> grocery lists</div>
                </div>
              )}
              <Overview snapshot={snapshot} />
              <ReusablePlanning snapshot={snapshot} />
              <GroceryState snapshot={snapshot} />
              <ActivePlanning snapshot={snapshot} />
              <GroceryLists snapshot={snapshot} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/support/planning-grocery',
        permanent: false,
      },
    };
  }
  if (user.role !== 'admin') {
    return {
      redirect: {
        destination: '/admin/unauthorized',
        permanent: false,
      },
    };
  }

  const initialPersonId =
    typeof context.query.person_id === 'string' && context.query.person_id
      ? context.query.person_id
      : null;

  return {
    props: {
      user,
      initialPersonId,
    },
  };
};
