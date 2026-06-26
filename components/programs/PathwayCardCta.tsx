'use client';

import Link from 'next/link';
import { Button, buttonClassNames } from '@/components/ui/Button';
import type { ProgramMarketingCtaResolution } from '@/lib/programs/programCollectionTypes';

export default function PathwayCardCta({ cta }: { cta: ProgramMarketingCtaResolution }) {
  const isActive = Boolean(cta.href) && !cta.disabled;

  if (isActive && cta.href) {
    return (
      <Link
        href={cta.href}
        className={`flex w-full ${buttonClassNames({
          variant: 'quinary',
          size: 'md',
          className: 'w-full bg-neutral-950 hover:bg-neutral-800',
        })}`}
      >
        {cta.label}
      </Link>
    );
  }

  return (
    <div className="flex w-full">
      <Button variant="secondary" size="md" disabled className="w-full">
        {cta.label}
      </Button>
    </div>
  );
}
