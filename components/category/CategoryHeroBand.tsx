import Image from 'next/image';
import { PricingCard, PricingCardProps } from '@/components/category/PricingCard';

interface CategoryHeroBandProps {
	title: string;
	subtitle?: string;
	backgroundImage?: string;
	pricingCards?: PricingCardProps[];
	pricingColumns?: {
		mobile?: 1;
		tablet?: 2 | 3;
		desktop?: 2 | 3 | 4;
	};
}

export const CategoryHeroBand = ({
	title,
	subtitle,
	backgroundImage = '/images/category/default-hero.jpg',
	pricingCards,
	pricingColumns = {
		mobile: 1,
		tablet: 2,
		desktop: 3,
	},
}: CategoryHeroBandProps) => {
	// Build responsive grid classes
	const getGridClasses = () => {
		const mobile = 'grid-cols-1';
		let tablet = '';
		let desktop = '';
		
		if (pricingColumns.tablet === 2) tablet = 'md:grid-cols-2';
		if (pricingColumns.tablet === 3) tablet = 'md:grid-cols-3';
		
		if (pricingColumns.desktop === 2) desktop = 'lg:grid-cols-2';
		if (pricingColumns.desktop === 3) desktop = 'lg:grid-cols-3';
		if (pricingColumns.desktop === 4) desktop = 'lg:grid-cols-4';
		
		return `grid gap-6 md:gap-8 ${mobile} ${tablet} ${desktop}`;
	};

	return (
		<section className="relative isolate overflow-hidden rounded-[2.5rem] mb-10">
			<div className="absolute inset-0">
				<Image src={backgroundImage} alt="" fill className="object-cover" priority />
				<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/65 to-black/20" />
			</div>

			<div className="
				relative mx-auto max-w-[1200px]
				flex flex-col
				px-6 sm:px-10
				pt-40 pb-12 lg:pt-40 lg:pb-12
			">
				{/* Hero Content */}
				<div className="flex flex-col items-center justify-center text-center mb-12">
					<h1 className="antialiased text-hero-mobile sm:text-6xl lg:text-6xl font-semibold leading-none text-white whitespace-pre-line">
						{title}
					</h1>
					{subtitle && (
						<p className="antialiased mt-4 text-base sm:text-lg font-light leading-5 text-white max-w-2xl">
							{subtitle}
						</p>
					)}
				</div>

				{/* Pricing Cards Section */}
				{pricingCards && pricingCards.length > 0 && (
					<div className={getGridClasses()}>
						{pricingCards.map((card) => (
							<PricingCard key={card.id} {...card} />
						))}
					</div>
				)}
			</div>
		</section>
	);
};


