import { useState, FormEvent } from 'react';
import Image from 'next/image';
import { ArrowRightIcon } from '@heroicons/react/24/outline';

interface GridItemEmailCaptureProps {
  title: string;
  description?: string;
  image?: string;
  aspect?: string;
  /**
   * Which source to pass to /api/people/newsletter.
   * Defaults to 'home_fine_print'.
   */
  source?: 'home_fine_print' | 'landing_the_fine_print';
}

/**
 * Grid card variant that renders an inline email capture form
 * instead of a navigation button.
 *
 * Used for the "Get The Fine Print" home-page grid item.
 * Submits to /api/people/newsletter with intent: nurture_marketing.
 */
export const GridItemEmailCapture = ({
  title,
  description,
  image,
  aspect,
  source = 'home_fine_print',
}: GridItemEmailCaptureProps) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const heightClasses =
    aspect === 'form-4-3'
      ? 'aspect-[4/3] md:aspect-auto md:h-[325px]'
      : 'h-[325px]';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error');
      setMessage('Please enter a valid email.');
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const res = await fetch('/api/people/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });

      const data = await res.json();

      if (!res.ok || data.ok !== true) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
      setMessage("You're in — watch your inbox.");
      setEmail('');
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <div className={`relative isolate overflow-hidden rounded-[2.5rem] ${heightClasses}`}>
      {image ? (
        <div className="absolute inset-0">
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/40 to-black/20" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-neutral-700" />
      )}

      <div className="relative h-full flex flex-col justify-end pb-10 p-6 md:p-8">
        <div className="space-y-2">
          <h3 className="antialiased text-3xl md:text-3xl font-semibold text-white">
            {title}
          </h3>

          {description && (
            <p className="antialiased text-base font-light leading-5 text-white/90">
              {description}
            </p>
          )}

          {status === 'success' ? (
            <p className="text-sm text-white/80 antialiased pt-2">{message}</p>
          ) : (
            <form onSubmit={handleSubmit} className="pt-2">
              <div className="relative flex items-center max-w-xs">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (status === 'error') setStatus('idle');
                  }}
                  placeholder="Your email"
                  disabled={status === 'submitting'}
                  required
                  className="w-full pl-4 pr-11 py-2.5 rounded-full text-sm
                    bg-white/15 backdrop-blur border border-white/30
                    text-white placeholder-white/60
                    focus:outline-none focus:ring-2 focus:ring-white/50
                    disabled:opacity-50 antialiased transition-all"
                />
                <button
                  type="submit"
                  disabled={status === 'submitting'}
                  aria-label="Subscribe"
                  className="absolute right-2.5 p-1 text-white hover:opacity-75
                    transition-opacity disabled:opacity-40"
                >
                  {status === 'submitting' ? (
                    <span className="block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <ArrowRightIcon className="w-4 h-4" strokeWidth={2.5} />
                  )}
                </button>
              </div>

              {status === 'error' && (
                <p className="text-xs text-red-400 mt-1.5 antialiased">{message}</p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
