import { GridItemMedium, GridItemMediumProps } from './GridItemMedium';

interface GridMediumSectionData {
  title?: string;
  items: GridItemMediumProps[];
}

export interface GridMediumSectionProps {
  section: GridMediumSectionData;
}

export const GridMediumSection = ({ section }: GridMediumSectionProps) => {
  return (
    <div className="w-full">
      {section.title && (
        <h2 className="text-3xl md:text-4xl font-semibold text-white text-center mb-8 md:mb-12">
          {section.title}
        </h2>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-3">
        {section.items.map((item, index) => (
          <GridItemMedium
            key={index}
            title={item.title}
            description={item.description}
            image={item.image}
            button={item.button}
            aspect={item.aspect}
            ctaType={item.ctaType}
          />
        ))}
      </div>
    </div>
  );
};
