'use client';

export function AppTopNav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-black/50 backdrop-blur-md border-b border-white/[0.04]">
      <div className="h-9 px-4 md:px-6 flex items-center justify-between">
        <div className="font-sans text-xs md:text-sm font-semibold text-brand-50 antialiased">
          Fine Diet App
        </div>
        <button
          type="button"
          className="h-8 w-8 inline-flex flex-col items-center justify-center gap-1.5 rounded-full text-brand-50/80 hover:text-brand-50 hover:bg-white/10 transition-colors"
          aria-label="Open app menu"
        >
          <span className="block h-px w-5 bg-current" />
          <span className="block h-px w-5 bg-current" />
        </button>
      </div>
    </header>
  );
}
