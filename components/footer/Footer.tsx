import Image from 'next/image';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import footerContent from '@/data/footerContent.json';

export const Footer = () => {
  return (
    <footer className="relative" style={{ backgroundColor: '#252018' }}>
      {/* Top Section - 4 columns */}
      <div className="px-3 sm:px-6 lg:px-10 py-12 lg:py-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 items-start">
            {/* Email Signup Section */}
            <div className="lg:col-span-1">
              <h3 className="text-lg font-semibold mb-2" style={{ color: '#ACACAC' }}>
                {footerContent.newsletter.headline}
              </h3>
              <p className="text-sm mb-4" style={{ color: '#ACACAC' }}>
                {footerContent.newsletter.subheadline}
              </p>
              <form className="relative">
                <input
                  type="email"
                  placeholder="Email Address"
                  className="w-full px-4 py-3 pr-12 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#252018] focus:ring-[#ACACAC]"
                  style={{
                    backgroundColor: '#4A4A4A',
                    color: '#252018',
                  }}
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:opacity-80 transition-opacity"
                  style={{ color: '#252018' }}
                >
                  <ArrowLeftIcon className="w-5 h-5" />
                </button>
              </form>
            </div>

            {/* Explore Section */}
            <div>
              <h4 className="text-base font-semibold mb-4" style={{ color: '#ACACAC' }}>
                {footerContent.explore.title}
              </h4>
              <ul className="space-y-2">
                {footerContent.explore.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm hover:text-white transition-colors no-underline"
                      style={{ color: '#ACACAC' }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources Section */}
            <div>
              <h4 className="text-base font-semibold mb-4" style={{ color: '#ACACAC' }}>
                {footerContent.resources.title}
              </h4>
              <ul className="space-y-2">
                {footerContent.resources.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm hover:text-white transition-colors no-underline"
                      style={{ color: '#ACACAC' }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Connect Section */}
            <div>
              <h4 className="text-base font-semibold mb-4" style={{ color: '#ACACAC' }}>
                {footerContent.connect.title}
              </h4>
              <ul className="space-y-2">
                {footerContent.connect.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm hover:text-white transition-colors no-underline"
                      style={{ color: '#ACACAC' }}
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Legal Links Row */}
      <div className="px-3 sm:px-6 lg:px-10 py-6 border-t" style={{ borderColor: 'rgba(172, 172, 172, 0.2)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap items-center gap-4 text-sm" style={{ color: '#ACACAC' }}>
            {footerContent.legal.links.map((link, index) => (
              <span key={link.href}>
                <Link
                  href={link.href}
                  className="no-underline hover:underline"
                  style={{ color: '#ACACAC' }}
                >
                  {link.label}
                </Link>
                {index < footerContent.legal.links.length - 1 && (
                  <span className="mx-2" style={{ color: '#ACACAC' }}>
                    |
                  </span>
                )}
              </span>
            ))}
            <span className="ml-2">{footerContent.legal.copyright}</span>
          </div>
        </div>
      </div>

      {/* Logo Section */}
      <div className="relative w-full" style={{ height: '200px' }}>
        <div className="absolute inset-0">
          <Image
            src="/images/home/fine-diet-logo-footer-desktop.svg"
            alt="Fine Diet Logo"
            fill
            className="object-cover object-bottom hidden md:block"
            priority={false}
          />
          <Image
            src="/images/home/fine-diet-logo-footer-mobile.svg"
            alt="Fine Diet Logo"
            fill
            className="object-cover object-bottom md:hidden"
            priority={false}
          />
        </div>
      </div>
    </footer>
  );
};

