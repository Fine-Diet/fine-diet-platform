import { NavigationContent, NavigationCategory as BaseNavigationCategory } from '@/lib/contentTypes';

// Re-export types from contentTypes for backward compatibility
export type NavigationData = NavigationContent;
export type NavigationCategory = BaseNavigationCategory;
export type NavigationSubcategory = NavigationCategory['subcategories'][number];
export type NavigationItem = NavigationSubcategory['items'][number];

export type NavigationTopLinks = NavigationContent['topLinks'];

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
