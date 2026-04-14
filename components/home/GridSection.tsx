import { GridItem, GridItemProps } from './GridItem';
import { GridItemEmailCapture } from './GridItemEmailCapture';

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
      {section.title && (
        <h2 className="text-3xl md:text-4xl font-semibold text-white text-center mb-8 md:mb-12">
          {section.title}
        </h2>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-3">
        {section.items.map((item, index) =>
          item.ctaType === 'email-capture' ? (
            <GridItemEmailCapture
              key={index}
              title={item.title}
              description={item.description}
              image={item.image}
              aspect={item.aspect}
              source="home_fine_print"
            />
          ) : (
            <GridItem
              key={index}
              title={item.title}
              description={item.description}
              image={item.image}
              button={item.button}
              aspect={item.aspect}
              ctaType={item.ctaType}
            />
          )
        )}
      </div>
    </div>
  );
};
