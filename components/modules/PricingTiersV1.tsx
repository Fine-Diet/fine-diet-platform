/**
 * Module: pricing.tiers.v1
 *
 * Responsive grid of pricing tier cards. Thin adapter over the
 * existing PricingSection component.
 */

import { PricingSection } from '@/components/category/PricingSection';
import type { PricingTiersV1Content } from '@/lib/modules/types';

interface Props {
  content: PricingTiersV1Content;
}

export function PricingTiersV1({ content }: Props) {
  return (
    <PricingSection
      title={content.title}
      description={content.description}
      cards={content.cards.map((card) => ({
        id: card.id,
        image: card.image ?? '',
        title: card.title,
        subtitle: card.subtitle,
        description: card.description ?? '',
        price: card.price ?? '',
        paymentSchedule: card.paymentSchedule ?? '',
        button: {
          label: card.button.label,
          variant: card.button.variant ?? 'primary',
          href: card.button.href,
        },
      }))}
      columns={content.columns}
    />
  );
}
