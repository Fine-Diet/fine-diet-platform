'use client';

import { useState, type ReactNode } from 'react';
import { AppTopNav } from './AppTopNav';
import { AppSideMenu } from './AppSideMenu';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-brand-900 text-white pt-9">
      <AppTopNav drawerOpen={drawerOpen} onOpenDrawer={() => setDrawerOpen(true)} />
      <AppSideMenu open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      {/* Offset page content for the persistent desktop sidebar. */}
      <div className="lg:pl-[250px]">{children}</div>
    </div>
  );
}
