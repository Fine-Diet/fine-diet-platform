/**
 * Module: process.timed-steps.v1
 *
 * Table-style "how it works" process section. Thin composition wrapper around the
 * code-owned `TimedProcessSteps` visual so the reusable module renders EXACTLY the
 * same table-style rows (number · title · description, auto-advancing highlight)
 * as the static `/programs/[category-slug]` page. Distinct from the image-driven
 * `process.slide-stack.v1` slideshow.
 *
 * Renders nothing when there are no steps (matches the per-module skip policy).
 */

import type { ProcessTimedStepsV1Content } from '@/lib/modules/types';
import TimedProcessSteps from '@/components/programs/TimedProcessSteps';

interface Props {
  content: ProcessTimedStepsV1Content;
}

export function ProcessTimedStepsV1({ content }: Props) {
  if (!content.steps || content.steps.length === 0) return null;

  return (
    <TimedProcessSteps
      heading={content.heading}
      steps={content.steps.map((step) => ({
        stepNumber: step.stepNumber,
        // TimedProcessSteps' CategoryProcessStep requires `label`; it is not shown
        // in the row body, so default to an empty string when omitted.
        label: step.label ?? '',
        title: step.title,
        description: step.description,
      }))}
    />
  );
}
