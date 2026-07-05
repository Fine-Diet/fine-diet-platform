/**
 * Scoring Dispatch Hub (Packet M)
 *
 * Presentational component that surfaces the assessment-type scoring dispatch
 * foundation on /admin/assessments. It shows:
 *   - that a scoring dispatch layer exists,
 *   - which adapters are registered today (Gut Check only),
 *   - that unknown / unregistered assessment types fail closed,
 *   - that future scoring templates remain planned unless an adapter is
 *     explicitly wired.
 *
 * Pure-presentational: all data comes from `lib/assessments/scoring` and
 * `lib/assessments/assessmentFactory`. Nothing here scores a run, registers
 * an adapter, or creates an assessment.
 */

import {
  listScoringAdapters,
  type AssessmentScoringAdapter,
} from '@/lib/assessments/scoring';
import {
  listScoringTemplates,
  getScoringTemplate,
} from '@/lib/assessments/assessmentFactory';

const ADAPTER_STATUS_STYLES: Record<string, string> = {
  live: 'bg-green-100 text-green-800',
  planned: 'bg-blue-100 text-blue-800',
};

function AdapterRow({ adapter }: { adapter: AssessmentScoringAdapter }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
        {adapter.assessmentType}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-mono">
        {adapter.id}
      </td>
      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-mono">
        {adapter.scoringTemplateId}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{adapter.description}</td>
      <td className="px-4 py-3 whitespace-nowrap text-sm">
        <span
          className={`px-2 py-1 text-xs font-medium rounded ${
            ADAPTER_STATUS_STYLES['live']
          }`}
        >
          Live (registry)
        </span>
      </td>
    </tr>
  );
}

function TemplateRow({ templateId }: { templateId: string }) {
  const template = getScoringTemplate(templateId);
  const isLive = template?.status === 'available';
  return (
    <li className="flex items-start gap-2 text-sm text-gray-700">
      <span
        className={`mt-0.5 inline-block px-2 py-0.5 text-xs font-medium rounded ${
          isLive ? ADAPTER_STATUS_STYLES['live'] : ADAPTER_STATUS_STYLES['planned']
        }`}
      >
        {isLive ? 'available' : template?.status ?? 'planned'}
      </span>
      <span className="font-mono text-gray-900">{templateId}</span>
      <span className="text-gray-500">
        {template ? `— ${template.summary}` : '— not declared in factory metadata'}
      </span>
    </li>
  );
}

export default function ScoringDispatchHub() {
  const adapters = listScoringAdapters();
  const templates = listScoringTemplates();

  return (
    <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-1">
        Scoring Dispatch
      </h2>
      <p className="text-sm text-gray-600 mb-4">
        Assessment-type scoring dispatch foundation (Packet M). Scoring is
        routed by <code className="text-gray-800">assessmentType</code> to a
        registered adapter, and unknown / unregistered types fail closed. Gut
        Check is the only implemented/live scoring adapter today; future
        scoring templates remain planned unless an adapter is explicitly
        wired in{' '}
        <code className="text-gray-800">
          lib/assessments/scoring/scoringDispatch.ts
        </code>
        .
      </p>

      <div className="overflow-x-auto mb-6">
        <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Assessment type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Adapter id
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Scoring template
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {adapters.map((adapter) => (
              <AdapterRow key={adapter.id} adapter={adapter} />
            ))}
            {adapters.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-sm text-gray-500"
                >
                  No scoring adapters registered.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border border-gray-200 rounded p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Fail-closed contract
          </h3>
          <ul className="space-y-1.5 text-sm text-gray-700 list-disc pl-5">
            <li>
              Unknown <code>assessmentType</code> → rejected (no silent Gut
              Check fallback).
            </li>
            <li>
              Mismatched <code>adapterId</code> → rejected.
            </li>
            <li>
              Mismatched <code>scoringTemplateId</code> → rejected.
            </li>
            <li>
              A future assessment must register its own adapter before it can
              be scored at all.
            </li>
          </ul>
        </div>

        <div className="border border-gray-200 rounded p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">
            Scoring templates (factory metadata)
          </h3>
          <ul className="space-y-1.5">
            {templates.map((t) => (
              <TemplateRow key={t.id} templateId={t.id} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-gray-500">
            Only <code>axis-scores-to-profile</code> has a live adapter (Gut
            Check). Every other template is metadata-only until an adapter is
            wired.
          </p>
        </div>
      </div>
    </section>
  );
}
