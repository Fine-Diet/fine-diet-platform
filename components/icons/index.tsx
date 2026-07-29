import { SVGProps } from 'react';

export type IconProps = SVGProps<SVGSVGElement>;

/**
 * Home icon - represents navigation to home/dashboard
 */
export const HomeIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 25 25"
    fill="currentColor"
    {...props}
  >
    <path d="M20.96,21.96h-3.79c-1.2,0-2.18-.98-2.18-2.18v-.07c0-.87-.51-1.65-1.31-2l-.32-.14c-.55-.24-1.18-.24-1.73,0l-.33.14c-.8.34-1.31,1.13-1.31,2v.07c0,1.2-.98,2.18-2.18,2.18h-3.77c-1.2,0-2.18-.98-2.18-2.18v-8.85c0-.72.36-1.4.96-1.8L11.28,3.42c.74-.5,1.7-.5,2.44,0l8.46,5.71c.6.4.96,1.08.96,1.81v8.85c0,1.2-.98,2.18-2.18,2.18Z" />
  </svg>
);

/**
 * Insights icon - represents analytics, data visualization, or eye/view
 */
export const InsightsIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 25 25"
    fill="currentColor"
    {...props}
  >
    <path d="M23.56,12.5h0c-6.11,7.9-16.01,7.9-22.11,0h0s0,0,0,0c6.11-7.9,16.01-7.9,22.11,0h0Z" />
  </svg>
);

/**
 * Programs icon - represents a structured program library or path
 */
export const ProgramsIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 25 25"
    fill="currentColor"
    {...props}
  >
    <path d="M12.5,2.3C6.87,2.3,2.3,6.86,2.3,12.49s4.57,10.19,10.19,10.19,10.19-4.56,10.19-10.19S18.13,2.3,12.5,2.3ZM14.98,13.69c-.2.6-.68,1.08-1.29,1.28l-5.52,1.83,1.85-5.52c.2-.6.68-1.08,1.28-1.28l5.52-1.85-1.83,5.53Z" />
    <path d="M12.5,13.26h0c.42,0,.76-.34.76-.76s-.34-.76-.76-.76h0c-.42,0-.76.34-.76.76s.34.76.76.76" />
  </svg>
);

/**
 * Quadrants icon - represents a four-part workspace. Used by CMS/marketing
 * icon selectors (see lib/modules/*) and by ProgramCategoryView. Not the
 * Food navigation icon — see FoodIcon below for that semantic usage.
 */
export const QuadrantsIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 25 25"
    fill="currentColor"
    {...props}
  >
    <path
      fillRule="evenodd"
      d="M2.38,5.75c0-1.86,1.51-3.37,3.37-3.37h2.53c1.86,0,3.37,1.51,3.37,3.37v2.53c0,1.86-1.51,3.37-3.37,3.37h-2.53c-1.86,0-3.37-1.51-3.37-3.37v-2.53ZM13.34,5.75c0-1.86,1.51-3.37,3.37-3.37h2.53c1.86,0,3.37,1.51,3.37,3.37v2.53c0,1.86-1.51,3.37-3.37,3.37h-2.53c-1.86,0-3.37-1.51-3.37-3.37v-2.53ZM2.38,16.72c0-1.86,1.51-3.37,3.37-3.37h2.53c1.86,0,3.37,1.51,3.37,3.37v2.53c0,1.86-1.51,3.37-3.37,3.37h-2.53c-1.86,0-3.37-1.51-3.37-3.37v-2.53ZM13.34,16.72c0-1.86,1.51-3.37,3.37-3.37h2.53c1.86,0,3.37,1.51,3.37,3.37v2.53c0,1.86-1.51,3.37-3.37,3.37h-2.53c-1.86,0-3.37-1.51-3.37-3.37v-2.53Z"
    />
  </svg>
);

/**
 * Food icon - the former Plans quadrants glyph, reassigned to represent the
 * Food service (Pantry, Meals & Recipes, Groceries) in footer/drawer nav.
 */
export const FoodIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 25 25"
    fill="currentColor"
    {...props}
  >
    <path
      fillRule="evenodd"
      d="M2.38,5.75c0-1.86,1.51-3.37,3.37-3.37h2.53c1.86,0,3.37,1.51,3.37,3.37v2.53c0,1.86-1.51,3.37-3.37,3.37h-2.53c-1.86,0-3.37-1.51-3.37-3.37v-2.53ZM13.34,5.75c0-1.86,1.51-3.37,3.37-3.37h2.53c1.86,0,3.37,1.51,3.37,3.37v2.53c0,1.86-1.51,3.37-3.37,3.37h-2.53c-1.86,0-3.37-1.51-3.37-3.37v-2.53ZM2.38,16.72c0-1.86,1.51-3.37,3.37-3.37h2.53c1.86,0,3.37,1.51,3.37,3.37v2.53c0,1.86-1.51,3.37-3.37,3.37h-2.53c-1.86,0-3.37-1.51-3.37-3.37v-2.53ZM13.34,16.72c0-1.86,1.51-3.37,3.37-3.37h2.53c1.86,0,3.37,1.51,3.37,3.37v2.53c0,1.86-1.51,3.37-3.37,3.37h-2.53c-1.86,0-3.37-1.51-3.37-3.37v-2.53Z"
    />
  </svg>
);

/**
 * Plans icon - calendar glyph sourced from the FD-Plans-Calendar design
 * asset (public/images/icon/FD-Plans-Calendar.svg), replacing the Quadrants
 * glyph as the Plans destination icon.
 */
export const PlansIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 25 25"
    fill="currentColor"
    {...props}
  >
    <path d="M23.47,6.3v.67H1.2v-.67c0-2.06,1.67-3.73,3.74-3.73h14.8c2.06,0,3.73,1.67,3.73,3.73Z" />
    <path d="M1.2,7.79v10.99c0,2.06,1.67,3.73,3.74,3.73h14.8c2.06,0,3.73-1.67,3.73-3.73V7.79H1.2ZM11.3,17.6c-.45.42-1.04.63-1.75.63s-1.28-.21-1.73-.61c-.45-.41-.68-.96-.71-1.64h1.38c.01.29.11.53.29.71.18.18.44.26.77.26.31,0,.56-.08.75-.25s.28-.38.28-.65-.09-.5-.26-.67c-.17-.16-.44-.24-.8-.24h-.62v-1.18h.64c.33,0,.58-.07.75-.22.17-.14.25-.34.25-.59s-.08-.44-.24-.6-.39-.24-.69-.24c-.33,0-.57.09-.73.28-.16.2-.24.42-.24.69h-1.39c0-.63.22-1.17.66-1.6.44-.43,1-.64,1.7-.64s1.26.18,1.68.55c.41.38.62.87.62,1.48,0,.69-.31,1.17-.93,1.44.67.26,1.01.78,1.01,1.54,0,.62-.23,1.13-.69,1.55ZM17.56,18.08h-4.36v-1.16h1.47v-4.34h-1.44v-.92l1.71-.48h1.15v5.74h1.47v1.16Z" />
  </svg>
);

/**
 * Notebook icon - represents notes, journal, or documentation
 */
export const NotebookIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 25 25"
    fill="currentColor"
    {...props}
  >
    <path d="M19.9,2.82H5.1c-1.79,0-3.23,1.45-3.23,3.23v12.9c0,1.78,1.44,3.23,3.23,3.23h14.8c1.79,0,3.23-1.45,3.23-3.23V6.05c0-1.78-1.44-3.23-3.23-3.23ZM5.83,16.49c-.21,0-.38-.16-.38-.37s.17-.38.38-.38.37.17.37.38-.16.37-.37.37ZM5.83,12.88c-.21,0-.38-.17-.38-.38s.17-.37.38-.37.37.16.37.37-.16.38-.37.38ZM5.83,9.26c-.21,0-.38-.17-.38-.38s.17-.37.38-.37.37.16.37.37-.16.38-.37.38ZM19.17,16.49h-10.46c-.21,0-.38-.16-.38-.37s.17-.38.38-.38h10.46c.21,0,.38.17.38.38s-.17.37-.38.37ZM19.17,12.88h-10.46c-.21,0-.38-.17-.38-.38s.17-.37.38-.37h10.46c.21,0,.38.16.38.37s-.17.38-.38.38ZM19.17,9.26h-10.46c-.21,0-.38-.17-.38-.38s.17-.37.38-.37h10.46c.21,0,.38.16.38.37s-.17.38-.38.38Z" />
  </svg>
);

/**
 * Plus icon - represents quick add / create actions
 */
export const PlusIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 25 25"
    fill="currentColor"
    {...props}
  >
    <path d="M21.9,11.76h-8.64V3.11c0-.41-.34-.75-.75-.75s-.75.34-.75.75v8.64H3.12c-.41,0-.75.34-.75.75s.34.75.75.75h8.64v8.64c0,.41.34.75.75.75s.75-.34.75-.75v-8.64h8.64c.41,0,.75-.34.75-.75s-.34-.75-.75-.75Z" />
  </svg>
);

/**
 * Save icon - represents bookmark or save action
 */
export const SaveIcon = (props: IconProps) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 25 25"
    fill="currentColor"
    {...props}
  >
    <path d="M21.08,21.53l-8.11-7.66c-.27-.25-.67-.25-.93,0l-8.11,7.66c-.46.44-1.18.08-1.18-.59V4.06c0-.43.32-.78.71-.78h18.09c.39,0,.71.35.71.78v16.88c0,.67-.72,1.02-1.18.59Z" />
  </svg>
);

/**
 * Icon map for programmatic access
 */
export const icons = {
  home: HomeIcon,
  insights: InsightsIcon,
  programs: ProgramsIcon,
  notebook: NotebookIcon,
  quadrants: QuadrantsIcon,
  food: FoodIcon,
  plansCalendar: PlansIcon,
  plus: PlusIcon,
  save: SaveIcon,
} as const;

export type IconName = keyof typeof icons;
