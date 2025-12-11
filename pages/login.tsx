import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { signIn } from '@/lib/authHelpers';
import { Button } from '@/components/ui/Button';
import Head from 'next/head';

/**
 * Login Page
 * 
 * Standalone login page that handles authentication and redirects.
 * Supports a 'redirect' query parameter to send users to their intended destination after login.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get redirect URL from query params
  const redirectTo = (router.query.redirect as string) || '/';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // Validate inputs
      if (!email || !password) {
        setError('Please enter both email and password.');
        setLoading(false);
        return;
      }

      // Sign in with Supabase Auth
      const { data, error: signInError } = await signIn(email, password);

      if (signInError) {
        // Provide more helpful error messages
        let errorMessage = signInError.message || 'Invalid email or password.';
        
        // Check for specific error types
        if (signInError.message?.includes('Email not confirmed') || 
            signInError.message?.includes('email_not_confirmed')) {
          errorMessage = 'Please check your email and click the confirmation link before logging in.';
        } else if (signInError.message?.includes('Invalid login credentials') ||
                   signInError.message?.includes('invalid_credentials')) {
          errorMessage = 'Invalid email or password. Please check your credentials and try again.';
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      if (!data?.user) {
        setError('Login failed. Please try again.');
        setLoading(false);
        return;
      }

      // Check if email is confirmed
      if (data.user && !data.user.email_confirmed_at && !data.session) {
        setError('Please check your email and click the confirmation link before logging in.');
        setLoading(false);
        return;
      }

      if (!data?.session) {
        setError('Login failed. Please check your email confirmation or try again.');
        setLoading(false);
        return;
      }

      // Link auth user to people record (if needed)
      try {
        const linkResponse = await fetch('/api/account/link-person', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            authUserId: data.user.id,
            email: data.user.email,
          }),
        });

        if (!linkResponse.ok) {
          console.warn('Failed to link person, but login succeeded');
        }
      } catch (linkError) {
        console.warn('Error linking person:', linkError);
        // Don't fail login if linking fails - user is still authenticated
      }

      // Success - redirect to intended destination or home
      // Wait a moment for auth state to propagate
      setTimeout(() => {
        router.push(redirectTo);
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login • Fine Diet</title>
      </Head>
      <div className="min-h-screen bg-brand-900 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-neutral-900/95 backdrop-blur-lg rounded-2xl p-8 text-white">
          <h1 className="text-2xl font-semibold antialiased mb-2">Login</h1>
          <p className="text-sm text-white/70 antialiased mb-6">
            Sign in to access the admin dashboard.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="login-email" className="block text-sm font-semibold text-white mb-2 antialiased">
                Email
              </label>
              <input
                type="email"
                id="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
                placeholder="your.email@example.com"
              />
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="login-password" className="block text-sm font-semibold text-white antialiased">
                  Password
                </label>
                <a
                  href="/auth/reset-password"
                  className="text-sm text-white/70 hover:text-white/90 transition-colors antialiased"
                >
                  Forgot password?
                </a>
              </div>
              <input
                type="password"
                id="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                className="w-full px-4 py-3 bg-neutral-800/50 border border-neutral-700 rounded-xl text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-dark_accent-500 focus:border-transparent transition-all antialiased disabled:opacity-50"
                placeholder="Enter your password"
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-semantic-error/20 border border-semantic-error/50 rounded-xl p-4">
                <p className="text-sm text-white antialiased">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={loading}
              className="w-full"
            >
              {loading ? 'Logging in...' : 'Log in'}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-700/50"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-neutral-900/95 text-white/60 antialiased">
                Don't have an account?
              </span>
            </div>
          </div>

          {/* Link to Home */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-sm text-white/70 hover:text-white/90 transition-colors antialiased"
            >
              Return to home
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

