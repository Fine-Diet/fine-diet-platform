import { GridItemApp } from './GridItemApp';
import type { SummaryRowModule } from '@/lib/summaryRowTypes';

export interface GridSectionAppProps {
  title?: string;
  modules: SummaryRowModule[];
}

/**
 * Grid Section App — Full-width container; each tile's copy section is max 650px.
 * Renders GridItemApp cards in a vertical list with gap-3.
 */
export function GridSectionApp({ title, modules }: GridSectionAppProps) {
  return (
    <div className="w-full max-w-[1000px] m-auto">
      {title && (
        <h2 className="text-2xl md:text-3xl font-semibold text-white text-left mb-4 md:mb-6 antialiased">
          {title}
        </h2>
      )}
      <div className="flex flex-col gap-3">
        {modules.map((mod) => (
          <GridItemApp key={mod.id} module={mod} />
        ))}
      </div>
    </div>
  );
}
