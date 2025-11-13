import navigation from '@/data/navigation.json';

export type NavigationData = typeof navigation;
export type NavigationCategory = NavigationData['categories'][number];
export type NavigationSubcategory = NavigationCategory['subcategories'][number];
export type NavigationItem = NavigationSubcategory['items'][number];

export type NavigationTopLinks = NavigationData['topLinks'];
