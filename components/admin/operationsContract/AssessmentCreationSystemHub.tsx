/**
 * Assessment Creation System Hub (Packet K)
 *
 * Presentational component that renders the assessment creation-system
 * maturity surface for /admin/assessments (Packet K):
 *   - "Where do I create / edit / activate an assessment today?" header,
 *   - planned assessment concepts grouped by problem point (proving one
 *     problem point can hold many assessments),
 *   - admin-owned vs engineering-owned ownership split,
 *   - reusable activation checklist with admin / engineering / shared badges,
 *   - honest "available now vs requires engineering" summary.
 *
 * Pure-presentational: all data comes from `lib/assessments/assessmentCreationPlan`
 * and `lib/assessments/assessmentFactory`. Nothing here creates, registers,
 * routes, or publishes an assessment. Every planned concept is labelled
 * planning-only / not live / not public.
 */

import Link from 'next/link';
import {
  listPlannedAssessmentConcepts,
  listPlannedConceptsForProblemPoint,
  listActivationChecklistSteps,
  listActivationStepsByOwnership,
  summarizeCreationSystem,
  isPlannedConceptLive,
  PLAN_STATUS_LABELS,
  type PlannedAssessmentConcept,
  type AssessmentActivationStep,
  type AssessmentCreationOwnership,
  type AssessmentCreationPlanStatus,
} from '@/lib/assessments/assessmentCreationPlan';
import {
  listProblemPoints,
  getProblemPoint,
  getArchetype,
  getScoringTemplate,
  type FactoryCapabilityStatus,
} from '@/lib/assessments/assessmentFactory';

const OWNERSHIP_STYLES: Record<AssessmentCreationOwnership, string> = {
  admin: 'bg-green-100 text-green-800',
  engineering: 'bg-purple-100 text-purple-800',
  shared: 'bg-yellow-100 text-yellow-800',
};

const OWNERSHIP_LABELS: Record<AssessmentCreationOwnership, string> = {
  admin: 'Admin-owned',
  engineering: 'Engineering-owned',
  shared: 'Shared',
};

const PLAN_STATUS_STYLES: Record<AssessmentCreationPlanStatus, string> = {
  idea: 'bg-gray-200 text-gray-700',
  planned: 'bg-blue-100 text-blue-800',
  'scaffold-ready': 'bg-teal-100 text-teal-800',
  'activation-blocked': 'bg-orange-100 text-orange-800',
  'ready-for-engineering-handoff': 'bg-green-100 text-green-800',
};

const STEP_STATUS_STYLES: Record<FactoryCapabilityStatus, string> = {
  available: 'bg-green-100 text-green-800',
  planned: 'bg-blue-100 text-blue-800',
  'manual-review': 'bg-yellow-100 text-yellow-800',
  'not-implemented': 'bg-gray-200 text-gray-700',
};

const STEP_STATUS_LABELS: Record<FactoryCapabilityStatus, string> = {
  available: 'Available',
  planned: 'Planned',
  'manual-review': 'Manual review',
  'not-implemented': 'Not implemented',
};

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

export default function AssessmentCreationSystemHub() {
  const concepts = listPlannedAssessmentConcepts();
  const problemPoints = listProblemPoints();
  const checklist = listActivationChecklistSteps();
  const summary = summarizeCreationSystem();

  return (
    <div className="space-y-8">
      <CreationSystemHeader summary={summary} />
      <WhereDoITodayCard />
      <PlannedConceptsByProblemPoint
        problemPoints={problemPoints}
        concepts={concepts}
      />
      <ActivationChecklist steps={checklist} />
      <OwnershipSplitCard />
      <AvailableNowVsRequiresEngineeringCard />
    </div>
  );
}

// ---------------------------------------------------------------------------

function CreationSystemHeader({
  summary,
}: {
  summary: ReturnType<typeof summarizeCreationSystem>;
}) {
  return (
    <section className="bg-gradient-to-br from-indigo-900 to-indigo-800 rounded-lg shadow-sm text-white p-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold mb-1">Assessment Creation System</h2>
          <p className="text-sm text-indigo-200">
            Maturity view (Packet K): problem points are categories that can hold
            many assessments. Planned concepts are planning-only — they are not
            live, not registered, not routed, and not persisted to a database.
            Activation still requires engineering for registry, scoring
            dispatch, routes, and artifact coverage.
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <ReadinessStat
            label="Planned concepts"
            value={String(summary.plannedConcepts.total)}
            sub="planning-only"
          />
          <ReadinessStat
            label="Problem points with 2+"
            value={String(summary.problemPointsWithMultipleConcepts)}
            sub="multi-assessment"
          />
          <ReadinessStat
            label="Activation steps"
            value={String(summary.activationChecklist.total)}
            sub={`${summary.activationChecklist.adminOwned} admin / ${summary.activationChecklist.engineeringOwned} eng`}
          />
          <ReadinessStat
            label="Live concepts"
            value={String(summary.liveConcepts)}
            sub="always 0 in v1"
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
      <div className="text-xs uppercase tracking-wide text-indigo-200">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] text-indigo-300">{sub}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function WhereDoITodayCard() {
  return (
    <SectionCard
      title="Where do I create, edit, or activate assessments today?"
      description="Plain answers for an admin landing on this page. Nothing here implies a non-engineer can publish an arbitrary assessment today."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionTile
          label="Edit an existing assessment"
          body="Edit question sets and results packs for declared assessments (Gut Check today) in the CMS."
          href="/admin/question-sets/author"
          cta="Open authoring UI"
          status="available"
        />
        <ActionTile
          label="Plan a new assessment"
          body="New assessments start as a planning/scaffold workflow. Use the planned concepts below as the vocabulary. No DB persistence in v1."
          href="/admin/assessments"
          cta="View planned concepts"
          status="planned"
        />
        <ActionTile
          label="Activate a planned path"
          body="Activation requires engineering: registry entry, scoring dispatch, public route, artifact coverage, QA. Use the activation checklist below."
          href="#activation-checklist"
          cta="View activation checklist"
          status="planned"
        />
      </div>
      <div className="mt-4 text-xs text-gray-600 space-y-1">
        <p>
          <span className="font-medium text-gray-700">Useful links: </span>
          <Link href="/admin/question-sets/author" className="text-blue-600 hover:underline">/admin/question-sets/author</Link>
          {' · '}
          <Link href="/admin/question-sets" className="text-blue-600 hover:underline">/admin/question-sets</Link>
          {' · '}
          <Link href="/admin/results-packs" className="text-blue-600 hover:underline">/admin/results-packs</Link>
          {' · '}
          <Link href="/admin/assessments" className="text-blue-600 hover:underline">operations contract + readiness</Link>
        </p>
        <p>
          See <span className="font-mono">docs/assessments/assessment-creation-manual.md</span> for
          the full operating manual.
        </p>
      </div>
    </SectionCard>
  );
}

function ActionTile({
  label,
  body,
  href,
  cta,
  status,
}: {
  label: string;
  body: string;
  href: string;
  cta: string;
  status: FactoryCapabilityStatus;
}) {
  return (
    <div className="border border-gray-200 rounded-md p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-gray-900">{label}</div>
        <span className={`px-2 py-1 text-xs font-medium rounded ${STEP_STATUS_STYLES[status]}`}>
          {STEP_STATUS_LABELS[status]}
        </span>
      </div>
      <p className="text-sm text-gray-700 flex-1">{body}</p>
      <Link
        href={href}
        className="text-xs text-blue-600 hover:text-blue-800 hover:underline mt-1"
      >
        {cta} →
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlannedConceptsByProblemPoint({
  problemPoints,
  concepts,
}: {
  problemPoints: ReturnType<typeof listProblemPoints>;
  concepts: PlannedAssessmentConcept[];
}) {
  return (
    <SectionCard
      title="Planned Assessment Concepts by Problem Point"
      description="Problem points are categories — one problem point can hold many planned assessments. Every concept below is planning-only: not live, not registered, not routed, not persisted."
    >
      <div className="space-y-4">
        {problemPoints.map((pp) => {
          const ppConcepts = listPlannedConceptsForProblemPoint(pp.id);
          return (
            <div
              key={pp.id}
              className="border border-gray-200 rounded-md p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-medium text-gray-900">{pp.label}</div>
                  <div className="font-mono text-xs text-gray-500">{pp.id}</div>
                </div>
                <div className="text-xs text-gray-600">
                  {ppConcepts.length} planned concept{ppConcepts.length === 1 ? '' : 's'}
                </div>
              </div>
              {ppConcepts.length === 0 ? (
                <p className="text-xs text-gray-500 italic">
                  No planned concepts yet for this problem point.
                </p>
              ) : (
                <ul className="space-y-2">
                  {ppConcepts.map((c) => (
                    <PlannedConceptRow key={c.id} concept={c} />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 mt-4">
        Total: {concepts.length} planning-only concepts across{' '}
        {problemPoints.length} problem points. None are live or registered.
      </p>
    </SectionCard>
  );
}

function PlannedConceptRow({ concept }: { concept: PlannedAssessmentConcept }) {
  const archetype = getArchetype(concept.archetypeId);
  const template = getScoringTemplate(concept.scoringTemplateId);
  return (
    <li className="border border-gray-100 rounded-md p-3 bg-gray-50">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <div className="font-medium text-gray-900 text-sm">{concept.workingTitle}</div>
          <div className="font-mono text-xs text-gray-500">{concept.id}</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-1 text-xs font-medium rounded ${PLAN_STATUS_STYLES[concept.status]}`}>
            {PLAN_STATUS_LABELS[concept.status]}
          </span>
          <span className="px-2 py-1 text-xs font-medium rounded bg-red-50 text-red-700">
            Not live · Not public
          </span>
        </div>
      </div>
      <p className="text-sm text-gray-700 mt-2">{concept.intendedUse}</p>
      <div className="text-xs text-gray-600 mt-2 flex flex-wrap gap-x-3 gap-y-1">
        <span><span className="font-medium text-gray-700">Archetype:</span> {archetype?.label ?? concept.archetypeId}</span>
        <span><span className="font-medium text-gray-700">Template:</span> {template?.label ?? concept.scoringTemplateId}</span>
        <span><span className="font-medium text-gray-700">Persisted:</span> {concept.persisted ? 'yes' : 'no'}</span>
        <span><span className="font-medium text-gray-700">Live check:</span> {isPlannedConceptLive(concept.id) ? 'live' : 'not live'}</span>
      </div>
      {concept.activationBlockerStepIds.length > 0 && (
        <div className="text-xs text-gray-600 mt-1">
          <span className="font-medium text-gray-700">Activation blockers:</span>{' '}
          {concept.activationBlockerStepIds.join(', ')}
        </div>
      )}
      <div className="mt-3">
        <Link
          href={`/admin/assessments/create?concept=${encodeURIComponent(concept.id)}`}
          className="inline-block text-xs font-medium text-white bg-gray-900 rounded-md px-3 py-1.5 hover:bg-gray-800"
          title="Open the planning-only wizard prefilled from this concept"
        >
          Plan with wizard →
        </Link>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

function ActivationChecklist({ steps }: { steps: AssessmentActivationStep[] }) {
  const adminSteps = listActivationStepsByOwnership('admin');
  const engSteps = listActivationStepsByOwnership('engineering');
  const sharedSteps = listActivationStepsByOwnership('shared');
  return (
    <SectionCard
      title="Activation Checklist"
      description="The reusable, honest list of work required to take a planned concept from idea to a live, public, registered assessment. Each step is labelled with who owns it."
    >
      <div id="activation-checklist" className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <OwnershipCountCard
          label="Admin-owned"
          count={adminSteps.length}
          className="bg-green-50 border-green-200"
        />
        <OwnershipCountCard
          label="Engineering-owned"
          count={engSteps.length}
          className="bg-purple-50 border-purple-200"
        />
        <OwnershipCountCard
          label="Shared"
          count={sharedSteps.length}
          className="bg-yellow-50 border-yellow-200"
        />
      </div>
      <ol className="space-y-3">
        {steps.map((step) => (
          <li
            key={step.id}
            className="border border-gray-200 rounded-md p-4 flex flex-col sm:flex-row sm:items-start gap-3"
          >
            <div className="flex items-center gap-3 sm:w-56 sm:flex-shrink-0">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-white text-sm font-bold">
                {step.order}
              </span>
              <div className="font-medium text-gray-900 text-sm">{step.label}</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`px-2 py-1 text-xs font-medium rounded ${OWNERSHIP_STYLES[step.ownership]}`}>
                  {OWNERSHIP_LABELS[step.ownership]}
                </span>
                <span className={`px-2 py-1 text-xs font-medium rounded ${STEP_STATUS_STYLES[step.status]}`}>
                  {STEP_STATUS_LABELS[step.status]}
                </span>
                {step.availableAtHref && (
                  <Link
                    href={step.availableAtHref}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Open tool →
                  </Link>
                )}
              </div>
              <p className="text-sm text-gray-700">{step.description}</p>
              {step.notes && (
                <p className="text-xs text-gray-600 mt-2">{step.notes}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

function OwnershipCountCard({
  label,
  count,
  className,
}: {
  label: string;
  count: number;
  className: string;
}) {
  return (
    <div className={`border rounded-md p-4 ${className}`}>
      <div className="text-xs uppercase tracking-wide text-gray-600">{label}</div>
      <div className="text-2xl font-bold text-gray-900">{count}</div>
      <div className="text-xs text-gray-600">steps</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function OwnershipSplitCard() {
  return (
    <SectionCard
      title="Admin-owned vs Engineering-owned"
      description="What an admin can do today vs what still requires an engineer. This is the honest split that governs the creation system."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Admin-owned today</h3>
          <ul className="space-y-1 text-gray-700 list-disc list-inside">
            <li>Choose problem point / archetype (planning)</li>
            <li>Author question set content</li>
            <li>Author results pack content</li>
            <li>Preview question set + results packs</li>
            <li>Confirm publish-readiness checklist</li>
            <li>Publish pointers (admin role only)</li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Engineering-owned</h3>
          <ul className="space-y-1 text-gray-700 list-disc list-inside">
            <li>Registry entry (code-owned)</li>
            <li>Operations contract + factory coordinates</li>
            <li>Scoring dispatch by assessmentType</li>
            <li>Public route</li>
            <li>Email / PDF / webhook / CTA routing per assessment</li>
            <li>Artifact payload coverage wiring</li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Shared</h3>
          <ul className="space-y-1 text-gray-700 list-disc list-inside">
            <li>Outcome shape design (admin) + mapping (engineering today)</li>
            <li>Forced-result preview (engineering harness, admin uses)</li>
            <li>QA the public route (admin smoke + engineering verify)</li>
          </ul>
        </div>
      </div>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------

function AvailableNowVsRequiresEngineeringCard() {
  return (
    <SectionCard
      title="Available now vs requires engineering"
      description="Honest summary. Planned assessment concepts are not persisted, not live, and not public in v1."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Available now</h3>
          <ul className="space-y-1 text-gray-700 list-disc list-inside">
            <li>Edit existing assessments via /admin/question-sets/author</li>
            <li>Plan a new assessment using the factory vocabulary</li>
            <li>Author question sets + results packs in the CMS</li>
            <li>Preview question sets and results packs</li>
            <li>Publish-readiness checklist (Packet I)</li>
            <li>Gut Check runtime, scoring, results, email, PDF — unchanged</li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 mb-2">Requires engineering</h3>
          <ul className="space-y-1 text-gray-700 list-disc list-inside">
            <li>Scoring-template selector + generalized scoring engine</li>
            <li>Assessment-type-keyed scoring dispatch</li>
            <li>Outcome builder UI for non-level outcomes</li>
            <li>Forced-result preview harness</li>
            <li>Per-assessment email / PDF / webhook / CTA routing</li>
            <li>Public route for a second assessment</li>
            <li>DB persistence for planned concepts (not built in v1)</li>
          </ul>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-4">
        See <span className="font-mono">docs/assessments/assessment-creation-manual.md</span> for
        the operating manual and the recommended next packet.
      </p>
    </SectionCard>
  );
}
