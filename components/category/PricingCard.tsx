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
	title,
	subtitle,
	button,
}: PricingCardProps) => {
	const router = useRouter();

	return (
		<div className="rounded-[2.5rem] overflow-hidden bg-neutral-900/25 backdrop-brightness-150 backdrop-blur-lg shadow-soft h-full flex flex-col py-10 md:py-3 mt-6 px-3 shadow-md">
			{/* Content Section */}
			<div className="p-6 flex flex-col flex-grow">
				{/* Title and Subtitle */}
				<div className="space-y-1 flex-grow">
					<h3 className="text-2xl md:text-3xl font-semibold text-white leading-tight">
						{title}
					</h3>
					{subtitle && (
						<p className="text-base md:text-lg font-light text-white leading-none">
							{subtitle}
						</p>
					)}
				</div>




				{/* Purchase Button */}
			<div className="pt-0">
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
