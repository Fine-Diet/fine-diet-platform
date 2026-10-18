'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  completeProgramDay,
  displayObservation,
  fetchProgramDayCompletion,
  fetchProgramDayObservation,
  writeProgramDayObservation,
  type MemberDayInteractionError,
  type MemberObservationTarget,
  type ProgramDayCompletionRecord,
} from '@/lib/programs/memberDayInteractionClient';

const DRAFT_DELAY_MS = 400;

interface MemberDayInteractionProps {
  enrollmentId: string;
  versionId: string;
  day: number;
  writable: boolean;
  readOnlyReason: string | null;
  observation: MemberObservationTarget | null;
  checkinRequired: boolean;
  checkinHandled: boolean;
}

function errorMessage(error: unknown): MemberDayInteractionError {
  if (error && typeof error === 'object' && 'message' in error) {
    const coded = error as MemberDayInteractionError;
    return {
      status: coded.status ?? 0,
      message: coded.message,
      code: coded.code,
    };
  }
  return { status: 0, message: 'The Program day request failed.' };
}

export function MemberDayInteraction({
  enrollmentId,
  versionId,
  day,
  writable,
  readOnlyReason,
  observation,
  checkinRequired,
  checkinHandled,
}: MemberDayInteractionProps) {
  const [editorText, setEditorText] = useState('');
  const [savedResponse, setSavedResponse] = useState<string | null>(null);
  const [persistedDraft, setPersistedDraft] = useState('');
  const [completion, setCompletion] = useState<ProgramDayCompletionRecord | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<'draft' | 'save' | 'complete' | null>(null);
  const [error, setError] = useState<MemberDayInteractionError | null>(null);
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [draftAttempt, setDraftAttempt] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  useEffect(() => {
    const generation = ++requestGeneration.current;
    const current = () => requestGeneration.current === generation;
    setLoaded(false);
    setError(null);
    setRetry(null);
    setCompletion(null);
    setEditorText('');
    setSavedResponse(null);
    setPersistedDraft('');
    setDraftAttempt(null);
    const identity = { enrollmentId, versionId, day, contentKey: observation?.contentKey };
    void (async () => {
      try {
        const [completionRecord, observationRecord] = await Promise.all([
          fetchProgramDayCompletion(identity),
          observation
            ? fetchProgramDayObservation({ ...identity, contentKey: observation.contentKey })
            : Promise.resolve(null),
        ]);
        if (!current()) return;
        setCompletion(completionRecord);
        if (observationRecord) {
          const display = displayObservation(observationRecord);
          setEditorText(display.editorText);
          setSavedResponse(display.savedResponse);
          setPersistedDraft(display.editorText);
        }
        setLoaded(true);
      } catch (err) {
        if (!current()) return;
        setError(errorMessage(err));
        setRetry(() => () => setReloadKey((value) => value + 1));
        setLoaded(true);
      }
    })();
  }, [enrollmentId, versionId, day, observation?.contentKey, reloadKey]);

  useEffect(() => {
    if (!loaded || !writable || !observation || editorText === persistedDraft || editorText === draftAttempt || pending) return undefined;
    const generation = requestGeneration.current;
    const handle = window.setTimeout(() => {
      void (async () => {
        setPending('draft');
        try {
          const saved = await writeProgramDayObservation(
            { enrollmentId, versionId, day, contentKey: observation.contentKey },
            editorText,
            'draft',
          );
          if (requestGeneration.current !== generation) return;
          const display = displayObservation(saved);
          setPersistedDraft(editorText);
          setDraftAttempt(editorText);
          setSavedResponse(display.savedResponse);
          setError(null);
          setRetry(null);
        } catch (err) {
          if (requestGeneration.current !== generation) return;
          const failure = errorMessage(err);
          setError(failure);
          setDraftAttempt(editorText);
          setRetry(() => () => setDraftAttempt(null));
        } finally {
          if (requestGeneration.current === generation) setPending(null);
        }
      })();
    }, DRAFT_DELAY_MS);
    return () => window.clearTimeout(handle);
  }, [day, draftAttempt, editorText, enrollmentId, loaded, observation, pending, persistedDraft, versionId, writable]);

  async function saveExplicitly() {
    if (!observation || !writable) return;
    const generation = requestGeneration.current;
    setPending('save');
    setError(null);
    try {
      const saved = await writeProgramDayObservation(
        { enrollmentId, versionId, day, contentKey: observation.contentKey },
        editorText,
        'save',
      );
      if (requestGeneration.current !== generation) return;
      const display = displayObservation({ ...saved, draft_text: saved.draft_text || editorText });
      setEditorText(display.editorText);
      setPersistedDraft(display.editorText);
      setSavedResponse(display.savedResponse);
      setRetry(null);
    } catch (err) {
      if (requestGeneration.current !== generation) return;
      setError(errorMessage(err));
      setRetry(() => () => { void saveExplicitly(); });
    } finally {
      if (requestGeneration.current === generation) setPending(null);
    }
  }

  async function completeDay() {
    if (!writable || completion) return;
    if (observation?.required && !savedResponse) return;
    const generation = requestGeneration.current;
    setPending('complete');
    setError(null);
    try {
      const saved = await completeProgramDay({ enrollmentId, versionId, day });
      if (requestGeneration.current !== generation) return;
      setCompletion(saved);
      setRetry(null);
    } catch (err) {
      if (requestGeneration.current !== generation) return;
      setError(errorMessage(err));
      setRetry(() => () => { void completeDay(); });
    } finally {
      if (requestGeneration.current === generation) setPending(null);
    }
  }

  const savedObservationReady = !observation?.required || Boolean(savedResponse);
  const twoDigit = String(day).padStart(2, '0');

  return (
    <section aria-label={`Day ${twoDigit} responses`} className="mt-8 border-t border-white/15 pt-6">
      {readOnlyReason && (
        <p className="text-sm text-white/70">{readOnlyReason}</p>
      )}
      {observation && (
        <div className="mt-4">
          <label className="block text-sm text-white/80" htmlFor={`program-day-observation-${day}`}>
            {observation.prompt}
          </label>
          <textarea
            id={`program-day-observation-${day}`}
            aria-label="Observation"
            value={editorText}
            readOnly={!writable}
            onChange={(event) => setEditorText(event.target.value)}
            className="mt-2 min-h-28 w-full rounded-2xl border border-white/20 bg-black/20 px-3 py-2 text-sm text-white"
          />
          {savedResponse && (
            <p className="mt-2 text-xs text-white/60">
              Saved response: {savedResponse}
            </p>
          )}
          {writable && (
            <button
              type="button"
              onClick={() => { void saveExplicitly(); }}
              disabled={pending !== null}
              className="mt-3 rounded-full bg-[#d7ecff] px-4 py-2 text-xs font-semibold text-black disabled:opacity-60"
            >
              Save observation
            </button>
          )}
        </div>
      )}
      {checkinRequired && !checkinHandled && (
        <p className="mt-4 text-sm text-white/70">
          Complete or skip this day’s check-in before completing the day.
        </p>
      )}
      {observation?.required && !savedResponse && writable && (
        <p className="mt-4 text-sm text-white/70">
          Save the required observation before completing this day.
        </p>
      )}
      {completion ? (
        <p className="mt-4 text-sm text-white/80">
          Day {twoDigit} completed {new Date(completion.completed_at).toLocaleString()}
        </p>
      ) : writable ? (
        <button
          type="button"
          onClick={() => { void completeDay(); }}
          disabled={pending !== null || !savedObservationReady}
          className="mt-4 h-12 w-full rounded-full border border-white/30 text-sm font-semibold hover:bg-white/5 disabled:opacity-60"
        >
          Mark day {twoDigit} completed
        </button>
      ) : (
        <p className="mt-4 text-center text-xs text-white/45">Day {twoDigit}</p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-amber-100">
          {error.message}
        </p>
      )}
      {error && retry && (
        <button
          type="button"
          onClick={retry}
          className="mt-2 text-xs font-semibold text-white underline"
        >
          Retry
        </button>
      )}
    </section>
  );
}
