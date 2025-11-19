import navigation from '@/data/navigation.json';

export type NavigationData = typeof navigation;
export type NavigationCategory = NavigationData['categories'][number];
export type NavigationSubcategory = NavigationCategory['subcategories'][number];
export type NavigationItem = NavigationSubcategory['items'][number];

export type NavigationTopLinks = NavigationData['topLinks'];

// Extended types for waitlist configuration
export interface WaitlistConfig {
	enabled: boolean;
	title?: string;
	description?: string;
	buttonLabel?: string;
}

// Extend NavigationItem to include proper waitlist typing
export interface ExtendedNavigationItem extends Omit<NavigationItem, 'waitlist'> {
	waitlist?: WaitlistConfig;
}
