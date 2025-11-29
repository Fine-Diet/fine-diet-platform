import Image from 'next/image';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/Button';
import { NavigationCategory, WaitlistConfig } from '@/components/nav/types';

interface CategoryGridProps {
	category: NavigationCategory;
}

export const CategoryGrid = ({ category }: CategoryGridProps) => {
	const router = useRouter();
	// Filter out waitlist items since they're now shown in the hero section
	const items = category.subcategories.flatMap((sc) => sc.items || []).filter((item) => {
		const waitlist = item.waitlist as WaitlistConfig | undefined;
		const showWaitlist = item.available === false && waitlist?.enabled === true;
		return !showWaitlist; // Exclude waitlist items from grid
	});

	// Determine grid columns based on item count
	const itemCount = items.length;
	const getGridClasses = () => {
		if (itemCount === 1) {
			return 'grid-cols-1';
		} else if (itemCount === 2) {
			// 2 items: distribute evenly across all breakpoints (explicitly set lg to prevent 3-column)
			return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2';
		} else {
			// 3+ items: use 3-column layout on large screens
			return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
		}
	};

	return (
		<div className={`
			grid gap-8
			${getGridClasses()}
			px-6 sm:px-10 max-w-[1200px] mx-auto
		`}>
			{items.map((item) => (
					<div key={item.id} className="rounded-[2.5rem] overflow-hidden bg-neutral-800/40 shadow-soft backdrop-blur">
						<div className="relative aspect-square">
							{item.image ? (
								<Image src={item.image} alt="" fill className="object-cover" />
							) : (
								<div className="absolute inset-0 bg-neutral-700" />
							)}
						</div>
						<div className="p-6 space-y-3">
							<h3 className="text-xl md:text-2xl font-semibold text-white">{item.title}</h3>
							{item.description && (
								<p className="text-base font-light text-white/90">{item.description}</p>
							)}
							{item.buttons && item.buttons.length > 0 && (
								<Button
									variant={item.buttons[0].variant as any}
									onClick={() => router.push(item.buttons[0].href)}
									size="sm"
								>
									{item.buttons[0].label}
								</Button>
							)}
						</div>
					</div>
			))}
		</div>
	);
};


