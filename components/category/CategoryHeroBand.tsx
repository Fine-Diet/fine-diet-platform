import { useState } from 'react';
import Image from 'next/image';
import { PricingCard, PricingCardProps } from '@/components/category/PricingCard';
import { WaitlistCard } from '@/components/category/WaitlistCard';

interface WaitlistCardData {
	id: string;
	title: string;
	description: string;
	buttonLabel?: string;
	programSlug?: string;
	source?: string;
}

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
	waitlistCards?: WaitlistCardData[];
}

export const CategoryHeroBand = ({
	title,
	subtitle,
	backgroundImage = '/images/home/hero-desktop.jpg',
	pricingCards,
	pricingColumns = {
		mobile: 1,
		tablet: 2,
		desktop: 3,
	},
	waitlistCards,
}: CategoryHeroBandProps) => {
	// Fallback to default hero image if category image fails to load
	const [imageSrc, setImageSrc] = useState(backgroundImage);
	const defaultImage = '/images/home/hero-desktop.jpg';

	const handleImageError = () => {
		setImageSrc(defaultImage);
	};

	// Build responsive grid classes
	const getGridClasses = () => {
		if (!pricingColumns) return 'grid gap-6 md:gap-8 grid-cols-1';
		
		const cardCount = pricingCards?.length || 0;
		const mobile = 'grid-cols-1';
		let tablet = '';
		let desktop = '';
		
		// Determine tablet columns
		if (pricingColumns.tablet === 2) tablet = 'md:grid-cols-2';
		if (pricingColumns.tablet === 3) tablet = 'md:grid-cols-3';
		
		// Determine desktop columns based on card count
		if (cardCount === 1) {
			desktop = 'lg:grid-cols-1';
		} else if (cardCount === 2) {
			// 2 cards: distribute evenly (explicitly set lg to prevent 3-column)
			desktop = 'lg:grid-cols-2';
		} else {
			// 3+ cards: use the configured desktop columns
			if (pricingColumns.desktop === 2) desktop = 'lg:grid-cols-2';
			if (pricingColumns.desktop === 3) desktop = 'lg:grid-cols-3';
			if (pricingColumns.desktop === 4) desktop = 'lg:grid-cols-4';
		}
		
		return `grid gap-6 md:gap-8 ${mobile} ${tablet} ${desktop}`;
	};

	return (
		<section className="relative isolate overflow-hidden mb-0">
			{/* Background Image Container - Min 950px Height, can grow with content */}
			<div className="relative min-h-[950px]">
				<div className="absolute inset-0">
					<Image 
						src={imageSrc} 
						alt="" 
						fill 
						className="object-cover" 
						priority 
						onError={handleImageError}
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/65 to-black/20" />
				</div>

				{/* Hero Content - Headline, Description, and Pricing Cards */}
				<div className="relative mx-auto max-w-[1200px] m-auto flex flex-col items-center justify-center  px-8 pt-[250px] sm:px-10 py-20 text-center">
					{/* Headline and Subtitle */}
					<div className="max-w-2xl mb-0">
						<h1 className="antialiased text-hero-mobile sm:text-6xl lg:text-6xl font-semibold leading-none text-white whitespace-pre-line">
							{title}
						</h1>
						{subtitle && (
							<p className="antialiased mt-4 text-base sm:text-lg font-light leading-5 text-white max-w-2xl">
								{subtitle}
							</p>
						)}
					</div>

					{/* Pricing Cards Section - Inside hero, below headline */}
					{pricingCards && pricingCards.length > 0 && (
						<div className="w-full">
							<div className={getGridClasses()}>
								{pricingCards.map((card) => (
									<PricingCard key={card.id} {...card} />
								))}
							</div>
						</div>
					)}

					{/* Waitlist Cards Section - Below pricing cards if both exist */}
					{waitlistCards && waitlistCards.length > 0 && (
						<div className="w-full mt-1">
							<div className="grid gap-6 md:gap-8 grid-cols-1">
								{waitlistCards.map((card) => {
									const { id, programSlug, source, ...waitlistCardProps } = card;
									return (
										<WaitlistCard 
											key={id} 
											{...waitlistCardProps}
											programSlug={programSlug}
											source={source}
										/>
									);
								})}
							</div>
						</div>
					)}
				</div>
			</div>
		</section>
	);
};


