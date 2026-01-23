'use client';

export function AuroraBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Base dark background */}
      <div className="absolute inset-0 bg-brand-900" />
      
      {/* Aurora gradient layers with animation */}
      <div 
        className="absolute inset-0 opacity-30"
        style={{
          background: `
            radial-gradient(circle at 20% 30%, rgba(139, 90, 43, 0.4) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(180, 120, 60, 0.3) 0%, transparent 50%),
            radial-gradient(circle at 50% 50%, rgba(120, 70, 35, 0.2) 0%, transparent 60%)
          `,
          animation: 'aurora 20s ease-in-out infinite alternate',
        }}
      />
      
      {/* Additional animated layer */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          background: `
            radial-gradient(circle at 60% 20%, rgba(160, 100, 50, 0.3) 0%, transparent 40%),
            radial-gradient(circle at 30% 80%, rgba(140, 85, 40, 0.25) 0%, transparent 45%)
          `,
          animation: 'aurora 25s ease-in-out infinite alternate-reverse',
        }}
      />
    </div>
  );
}
