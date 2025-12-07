import { GetStaticPaths, GetStaticProps } from 'next';

import { getNavigationContent, getHomeContent } from '@/lib/contentApi';
import { NavigationCategory, HomeContent } from '@/lib/contentTypes';

import { CategoryPageShell } from '@/components/category/CategoryPageShell';
import { CategoryHeroBand } from '@/components/category/CategoryHeroBand';
import { CategoryGrid } from '@/components/category/CategoryGrid';
import { CTASection } from '@/components/home/CTASection';

interface CategoryPageProps {
	category: NavigationCategory;
	homeContent: HomeContent;
}

export default function CategoryPage({ category, homeContent }: CategoryPageProps) {
	// Get layout configuration, with sensible defaults
	const layout = category.layout || {
		showHero: true,
		showGrid: true,
		showCTA: false,
	};

	// Find pricing section if enabled
	const pricingSection = category.sections?.find(
		(section) => section?.type === 'pricing' && section?.enabled
	);

	// Extract waitlist items from category
	const waitlistItems = category.subcategories
		.flatMap((sc) => sc.items || [])
		.filter((item) => {
			const waitlist = (item as any).waitlist;
			return item.available === false && waitlist?.enabled === true;
		})
		.map((item) => {
			const waitlist = (item as any).waitlist;
			return {
				id: item.id,
				title: waitlist?.title || item.title,
				description: waitlist?.description || item.description,
				buttonLabel: waitlist?.buttonLabel,
				programSlug: category.id, // Use category ID as program slug
				source: `category_${category.id}_waitlist`,
			};
		});

		return (
		<CategoryPageShell>
			{layout.showHero && (
				<CategoryHeroBand
					title={(category as any).headline || (category as any).label}
					subtitle={(category as any).subtitle}
					backgroundImage={`/images/category/${category.id}-hero.jpg`}
					pricingCards={
						pricingSection && pricingSection.cards
							? pricingSection.cards.map((card) => ({
									...card,
									button: {
										...card.button,
										variant: (card.button.variant as 'primary' | 'secondary' | 'tertiary' | 'quaternary') || 'primary',
									},
								}))
							: undefined
					}
					pricingColumns={
						pricingSection && pricingSection.columns
							? (pricingSection.columns as { mobile?: 1; tablet?: 2 | 3; desktop?: 2 | 3 | 4 })
							: undefined
					}
					waitlistCards={waitlistItems.length > 0 ? waitlistItems : undefined}
				/>
			)}

			{layout.showGrid && (
				<div className="mt-4">
					<CategoryGrid category={category} />
				</div>
			)}

			{layout.showCTA && homeContent.ctaSection && (
				<div className="mt-12">
					<CTASection content={homeContent.ctaSection} />
				</div>
			)}

			{/* Render other custom sections (excluding pricing, which is now in hero) */}
			{category.sections?.map((section) => {
				if (!section.enabled || section.type === 'pricing') return null;

				switch (section.type) {
					default:
						return null;
				}
			})}
		</CategoryPageShell>
	);
}

/**
 * Generate static paths for all categories at build time.
 * Uses 'blocking' fallback to handle new categories that might be added.
 */
export const getStaticPaths: GetStaticPaths = async () => {
	const navigation = await getNavigationContent();
	const paths = navigation.categories.map((category) => ({
		params: { category: category.id },
	}));

	return {
		paths,
		fallback: 'blocking', // Generate new pages on-demand if category doesn't exist
	};
};

/**
 * Fetch category page data with ISR (Incremental Static Regeneration).
 * Pages are statically generated at build time and revalidated every 60 seconds.
 * This provides fast static performance while keeping content fresh.
 */
export const getStaticProps: GetStaticProps<CategoryPageProps> = async ({ params }) => {
	const categoryId = params?.category as string;
	const [navigation, homeContent] = await Promise.all([
		getNavigationContent(),
		getHomeContent(),
	]);

	const category = navigation.categories.find((c) => c.id === categoryId) || null;

	if (!category) {
		return { notFound: true };
	}

	return {
		props: {
			category,
			homeContent,
		},
		// Revalidate every 60 seconds
		// After 60 seconds, the next request will trigger a background regeneration
		// while serving the cached page to the user
		revalidate: 60,
	};
};


