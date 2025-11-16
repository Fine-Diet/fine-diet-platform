import Image from 'next/image';

interface CategoryHeroBandProps {
	title: string;
	subtitle?: string;
	backgroundImage?: string;
}

export const CategoryHeroBand = ({
	title,
	subtitle,
	backgroundImage = '/images/category/default-hero.jpg',
}: CategoryHeroBandProps) => {
	return (
		<section className="relative isolate overflow-hidden rounded-[2.5rem] mb-10">
			<div className="absolute inset-0">
				<Image src={backgroundImage} alt="" fill className="object-cover" priority />
				<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/65 to-black/20" />
			</div>

			<div className="
				relative mx-auto max-w-[1200px]
				flex flex-col items-center justify-end text-center
				px-6 sm:px-10
				aspect-[5/6] sm:aspect-auto sm:h-[550px] lg:h-[550px]
				py-40 lg:py-40
			">
				<h1 className="antialiased text-hero-mobile sm:text-6xl lg:text-6xl font-semibold leading-none text-white whitespace-pre-line">
					{title}
				</h1>
				{subtitle && (
					<p className="antialiased mt-4 text-base sm:text-lg font-light leading-5 text-white max-w-2xl">
						{subtitle}
					</p>
				)}
			</div>
		</section>
	);
};


