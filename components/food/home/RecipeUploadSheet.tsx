'use client';

import { useEffect, useId, useRef, useState } from 'react';

import type { RecipeUploadAcceptedFile } from '@/lib/food/home/types';
import { cn } from '@/lib/utils';

const ACCEPTED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.pdf'];
const ACCEPTED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

export type RecipeUploadSubmitHandler = (file: RecipeUploadAcceptedFile) => void | Promise<void>;

/**
 * Stable deferred stub for Upload Image or PDF.
 * Holds the file in local component state only — no upload, parse, or persist.
 */
export function RecipeUploadSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** Stable boundary for the future import pipeline. */
  onSubmit?: RecipeUploadSubmitHandler;
}) {
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<RecipeUploadAcceptedFile | null>(null);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setInvalidMessage(null);
      setDragging(false);
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function acceptFile(candidate: File | null | undefined) {
    if (!candidate) return;
    const lower = candidate.name.toLowerCase();
    const extensionOk = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
    const mimeOk = !candidate.type || ACCEPTED_MIME.has(candidate.type);
    if (!extensionOk || !mimeOk) {
      setInvalidMessage('Use a PNG, JPG, WEBP, or PDF file.');
      setFile(null);
      return;
    }
    setInvalidMessage(null);
    setFile({
      name: candidate.name,
      size: candidate.size,
      mimeType: candidate.type || 'application/octet-stream',
    });
  }

  async function handleContinue() {
    if (!file) return;
    await onSubmit?.(file);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-[28px] border border-white/30 bg-brand-900 p-5 shadow-large sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45 antialiased">
              Upload image or PDF
            </p>
            <h2 id={titleId} className="mt-2 text-2xl font-semibold text-white antialiased">
              Add a recipe file
            </h2>
            <p className="mt-2 text-sm text-white/55 antialiased">
              Files stay on this device for now. Extraction and import attach behind the same
              continue action later.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close upload sheet"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white"
          >
            ×
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(',')}
          className="hidden"
          onChange={(event) => {
            acceptFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />

        <div
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            acceptFile(event.dataTransfer.files?.[0]);
          }}
          className={cn(
            'mt-5 rounded-[24px] border border-dashed px-4 py-8 text-center transition-colors',
            dragging ? 'border-denim-400 bg-black/35' : 'border-white/25 bg-black/20',
          )}
        >
          {!file ? (
            <>
              <p className="text-base text-white antialiased">Drag & drop a recipe file here</p>
              <p className="mt-2 text-sm text-white/50 antialiased">
                Accepted: PNG, JPG, WEBP, or PDF
              </p>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="mt-5 rounded-full border border-white/30 px-5 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Choose file
              </button>
            </>
          ) : (
            <div className="text-left">
              <p className="text-base font-semibold text-white antialiased">{file.name}</p>
              <p className="mt-1 text-sm text-white/50 antialiased">
                {(file.size / 1024).toFixed(1)} KB · {file.mimeType}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setInvalidMessage(null);
                  }}
                  className="rounded-full border border-white/25 px-4 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  Remove
                </button>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-full border border-white/25 px-4 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                >
                  Replace
                </button>
              </div>
            </div>
          )}
        </div>

        {invalidMessage && (
          <p className="mt-3 text-sm text-semantic-error antialiased" role="alert">
            {invalidMessage}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/25 px-5 py-2 text-sm font-semibold text-white/80 hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!file}
            onClick={() => void handleContinue()}
            title="Import processing is not available yet"
            className="rounded-full bg-denim-500 px-5 py-2 text-sm font-semibold text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Continue after import support
          </button>
        </div>
      </div>
    </div>
  );
}
