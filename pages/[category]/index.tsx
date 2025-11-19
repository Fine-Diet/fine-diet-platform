import { GetStaticPaths, GetStaticProps } from 'next';

import navigation from '@/data/navigation.json';
import homeContent from '@/data/homeContent.json';

import { CategoryPageShell } from '@/components/category/CategoryPageShell';
import { CategoryHeroBand } from '@/components/category/CategoryHeroBand';
import { CategoryGrid } from '@/components/category/CategoryGrid';
import { PricingSection } from '@/components/category/PricingSection';
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

	return (
		<CategoryPageShell>
			{layout.showHero && (
				<CategoryHeroBand
					title={category.label}
					backgroundImage={`/images/category/${category.id}-hero.jpg`}
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

			{/* Render custom sections */}
			{category.sections?.map((section) => {
				if (!section.enabled) return null;

				switch (section.type) {
					case 'pricing':
						return (
							<PricingSection
								key={section.id}
								title={section.title}
								description={section.description}
								cards={section.cards.map((card) => ({
									...card,
									button: {
										...card.button,
										variant: (card.button.variant as 'primary' | 'secondary' | 'tertiary' | 'quaternary') || 'primary',
									},
								}))}
								columns={section.columns as { mobile?: 1; tablet?: 2 | 3; desktop?: 2 | 3 | 4 }}
							/>
						);
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


