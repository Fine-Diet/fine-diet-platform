'use client';

import { useCallback, useRef, useState } from 'react';

import { shouldApplySerializedSaveResult } from '@/lib/plans/serializedReusableSave';

interface UseSerializedReusableSaveResult<T> {
  busy: boolean;
  error: string | null;
  savedMessage: string | null;
  save: (value: T, onSaved?: (saved: T) => void) => Promise<T | null>;
  clearMessages: () => void;
}

export function useSerializedReusableSave<T>(
  saveFn: (value: T) => Promise<T>,
): UseSerializedReusableSaveResult<T> {
  const saveGeneration = useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const save = useCallback(
    async (value: T, onSaved?: (saved: T) => void) => {
      const generation = ++saveGeneration.current;
      setBusy(true);
      setError(null);
      setSavedMessage(null);
      try {
        const saved = await saveFn(value);
        if (!shouldApplySerializedSaveResult(generation, saveGeneration.current)) return null;
        onSaved?.(saved);
        setSavedMessage('Saved.');
        return saved;
      } catch (err) {
        if (shouldApplySerializedSaveResult(generation, saveGeneration.current)) {
          setError(err instanceof Error ? err.message : 'Save failed.');
        }
        return null;
      } finally {
        if (shouldApplySerializedSaveResult(generation, saveGeneration.current)) {
          setBusy(false);
        }
      }
    },
    [saveFn],
  );

  const clearMessages = useCallback(() => {
    setError(null);
    setSavedMessage(null);
  }, []);

  return { busy, error, savedMessage, save, clearMessages };
}
