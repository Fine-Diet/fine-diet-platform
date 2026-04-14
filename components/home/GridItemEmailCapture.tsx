import { useState, FormEvent } from 'react';
import Image from 'next/image';

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
 * Collects first name, last name, and email.
 * Submits to /api/people/newsletter with source: home_fine_print.
 */
export const GridItemEmailCapture = ({
  title,
  image,
  aspect,
  source = 'home_fine_print',
}: GridItemEmailCaptureProps) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const heightClasses =
    aspect === 'form-4-3'
      ? 'aspect-[4/3] md:aspect-auto md:h-[325px]'
      : 'h-[325px]';

  const clearError = () => {
    if (status === 'error') setStatus('idle');
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!firstName.trim()) {
      setStatus('error');
      setErrorMessage('First name is required.');
      return;
    }
    if (!lastName.trim()) {
      setStatus('error');
      setErrorMessage('Last name is required.');
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setStatus('error');
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const res = await fetch('/api/people/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          source,
        }),
      });

      const data = await res.json();

      if (!res.ok || data.ok !== true) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  // Shared underline input style matching the screenshot aesthetic
  const inputClass =
    'w-full bg-transparent border-b border-white/60 py-2 text-sm text-white ' +
    'placeholder-white/55 antialiased focus:outline-none focus:border-white/80 ' +
    'disabled:opacity-50 transition-colors';

  return (
    <div className={`relative isolate overflow-hidden rounded-[2.5rem] ${heightClasses}`}>
      {/* Background image */}
      {image ? (
        <div className="absolute inset-0">
          <Image
            src={image}
            alt={title}
            fill
            className="object-cover object-center"
            sizes="(max-width: 768px) 100vw, 50vw"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-black/10" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-neutral-800" />
      )}

      <div className="relative h-full flex flex-col justify-center p-6 md:p-8">
        {status === 'success' ? (
          <div className="space-y-2">
            <h3 className="antialiased text-2xl md:text-3xl font-semibold text-white">
              {title}
            </h3>
            <p className="text-sm text-white/75 antialiased pt-1">
              You&apos;re in — watch your inbox.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <h3 className="antialiased text-2xl md:text-3xl font-semibold text-white">
              {title}
            </h3>

            {/* First Name + Last Name row */}
            <div className="grid grid-cols-2 gap-4 !mt-0">
              <input
                type="text"
                value={firstName}
                onChange={(e) => { setFirstName(e.target.value); clearError(); }}
                placeholder="First Name"
                disabled={status === 'submitting'}
                required
                autoComplete="given-name"
                className={inputClass}
              />
              <input
                type="text"
                value={lastName}
                onChange={(e) => { setLastName(e.target.value); clearError(); }}
                placeholder="Last Name"
                disabled={status === 'submitting'}
                required
                autoComplete="family-name"
                className={inputClass}
              />
            </div>

            {/* Email */}
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
              placeholder="Email Address"
              disabled={status === 'submitting'}
              required
              autoComplete="email"
              className={inputClass}
            />

            {status === 'error' && (
              <p className="text-xs text-red-400 antialiased">{errorMessage}</p>
            )}

            {/* Join button */}
            <div className="pt-1">
              <button
                type="submit"
                disabled={status === 'submitting'}
                className="px-6 py-2 rounded-full text-sm font-semibold antialiased
                  bg-white text-neutral-900
                  hover:bg-white/90 transition-opacity
                  disabled:opacity-50 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-white/60
                  inline-flex items-center gap-2"
              >
                {status === 'submitting' ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-neutral-400/40 border-t-neutral-700 rounded-full animate-spin" />
                    Joining…
                  </>
                ) : (
                  'Join'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
