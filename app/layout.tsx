import '../styles/globals.css';
import type { Metadata } from 'next';
import { APP_ROUTER_FAVICON } from '@/lib/config/favicons';

export const metadata: Metadata = {
  title: 'The Fine Diet Journal — Join the Waitlist',
  description: 'Track Food, Moods & Patterns More Intuitively. Join the early access waitlist and be first to try it.',
  icons: {
    icon: APP_ROUTER_FAVICON,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased bg-brand-900 text-white">
        {children}
      </body>
    </html>
  );
}

