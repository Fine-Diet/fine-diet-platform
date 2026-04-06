/**
 * Module: feature.split-media.v1
 *
 * Rounded content card with a background image and optional Swiper
 * carousel for multiple slides. Thin adapter over the existing
 * FeatureSection component.
 */

import { FeatureSection } from '@/components/home/FeatureSection';
import type { FeatureSplitMediaV1Content } from '@/lib/modules/types';

interface Props {
  content: FeatureSplitMediaV1Content;
}

/** Normalise a ButtonSlot to the variant string FeatureSection expects. */
function adaptButtons(
  buttons?: FeatureSplitMediaV1Content['buttons'],
): Array<{ label: string; variant: string; href: string }> | undefined {
  if (!buttons) return undefined;
  return buttons.map((b) => ({ label: b.label, href: b.href, variant: b.variant ?? 'primary' }));
}

export function FeatureSplitMediaV1({ content }: Props) {
  const adapted = {
    title: content.title,
    description: content.description,
    images: content.images,
    buttons: adaptButtons(content.buttons),
    slides: content.slides?.map((s) => ({
      ...s,
      buttons: adaptButtons(s.buttons),
    })),
  };

  return (
    <div className="px-3 pb-1.5 pt-1.5">
      <FeatureSection content={adapted} />
    </div>
  );
}
