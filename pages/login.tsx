import { useState, FormEvent } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabaseBrowser';
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

      // Create Supabase client with cookie support
      const supabase = createClient();

      // Sign in with Supabase Auth (uses cookie-based session)
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      // Handle sign-in errors
      if (signInError || !data?.session) {
        let errorMessage = 'Invalid email or password.';
        
        if (signInError) {
          // Provide more helpful error messages
          errorMessage = signInError.message || 'Invalid email or password.';
          
          // Check for specific error types
          if (signInError.message?.includes('Email not confirmed') || 
              signInError.message?.includes('email_not_confirmed')) {
            errorMessage = 'Please check your email and click the confirmation link before logging in.';
          } else if (signInError.message?.includes('Invalid login credentials') ||
                     signInError.message?.includes('invalid_credentials')) {
            errorMessage = 'Invalid email or password. Please check your credentials and try again.';
          }
        } else if (!data?.session) {
          errorMessage = 'Login failed. Please check your email confirmation or try again.';
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Link auth user to people record (if needed) - don't block on this
      fetch('/api/account/link-person', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          authUserId: data.user.id,
          email: data.user.email,
        }),
      })
        .then(async (linkResponse) => {
          if (!linkResponse.ok) {
            console.warn('[Login] link-person response not OK:', linkResponse.status);
            return;
          }
          const linkData = await linkResponse.json();
          if (linkData.profileCreated === false && linkData.profileError) {
            console.warn(
              '[Login] Profile creation failed:',
              linkData.profileError,
              'User ID:',
              data.user.id
            );
          } else if (linkData.profileCreated === true) {
            console.log('[Login] Profile created successfully for user:', data.user.id);
          } else if (linkData.profileExisted === true) {
            console.log('[Login] Profile already existed for user:', data.user.id);
          }
        })
        .catch((linkError) => {
          console.warn('[Login] Error calling link-person:', linkError);
          // Don't fail login if linking fails - user is still authenticated
        });

      // Success: redirect to intended destination
      // Default to /admin for admin login page, or use redirect query param
      const redirectTo = (router.query.redirect as string) || '/admin';
      
      try {
        await router.push(redirectTo);
        // If redirect succeeds, we'll navigate away, so loading state doesn't matter
        // But if we're still here for any reason, reset loading
        setLoading(false);
      } catch (redirectError) {
        // If redirect fails, show error and reset loading
        console.error('Redirect error:', redirectError);
        setError('Login successful, but redirect failed. Please navigate manually.');
        setLoading(false);
      }
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

