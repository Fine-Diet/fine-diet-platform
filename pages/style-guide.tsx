import { theme } from '@/styles/theme';

export default function StyleGuide() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-brand-500 text-white py-12 px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-5xl font-bold mb-2">Fine Diet Style Guide</h1>
          <p className="text-xl opacity-90">Design tokens and component library</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-12">
        {/* Colors Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-neutral-800 mb-6 pb-3 border-b-2 border-neutral-200">
            Colors
          </h2>

          {/* Brand Colors */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Brand</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(theme.colors.brand).map(([shade, hex]) => (
                <div key={shade} className="flex flex-col">
                  <div
                    className="h-24 rounded-lg shadow-soft flex items-center justify-center text-sm font-medium"
                    style={{ backgroundColor: hex }}
                  >
                    <span
                      className="px-3 py-1 rounded"
                      style={{
                        color: parseInt(shade) >= 500 ? '#FFFFFF' : '#20201E',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      }}
                    >
                      {shade}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-600 font-mono">{hex}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Accent Colors */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Accent</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(theme.colors.accent).map(([shade, hex]) => (
                <div key={shade} className="flex flex-col">
                  <div
                    className="h-24 rounded-lg shadow-soft flex items-center justify-center text-sm font-medium"
                    style={{ backgroundColor: hex }}
                  >
                    <span
                      className="px-3 py-1 rounded"
                      style={{
                        color: parseInt(shade) >= 700 ? '#FFFFFF' : '#20201E',
                        backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      }}
                    >
                      {shade}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-600 font-mono">{hex}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Neutral Colors */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Neutral</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(theme.colors.neutral).map(([shade, hex]) => (
                <div key={shade} className="flex flex-col">
                  <div
                    className="h-24 rounded-lg shadow-soft flex items-center justify-center text-sm font-medium border border-neutral-200"
                    style={{ backgroundColor: hex }}
                  >
                    <span
                      className="px-3 py-1 rounded"
                      style={{
                        color: parseInt(shade) >= 500 ? '#FFFFFF' : '#20201E',
                        backgroundColor: parseInt(shade) >= 500 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.1)',
                      }}
                    >
                      {shade}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-600 font-mono">{hex}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Semantic Colors */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Semantic</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(theme.colors.semantic).map(([name, hex]) => (
                <div key={name} className="flex flex-col">
                  <div
                    className="h-24 rounded-lg shadow-soft flex items-center justify-center text-sm font-medium"
                    style={{ backgroundColor: hex }}
                  >
                    <span className="px-3 py-1 rounded bg-white bg-opacity-20 text-white capitalize">
                      {name}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-600 font-mono">{hex}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Overlay Colors */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Overlay</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(theme.colors.overlay).map(([name, rgba]) => (
                <div key={name} className="flex flex-col">
                  <div
                    className="h-24 rounded-lg shadow-soft flex items-center justify-center text-sm font-medium relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-brand-500 to-accent-500" />
                    <div
                      className="absolute inset-0"
                      style={{ backgroundColor: rgba }}
                    />
                    <span className="relative px-3 py-1 rounded bg-white text-neutral-800 capitalize">
                      {name}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-600 font-mono">{rgba}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Typography Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-neutral-800 mb-6 pb-3 border-b-2 border-neutral-200">
            Typography
          </h2>

          {/* Font Families */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Font Families</h3>
            <div className="space-y-4">
              <div className="p-4 bg-neutral-50 rounded-lg">
                <p className="text-sm text-neutral-600 mb-2 font-mono">
                  {theme.typography.fonts.sans.join(', ')}
                </p>
                <p className="text-2xl font-sans">
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
              <div className="p-4 bg-neutral-50 rounded-lg">
                <p className="text-sm text-neutral-600 mb-2 font-mono">
                  {theme.typography.fonts.serif.join(', ')}
                </p>
                <p className="text-2xl font-serif">
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
              <div className="p-4 bg-neutral-50 rounded-lg">
                <p className="text-sm text-neutral-600 mb-2 font-mono">
                  {theme.typography.fonts.mono.join(', ')}
                </p>
                <p className="text-2xl font-mono">
                  The quick brown fox jumps over the lazy dog
                </p>
              </div>
            </div>
          </div>

          {/* Font Sizes */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Font Sizes</h3>
            <div className="space-y-3">
              {Object.entries(theme.typography.sizes).map(([name, size]) => (
                <div key={name} className="flex items-baseline gap-4 p-3 hover:bg-neutral-50 rounded">
                  <span className="text-sm text-neutral-500 font-mono w-16">{name}</span>
                  <span className="text-xs text-neutral-400 font-mono w-20">{size}</span>
                  <p style={{ fontSize: size }} className="font-sans">
                    The quick brown fox jumps over the lazy dog
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Font Weights */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Font Weights</h3>
            <div className="space-y-3">
              {Object.entries(theme.typography.weights).map(([name, weight]) => (
                <div key={name} className="flex items-baseline gap-4 p-3 hover:bg-neutral-50 rounded">
                  <span className="text-sm text-neutral-500 font-mono w-24">{name}</span>
                  <span className="text-xs text-neutral-400 font-mono w-16">{weight}</span>
                  <p style={{ fontWeight: weight }} className="text-xl font-sans">
                    The quick brown fox jumps over the lazy dog
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Line Heights */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Line Heights</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(theme.typography.lineHeights).map(([name, height]) => (
                <div key={name} className="p-4 bg-neutral-50 rounded-lg">
                  <p className="text-sm text-neutral-600 mb-2">
                    {name} <span className="font-mono">({height})</span>
                  </p>
                  <p style={{ lineHeight: height }} className="text-base">
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Letter Spacing */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Letter Spacing</h3>
            <div className="space-y-3">
              {Object.entries(theme.typography.letterSpacing).map(([name, spacing]) => (
                <div key={name} className="p-3 hover:bg-neutral-50 rounded">
                  <p className="text-sm text-neutral-600 mb-2">
                    {name} <span className="font-mono">({spacing})</span>
                  </p>
                  <p style={{ letterSpacing: spacing }} className="text-xl font-sans">
                    The quick brown fox jumps over the lazy dog
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Spacing Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-neutral-800 mb-6 pb-3 border-b-2 border-neutral-200">
            Spacing
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
            {Object.entries(theme.spacing).map(([name, value]) => (
              <div key={name} className="flex flex-col items-center">
                <div className="w-full bg-neutral-100 rounded flex items-center justify-center mb-2">
                  <div
                    className="bg-brand-500 rounded"
                    style={{ width: value, height: value }}
                  />
                </div>
                <p className="text-sm font-mono text-neutral-600">{name}</p>
                <p className="text-xs text-neutral-400 font-mono">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Border Radii Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-neutral-800 mb-6 pb-3 border-b-2 border-neutral-200">
            Border Radii
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Object.entries(theme.radii).map(([name, value]) => (
              <div key={name} className="flex flex-col items-center">
                <div
                  className="w-24 h-24 bg-brand-500 mb-3 shadow-soft"
                  style={{ borderRadius: value }}
                />
                <p className="text-sm font-mono text-neutral-600">{name}</p>
                <p className="text-xs text-neutral-400 font-mono">{value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Shadows Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-neutral-800 mb-6 pb-3 border-b-2 border-neutral-200">
            Shadows
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(theme.shadows).map(([name, value]) => (
              <div key={name} className="flex flex-col items-center">
                <div
                  className="w-32 h-32 bg-white rounded-lg mb-3 flex items-center justify-center"
                  style={{ boxShadow: value }}
                >
                  <span className="text-sm text-neutral-500 capitalize">{name}</span>
                </div>
                <p className="text-xs text-neutral-400 font-mono text-center px-2">{value}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-neutral-100 py-8 px-8 mt-16">
        <div className="max-w-7xl mx-auto text-center text-neutral-600">
          <p>Fine Diet Design System • {new Date().getFullYear()}</p>
        </div>
      </footer>
    </div>
  );
}

