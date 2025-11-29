import { GetStaticPaths, GetStaticProps } from 'next';

import navigation from '@/data/navigation.json';
import homeContent from '@/data/homeContent.json';

import { CategoryPageShell } from '@/components/category/CategoryPageShell';
import { CategoryHeroBand } from '@/components/category/CategoryHeroBand';
import { CategoryGrid } from '@/components/category/CategoryGrid';
import { CTASection } from '@/components/home/CTASection';
import { NavigationCategory } from '@/components/nav/types';

interface CategoryPageProps {
	category: NavigationCategory;
}

export default function CategoryPage({ category }: CategoryPageProps) {
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

export const getStaticPaths: GetStaticPaths = async () => {
	const paths = navigation.categories.map((c) => ({ params: { category: c.id } }));
	return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps = async ({ params }) => {
	const categoryId = params?.category as string;
	const category = navigation.categories.find((c) => c.id === categoryId) || null;

	if (!category) {
		return { notFound: true };
	}

	return {
		props: {
			category,
		},
	};
};


