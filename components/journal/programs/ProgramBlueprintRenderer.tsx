import { ProgramDeliveryExperience } from './ProgramDeliveryExperience';
import type { ProgramDeliveryModuleDefinition } from '@/lib/programs/deliveryModuleTypes';
import type { ProgramLibraryDetail } from '@/lib/programs/programLibraryServerService';
import type { ProgramBlueprint } from '@/lib/programs/programBlueprint';
import type { DeliveryCompositionSource } from '@/lib/programs/deliveryComposition';
import type { ProgramCheckinTemplate, ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';
import type { ProgramProgressSummary } from '@/lib/programs/progressTypes';

interface Props {
  blueprint: ProgramBlueprint;
  data: ProgramLibraryDetail;
  runtimeSummary: ProgramRuntimeSummary | null;
  modules?: ProgramDeliveryModuleDefinition[];
  progressSummary?: ProgramProgressSummary | null;
  previewMode?: boolean;
  compositionSource?: DeliveryCompositionSource;
  previewCheckinTemplates?: ProgramCheckinTemplate[];
  previewVersionId?: string | null;
  initialSelectedDay?: number;
  initialView?: 'day' | 'schedule';
  initialStartGateOpen?: boolean;
  onRuntimeSummaryUpdate: (summary: ProgramRuntimeSummary) => void;
}

/** Shared adapter from the Blueprint content contract to the existing renderer. */
export function ProgramBlueprintRenderer({
  blueprint,
  data,
  runtimeSummary,
  modules,
  progressSummary = null,
  previewMode = false,
  compositionSource = 'delivery',
  previewCheckinTemplates = [],
  previewVersionId,
  initialSelectedDay,
  initialView,
  initialStartGateOpen,
  onRuntimeSummaryUpdate,
}: Props) {
  return (
    <ProgramDeliveryExperience
      data={{ ...data, slug: blueprint.identity.slug, title: blueprint.identity.title }}
      runtimeSummary={runtimeSummary}
      progressSummary={progressSummary}
      deliveryModules={modules ?? blueprint.modules}
      previewMode={previewMode}
      compositionSource={compositionSource}
      previewCheckinTemplates={previewCheckinTemplates}
      previewVersionId={previewVersionId ?? runtimeSummary?.version.id ?? null}
      initialSelectedDay={initialSelectedDay}
      initialView={initialView}
      initialStartGateOpen={initialStartGateOpen}
      blueprint={blueprint}
      onRuntimeSummaryUpdate={onRuntimeSummaryUpdate}
    />
  );
}
