import Image from 'next/image';
import { useRouter } from 'next/router';
import { Button } from '@/components/ui/Button';

export interface PricingCardProps {
	id: string;
	image: string;
	title: string;
	subtitle?: string;
	description: string;
	price: string;
	paymentSchedule: string;
	button: {
		label: string;
		variant?: 'primary' | 'secondary' | 'tertiary' | 'quaternary';
		href: string;
	};
}

export const PricingCard = ({
	image,
	title,
	subtitle,
	description,
	price,
	paymentSchedule,
	button,
}: PricingCardProps) => {
	const router = useRouter();

	return (
		<div className="rounded-[2.5rem] overflow-hidden bg-neutral-0 shadow-soft">
			{/* Product Image Section */}
			<div className="relative aspect-[4/3]">
				<Image
					src={image}
					alt={title}
					fill
					className="object-cover"
					sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
				/>
			</div>

			{/* Content Section */}
			<div className="p-6 space-y-4 bg-neutral-0">
				{/* Title and Subtitle */}
				<div className="space-y-1">
					<h3 className="text-2xl md:text-3xl font-semibold text-neutral-900 leading-tight">
						{title}
					</h3>
					{subtitle && (
						<p className="text-base md:text-lg font-light italic text-neutral-700">
							{subtitle}
						</p>
					)}
				</div>

				{/* Description */}
				<p className="text-base font-light text-neutral-800 leading-relaxed">
					{description}
				</p>

				{/* Price and Payment Schedule */}
				<div className="pt-2 space-y-1">
					<div className="flex items-baseline gap-2">
						<span className="text-3xl md:text-4xl font-semibold text-neutral-900">
							{price}
						</span>
						<span className="text-base font-light text-neutral-700">
							{paymentSchedule}
						</span>
					</div>
				</div>

				{/* Purchase Button */}
				<div className="pt-2">
					<Button
						variant={button.variant || 'primary'}
						size="md"
						onClick={() => router.push(button.href)}
						className="w-full"
					>
						{button.label}
					</Button>
				</div>
			</div>
		</div>
	);
};

