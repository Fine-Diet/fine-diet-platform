import Image from 'next/image';
import Link from 'next/link';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

interface HomeTile {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  image?: string;
}

const TILES: HomeTile[] = [
  {
    id: 'programs',
    title: 'Programs',
    subtitle: 'Your program library',
    href: APP_ROUTES.programs,
    image: '/images/home/placeholder-2-desktop.jpg',
  },
  {
    id: 'assessments',
    title: 'Assessments',
    subtitle: 'View your results',
    href: '/account/journal/plans',
    image: '/images/home/placeholder-3-desktop.jpg',
  },
  {
    id: 'shop',
    title: 'Shop',
    subtitle: 'Products & supplements',
    href: '/shop',
    image: '/images/home/placeholder-3-desktop.jpg',
  },
];

function TileCard({ tile }: { tile: HomeTile }) {
  return (
    <Link href={tile.href} className="block group">
      <div className="relative isolate overflow-hidden rounded-md h-[140px]">
        {tile.image ? (
          <div className="absolute inset-0">
            <Image
              src={tile.image}
              alt={tile.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 650px"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/40" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-neutral-700" />
        )}

        <div className="relative h-full flex items-center justify-center">
          <div className="w-full max-w-[650px] flex items-center p-5 md:p-6">
            <div className="flex-1 min-w-0 space-y-[1px]">
              <h3 className="antialiased text-3xl font-semibold text-white leading-tight">
                {tile.title}
              </h3>
              <p className="antialiased text-base font-light text-white/80 leading-snug">
                {tile.subtitle}
              </p>
            </div>

            <div className="flex-shrink-0 ml-3">
              <svg
                className="h-5 w-5 text-white/50 group-hover:text-white/80 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/**
 * Grid App Section Home — navigation tiles for Programs, Assessments, Shop,
 * plus a placeholder upgrade tile. Follows GridItemApp visual language.
 */
export function GridAppSectionHome() {
  return (
    <div className="w-full max-w-[1000px] mx-auto">
      <div className="flex flex-col gap-3">
        {TILES.map((tile) => (
          <TileCard key={tile.id} tile={tile} />
        ))}

        {/* Upgrade / offer placeholder */}
        <div className="relative isolate overflow-hidden rounded-md h-[140px]">
          <div className="absolute inset-0 bg-gradient-to-br from-denim-900/60 via-denim-800/40 to-brand-900" />
          <div className="relative h-full flex items-center justify-center">
            <div className="w-full max-w-[650px] flex items-center p-5 md:p-6">
              <div className="flex-1 min-w-0 space-y-[1px]">
                <h3 className="antialiased text-3xl font-semibold text-white leading-tight">
                  Upgrade
                </h3>
                <p className="antialiased text-sm font-light text-white/50 leading-snug">
                  Unlock the full experience
                </p>
              </div>
              <div className="flex-shrink-0 ml-3">
                <svg
                  className="h-5 w-5 text-white/30"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
