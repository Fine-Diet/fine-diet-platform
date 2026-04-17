/**
 * Admin Page: Klaviyo Contact Import
 *
 * 5-step wizard for migrating opted-in contacts from Klaviyo into the
 * Fine Diet people / subscriptions / preferences system.
 *
 * Steps:
 *   1. Upload  — drag-drop or paste CSV
 *   2. Map     — auto-detect Klaviyo columns, allow overrides
 *   3. Preview — paginated table of parsed rows with validation
 *   4. Dry Run — per-row action plan + summary (no DB writes)
 *   5. Execute — confirmation + live import + results
 *
 * Requires editor or admin role.
 */

import { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useState, useRef, useCallback } from 'react';
import { getCurrentUserWithRoleFromSSR, AuthenticatedUser } from '@/lib/authServer';
import { parseCSV } from '@/lib/csvParser';
import type { ImportRow, ImportOptions, DryRunResponse, DryRunRow, ExecuteResponse, RowAction, RowLimitOption } from '@/lib/admin/importTypes';
import { DEFAULT_IMPORT_OPTIONS, ROW_LIMIT_OPTIONS } from '@/lib/admin/importTypes';

// ---------------------------------------------------------------------------
// Column auto-detection
// ---------------------------------------------------------------------------

/** Maps our canonical field names to possible Klaviyo header variants */
const COLUMN_MATCHERS: Record<string, string[]> = {
  email: ['email', 'email address', 'e-mail', 'e-mail address'],
  first_name: ['first name', 'firstname', 'first_name', 'given name'],
  last_name: ['last name', 'lastname', 'last_name', 'surname', 'family name'],
  subscribed: [
    'subscribed to email marketing',
    'subscribed',
    'email subscribed',
    'opted in',
    'consent',
    'status',
    'email marketing consent',
  ],
  created_at: ['created', 'date added', 'signup date', 'subscribed date', 'created at', 'joined'],
  tags: ['tags', 'tag', 'lists', 'segments', 'list names'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'cell'],
};

const FIELD_LABELS: Record<string, string> = {
  email: 'Email *',
  first_name: 'First Name',
  last_name: 'Last Name',
  subscribed: 'Subscribed / Consent',
  created_at: 'Created / Signed-Up Date',
  tags: 'Tags / Lists',
  phone: 'Phone',
};

function autoDetectColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(COLUMN_MATCHERS)) {
    const match = headers.find((h) =>
      aliases.some((a) => h.toLowerCase().trim() === a.toLowerCase()),
    );
    if (match) mapping[field] = match;
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Row → ImportRow mapper
// ---------------------------------------------------------------------------

function parseSubscribed(raw: string): boolean | null {
  if (!raw) return null;
  const v = raw.toLowerCase().trim();
  if (['true', 'yes', '1', 'subscribed', 'opted in', 'active', 'consented'].includes(v)) return true;
  if (['false', 'no', '0', 'unsubscribed', 'opted out', 'inactive', 'bounced', 'cleaned'].includes(v)) return false;
  return null;
}

function mapRowsToImport(
  csvRows: Record<string, string>[],
  mapping: Record<string, string>,
): ImportRow[] {
  return csvRows.map((row, idx) => ({
    email: mapping.email ? row[mapping.email] || '' : '',
    first_name: mapping.first_name ? row[mapping.first_name] || undefined : undefined,
    last_name: mapping.last_name ? row[mapping.last_name] || undefined : undefined,
    phone: mapping.phone ? row[mapping.phone] || undefined : undefined,
    subscribed: mapping.subscribed ? parseSubscribed(row[mapping.subscribed]) : null,
    tags: mapping.tags ? row[mapping.tags] || undefined : undefined,
    klaviyo_created_at: mapping.created_at ? row[mapping.created_at] || undefined : undefined,
    sourceRowIndex: idx + 2, // +2 because row 1 = headers
  }));
}

// ---------------------------------------------------------------------------
// Action display helpers
// ---------------------------------------------------------------------------

const ACTION_COLORS: Record<RowAction | 'error', string> = {
  create: 'bg-green-100 text-green-800',
  update: 'bg-blue-100 text-blue-800',
  skip_unsubscribed: 'bg-orange-100 text-orange-800',
  skip_no_consent: 'bg-yellow-100 text-yellow-800',
  skip_duplicate: 'bg-gray-100 text-gray-600',
  invalid: 'bg-red-100 text-red-800',
  error: 'bg-red-100 text-red-800',
};

const ACTION_LABELS: Record<RowAction | 'error', string> = {
  create: 'Create',
  update: 'Update',
  skip_unsubscribed: 'Skip (unsubscribed)',
  skip_no_consent: 'Skip (no consent)',
  skip_duplicate: 'Skip (duplicate)',
  invalid: 'Invalid',
  error: 'Error',
};

function ActionBadge({ action }: { action: RowAction | 'error' }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLORS[action]}`}>
      {ACTION_LABELS[action]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = ['Upload', 'Map Columns', 'Preview', 'Dry Run', 'Execute'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEPS.map((label, idx) => {
        const state = idx < current ? 'done' : idx === current ? 'active' : 'pending';
        return (
          <div key={label} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              state === 'active' ? 'bg-blue-600 text-white' :
              state === 'done' ? 'bg-green-600 text-white' :
              'bg-gray-100 text-gray-400'
            }`}>
              <span>{state === 'done' ? '✓' : idx + 1}</span>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`w-6 h-0.5 mx-1 ${idx < current ? 'bg-green-400' : 'bg-gray-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface PageProps {
  user: AuthenticatedUser | null;
}

type Step = 0 | 1 | 2 | 3 | 4;

export default function KlaviyoImportPage({ user }: PageProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState<Step>(0);

  // Step 1: CSV data
  const [csvText, setCsvText] = useState('');
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Step 2: Column mapping
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

  // Step 3: Mapped rows (preview page)
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [previewPage, setPreviewPage] = useState(0);

  // Step 4: Dry run
  const [dryRunResult, setDryRunResult] = useState<DryRunResponse | null>(null);
  const [dryRunLoading, setDryRunLoading] = useState(false);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [dryRunFilter, setDryRunFilter] = useState<RowAction | 'all'>('all');

  // Import options
  const [importOptions, setImportOptions] = useState<ImportOptions>(DEFAULT_IMPORT_OPTIONS);

  // Test / partial import
  const [rowLimit, setRowLimit] = useState<RowLimitOption>('all');
  const [emailFilter, setEmailFilter] = useState('');

  // Step 5: Execute
  const [executing, setExecuting] = useState(false);
  const [executeResult, setExecuteResult] = useState<ExecuteResponse | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">You don't have permission to access this area.</p>
      </main>
    );
  }

  const PREVIEW_PAGE_SIZE = 20;

  // ---------------------------------------------------------------------------
  // Step 1: Handle file upload
  // ---------------------------------------------------------------------------

  const handleFile = useCallback((file: File) => {
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      processCsvText(text);
    };
    reader.readAsText(file, 'UTF-8');
  }, []);

  const processCsvText = (text: string) => {
    setParseError(null);
    if (!text.trim()) {
      setParseError('The file appears to be empty.');
      return;
    }

    const { headers, rows } = parseCSV(text);

    if (headers.length === 0) {
      setParseError('Could not detect any column headers. Is this a valid CSV?');
      return;
    }

    if (rows.length === 0) {
      setParseError('No data rows found. The file must have a header row plus at least one data row.');
      return;
    }

    setCsvText(text);
    setParsedHeaders(headers);
    setParsedRows(rows);

    const detected = autoDetectColumns(headers);
    setColumnMapping(detected);

    setStep(1);
  };

  const onFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  // ---------------------------------------------------------------------------
  // Step 2 → 3: Apply column mapping + row limit + email filter
  // ---------------------------------------------------------------------------

  const applyMapping = () => {
    if (!columnMapping.email) {
      setParseError('You must map the Email column before continuing.');
      return;
    }
    setParseError(null);

    let sourceRows = parsedRows;

    // Apply email filter first (case-insensitive substring match)
    const trimmedFilter = emailFilter.trim().toLowerCase();
    if (trimmedFilter) {
      const emailCol = columnMapping.email;
      sourceRows = sourceRows.filter((r) =>
        (r[emailCol] || '').toLowerCase().includes(trimmedFilter),
      );
    }

    // Apply row limit
    const limitMap: Record<RowLimitOption, number> = { '1': 1, '5': 5, '10': 10, all: Infinity };
    const limit = limitMap[rowLimit] ?? Infinity;
    if (limit < Infinity) {
      sourceRows = sourceRows.slice(0, limit);
    }

    const rows = mapRowsToImport(sourceRows, columnMapping);
    setImportRows(rows);
    setPreviewPage(0);
    setStep(2);
  };

  // ---------------------------------------------------------------------------
  // Step 3 → 4: Dry run
  // ---------------------------------------------------------------------------

  const runDryRun = async () => {
    setDryRunLoading(true);
    setDryRunError(null);
    setDryRunResult(null);

    try {
      const res = await fetch('/api/admin/import/dry-run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importRows, options: importOptions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dry run failed.');
      setDryRunResult(data);
      setDryRunFilter('all');
      setStep(3);
    } catch (err) {
      setDryRunError(err instanceof Error ? err.message : 'Dry run failed.');
    } finally {
      setDryRunLoading(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Step 4 → 5: Execute
  // ---------------------------------------------------------------------------

  const executeImport = async () => {
    if (!dryRunResult) return;
    setExecuting(true);
    setExecuteError(null);
    setExecuteResult(null);

    // Only pass rows that should be processed
    const rowsToExecute = importRows.filter((row) => {
      const dryRow = dryRunResult.rows.find((r) => r.sourceRowIndex === row.sourceRowIndex);
      return dryRow && (dryRow.action === 'create' || dryRow.action === 'update');
    });

    try {
      const res = await fetch('/api/admin/import/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToExecute, options: importOptions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed.');
      setExecuteResult(data);
      setStep(4);
    } catch (err) {
      setExecuteError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setExecuting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const dryFilteredRows: DryRunRow[] = dryRunResult
    ? dryRunFilter === 'all'
      ? dryRunResult.rows
      : dryRunResult.rows.filter((r) => r.action === dryRunFilter)
    : [];

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      <Head>
        <title>Import from Klaviyo • Fine Diet Admin</title>
      </Head>

      <div className="min-h-screen bg-gray-100 pt-[100px] pb-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

          {/* Header */}
          <div className="mb-8">
            <Link href="/admin/import" className="text-sm text-gray-600 hover:text-gray-900 mb-3 inline-block">
              ← Import Contacts
            </Link>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">Import from Klaviyo</h1>
            <p className="text-gray-500 text-sm">
              Migrate opted-in contacts into the Fine Diet people system.
              All imports include a required dry-run review before writing any data.
            </p>
          </div>

          <StepIndicator current={step} />

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 0: UPLOAD */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {step === 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload Klaviyo CSV</h2>
              <p className="text-sm text-gray-500 mb-6">
                Export your list from Klaviyo → Profiles → Export All, or export a specific list.
                The CSV must have at least an <strong>Email</strong> column.
              </p>

              {parseError && (
                <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">
                  {parseError}
                </div>
              )}

              {/* Drag-drop zone */}
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
                onDrop={onFileDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-4xl mb-3">📄</div>
                <p className="text-gray-700 font-medium mb-1">Drag & drop your CSV here</p>
                <p className="text-sm text-gray-400">or click to browse</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={onFileChange}
                  className="hidden"
                />
              </div>

              {/* Klaviyo field guide */}
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-semibold text-blue-900 mb-2">Expected Klaviyo columns (auto-detected):</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-blue-800">
                  <div><strong>Email</strong> — required</div>
                  <div><strong>First Name</strong> — recommended</div>
                  <div><strong>Last Name</strong> — optional</div>
                  <div><strong>Subscribed to Email Marketing</strong> — true/false</div>
                  <div><strong>Created</strong> — original opt-in date</div>
                  <div><strong>Tags</strong> — list membership</div>
                </div>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 1: MAP COLUMNS */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {step === 1 && (
            <div className="bg-white rounded-lg border border-gray-200 p-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Map Columns</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {parsedRows.length} rows detected · {parsedHeaders.length} columns.
                    Auto-detected matches are shown. Adjust any that are wrong.
                  </p>
                </div>
                <button onClick={() => setStep(0)} className="text-sm text-gray-500 hover:text-gray-700">
                  ← Re-upload
                </button>
              </div>

              {parseError && (
                <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">{parseError}</div>
              )}

              <div className="space-y-4 mb-6">
                {Object.entries(FIELD_LABELS).map(([field, label]) => (
                  <div key={field} className="grid grid-cols-2 gap-4 items-center">
                    <label className="text-sm font-medium text-gray-700">
                      {label}
                      {field === 'email' && (
                        <span className="ml-1 text-red-500">*</span>
                      )}
                    </label>
                    <select
                      value={columnMapping[field] || ''}
                      onChange={(e) =>
                        setColumnMapping((m) => {
                          const next = { ...m };
                          if (e.target.value) next[field] = e.target.value;
                          else delete next[field];
                          return next;
                        })
                      }
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">(not mapped)</option>
                      {parsedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Test import controls */}
              <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-3">
                  Test / Partial Import
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-amber-700 mb-1">Row limit</label>
                    <select
                      value={rowLimit}
                      onChange={(e) => setRowLimit(e.target.value as RowLimitOption)}
                      className="w-full px-3 py-2 border border-amber-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      {ROW_LIMIT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-amber-700 mb-1">
                      Filter by email (optional)
                    </label>
                    <input
                      type="text"
                      value={emailFilter}
                      onChange={(e) => setEmailFilter(e.target.value)}
                      placeholder="e.g. rashad@"
                      className="w-full px-3 py-2 border border-amber-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <p className="text-xs text-amber-600 mt-1">Substring match — leave blank for all rows.</p>
                  </div>
                </div>
                {(rowLimit !== 'all' || emailFilter.trim()) && (
                  <p className="mt-3 text-xs text-amber-700 font-medium">
                    ⚠ Test mode active — only a subset of rows will be imported.
                    Set Row limit to "All rows" and clear the filter for the full import.
                  </p>
                )}
              </div>

              {/* Sample data preview */}
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Sample (first 3 rows):</p>
                <div className="overflow-x-auto border border-gray-200 rounded">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {parsedHeaders.slice(0, 8).map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedRows.slice(0, 3).map((row, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          {parsedHeaders.slice(0, 8).map((h) => (
                            <td key={h} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[180px] truncate">
                              {row[h] || <span className="text-gray-300">—</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={applyMapping}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Continue to Preview →
                </button>
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 2: PREVIEW */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <div className="bg-white rounded-lg border border-gray-200 p-6 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Preview Mapped Rows</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {importRows.length} rows parsed. Review before running the dry-run check.
                    </p>
                  </div>
                  <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">
                    ← Edit Mapping
                  </button>
                </div>

                {/* Import options */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4 border border-gray-200">
                  <p className="text-sm font-semibold text-gray-700 mb-3">Import Options</p>
                  <div className="space-y-3">
                    <div>
                      <label className="flex items-center gap-3">
                        <select
                          value={importOptions.unknownConsentBehavior}
                          onChange={(e) =>
                            setImportOptions((o) => ({
                              ...o,
                              unknownConsentBehavior: e.target.value as 'subscribe' | 'skip',
                            }))
                          }
                          className="px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900"
                        >
                          <option value="subscribe">Subscribe (recommended for Klaviyo lists)</option>
                          <option value="skip">Skip subscription (person created only)</option>
                        </select>
                        <span className="text-sm text-gray-600">when consent status is unknown</span>
                      </label>
                    </div>
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importOptions.setNutritionInsights}
                          onChange={(e) =>
                            setImportOptions((o) => ({ ...o, setNutritionInsights: e.target.checked }))
                          }
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-600">
                          Set <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">nutrition_insights = true</code> for all subscribed contacts
                        </span>
                      </label>
                    </div>
                    <div className="pt-2 border-t border-gray-200">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importOptions.markAsEditorialEligible}
                          onChange={(e) =>
                            setImportOptions((o) => ({ ...o, markAsEditorialEligible: e.target.checked }))
                          }
                          className="w-4 h-4 mt-0.5 text-orange-500 border-gray-300 rounded focus:ring-orange-400"
                        />
                        <div>
                          <span className="text-sm font-medium text-orange-700">
                            Mark imported contacts as editorial-eligible
                          </span>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Logs <code className="bg-gray-100 px-1 rounded">fine_print_sequence_completed</code> for each subscribed contact,
                            making them immediately eligible for Fine Print weekly sends.
                            <strong className="text-orange-700"> Only enable for legacy opted-in users who should skip the nurture sequence.</strong>
                          </p>
                        </div>
                      </label>
                      {importOptions.markAsEditorialEligible && (
                        <p className="mt-2 text-xs bg-orange-50 border border-orange-200 rounded p-2 text-orange-800">
                          ⚠ This option is active. Each subscribed import will also log
                          fine_print_sequence_completed. Contacts already having this event will not be duplicated.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Test mode banner */}
                {(rowLimit !== 'all' || emailFilter.trim()) && (
                  <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-center justify-between">
                    <span>
                      <strong>Test mode active:</strong>{' '}
                      {rowLimit !== 'all' && `limited to first ${rowLimit} rows`}
                      {rowLimit !== 'all' && emailFilter.trim() && ' · '}
                      {emailFilter.trim() && `filtered to emails matching "${emailFilter}"`}.
                      {' '}Showing <strong>{importRows.length}</strong> rows.
                    </span>
                    <button
                      onClick={() => { setRowLimit('all'); setEmailFilter(''); setStep(1); }}
                      className="text-xs text-amber-700 underline hover:no-underline ml-4 whitespace-nowrap"
                    >
                      Change limit
                    </button>
                  </div>
                )}

                {/* Preview table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm divide-y divide-gray-100">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-3 py-2 text-left">#</th>
                        <th className="px-3 py-2 text-left">Email</th>
                        <th className="px-3 py-2 text-left">First Name</th>
                        <th className="px-3 py-2 text-left">Last Name</th>
                        <th className="px-3 py-2 text-left">Subscribed</th>
                        <th className="px-3 py-2 text-left">Tags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importRows
                        .slice(previewPage * PREVIEW_PAGE_SIZE, (previewPage + 1) * PREVIEW_PAGE_SIZE)
                        .map((row) => (
                          <tr key={row.sourceRowIndex} className="hover:bg-gray-50">
                            <td className="px-3 py-2 text-gray-400">{row.sourceRowIndex}</td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-700">{row.email || <span className="text-red-400">missing</span>}</td>
                            <td className="px-3 py-2 text-gray-600">{row.first_name || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2 text-gray-600">{row.last_name || <span className="text-gray-300">—</span>}</td>
                            <td className="px-3 py-2">
                              {row.subscribed === true && <span className="text-green-600 text-xs">✓ yes</span>}
                              {row.subscribed === false && <span className="text-red-500 text-xs">✗ no</span>}
                              {row.subscribed === null && <span className="text-gray-400 text-xs">unknown</span>}
                            </td>
                            <td className="px-3 py-2 text-gray-500 text-xs max-w-[180px] truncate">{row.tags || <span className="text-gray-300">—</span>}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {importRows.length > PREVIEW_PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
                    <button
                      onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                      disabled={previewPage === 0}
                      className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      ← Prev
                    </button>
                    <span>
                      Page {previewPage + 1} of {Math.ceil(importRows.length / PREVIEW_PAGE_SIZE)}
                      {' · '}{importRows.length} rows total
                    </span>
                    <button
                      onClick={() => setPreviewPage((p) => Math.min(Math.ceil(importRows.length / PREVIEW_PAGE_SIZE) - 1, p + 1))}
                      disabled={(previewPage + 1) * PREVIEW_PAGE_SIZE >= importRows.length}
                      className="px-3 py-1 border border-gray-300 rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={runDryRun}
                  disabled={dryRunLoading}
                  className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  {dryRunLoading ? 'Running Dry Run…' : 'Run Dry Run →'}
                </button>
              </div>

              {dryRunError && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded p-3 text-sm text-red-800">{dryRunError}</div>
              )}
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 3: DRY RUN RESULTS */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {step === 3 && dryRunResult && (
            <div>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                {[
                  { label: 'To Create', count: dryRunResult.summary.toCreate, color: 'bg-green-50 border-green-200 text-green-700', filter: 'create' as RowAction },
                  { label: 'To Update', count: dryRunResult.summary.toUpdate, color: 'bg-blue-50 border-blue-200 text-blue-700', filter: 'update' as RowAction },
                  { label: 'Skip (unsub)', count: dryRunResult.summary.skipUnsubscribed, color: 'bg-orange-50 border-orange-200 text-orange-700', filter: 'skip_unsubscribed' as RowAction },
                  { label: 'Skip (no consent)', count: dryRunResult.summary.skipNoConsent, color: 'bg-yellow-50 border-yellow-200 text-yellow-700', filter: 'skip_no_consent' as RowAction },
                  { label: 'Duplicates', count: dryRunResult.summary.skipDuplicate, color: 'bg-gray-50 border-gray-200 text-gray-600', filter: 'skip_duplicate' as RowAction },
                  { label: 'Invalid', count: dryRunResult.summary.invalid, color: 'bg-red-50 border-red-200 text-red-700', filter: 'invalid' as RowAction },
                ].map(({ label, count, color, filter }) => (
                  <button
                    key={label}
                    onClick={() => setDryRunFilter(dryRunFilter === filter ? 'all' : filter)}
                    className={`border rounded-lg p-3 text-center transition-all ${color} ${dryRunFilter === filter ? 'ring-2 ring-blue-400' : 'hover:opacity-80'}`}
                  >
                    <div className="text-2xl font-bold">{count}</div>
                    <div className="text-xs mt-0.5">{label}</div>
                  </button>
                ))}
              </div>

              {/* Actionable rows only banner */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-sm text-blue-800">
                <strong>{dryRunResult.summary.toCreate + dryRunResult.summary.toUpdate} contacts</strong> will be written to the database
                ({dryRunResult.summary.toCreate} new, {dryRunResult.summary.toUpdate} updated).
                The remaining {dryRunResult.summary.skipUnsubscribed + dryRunResult.summary.skipNoConsent + dryRunResult.summary.skipDuplicate + dryRunResult.summary.invalid} rows will be skipped.
                Click any card above to filter the table below.
              </div>

              {/* Per-row table */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {dryRunFilter === 'all'
                      ? `All ${dryRunResult.rows.length} rows`
                      : `${dryFilteredRows.length} rows · ${ACTION_LABELS[dryRunFilter]}`}
                  </span>
                  {dryRunFilter !== 'all' && (
                    <button onClick={() => setDryRunFilter('all')} className="text-xs text-gray-500 hover:text-gray-700">
                      Clear filter ×
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm divide-y divide-gray-100">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                      <tr>
                        <th className="px-4 py-2 text-left">#</th>
                        <th className="px-4 py-2 text-left">Email</th>
                        <th className="px-4 py-2 text-left">Name</th>
                        <th className="px-4 py-2 text-left">Action</th>
                        <th className="px-4 py-2 text-left">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dryFilteredRows.slice(0, 200).map((row) => (
                        <tr key={row.sourceRowIndex} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-400">{row.sourceRowIndex}</td>
                          <td className="px-4 py-2 font-mono text-xs text-gray-700">{row.email}</td>
                          <td className="px-4 py-2 text-gray-600">
                            {[row.first_name, row.last_name].filter(Boolean).join(' ') || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2">
                            <ActionBadge action={row.action} />
                          </td>
                          <td className="px-4 py-2 text-xs text-gray-500 max-w-xs">{row.reason}</td>
                        </tr>
                      ))}
                      {dryFilteredRows.length > 200 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-3 text-center text-xs text-gray-400">
                            Showing first 200 of {dryFilteredRows.length} rows.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700">
                  ← Back to Preview
                </button>
                {(dryRunResult.summary.toCreate > 0 || dryRunResult.summary.toUpdate > 0) ? (
                  <button
                    onClick={() => { setConfirmed(false); setStep(4); }}
                    className="px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-700 font-medium"
                  >
                    Proceed to Execute →
                  </button>
                ) : (
                  <div className="text-sm text-gray-500 italic">
                    No actionable rows — nothing to import.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ───────────────────────────────────────────────────────────────── */}
          {/* STEP 4: EXECUTE */}
          {/* ───────────────────────────────────────────────────────────────── */}
          {step === 4 && (
            <div>
              {!executeResult ? (
                <div className="bg-white rounded-lg border border-gray-200 p-8">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Ready to Import</h2>

                  {dryRunResult && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 mb-6">
                      <p className="text-sm font-semibold text-amber-900 mb-3">You are about to write to the database:</p>
                      <ul className="space-y-1 text-sm text-amber-800">
                        <li>✦ <strong>{dryRunResult.summary.toCreate}</strong> new contacts will be created</li>
                        <li>✦ <strong>{dryRunResult.summary.toUpdate}</strong> existing contacts will be updated</li>
                        <li>✦ <strong>{dryRunResult.summary.skipUnsubscribed + dryRunResult.summary.skipNoConsent + dryRunResult.summary.skipDuplicate}</strong> rows will be skipped (unsubscribed, no consent, or duplicate)</li>
                        <li>✦ <strong>{dryRunResult.summary.invalid}</strong> invalid rows will be skipped</li>
                      </ul>
                      <div className="mt-4 pt-4 border-t border-amber-200 text-xs text-amber-700 space-y-1">
                        <p>• No existing subscriptions will be reactivated.</p>
                        <p>• No existing name fields will be overwritten.</p>
                        <p>• Unknown consent contacts will be treated as opted-in (Klaviyo enforces consent).</p>
                        <p>• This import is idempotent — running it again will produce the same result.</p>
                        {importOptions.markAsEditorialEligible && (
                          <p className="font-semibold text-orange-700">
                            • Editorial eligibility is ON — fine_print_sequence_completed will be logged for all subscribed contacts.
                          </p>
                        )}
                        {(rowLimit !== 'all' || emailFilter.trim()) && (
                          <p className="font-semibold text-orange-700">
                            • Test mode: only {importRows.length} of {parsedRows.length} rows are being imported.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {executeError && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-800">{executeError}</div>
                  )}

                  <label className="flex items-center gap-3 cursor-pointer mb-6">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700">
                      I have reviewed the dry-run results and confirm this import.
                    </span>
                  </label>

                  <div className="flex items-center justify-between">
                    <button onClick={() => setStep(3)} className="text-sm text-gray-500 hover:text-gray-700">
                      ← Back to Dry Run
                    </button>
                    <button
                      onClick={executeImport}
                      disabled={!confirmed || executing}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-semibold disabled:opacity-40"
                    >
                      {executing ? 'Importing…' : 'Execute Import'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Results */
                <div>
                  <div className={`rounded-lg border p-6 mb-6 ${
                    executeResult.errors > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
                  }`}>
                    <h2 className={`text-xl font-semibold mb-3 ${executeResult.errors > 0 ? 'text-yellow-900' : 'text-green-900'}`}>
                      {executeResult.errors > 0 ? 'Import Completed with Errors' : 'Import Successful'}
                    </h2>
                    <div className="grid grid-cols-4 gap-4 text-center">
                      {[
                        { label: 'Created', count: executeResult.created, color: 'text-green-700' },
                        { label: 'Updated', count: executeResult.updated, color: 'text-blue-700' },
                        { label: 'Skipped', count: executeResult.skipped, color: 'text-gray-600' },
                        { label: 'Errors', count: executeResult.errors, color: 'text-red-700' },
                      ].map(({ label, count, color }) => (
                        <div key={label}>
                          <div className={`text-3xl font-bold ${color}`}>{count}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Per-row results (errors highlighted) */}
                  {executeResult.errors > 0 && (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-4">
                      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                        <span className="text-sm font-medium text-gray-700">Rows with errors</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm divide-y divide-gray-100">
                          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                            <tr>
                              <th className="px-4 py-2 text-left">#</th>
                              <th className="px-4 py-2 text-left">Email</th>
                              <th className="px-4 py-2 text-left">Error</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {executeResult.rows
                              .filter((r) => r.action === 'error')
                              .map((row) => (
                                <tr key={row.sourceRowIndex} className="bg-red-50">
                                  <td className="px-4 py-2 text-gray-400">{row.sourceRowIndex}</td>
                                  <td className="px-4 py-2 font-mono text-xs text-gray-700">{row.email}</td>
                                  <td className="px-4 py-2 text-xs text-red-700">{row.message}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <Link
                      href="/admin/people"
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
                    >
                      View People →
                    </Link>
                    <button
                      onClick={() => {
                        setStep(0);
                        setCsvText('');
                        setParsedHeaders([]);
                        setParsedRows([]);
                        setImportRows([]);
                        setDryRunResult(null);
                        setExecuteResult(null);
                        setConfirmed(false);
                        setRowLimit('all');
                        setEmailFilter('');
                        setImportOptions(DEFAULT_IMPORT_OPTIONS);
                      }}
                      className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm"
                    >
                      Start New Import
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { props: { user: null } };
  }
  return { props: { user } };
};
