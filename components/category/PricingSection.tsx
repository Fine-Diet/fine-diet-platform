import { PricingCard, PricingCardProps } from '@/components/category/PricingCard';

export interface PricingSectionProps {
	title?: string;
	description?: string;
	cards: PricingCardProps[];
	columns?: {
		mobile?: 1;
		tablet?: 2 | 3;
		desktop?: 2 | 3 | 4;
	};
}

export const PricingSection = ({
	title,
	description,
	cards,
	columns = {
		mobile: 1,
		tablet: 2,
		desktop: 3,
	},
}: PricingSectionProps) => {
	// Build responsive grid classes with explicit values for Tailwind
	const getGridClasses = () => {
		const mobile = 'grid-cols-1';
		let tablet = '';
		let desktop = '';
		
		if (columns.tablet === 2) tablet = 'md:grid-cols-2';
		if (columns.tablet === 3) tablet = 'md:grid-cols-3';
		
		if (columns.desktop === 2) desktop = 'lg:grid-cols-2';
		if (columns.desktop === 3) desktop = 'lg:grid-cols-3';
		if (columns.desktop === 4) desktop = 'lg:grid-cols-4';
		
		return `grid gap-6 md:gap-8 ${mobile} ${tablet} ${desktop}`;
	};

	return (
		<section className="px-6 sm:px-10 max-w-[1200px] mx-auto py-12">
			{/* Optional Section Header */}
			{(title || description) && (
				<div className="mb-8 md:mb-12 text-center max-w-3xl mx-auto">
					{title && (
						<h2 className="text-3xl md:text-4xl lg:text-5xl font-semibold text-neutral-900 mb-4">
							{title}
						</h2>
					)}
					{description && (
						<p className="text-base md:text-lg font-light text-neutral-700">
							{description}
						</p>
					)}
				</div>
			)}

			{/* Pricing Cards Grid */}
			<div className={getGridClasses()}>
				{cards.map((card) => (
					<PricingCard key={card.id} {...card} />
				))}
			</div>
		</section>
	);
};

