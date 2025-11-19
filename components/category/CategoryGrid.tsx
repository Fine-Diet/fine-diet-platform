import Image from 'next/image';
import { useRouter } from 'next/router';

import { Button } from '@/components/ui/Button';
import { WaitlistCard } from '@/components/category/WaitlistCard';
import { NavigationCategory, ExtendedNavigationItem, WaitlistConfig } from '@/components/nav/types';

interface CategoryGridProps {
	category: NavigationCategory;
}

export const CategoryGrid = ({ category }: CategoryGridProps) => {
	const router = useRouter();
	const items = category.subcategories.flatMap((sc) => sc.items || []);

	return (
		<div className="
			grid gap-8
			grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
			px-6 sm:px-10 max-w-[1200px] mx-auto
		">
			{items.map((item) => {
				// Check if item is available or should show waitlist
				const isAvailable = item.available !== false; // Default to true if not specified
				const waitlist = item.waitlist as WaitlistConfig | undefined;
				const showWaitlist = !isAvailable && waitlist?.enabled;

				if (showWaitlist) {
					return (
						<WaitlistCard
							key={item.id}
							title={waitlist?.title || item.title}
							description={waitlist?.description || item.description}
							buttonLabel={waitlist?.buttonLabel}
						/>
					);
				}

				return (
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
				);
			})}
		</div>
	);
};


