/**
 * Operations Contract Hub
 *
 * Single presentational component that renders the full operations contract
 * surface for one assessment: scoring/results contract panel, result preview
 * matrix, publish readiness checklist, downstream output flow, and the
 * normalized artifact payload coverage view.
 *
 * Pure-presentational: all data comes from `lib/assessments/operationsContract`
 * and `lib/assessments/resultArtifactPayload`. The only client-side input is
 * the `AssessmentVersion` row from the existing admin index fetch (used to
 * populate automated readiness checks honestly).
 */

import Link from 'next/link';
import type { AssessmentVersion } from '@/lib/admin/assessments/buildAssessmentIndex';
import {
  type OperationsContract,
  type ReadinessCheckResult,
  type ArtifactStatus,
  type ReadinessStatus,
  evaluateReadiness,
  summarizeReadiness,
  type ReadinessInput,
} from '@/lib/assessments/operationsContract';
import {
  RESULT_PAYLOAD_COVERAGE,
  payloadCoverageSummary,
} from '@/lib/assessments/resultArtifactPayload';

interface OperationsContractHubProps {
  contract: OperationsContract;
  /** Matching assessment version row from the admin index, if present. */
  assessmentVersion: AssessmentVersion | null;
}

const ARTIFACT_STATUS_STYLES: Record<ArtifactStatus, string> = {
  implemented: 'bg-green-100 text-green-800',
  external: 'bg-blue-100 text-blue-800',
  'not-implemented': 'bg-red-100 text-red-800',
  'manual-review': 'bg-yellow-100 text-yellow-800',
};

const ARTIFACT_STATUS_LABELS: Record<ArtifactStatus, string> = {
  implemented: 'Implemented',
  external: 'External',
  'not-implemented': 'Not Implemented',
  'manual-review': 'Manual Review',
};

const READINESS_STATUS_STYLES: Record<ReadinessStatus, string> = {
  verified: 'bg-green-100 text-green-800',
  'manual-review': 'bg-yellow-100 text-yellow-800',
  missing: 'bg-red-100 text-red-800',
  'not-implemented': 'bg-gray-200 text-gray-700',
};

const READINESS_STATUS_LABELS: Record<ReadinessStatus, string> = {
  verified: 'Verified',
  'manual-review': 'Manual Review',
  missing: 'Missing',
  'not-implemented': 'Not Implemented',
};

function buildReadinessInput(
  contract: OperationsContract,
  version: AssessmentVersion | null
): ReadinessInput {
  const resultsLevelsWithCopy = version
    ? Object.values(version.resultsPackIds).filter((id) => id !== null).length
    : 0;
  const pdfOutput = contract.outputs.find((o) => o.key === 'pdf');

  return {
    assessmentType: contract.assessmentType,
    questionSetPresent: !!version?.questionSetId,
    questionSetValidates: undefined,
    resultsLevelsWithCopy,
    resultsLevelsExpected: contract.resultLevels.length,
    runtimePreviewAvailable: contract.preview.runtimePreviewFlag,
    // N8N_WEBHOOK_URL is server-side env; the client cannot see it. Honest
    // default is "not detected" → evaluator reports manual-review.
    emailWebhookConfigured: false,
    pdfRoutePresent: pdfOutput?.status === 'implemented',
    scoringAdapterDeclared: !!contract.scoringAdapterId,
    draftContentExposed: false,
  };
}

export default function OperationsContractHub({
  contract,
  assessmentVersion,
}: OperationsContractHubProps) {
  const readinessInput = buildReadinessInput(contract, assessmentVersion);
  const readinessResults: ReadinessCheckResult[] = evaluateReadiness(
    contract,
    readinessInput
  );
  const readinessSummary = summarizeReadiness(readinessResults);
  const payloadSummary = payloadCoverageSummary();

  return (
    <div className="space-y-8">
      <ScoringContractPanel contract={contract} />
      <ResultPreviewMatrix contract={contract} />
      <PublishReadinessChecklist
        results={readinessResults}
        summary={readinessSummary}
      />
      <DownstreamOutputFlow contract={contract} />
      <ArtifactPayloadCoveragePanel
        total={payloadSummary.total}
        fullyAligned={payloadSummary.fullyAligned}
        partial={payloadSummary.partial}
        unused={payloadSummary.unused}
      />
      <LegacyToolsPanel />
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">{title}</h2>
      {description && <p className="text-sm text-gray-600 mb-4">{description}</p>}
      {children}
    </section>
  );
}

function StatusPill({
  status,
  label,
}: {
  status: ArtifactStatus | ReadinessStatus;
  label: string;
}) {
  const styles =
    status in ARTIFACT_STATUS_STYLES
      ? ARTIFACT_STATUS_STYLES[status as ArtifactStatus]
      : READINESS_STATUS_STYLES[status as ReadinessStatus];
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${styles}`}>
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------

function ScoringContractPanel({ contract }: { contract: OperationsContract }) {
  return (
    <SectionCard
      title="Scoring & Results Contract"
      description="How this assessment maps questions/options to a result level. Read-only — scoring semantics are not edited here."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <dl className="text-sm space-y-2">
            <div>
              <dt className="font-medium text-gray-700 inline">Scoring style: </dt>
              <dd className="inline text-gray-900">{contract.scoringStyle}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-700 inline">Live adapter: </dt>
              <dd className="inline text-gray-900 font-mono text-xs">
                {contract.scoringAdapterId}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-700 inline">Engine: </dt>
              <dd className="inline text-gray-900 font-mono text-xs">
                {contract.scoringEnginePath}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-700 inline">Legacy adapters: </dt>
              <dd className="inline text-gray-600 font-mono text-xs">
                {contract.legacyScoringAdapters.join(', ') || 'none'}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-gray-700 inline">Results content version: </dt>
              <dd className="inline text-gray-900">{contract.resultsContentVersion}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-700 inline">Results pack source: </dt>
              <dd className="inline text-gray-900">{contract.resultsPackSource}</dd>
            </div>
          </dl>
        </div>
        <div>
          <div className="text-sm font-medium text-gray-700 mb-1">Option value model</div>
          <p className="text-sm text-gray-900">
            {contract.optionValueModel.min}–{contract.optionValueModel.max}
            {contract.optionValueModel.optionsPerQuestion
              ? ` · ${contract.optionValueModel.optionsPerQuestion} options/question`
              : ''}
          </p>
          <p className="text-xs text-gray-600 mt-1">
            {contract.optionValueModel.semantics}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium text-gray-700 mb-1">Scoring logic</div>
        <p className="text-sm text-gray-700">{contract.scoringDescription}</p>
      </div>

      <div className="mt-4">
        <div className="text-sm font-medium text-gray-700 mb-2">Result levels</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {contract.resultLevels.map((level) => (
            <div
              key={level.id}
              className="border border-gray-200 rounded-md p-3"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-gray-500">{level.id}</span>
                <span className="text-xs text-gray-500">{level.copySource}</span>
              </div>
              <div className="font-medium text-gray-900 text-sm mt-1">
                {level.label}
              </div>
              <div className="text-xs text-gray-600 mt-1">{level.summary}</div>
            </div>
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function ResultPreviewMatrix({ contract }: { contract: OperationsContract }) {
  const forcedPreview = contract.preview.forcedResultPreview;
  return (
    <SectionCard
      title="Result Preview Matrix"
      description="Each possible result outcome, with the available preview path. Forced-result preview is not implemented — use the results pack preview or run the assessment with ?preview=1."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contract.resultLevels.map((level) => (
          <div
            key={level.id}
            className="border border-gray-200 rounded-md p-4 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-gray-900">{level.label}</div>
                <div className="font-mono text-xs text-gray-500">{level.id}</div>
              </div>
              <span className="text-xs text-gray-500">{level.copySource}</span>
            </div>
            <p className="text-sm text-gray-700">{level.summary}</p>
            <div className="flex flex-wrap gap-3 text-sm mt-1">
              {level.resultsPackPreviewHref && (
                <Link
                  href={level.resultsPackPreviewHref}
                  className="text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Results pack preview →
                </Link>
              )}
              <Link
                href={`${level.runtimePreviewHref}`}
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                Runtime preview (?preview=1) →
              </Link>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-4">
        {forcedPreview
          ? 'Forced-result preview is supported.'
          : 'Forced-result preview (render a specific level on demand without taking the assessment) is NOT implemented. This is the recommended follow-up before second-assessment work.'}
      </p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function PublishReadinessChecklist({
  results,
  summary,
}: {
  results: ReadinessCheckResult[];
  summary: ReturnType<typeof summarizeReadiness>;
}) {
  const summaryLabel =
    summary.status === 'ready'
      ? 'Ready'
      : summary.status === 'needs-review'
      ? 'Needs Review'
      : 'Blocked';
  const summaryStyle =
    summary.status === 'ready'
      ? 'bg-green-100 text-green-800'
      : summary.status === 'needs-review'
      ? 'bg-yellow-100 text-yellow-800'
      : 'bg-red-100 text-red-800';

  return (
    <SectionCard
      title="Publish Readiness Checklist"
      description="Honest status for each readiness check. Automated checks derive from the contract + current admin index data; manual-review checks require a human to confirm."
    >
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className={`px-3 py-1 text-sm font-medium rounded ${summaryStyle}`}>
          {summaryLabel}
        </span>
        <span className="text-xs text-gray-600">
          {summary.verified} verified · {summary.manualReview} manual review ·{' '}
          {summary.missing} missing · {summary.notImplemented} not implemented
        </span>
      </div>
      <ul className="divide-y divide-gray-100">
        {results.map((r) => (
          <li key={r.key} className="py-3 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{r.label}</span>
                {r.automated ? (
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">
                    automated
                  </span>
                ) : (
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">
                    info-only
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-600">{r.detail}</div>
            </div>
            <StatusPill status={r.status} label={READINESS_STATUS_LABELS[r.status]} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function DownstreamOutputFlow({ contract }: { contract: OperationsContract }) {
  return (
    <SectionCard
      title="Downstream Output Flow"
      description="What happens after a submission: which artifacts are produced and where each one lives."
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Artifact</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Implemented at</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {contract.outputs.map((o) => (
              <tr key={o.key}>
                <td className="px-4 py-2 font-medium text-gray-900">{o.label}</td>
                <td className="px-4 py-2">
                  <StatusPill
                    status={o.status}
                    label={ARTIFACT_STATUS_LABELS[o.status]}
                  />
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">
                  {o.implementedAt || '—'}
                </td>
                <td className="px-4 py-2 text-xs text-gray-600">{o.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function ArtifactPayloadCoveragePanel({
  total,
  fullyAligned,
  partial,
  unused,
}: {
  total: number;
  fullyAligned: number;
  partial: number;
  unused: number;
}) {
  return (
    <SectionCard
      title="Normalized Artifact Payload Coverage"
      description="The canonical payload shape shared conceptually by ResultsScreen, email summary, PDF, and webhook. Documents which consumer currently uses each field — not the desired state."
    >
      <div className="flex flex-wrap gap-4 text-sm text-gray-700 mb-4">
        <span>{total} fields total</span>
        <span className="text-green-700">{fullyAligned} fully aligned</span>
        <span className="text-yellow-700">{partial} partial</span>
        <span className="text-gray-500">{unused} unused</span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Field</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase">Screen</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase">Email</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase">PDF</th>
              <th className="px-3 py-2 text-center font-medium text-gray-500 uppercase">Webhook</th>
              <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase">Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {RESULT_PAYLOAD_COVERAGE.map((row) => (
              <tr key={row.field}>
                <td className="px-3 py-2 font-mono text-gray-900">{row.field}</td>
                <td className="px-3 py-2 text-center">{row.screen ? '✓' : '—'}</td>
                <td className="px-3 py-2 text-center">{row.email ? '✓' : '—'}</td>
                <td className="px-3 py-2 text-center">{row.pdf ? '✓' : '—'}</td>
                <td className="px-3 py-2 text-center">{row.webhook ? '✓' : '—'}</td>
                <td className="px-3 py-2 text-gray-600">{row.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-4">
        Consumers are NOT migrated to a single payload builder in this packet (that would risk changing Gut Check runtime behavior). This view exists to make alignment gaps visible for a future packet.
      </p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function LegacyToolsPanel() {
  return (
    <SectionCard
      title="Advanced & Legacy Tools"
      description="Raw / JSON / CSV tooling is still available but is no longer the primary management path. Use the structured authoring UI above for new work."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <Link
          href="/admin/question-sets/author"
          className="border border-gray-200 rounded-md p-3 hover:border-gray-300"
        >
          <div className="font-medium text-gray-900">Structured Authoring UI</div>
          <div className="text-xs text-gray-600">Recommended. Packet H question-set editor.</div>
        </Link>
        <Link
          href="/admin/question-sets"
          className="border border-gray-200 rounded-md p-3 hover:border-gray-300"
        >
          <div className="font-medium text-gray-900">Question Sets (all revisions)</div>
          <div className="text-xs text-gray-600">Manage revisions, preview, publish pointers.</div>
        </Link>
        <Link
          href="/admin/question-sets/import"
          className="border border-gray-200 rounded-md p-3 hover:border-gray-300"
        >
          <div className="font-medium text-gray-900">CSV Import</div>
          <div className="text-xs text-gray-600">Legacy. Bulk import question sets from CSV.</div>
        </Link>
        <Link
          href="/admin/config/assessments/gut-check-v2"
          className="border border-gray-200 rounded-md p-3 hover:border-gray-300"
        >
          <div className="font-medium text-gray-900">Gut Check v2/v3 Scoring Config</div>
          <div className="text-xs text-gray-600">Advanced. Axis band thresholds.</div>
        </Link>
        <Link
          href="/admin/config/assessments/gut-check-v1"
          className="border border-gray-200 rounded-md p-3 hover:border-gray-300"
        >
          <div className="font-medium text-gray-900">Gut Check v1 Scoring Config</div>
          <div className="text-xs text-gray-600">Legacy. v1 weight-based thresholds.</div>
        </Link>
        <Link
          href="/admin/config/avatar-mapping"
          className="border border-gray-200 rounded-md p-3 hover:border-gray-300"
        >
          <div className="font-medium text-gray-900">Avatar Mapping</div>
          <div className="text-xs text-gray-600">Advanced. Avatar → level mapping.</div>
        </Link>
        <Link
          href="/admin/outbox"
          className="border border-gray-200 rounded-md p-3 hover:border-gray-300"
        >
          <div className="font-medium text-gray-900">Webhook Outbox</div>
          <div className="text-xs text-gray-600">Admin only. Monitor n8n webhook delivery.</div>
        </Link>
      </div>
    </SectionCard>
  );
}
