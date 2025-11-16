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
	return (
		<CategoryPageShell>
			<CategoryHeroBand
				title={category.label}
				subtitle={category.subtitle ?? ''}
				backgroundImage={`/images/category/${category.id}-hero.jpg`}
			/>

			<div className="mt-4">
				<CategoryGrid category={category} />
			</div>

			<div className="mt-20">
				<CTASection content={homeContent.ctaSection} />
			</div>
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


