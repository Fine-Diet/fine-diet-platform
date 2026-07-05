/**
 * Assessment Creation Wizard v1 UI (Packet L)
 *
 * Interactive, planning-only wizard rendered on `/admin/assessments/create`.
 * Walks an admin through: problem point → planned concept/blank → archetype →
 * scoring template → compatibility → admin-owned fields → engineering-owned
 * fields → activation checklist → copyable planning handoff.
 *
 * Non-mutating. Nothing here persists, registers, routes, or publishes an
 * assessment. The helper module `lib/assessments/assessmentCreationWizard`
 * is the single source of truth for draft state, filtering, validation, and
 * handoff generation; this component only renders + dispatches draft updates.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  createEmptyDraft,
  prefillDraftFromConcept,
  listArchetypesForDraft,
  listScoringTemplatesForDraft,
  isArchetypeTemplateCompatible,
  validateDraft,
  computeStepCompletion,
  generateHandoff,
  isDraftLive,
  isDraftPersisted,
  WIZARD_STEPS,
  WIZARD_STEP_LABELS,
  listProblemPoints,
  listPlannedConceptsForProblemPoint,
  listActivationChecklistSteps,
  listActivationStepsByOwnership,
  getPlannedAssessmentConcept,
  isPlannedConceptLive,
  type WizardDraft,
  type WizardStepId,
} from '@/lib/assessments/assessmentCreationWizard';
import {
  getArchetype,
  getScoringTemplate,
  type FactoryCapabilityStatus,
} from '@/lib/assessments/assessmentFactory';
import type { AssessmentCreationOwnership } from '@/lib/assessments/assessmentCreationPlan';

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

interface Props {
  /** Initial planned concept id to prefill from, if any (?concept=...). */
  initialConceptId?: string | null;
}

type CopyFormat = 'markdown' | 'json';

export default function AssessmentCreationWizard({ initialConceptId }: Props) {
  const prefill = useMemo(() => {
    if (!initialConceptId) return null;
    return prefillDraftFromConcept(initialConceptId);
  }, [initialConceptId]);

  const [draft, setDraft] = useState<WizardDraft>(() =>
    prefill ? prefill.draft : createEmptyDraft()
  );
  const [activeStep, setActiveStep] = useState<WizardStepId>('choose-problem-point');
  const [copyFormat, setCopyFormat] = useState<CopyFormat>('markdown');
  const [copied, setCopied] = useState(false);

  const validation = useMemo(() => validateDraft(draft), [draft]);
  const completion = useMemo(() => computeStepCompletion(draft), [draft]);
  const handoffOut = useMemo(() => generateHandoff(draft), [draft]);
  const archetypes = useMemo(() => listArchetypesForDraft(draft), [draft]);
  const templates = useMemo(() => listScoringTemplatesForDraft(draft), [draft]);
  const problemPoints = useMemo(() => listProblemPoints(), []);
  const conceptsForProblemPoint = useMemo(
    () => listPlannedConceptsForProblemPoint(draft.problemPointId),
    [draft.problemPointId]
  );
  const checklist = useMemo(() => listActivationChecklistSteps(), []);
  const adminSteps = useMemo(() => listActivationStepsByOwnership('admin'), []);
  const engSteps = useMemo(() => listActivationStepsByOwnership('engineering'), []);
  const sharedSteps = useMemo(() => listActivationStepsByOwnership('shared'), []);

  const update = (patch: Partial<WizardDraft>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const handleCopy = async () => {
    const text = copyFormat === 'markdown' ? handoffOut.markdown : handoffOut.json;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the text is still selectable in the textarea.
    }
  };

  const activeStepIndex = WIZARD_STEPS.indexOf(activeStep);
  const goNext = () => {
    const next = WIZARD_STEPS[activeStepIndex + 1];
    if (next) setActiveStep(next);
  };
  const goBack = () => {
    const prev = WIZARD_STEPS[activeStepIndex - 1];
    if (prev) setActiveStep(prev);
  };

  return (
    <div className="space-y-6">
      <PlanningOnlyBanner
        prefillOk={prefill?.ok === false && !!initialConceptId}
        prefillReason={prefill?.ok === false ? prefill.fallbackReason : undefined}
      />

      <StepNav
        activeStep={activeStep}
        completion={completion}
        onSelect={setActiveStep}
      />

      {activeStep === 'choose-problem-point' && (
        <ChooseProblemPointStep
          draft={draft}
          problemPoints={problemPoints}
          onSelect={(id) => {
            update({ problemPointId: id, plannedConceptId: null });
          }}
        />
      )}

      {activeStep === 'choose-concept' && (
        <ChooseConceptStep
          draft={draft}
          conceptsForProblemPoint={conceptsForProblemPoint}
          onChooseConcept={(conceptId) => {
            const res = prefillDraftFromConcept(conceptId, draft);
            if (res.ok) setDraft(res.draft);
          }}
          onClearConcept={() =>
            update({ plannedConceptId: null })
          }
          onWorkingTitleChange={(v) => update({ workingTitle: v })}
          onIntendedUseChange={(v) => update({ intendedUse: v })}
        />
      )}

      {activeStep === 'choose-archetype' && (
        <ChooseArchetypeStep
          draft={draft}
          archetypes={archetypes}
          onSelect={(id) => update({ archetypeId: id })}
        />
      )}

      {activeStep === 'choose-scoring-template' && (
        <ChooseScoringTemplateStep
          draft={draft}
          templates={templates}
          onSelect={(id) => update({ scoringTemplateId: id })}
        />
      )}

      {activeStep === 'review-compatibility' && (
        <ReviewCompatibilityStep draft={draft} />
      )}

      {activeStep === 'review-admin-fields' && (
        <ReviewAdminFieldsStep draft={draft} adminSteps={adminSteps} />
      )}

      {activeStep === 'review-engineering-fields' && (
        <ReviewEngineeringFieldsStep draft={draft} engSteps={engSteps} sharedSteps={sharedSteps} />
      )}

      {activeStep === 'review-activation-checklist' && (
        <ReviewActivationChecklistStep checklist={checklist} />
      )}

      {activeStep === 'generate-handoff' && (
        <GenerateHandoffStep
          draft={draft}
          validation={validation}
          canGenerate={validation.canGenerateHandoff}
          markdown={handoffOut.markdown}
          json={handoffOut.json}
          copyFormat={copyFormat}
          copied={copied}
          onFormatChange={setCopyFormat}
          onCopy={handleCopy}
        />
      )}

      <StepFooter
        activeStep={activeStep}
        onBack={goBack}
        onNext={goNext}
        canGoNext={activeStep !== 'generate-handoff'}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlanningOnlyBanner({
  prefillOk,
  prefillReason,
}: {
  prefillOk?: boolean;
  prefillReason?: string;
}) {
  return (
    <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>⚠️</span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-amber-900">
            Planning-only — not persisted, not live, not public
          </h2>
          <p className="text-sm text-amber-800 mt-1">
            This wizard helps you form a complete assessment plan and copy an
            engineering handoff. It does <strong>not</strong> create, register,
            route, publish, or persist an assessment. Activation still requires
            engineering (registry, scoring dispatch, public route, artifact
            coverage). No public route is created for any planned concept.
          </p>
          {prefillOk && prefillReason && (
            <p className="text-sm text-amber-900 mt-2 font-medium">
              Prefill notice: {prefillReason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function StepNav({
  activeStep,
  completion,
  onSelect,
}: {
  activeStep: WizardStepId;
  completion: Record<WizardStepId, boolean>;
  onSelect: (s: WizardStepId) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2 bg-white border border-gray-200 rounded-lg p-3">
      {WIZARD_STEPS.map((step, idx) => {
        const isActive = step === activeStep;
        const isDone = completion[step];
        return (
          <li key={step} className="flex items-center">
            <button
              type="button"
              onClick={() => onSelect(step)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : isDone
                  ? 'bg-green-50 text-green-800 hover:bg-green-100'
                  : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span
                className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                  isActive ? 'bg-white/20' : isDone ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}
              >
                {isDone ? '✓' : idx + 1}
              </span>
              <span className="hidden sm:inline">{WIZARD_STEP_LABELS[step]}</span>
            </button>
            {idx < WIZARD_STEPS.length - 1 && (
              <span className="text-gray-300 mx-1" aria-hidden>›</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({
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

function StepFooter({
  activeStep,
  onBack,
  onNext,
  canGoNext,
}: {
  activeStep: WizardStepId;
  onBack: () => void;
  onNext: () => void;
  canGoNext: boolean;
}) {
  const isFirst = activeStep === WIZARD_STEPS[0];
  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        onClick={onBack}
        disabled={isFirst}
        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        ← Back
      </button>
      {canGoNext && (
        <button
          type="button"
          onClick={onNext}
          className="px-4 py-2 text-sm font-medium text-white bg-gray-900 rounded-md hover:bg-gray-800"
        >
          Next →
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ChooseProblemPointStep({
  draft,
  problemPoints,
  onSelect,
}: {
  draft: WizardDraft;
  problemPoints: ReturnType<typeof listProblemPoints>;
  onSelect: (id: string) => void;
}) {
  return (
    <StepCard
      title="Step 1 — Choose a problem point"
      description="Pick the Fine Diet prospect problem point this assessment addresses. Grounds the assessment in a real program pathway."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {problemPoints.map((pp) => {
          const selected = draft.problemPointId === pp.id;
          const conceptCount = listPlannedConceptsForProblemPoint(pp.id).length;
          return (
            <button
              key={pp.id}
              type="button"
              onClick={() => onSelect(pp.id)}
              className={`text-left border rounded-md p-4 transition-colors ${
                selected
                  ? 'border-gray-900 bg-gray-50 ring-2 ring-gray-900'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-gray-900">{pp.label}</div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${STEP_STATUS_STYLES[pp.status]}`}>
                  {STEP_STATUS_LABELS[pp.status]}
                </span>
              </div>
              <div className="font-mono text-xs text-gray-500 mt-0.5">{pp.id}</div>
              <p className="text-sm text-gray-700 mt-2">{pp.summary}</p>
              <div className="text-xs text-gray-600 mt-2">
                {conceptCount} planned concept{conceptCount === 1 ? '' : 's'}
              </div>
            </button>
          );
        })}
      </div>
    </StepCard>
  );
}

function ChooseConceptStep({
  draft,
  conceptsForProblemPoint,
  onChooseConcept,
  onClearConcept,
  onWorkingTitleChange,
  onIntendedUseChange,
}: {
  draft: WizardDraft;
  conceptsForProblemPoint: ReturnType<typeof listPlannedConceptsForProblemPoint>;
  onChooseConcept: (conceptId: string) => void;
  onClearConcept: () => void;
  onWorkingTitleChange: (v: string) => void;
  onIntendedUseChange: (v: string) => void;
}) {
  return (
    <StepCard
      title="Step 2 — Choose a planned concept or draft blank"
      description="Prefill from an existing planned concept (planning-only metadata) or draft a blank concept by entering a working title and intended use."
    >
      {!draft.problemPointId && (
        <p className="text-sm text-gray-500 italic mb-4">
          Choose a problem point first to see its planned concepts, or draft a blank concept below.
        </p>
      )}

      {draft.problemPointId && conceptsForProblemPoint.length > 0 && (
        <div className="mb-6">
          <h3 className="font-medium text-gray-900 mb-2">Planned concepts for this problem point</h3>
          <ul className="space-y-2">
            {conceptsForProblemPoint.map((c) => {
              const selected = draft.plannedConceptId === c.id;
              const archetype = getArchetype(c.archetypeId);
              const template = getScoringTemplate(c.scoringTemplateId);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onChooseConcept(c.id)}
                    className={`w-full text-left border rounded-md p-3 transition-colors ${
                      selected
                        ? 'border-gray-900 bg-gray-50 ring-2 ring-gray-900'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{c.workingTitle}</div>
                        <div className="font-mono text-xs text-gray-500">{c.id}</div>
                      </div>
                      <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-50 text-red-700">
                        Not live · Not public
                      </span>
                    </div>
                    <p className="text-sm text-gray-700 mt-2">{c.intendedUse}</p>
                    <div className="text-xs text-gray-600 mt-1">
                      Archetype: {archetype?.label ?? c.archetypeId} · Template: {template?.label ?? c.scoringTemplateId}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {draft.plannedConceptId && (
        <div className="mb-4 text-sm">
          <span className="text-gray-700">
            Prefilled from <span className="font-mono">{draft.plannedConceptId}</span>.{' '}
          </span>
          <button
            type="button"
            onClick={onClearConcept}
            className="text-blue-600 hover:underline"
          >
            Clear prefill and draft blank
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Working title (planning label only)</span>
          <input
            type="text"
            value={draft.workingTitle}
            onChange={(e) => onWorkingTitleChange(e.target.value)}
            placeholder="e.g. Starter readiness assessment"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Intended use / audience</span>
          <textarea
            value={draft.intendedUse}
            onChange={(e) => onIntendedUseChange(e.target.value)}
            placeholder="Plain language: who this is for and what it helps them decide."
            rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:ring-1 focus:ring-gray-900"
          />
        </label>
      </div>
    </StepCard>
  );
}

function ChooseArchetypeStep({
  draft,
  archetypes,
  onSelect,
}: {
  draft: WizardDraft;
  archetypes: ReturnType<typeof listArchetypesForDraft>;
  onSelect: (id: string) => void;
}) {
  return (
    <StepCard
      title="Step 3 — Choose an archetype"
      description="The reusable assessment shape. Filtered by the chosen problem point's suggested archetypes when a problem point is set."
    >
      {archetypes.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No archetypes suggested for this problem point. Choose a different problem point or continue with a blank problem point to see all archetypes.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {archetypes.map((a) => {
          const selected = draft.archetypeId === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onSelect(a.id)}
              className={`text-left border rounded-md p-4 transition-colors ${
                selected
                  ? 'border-gray-900 bg-gray-50 ring-2 ring-gray-900'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-gray-900">{a.label}</div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${STEP_STATUS_STYLES[a.status]}`}>
                  {STEP_STATUS_LABELS[a.status]}
                </span>
              </div>
              <div className="font-mono text-xs text-gray-500 mt-0.5">{a.id}</div>
              <p className="text-sm text-gray-700 mt-2">{a.summary}</p>
              {a.status !== 'available' && (
                <p className="text-xs text-gray-500 mt-2">
                  Wiring this archetype still requires engineering.
                </p>
              )}
            </button>
          );
        })}
      </div>
    </StepCard>
  );
}

function ChooseScoringTemplateStep({
  draft,
  templates,
  onSelect,
}: {
  draft: WizardDraft;
  templates: ReturnType<typeof listScoringTemplatesForDraft>;
  onSelect: (id: string) => void;
}) {
  return (
    <StepCard
      title="Step 4 — Choose a scoring template"
      description="Filtered to templates compatible with the chosen archetype (intersected with the problem point's suggestions when both are set)."
    >
      {templates.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No scoring templates available. Choose an archetype first.
        </p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {templates.map((t) => {
          const selected = draft.scoringTemplateId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className={`text-left border rounded-md p-4 transition-colors ${
                selected
                  ? 'border-gray-900 bg-gray-50 ring-2 ring-gray-900'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium text-gray-900">{t.label}</div>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${STEP_STATUS_STYLES[t.status]}`}>
                  {STEP_STATUS_LABELS[t.status]}
                </span>
              </div>
              <div className="font-mono text-xs text-gray-500 mt-0.5">{t.id}</div>
              <p className="text-sm text-gray-700 mt-2">{t.summary}</p>
              {t.status !== 'available' && (
                <p className="text-xs text-gray-500 mt-2">
                  Template not yet implemented — activation still requires engineering.
                </p>
              )}
            </button>
          );
        })}
      </div>
    </StepCard>
  );
}

function ReviewCompatibilityStep({ draft }: { draft: WizardDraft }) {
  const ok = isArchetypeTemplateCompatible(draft);
  const archetype = draft.archetypeId ? getArchetype(draft.archetypeId) : null;
  const template = draft.scoringTemplateId ? getScoringTemplate(draft.scoringTemplateId) : null;
  return (
    <StepCard
      title="Step 5 — Review compatibility"
      description="The chosen archetype and scoring template must be a declared-compatible pair per the factory metadata."
    >
      {!archetype || !template ? (
        <p className="text-sm text-gray-500 italic">
          Choose both an archetype and a scoring template to review compatibility.
        </p>
      ) : ok ? (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <p className="text-sm text-green-800">
            <strong>Compatible.</strong> Archetype{' '}
            <span className="font-mono">{archetype.id}</span> lists scoring template{' '}
            <span className="font-mono">{template.id}</span> as compatible.
          </p>
        </div>
      ) : (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-800">
            <strong>Not compatible.</strong> Archetype{' '}
            <span className="font-mono">{archetype.id}</span> does not list scoring template{' '}
            <span className="font-mono">{template.id}</span> as compatible. Go back and pick a
            compatible template.
          </p>
        </div>
      )}
    </StepCard>
  );
}

function ReviewAdminFieldsStep({
  draft,
  adminSteps,
}: {
  draft: WizardDraft;
  adminSteps: ReturnType<typeof listActivationStepsByOwnership>;
}) {
  return (
    <StepCard
      title="Step 6 — Review admin-owned fields"
      description="What an admin can do today for this plan. These are the admin-owned activation steps from the reusable checklist."
    >
      <DraftSummary draft={draft} />
      <ul className="space-y-2 mt-4">
        {adminSteps.map((s) => (
          <li key={s.id} className="border border-gray-200 rounded-md p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-gray-900 text-sm">{s.label}</div>
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${STEP_STATUS_STYLES[s.status]}`}>
                {STEP_STATUS_LABELS[s.status]}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-1">{s.description}</p>
            {s.availableAtHref && (
              <Link href={s.availableAtHref} className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                Open tool →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </StepCard>
  );
}

function ReviewEngineeringFieldsStep({
  draft,
  engSteps,
  sharedSteps,
}: {
  draft: WizardDraft;
  engSteps: ReturnType<typeof listActivationStepsByOwnership>;
  sharedSteps: ReturnType<typeof listActivationStepsByOwnership>;
}) {
  return (
    <StepCard
      title="Step 7 — Review engineering-owned fields"
      description="What still requires an engineer to activate this plan. These steps are code-owned and cannot be completed from this wizard."
    >
      <h3 className="font-semibold text-gray-900 mb-2">Engineering-owned</h3>
      <ul className="space-y-2 mb-6">
        {engSteps.map((s) => (
          <li key={s.id} className="border border-gray-200 rounded-md p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-gray-900 text-sm">{s.label}</div>
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${STEP_STATUS_STYLES[s.status]}`}>
                {STEP_STATUS_LABELS[s.status]}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-1">{s.description}</p>
          </li>
        ))}
      </ul>
      <h3 className="font-semibold text-gray-900 mb-2">Shared (admin content + engineering guardrail)</h3>
      <ul className="space-y-2">
        {sharedSteps.map((s) => (
          <li key={s.id} className="border border-gray-200 rounded-md p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-medium text-gray-900 text-sm">{s.label}</div>
              <span className={`px-2 py-0.5 text-xs font-medium rounded ${STEP_STATUS_STYLES[s.status]}`}>
                {STEP_STATUS_LABELS[s.status]}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-1">{s.description}</p>
          </li>
        ))}
      </ul>
    </StepCard>
  );
}

function ReviewActivationChecklistStep({
  checklist,
}: {
  checklist: ReturnType<typeof listActivationChecklistSteps>;
}) {
  return (
    <StepCard
      title="Step 8 — Review activation checklist"
      description="The full, reusable 16-step checklist that takes a planned concept from idea to a live, public, registered assessment. Each step is labelled with who owns it."
    >
      <ol className="space-y-2">
        {checklist.map((s) => (
          <li key={s.id} className="border border-gray-200 rounded-md p-3 flex flex-col sm:flex-row sm:items-start gap-2">
            <div className="flex items-center gap-2 sm:w-64 sm:flex-shrink-0">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-900 text-white text-xs font-bold">
                {s.order}
              </span>
              <div className="font-medium text-gray-900 text-sm">{s.label}</div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${OWNERSHIP_STYLES[s.ownership]}`}>
                  {OWNERSHIP_LABELS[s.ownership]}
                </span>
                <span className={`px-2 py-0.5 text-xs font-medium rounded ${STEP_STATUS_STYLES[s.status]}`}>
                  {STEP_STATUS_LABELS[s.status]}
                </span>
              </div>
              <p className="text-sm text-gray-700">{s.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </StepCard>
  );
}

function GenerateHandoffStep({
  draft,
  validation,
  canGenerate,
  markdown,
  json,
  copyFormat,
  copied,
  onFormatChange,
  onCopy,
}: {
  draft: WizardDraft;
  validation: ReturnType<typeof validateDraft>;
  canGenerate: boolean;
  markdown: string | null;
  json: string | null;
  copyFormat: CopyFormat;
  copied: boolean;
  onFormatChange: (f: CopyFormat) => void;
  onCopy: () => void;
}) {
  const text = copyFormat === 'markdown' ? markdown : json;
  return (
    <StepCard
      title="Step 9 — Generate planning handoff"
      description="Copyable planning/engineering handoff. Paste it into an engineering ticket or doc. It is metadata-only and explicitly planning-only."
    >
      {validation.issues.length > 0 && (
        <div className="mb-4 space-y-2">
          {validation.errors.map((e, i) => (
            <div key={`e-${i}`} className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
              <strong>Error:</strong> {e.message}
            </div>
          ))}
          {validation.warnings.map((w, i) => (
            <div key={`w-${i}`} className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-sm text-yellow-800">
              <strong>Warning:</strong> {w.message}
            </div>
          ))}
        </div>
      )}

      {!canGenerate && (
        <p className="text-sm text-gray-700">
          Fix the errors above (or go back to earlier steps) to generate a handoff.
        </p>
      )}

      {canGenerate && text && (
        <div>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onFormatChange('markdown')}
                className={`px-3 py-1 text-sm rounded-md ${copyFormat === 'markdown' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                Markdown
              </button>
              <button
                type="button"
                onClick={() => onFormatChange('json')}
                className={`px-3 py-1 text-sm rounded-md ${copyFormat === 'json' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700'}`}
              >
                JSON
              </button>
            </div>
            <button
              type="button"
              onClick={onCopy}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </div>
          <textarea
            readOnly
            value={text}
            rows={24}
            className="block w-full font-mono text-xs rounded-md border border-gray-300 px-3 py-2 bg-gray-50"
            onClick={(e) => e.currentTarget.select()}
          />
          <p className="text-xs text-gray-500 mt-2">
            live: {String(isDraftLive())} · persisted: {String(isDraftPersisted())} ·
            public route: false · registered: false. This output does not create an assessment.
          </p>
        </div>
      )}
    </StepCard>
  );
}

function DraftSummary({ draft }: { draft: WizardDraft }) {
  const pp = draft.problemPointId ? listProblemPoints().find((p) => p.id === draft.problemPointId) : null;
  const archetype = draft.archetypeId ? getArchetype(draft.archetypeId) : null;
  const template = draft.scoringTemplateId ? getScoringTemplate(draft.scoringTemplateId) : null;
  const concept = draft.plannedConceptId ? getPlannedAssessmentConcept(draft.plannedConceptId) : null;
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm">
      <div className="font-medium text-gray-900 mb-2">Current plan</div>
      <ul className="space-y-1 text-gray-700">
        <li><span className="font-medium">Working title:</span> {draft.workingTitle || '(unset)'}</li>
        <li><span className="font-medium">Planned concept:</span> {concept ? <span className="font-mono">{concept.id}</span> : '(blank draft)'}</li>
        <li><span className="font-medium">Problem point:</span> {pp ? `${pp.label} (${pp.id})` : '(unset)'}</li>
        <li><span className="font-medium">Archetype:</span> {archetype ? `${archetype.label} (${archetype.id})` : '(unset)'}</li>
        <li><span className="font-medium">Scoring template:</span> {template ? `${template.label} (${template.id})` : '(unset)'}</li>
        {concept && (
          <li><span className="font-medium">Concept live?</span> {isPlannedConceptLive(concept.id) ? 'live' : 'not live (planning-only)'}</li>
        )}
      </ul>
    </div>
  );
}
