/**
 * Assessment Factory Hub
 *
 * Presentational component that renders the assessment-factory / readiness
 * surface for /admin/assessments (Packet J):
 *   - factory readiness summary header (available vs planned counts),
 *   - registered assessments positioned as factory instances,
 *   - problem-point taxonomy,
 *   - reusable assessment archetypes,
 *   - reusable scoring templates,
 *   - the creation workflow stages with honest per-stage status.
 *
 * Pure-presentational: all data comes from `lib/assessments/assessmentFactory`.
 * Nothing here creates an assessment or implies a non-engineer can publish an
 * arbitrary assessment today. Unavailable steps are labelled honestly.
 */

import Link from 'next/link';
import {
  listProblemPoints,
  getProblemPoint,
  listArchetypes,
  getArchetype,
  listScoringTemplates,
  listCreationWorkflowStages,
  listFactoryModels,
  summarizeFactoryReadiness,
  type FactoryCapabilityStatus,
  type ProblemPoint,
  type AssessmentArchetype,
  type ScoringTemplate,
  type CreationWorkflowStage,
  type AssessmentFactoryModel,
} from '@/lib/assessments/assessmentFactory';

const STATUS_STYLES: Record<FactoryCapabilityStatus, string> = {
  available: 'bg-green-100 text-green-800',
  planned: 'bg-blue-100 text-blue-800',
  'manual-review': 'bg-yellow-100 text-yellow-800',
  'not-implemented': 'bg-gray-200 text-gray-700',
};

const STATUS_LABELS: Record<FactoryCapabilityStatus, string> = {
  available: 'Available',
  planned: 'Planned',
  'manual-review': 'Manual Review',
  'not-implemented': 'Not Implemented',
};

function StatusBadge({ status }: { status: FactoryCapabilityStatus }) {
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

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

export default function AssessmentFactoryHub() {
  const problemPoints = listProblemPoints();
  const archetypes = listArchetypes();
  const templates = listScoringTemplates();
  const stages = listCreationWorkflowStages();
  const factoryModels = listFactoryModels();
  const summary = summarizeFactoryReadiness();

  return (
    <div className="space-y-8">
      <FactoryReadinessHeader summary={summary} />
      <RegisteredFactoryInstances models={factoryModels} />
      <ProblemPointTaxonomy problemPoints={problemPoints} />
      <ArchetypeGallery archetypes={archetypes} />
      <ScoringTemplateGallery templates={templates} />
      <CreationWorkflow stages={stages} />
      <FactoryRoadmapNote />
    </div>
  );
}

// ---------------------------------------------------------------------------

function FactoryReadinessHeader({
  summary,
}: {
  summary: ReturnType<typeof summarizeFactoryReadiness>;
}) {
  return (
    <section className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-lg shadow-sm text-white p-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold mb-1">Assessment Factory Readiness</h2>
          <p className="text-sm text-gray-300">
            Fine Diet is building toward an assessment factory: many prospect-facing
            tools across problem points, built from reusable archetypes and scoring
            templates. This view is honest about what works today vs what is still
            planned. No second assessment is published here.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <ReadinessStat
            label="Problem points"
            value={`${summary.problemPoints.available}/${summary.problemPoints.total}`}
            sub="available"
          />
          <ReadinessStat
            label="Archetypes"
            value={`${summary.archetypes.available}/${summary.archetypes.total}`}
            sub="available"
          />
          <ReadinessStat
            label="Scoring templates"
            value={`${summary.scoringTemplates.available}/${summary.scoringTemplates.total}`}
            sub="available"
          />
          <ReadinessStat
            label="Creation stages"
            value={`${summary.creationStages.available}/${summary.creationStages.total}`}
            sub="available"
          />
        </div>
      </div>
    </section>
  );
}

function ReadinessStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-white/10 rounded-md px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-gray-300">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-gray-400">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RegisteredFactoryInstances({
  models,
}: {
  models: AssessmentFactoryModel[];
}) {
  if (models.length === 0) return null;
  return (
    <SectionCard
      title="Registered Assessments as Factory Instances"
      description="Each registered assessment is one instance of the factory model — a problem point + archetype + scoring template — not the whole product. Gut Check is the first instance."
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Assessment</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Problem point</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Archetype</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scoring template</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Planned extensions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {models.map((m) => {
              const pp = getProblemPoint(m.problemPointId);
              const ar = getArchetype(m.archetypeId);
              return (
                <tr key={m.assessmentType}>
                  <td className="px-4 py-2 font-medium text-gray-900 font-mono text-xs">
                    {m.assessmentType}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {pp?.label ?? m.problemPointId}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {ar?.label ?? m.archetypeId}
                  </td>
                  <td className="px-4 py-2 text-gray-700 font-mono text-xs">
                    {m.scoringTemplateId}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {m.plannedExtendsToProblemPointIds?.length
                      ? m.plannedExtendsToProblemPointIds
                          .map((id) => getProblemPoint(id)?.label ?? id)
                          .join(', ')
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function ProblemPointTaxonomy({ problemPoints }: { problemPoints: ProblemPoint[] }) {
  return (
    <SectionCard
      title="Problem-Point Taxonomy"
      description="The Fine Diet prospect problem points an assessment can address. Grounded in the program catalogue so assessments route into real pathways. Status shows whether an assessment is available for this problem point today."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {problemPoints.map((p) => (
          <div key={p.id} className="border border-gray-200 rounded-md p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-gray-900">{p.label}</div>
                <div className="font-mono text-xs text-gray-500">{p.id}</div>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <p className="text-sm text-gray-700">{p.summary}</p>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Related programs: </span>
              {p.relatedProgramSlugs.join(', ')}
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Suggested archetypes: </span>
              {p.suggestedArchetypeIds
                .map((id) => getArchetype(id)?.label ?? id)
                .join(', ')}
            </div>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Suggested templates: </span>
              {p.suggestedScoringTemplateIds.join(', ')}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function ArchetypeGallery({ archetypes }: { archetypes: AssessmentArchetype[] }) {
  return (
    <SectionCard
      title="Assessment Archetypes"
      description="Reusable assessment shapes, independent of problem point. Gut Check is the reference instance of the axis-profile archetype. Wiring a new archetype for a non-Gut-Check assessment still requires engineering (scoring engine + results template)."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {archetypes.map((a) => (
          <div key={a.id} className="border border-gray-200 rounded-md p-4 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-gray-900">{a.label}</div>
                <div className="font-mono text-xs text-gray-500">{a.id}</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
            <p className="text-sm text-gray-700">{a.summary}</p>
            <div className="text-xs text-gray-600">
              <span className="font-medium text-gray-700">Compatible templates: </span>
              {a.compatibleScoringTemplateIds.join(', ')}
            </div>
            {a.referenceAssessmentType && (
              <div className="text-xs text-gray-600">
                <span className="font-medium text-gray-700">Reference: </span>
                <span className="font-mono">{a.referenceAssessmentType}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function ScoringTemplateGallery({ templates }: { templates: ScoringTemplate[] }) {
  return (
    <SectionCard
      title="Scoring Templates"
      description="Reusable scoring-template metadata: how answers become a result. METADATA ONLY — this is not a generalized scoring-rule engine. Only the Gut Check axis template is implemented today; a scoring-template selector is planned, not built."
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Output kind</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Applicable archetypes</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {templates.map((t) => (
              <tr key={t.id}>
                <td className="px-4 py-2">
                  <div className="font-medium text-gray-900">{t.label}</div>
                  <div className="font-mono text-xs text-gray-500">{t.id}</div>
                  <div className="text-xs text-gray-600 mt-1">{t.summary}</div>
                </td>
                <td className="px-4 py-2 font-mono text-xs text-gray-700">{t.outputKind}</td>
                <td className="px-4 py-2 text-xs text-gray-700">
                  {t.applicableArchetypeIds.join(', ')}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={t.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function CreationWorkflow({ stages }: { stages: CreationWorkflowStage[] }) {
  return (
    <SectionCard
      title="Creation Workflow"
      description="The intended path from a problem point to a published assessment. Each stage is labelled honestly — available stages are actionable today; planned stages are designed but not built."
    >
      <ol className="space-y-3">
        {stages.map((stage) => (
          <li
            key={stage.id}
            className="border border-gray-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-start gap-3"
          >
            <div className="flex items-center gap-3 sm:w-48 sm:flex-shrink-0">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold">
                {stage.order}
              </span>
              <div className="font-medium text-gray-900">{stage.label}</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <StatusBadge status={stage.status} />
                {stage.availableAtHref && (
                  <Link
                    href={stage.availableAtHref}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Open tool →
                  </Link>
                )}
              </div>
              <p className="text-sm text-gray-700">{stage.description}</p>
              {stage.notes && (
                <p className="text-xs text-gray-600 mt-2">{stage.notes}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function FactoryRoadmapNote() {
  return (
    <SectionCard
      title="What is available now vs what is planned"
      description="Honest summary of the gaps required before a non-engineer can publish an arbitrary assessment."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Available today</h3>
          <ul className="space-y-1 text-gray-700 list-disc list-inside">
            <li>Problem-point taxonomy, archetypes, scoring templates (metadata)</li>
            <li>Operations contract + publish-readiness checklist (Packet I)</li>
            <li>Structured question-set authoring UI (Packet H) for declared assessments</li>
            <li>Question-set + results-pack preview and publish pointers</li>
            <li>Gut Check runtime, scoring, results, email, PDF, claim — unchanged</li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Planned before full factory</h3>
          <ul className="space-y-1 text-gray-700 list-disc list-inside">
            <li>Scoring-template selector + generalized scoring-rule engine</li>
            <li>Outcome builder UI (level / persona / recommendation mapping)</li>
            <li>Forced-result preview harness per outcome</li>
            <li>Assessment-type-keyed scoring dispatch (decouple from Gut Check engine)</li>
            <li>PDF / email / CTA / program-routing configuration per assessment</li>
            <li>Governance checks for non-diagnostic claims and medical guardrails</li>
          </ul>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-4">
        See <span className="font-mono">docs/assessments/assessment-factory.md</span> for
        the full factory guide and the recommended Packet K next step.
      </p>
    </SectionCard>
  );
}
