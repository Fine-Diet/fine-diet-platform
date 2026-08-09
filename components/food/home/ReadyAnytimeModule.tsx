'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { StackedPageSection } from '@/components/layout/StackedPageSection';
import { FoodHomeColumn } from '@/components/food/home/FoodHomeColumn';
import type { MakeListHandler, ReadyAnytimeViewModel } from '@/lib/food/home/types';
import { APP_ROUTE_BUILDERS } from '@/lib/routes/appRoutes';
import { cn } from '@/lib/utils';

function toDisplayDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${month}/${day}/${year}`;
}

export function ReadyAnytimeModule({
  model,
  onMakeList,
}: {
  model: ReadyAnytimeViewModel;
  onMakeList: MakeListHandler;
}) {
  const [startDate, setStartDate] = useState(model.startDate);
  const [endDate, setEndDate] = useState(model.endDate);
  const [status, setStatus] = useState(model.status);
  const [message, setMessage] = useState(model.message ?? null);
  const [errorMessage, setErrorMessage] = useState(model.errorMessage ?? null);
  const [successListId, setSuccessListId] = useState(model.successListId ?? null);

  useEffect(() => {
    setStartDate(model.startDate);
    setEndDate(model.endDate);
    setStatus(model.status);
    setMessage(model.message ?? null);
    setErrorMessage(model.errorMessage ?? null);
    setSuccessListId(model.successListId ?? null);
  }, [model]);

  const rangeInvalid = useMemo(() => startDate > endDate, [startDate, endDate]);

  const submitDisabled =
    status === 'submitting' ||
    !model.hasActivePlan ||
    rangeInvalid ||
    status === 'no_active_plan';

  async function handleSubmit() {
    if (submitDisabled) return;
    if (rangeInvalid) {
      setStatus('invalid_range');
      setMessage('Start date cannot be after end date.');
      return;
    }
    setStatus('submitting');
    setMessage(null);
    setErrorMessage(null);
    const result = await onMakeList({ startDate, endDate });
    if (!result.ok) {
      setStatus(result.status ?? 'error');
      setErrorMessage(result.errorMessage ?? 'Could not create this grocery list.');
      setMessage(result.message ?? null);
      return;
    }
    setStatus('success');
    setSuccessListId(result.listId ?? null);
    setMessage(result.message ?? 'List ready.');
  }

  return (
    <StackedPageSection
      layer={2}
      className="bg-[#16110d] px-12 pb-28 pt-10 sm:px-12 sm:pb-32 sm:pt-12"
      contentClassName="max-w-none"
    >
      <FoodHomeColumn>
        <p className="text-regular font-regular text-white antialiased text-white/50">Ready Anytime</p>
        <h2 className="mt-1 text-4xl font-regular leading-[1] tracking-tight text-white antialiased md:text-4xl">
          Create a list for a full grocery haul or quick pickup
        </h2>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <DateControl
            label="Start"
            value={startDate}
            display={toDisplayDate(startDate)}
            disabled={status === 'submitting' || !model.hasActivePlan}
            onChange={(value) => {
              setStartDate(value);
              setStatus('idle');
              setMessage(null);
              setErrorMessage(null);
              setSuccessListId(null);
            }}
          />
          <DateControl
            label="End"
            value={endDate}
            display={toDisplayDate(endDate)}
            disabled={status === 'submitting' || !model.hasActivePlan}
            onChange={(value) => {
              setEndDate(value);
              setStatus('idle');
              setMessage(null);
              setErrorMessage(null);
              setSuccessListId(null);
            }}
          />
          <button
            type="button"
            disabled={submitDisabled}
            onClick={() => void handleSubmit()}
            className={cn(
              'inline-flex items-center justify-center rounded-full bg-denim-500 px-6 py-2.5 text-base font-semibold text-neutral-900 antialiased',
              'transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            {status === 'submitting' ? 'Making list…' : 'Make List'}
          </button>
        </div>

        {(rangeInvalid || status === 'invalid_range') && (
          <p className="mt-4 text-sm text-semantic-error antialiased" role="alert">
            {message ?? 'Start date cannot be after end date.'}
          </p>
        )}

        {status === 'no_active_plan' && (
          <p className="mt-4 text-sm text-white/55 antialiased">
            {message ?? 'Activate a plan to generate a grocery list from planned meals.'}
          </p>
        )}

        {status === 'no_meals_in_range' && (
          <p className="mt-4 text-sm text-white/55 antialiased">
            {message ?? 'Nothing is planned in this range.'}
          </p>
        )}

        {status === 'error' && (
          <p className="mt-4 text-sm text-semantic-error antialiased" role="alert">
            {errorMessage ?? 'Could not prepare this grocery list. Try again.'}
          </p>
        )}

        {status === 'success' && successListId && (
          <div className="mt-5 rounded-[20px] border border-white/15 bg-white/[0.04] px-4 py-3">
            <p className="text-sm text-white/80 antialiased">{message ?? 'List ready.'}</p>
            <Link
              href={APP_ROUTE_BUILDERS.foodGroceryList(successListId)}
              className="mt-2 inline-block text-sm font-semibold text-denim-300 hover:text-denim-100"
            >
              Open grocery list →
            </Link>
          </div>
        )}
      </FoodHomeColumn>
    </StackedPageSection>
  );
}

function DateControl({
  label,
  value,
  display,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  display: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label
      className={cn(
        'relative inline-flex min-w-[9.5rem] items-center gap-2 rounded-full border border-white/30 bg-transparent px-4 py-2.5',
        disabled && 'opacity-50',
      )}
    >
      <span className="text-sm text-white/50 antialiased">{label}</span>
      <span className="text-sm text-white antialiased">{display}</span>
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        aria-label={label}
      />
    </label>
  );
}
