'use client';

import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/Button';

type GoalOption = 'Energy' | 'Digestion' | 'Weight' | 'Clarity' | 'Sleep' | 'Other';

interface FormData {
  email: string;
  name: string;
  goal: GoalOption | '';
}

interface FormState {
  status: 'idle' | 'submitting' | 'success' | 'error';
  message: string;
}

export default function WaitlistPage() {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    name: '',
    goal: '',
  });

  const [formState, setFormState] = useState<FormState>({
    status: 'idle',
    message: '',
  });

  const goalOptions: GoalOption[] = ['Energy', 'Digestion', 'Weight', 'Clarity', 'Sleep', 'Other'];

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validate email
    if (!formData.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setFormState({
        status: 'error',
        message: 'Please enter a valid email address.',
      });
      return;
    }

    setFormState({ status: 'submitting', message: '' });

    try {
      const response = await fetch('/api/people/waitlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          name: formData.name || null,
          goal: formData.goal || null,
          source: 'journal_waitlist',
          programSlug: 'journal',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }

      setFormState({
        status: 'success',
        message: 'Thank you! You\'ve been added to the waitlist. We\'ll be in touch soon.',
      });

      // Reset form
      setFormData({
        email: '',
        name: '',
        goal: '',
      });
    } catch (error) {
      setFormState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      });
    }
  };

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error state when user starts typing
    if (formState.status === 'error') {
      setFormState({ status: 'idle', message: '' });
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 sm:py-16">
      <div className="w-full max-w-2xl mx-auto">
        {/* Logo */}
        <div className="mb-8 sm:mb-12 flex justify-center">
          <img
            src="/images/home/Fine-Diet-Logo.svg"
            alt="Fine Diet"
            className="h-8 sm:h-10 w-auto"
          />
        </div>

        {/* Hero Section */}
        <div className="text-center mb-8 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-white mb-4 antialiased">
            The Fine Diet Journal — Track Food, Moods & Patterns More Intuitively.
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-white/90 font-light antialiased">
            Join the early access waitlist and be first to try it.
          </p>
        </div>

        {/* Form */}
        <div className="bg-neutral-800/40 backdrop-blur rounded-[2.5rem] p-6 sm:p-8 md:p-10 shadow-soft">
          {formState.status === 'success' ? (
            <div className="text-center py-8">
              <div className="mb-4">
                <svg
                  className="w-16 h-16 mx-auto text-semantic-success"
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
              <p className="text-lg font-semibold text-white mb-2 antialiased">
                You're on the list!
              </p>
              <p className="text-base text-white/90 font-light antialiased">
                {formState.message}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-white mb-2 antialiased">
                  Email <span className="text-white/60">(required)</span>
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased"
                  placeholder="your.email@example.com"
                  disabled={formState.status === 'submitting'}
                />
              </div>

              {/* Name Field */}
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-white mb-2 antialiased">
                  Name <span className="text-white/60">(optional)</span>
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased"
                  placeholder="Your name"
                  disabled={formState.status === 'submitting'}
                />
              </div>

              {/* Goal Field */}
              <div>
                <label htmlFor="goal" className="block text-sm font-semibold text-white mb-2 antialiased">
                  Goal <span className="text-white/60">(optional)</span>
                </label>
                <select
                  id="goal"
                  value={formData.goal}
                  onChange={(e) => handleChange('goal', e.target.value)}
                  className="w-full px-4 py-3 bg-neutral-700/50 border border-neutral-600 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased appearance-none cursor-pointer"
                  disabled={formState.status === 'submitting'}
                >
                  <option value="" className="bg-neutral-800">
                    Select a goal...
                  </option>
                  {goalOptions.map((goal) => (
                    <option key={goal} value={goal} className="bg-neutral-800">
                      {goal}
                    </option>
                  ))}
                </select>
              </div>

              {/* Error Message */}
              {formState.status === 'error' && (
                <div className="bg-semantic-error/20 border border-semantic-error/50 rounded-xl p-4">
                  <p className="text-sm text-white antialiased">{formState.message}</p>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={formState.status === 'submitting'}
                  className="w-full"
                >
                  {formState.status === 'submitting' ? 'Submitting...' : 'Join Waitlist'}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Footer Note */}
        <div className="mt-8 text-center">
          <p className="text-sm text-white/60 font-light antialiased">
            We respect your privacy. Unsubscribe at any time.
          </p>
        </div>
      </div>
    </div>
  );
}

