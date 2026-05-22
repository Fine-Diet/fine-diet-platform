import type { ReactNode } from 'react';
import { AppTopNav } from './AppTopNav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="min-h-screen bg-brand-900 text-white pt-9">
      <AppTopNav />
      {children}
    </div>
  );
}
