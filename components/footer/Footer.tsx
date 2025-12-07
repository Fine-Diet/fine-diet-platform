'use client';

import { useState, FormEvent } from 'react';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { FooterContent } from '@/lib/contentTypes';

interface FooterProps {
  footerContent: FooterContent;
}

export const Footer = ({ footerContent }: FooterProps) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const response = await fetch('/api/people/newsletter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          source: 'footer_newsletter',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setMessage('You\'re in! Check your inbox for updates.');
      setEmail(''); // Clear form on success
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <footer className="relative" style={{ backgroundColor: '#252018' }}>
      {/* Top Section - 4 columns */}
      <div className="pt-9 lg:pt-12 px-6 max-w-[1250px] mx-auto">
        <div className=" mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12 items-start">
            {/* Email Signup Section */}
            <div className="lg:col-span-2 max-w-[375px]">
              <h3 className="text-2xl font-semibold mb-1 leading-[1] antialiased" style={{ color: '#ACACAC' }}>
                {footerContent.newsletter.headline}
              </h3>
              <p className="text-sm mb-2 antialiased" style={{ color: '#ACACAC' }}>
                {footerContent.newsletter.subheadline}
              </p>
              {status === 'success' ? (
                <div className="text-sm antialiased" style={{ color: '#ACACAC' }}>
                  {message}
                </div>
              ) : (
                <form className="relative" onSubmit={handleSubmit}>
                  <input
                    type="email"
                    placeholder="Email Address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={status === 'submitting'}
                    required
                    className="w-full px-4 py-3 pr-12 rounded-full text-sm placeholder:text-[#252018] placeholder:font-semibold focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#252018] focus:ring-[#ACACAC] disabled:opacity-50"
                    style={{
                      backgroundColor: '#4A4A4A',
                      color: '#252018',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={status === 'submitting'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:opacity-80 transition-opacity disabled:opacity-50"
                    style={{ color: '#252018' }}
                  >
                    <ArrowLeftIcon className="w-4 h-5" />
                  </button>
                  {status === 'error' && (
                    <p className="text-xs mt-1 antialiased" style={{ color: '#E04E39' }}>
                      {message}
                    </p>
                  )}
                </form>
              )}
            </div>

            {/* Explore Section */}
            <div>
              <h4 className="text-base font-semibold mb-1 antialiased" style={{ color: '#ACACAC' }}>
                {footerContent.explore.title}
              </h4>
              <ul className="leading-[1]">
                {footerContent.explore.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm hover:text-white transition-colors no-underline antialiased"
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
              <h4 className="text-base font-semibold mb-1 antialiased" style={{ color: '#ACACAC' }}>
                {footerContent.resources.title}
              </h4>
              <ul className="leading-[1]">
                {footerContent.resources.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm hover:text-white transition-colors no-underline antialiased"
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
              <h4 className="text-base font-semibold mb-1 antialiased" style={{ color: '#ACACAC' }}>
                {footerContent.connect.title}
              </h4>
              <ul className="flex flex-row md:flex-col gap-4 md:gap-0 md:leading-[1]">
                {footerContent.connect.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm hover:text-white transition-colors no-underline antialiased"
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
      <div className="max-w-[1250px] px-6 mx-auto pt-9 pb-12" style={{ borderColor: 'rgba(172, 172, 172, 0.2)' }}>
        <div className="mx-auto">
          <div className="flex flex-wrap items-center gap-2 leading-[.8] text-xs antialiased" style={{ color: '#ACACAC' }}>
            {footerContent.legal.links.map((link, index) => (
              <span key={link.href}>
                <Link
                  href={link.href}
                  className="no-underline hover:underline antialiased"
                  style={{ color: '#ACACAC' }}
                >
                  {link.label}
                </Link>
                {index < footerContent.legal.links.length - 1 && (
                  <span className="ml-2 antialiased" style={{ color: '#ACACAC' }}>
                     |
                  </span>
                )}
              </span>
            ))}
            <span className="ml-0 antialiased">{footerContent.legal.copyright}</span>
          </div>
        </div>
      </div>

      {/* Logo Section */}
      <div className="w-full">
        <img
          src="/images/home/fine-diet-logo-footer-desktop.svg"
          alt="Fine Diet Logo"
          className="w-full h-auto object-cover object-bottom hidden md:block"
        />
        <img
          src="/images/home/fine-diet-logo-footer-mobile.svg"
          alt="Fine Diet Logo"
          className="w-full h-auto object-cover object-bottom md:hidden"
        />
      </div>
    </footer>
  );
};

