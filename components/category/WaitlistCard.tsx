'use client';

import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/Button';

interface WaitlistCardProps {
  title: string;
  description?: string;
  buttonLabel?: string;
  programSlug?: string;
  source?: string;
}

export const WaitlistCard = ({
  title,
  description,
  buttonLabel = "Join Waitlist",
  programSlug = 'journal',
  source,
}: WaitlistCardProps) => {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  // Derive source if not provided
  const derivedSource = source || `category_${programSlug}_waitlist`;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error');
      setMessage('Please enter a valid email address.');
      return;
    }

    // Validate phone (basic check)
    if (!phone || phone.trim().length < 10) {
      setStatus('error');
      setMessage('Please enter a valid phone number.');
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const response = await fetch('/api/people/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          phone,
          smsOptIn: true, // Implied by phone collection
          programSlug,
          source: derivedSource,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setMessage('Thank you! You\'ve been added to the waitlist. We\'ll be in touch soon.');
      
      // Reset form
      setEmail('');
      setPhone('');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className="">
      <div className="space-y-4 text-center pt-3">
        {/* Description only - no headline */}
        {description && (
          <p className="text-base font-light text-white">{description}</p>
        )}
        
        {status === 'success' ? (
          <div className="space-y-2">
            <div className="mb-4">
              <svg
                className="w-12 h-12 mx-auto text-semantic-success"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="text-base font-light text-white">{message}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-3 max-w-lg mx-auto">
              <div className="flex flex-col md:flex-row gap-3">
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === 'submitting'}
                  required
                  className="
                    flex-1 px-5 py-3 rounded-[2.5rem]
                    bg-neutral-700/50 border border-neutral-600/50
                    text-base font-light text-white placeholder:text-base placeholder:font-light placeholder:text-white/50 placeholder:translate-y-[2px]
                    focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                    disabled:opacity-50
                  "
                />
                <input
                  type="tel"
                  placeholder="Enter your phone number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={status === 'submitting'}
                  required
                  className="
                    flex-1 px-5 py-3 rounded-[2.5rem]
                    bg-neutral-700/50 border border-neutral-600/50
                    text-base font-light text-white placeholder:text-base placeholder:font-light placeholder:text-white/50 placeholder:translate-y-[2px]
                    focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                    disabled:opacity-50
                  "
                />
              </div>
              {status === 'error' && (
                <div className="bg-semantic-error/20 border border-semantic-error/50 rounded-xl p-3">
                  <p className="text-sm text-white">{message}</p>
                </div>
              )}
              <Button
                type="submit"
                variant="quaternary"
                size="md"
                disabled={status === 'submitting'}
                className="whitespace-nowrap w-full"
              >
                {status === 'submitting' ? 'Submitting...' : buttonLabel}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

