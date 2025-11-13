import { GridItem, GridItemProps } from './GridItem';

interface GridSectionData {
  title?: string;
  items: GridItemProps[];
}

export interface GridSectionProps {
  section: GridSectionData;
}

export const GridSection = ({ section }: GridSectionProps) => {
  return (
    <div className="w-full">
      {/* Optional Section Title */}
      {section.title && (
        <h2 className="text-3xl md:text-4xl font-semibold text-white text-center mb-8 md:mb-12">
          {section.title}
        </h2>
      )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
        {section.items.map((item, index) => (
          <GridItem
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

