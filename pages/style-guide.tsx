import { theme } from '@/styles/theme';
import { HomeIcon, InsightsIcon, NotebookIcon, SaveIcon } from '@/components/icons';
import { Button } from '@/components/ui/Button';

const iconData = [
  { Icon: HomeIcon, name: 'Home', file: 'FD-Home.svg' },
  { Icon: InsightsIcon, name: 'Insights', file: 'FD-Insights.svg' },
  { Icon: NotebookIcon, name: 'Notebook', file: 'FD-Notebook.svg' },
  { Icon: SaveIcon, name: 'Save', file: 'FD-Save.svg' },
];

export default function StyleGuide() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-brand-900 text-white py-12 px-8">
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


          {/* Dark_Accent Colors */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Dark Accent</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(theme.colors.dark_accent).map(([shade, hex]) => (
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

          <section className="mt-12">
            <h2 className="text-2xl font-semibold mb-4">Core Data Colors</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {Object.entries(theme.colors.core_data).map(([key, value]) => (
                <div key={key} className="flex flex-col items-center">
                  <div
                    className="w-20 h-20 rounded-xl shadow-md"
                    style={{ backgroundColor: value }}
                  ></div>
                  <p className="mt-2 text-sm font-medium text-center">{key}</p>
                  <p className="text-xs text-neutral-600">{value}</p>
                </div>
              ))}
            </div>
          </section>
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
                  <p style={{ fontSize: size }} className="font-sans text-brand-900">
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

        {/* Icons Section */}
        <section className="mb-16">
          <h2 className="text-3xl font-bold text-neutral-800 mb-6 pb-3 border-b-2 border-neutral-200">
            Icons
          </h2>

          {/* Icon Grid with Labels */}
          <div className="mb-10">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Icon Set</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {iconData.map(({ Icon, name, file }) => (
                <div key={name} className="flex flex-col items-center p-6 bg-neutral-50 rounded-xl border border-neutral-200">
                  <Icon className="w-10 h-10 text-brand-700" />
                  <p className="mt-3 text-base font-semibold text-neutral-800">{name}</p>
                  <p className="text-xs text-neutral-500 font-mono mt-1">{file}</p>
                </div>
              ))}
            </div>
          </div>

          {/* State Styling */}
          <div className="mb-10">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">States</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Icons inherit color from the parent via <code className="px-1.5 py-0.5 bg-neutral-100 rounded text-xs">fill=&quot;currentColor&quot;</code> and can be styled with Tailwind <code className="px-1.5 py-0.5 bg-neutral-100 rounded text-xs">text-*</code> utilities.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Default/Muted */}
              <div className="flex flex-col items-center p-5 bg-neutral-50 rounded-xl border border-neutral-200">
                <HomeIcon className="w-8 h-8 text-neutral-400" />
                <p className="mt-3 text-sm font-medium text-neutral-700">Default</p>
                <p className="text-xs text-neutral-500">(Muted)</p>
                <code className="text-xs text-neutral-400 mt-2 bg-neutral-100 px-2 py-1 rounded">text-neutral-400</code>
              </div>

              {/* Hover/Primary */}
              <div className="flex flex-col items-center p-5 bg-neutral-50 rounded-xl border border-neutral-200 group cursor-pointer hover:bg-neutral-100 transition-colors">
                <HomeIcon className="w-8 h-8 text-neutral-400 group-hover:text-dark_accent-700 transition-colors" />
                <p className="mt-3 text-sm font-medium text-neutral-700">Hover</p>
                <p className="text-xs text-neutral-500">(Primary)</p>
                <code className="text-xs text-neutral-400 mt-2 bg-neutral-100 px-2 py-1 rounded">hover:text-dark_accent-700</code>
              </div>

              {/* Active/Selected */}
              <div className="flex flex-col items-center p-5 bg-dark_accent-100 rounded-xl border border-dark_accent-300">
                <HomeIcon className="w-8 h-8 text-dark_accent-900" />
                <p className="mt-3 text-sm font-medium text-neutral-700">Active</p>
                <p className="text-xs text-neutral-500">(Strong)</p>
                <code className="text-xs text-neutral-400 mt-2 bg-white/50 px-2 py-1 rounded">text-dark_accent-900</code>
              </div>

              {/* Disabled */}
              <div className="flex flex-col items-center p-5 bg-neutral-50 rounded-xl border border-neutral-200">
                <HomeIcon className="w-8 h-8 text-neutral-200" />
                <p className="mt-3 text-sm font-medium text-neutral-700">Disabled</p>
                <p className="text-xs text-neutral-500">(Low Contrast)</p>
                <code className="text-xs text-neutral-400 mt-2 bg-neutral-100 px-2 py-1 rounded">text-neutral-200</code>
              </div>
            </div>
          </div>

          {/* Size Grid */}
          <div className="mb-10">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Sizes</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="text-left border-b-2 border-neutral-200">
                    <th className="py-3 px-4 text-sm font-semibold text-neutral-600">Icon</th>
                    <th className="py-3 px-4 text-sm font-semibold text-neutral-600 text-center">16px</th>
                    <th className="py-3 px-4 text-sm font-semibold text-neutral-600 text-center">20px</th>
                    <th className="py-3 px-4 text-sm font-semibold text-neutral-600 text-center">24px</th>
                    <th className="py-3 px-4 text-sm font-semibold text-neutral-600 text-center">32px</th>
                  </tr>
                </thead>
                <tbody>
                  {iconData.map(({ Icon, name }) => (
                    <tr key={name} className="border-b border-neutral-100 hover:bg-neutral-50">
                      <td className="py-4 px-4 text-sm font-medium text-neutral-700">{name}</td>
                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center justify-center w-10 h-10">
                          <Icon className="w-4 h-4 text-brand-700" />
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center justify-center w-10 h-10">
                          <Icon className="w-5 h-5 text-brand-700" />
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center justify-center w-10 h-10">
                          <Icon className="w-6 h-6 text-brand-700" />
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <div className="inline-flex items-center justify-center w-10 h-10">
                          <Icon className="w-8 h-8 text-brand-700" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex gap-4 text-xs text-neutral-500">
              <span><code className="bg-neutral-100 px-1.5 py-0.5 rounded">w-4 h-4</code> = 16px</span>
              <span><code className="bg-neutral-100 px-1.5 py-0.5 rounded">w-5 h-5</code> = 20px</span>
              <span><code className="bg-neutral-100 px-1.5 py-0.5 rounded">w-6 h-6</code> = 24px</span>
              <span><code className="bg-neutral-100 px-1.5 py-0.5 rounded">w-8 h-8</code> = 32px</span>
            </div>
          </div>

          {/* Icon Buttons */}
          <div className="mb-8">
            <h3 className="text-2xl font-semibold text-neutral-700 mb-4">Icon Buttons</h3>
            
            {/* Icon-only buttons */}
            <div className="mb-6">
              <p className="text-sm font-medium text-neutral-600 mb-3">Icon-only buttons</p>
              <div className="flex gap-4 items-center flex-wrap">
                <button className="p-3 rounded-full bg-gradient-to-bl from-dark_accent-500 to-dark_accent-900 text-neutral-900 hover:opacity-90 transition-opacity shadow-soft">
                  <HomeIcon className="w-5 h-5" />
                </button>
                <button className="p-3 rounded-full border border-brand-900 text-brand-900 hover:bg-neutral-100 transition-colors">
                  <InsightsIcon className="w-5 h-5" />
                </button>
                <button className="p-3 rounded-full bg-white text-neutral-700 hover:bg-neutral-100 transition-colors shadow-soft border border-neutral-200">
                  <NotebookIcon className="w-5 h-5" />
                </button>
                <button className="p-3 rounded-full bg-brand-900 text-white hover:bg-brand-700 transition-colors">
                  <SaveIcon className="w-5 h-5" />
                </button>
                {/* Disabled state */}
                <button disabled className="p-3 rounded-full bg-neutral-100 text-neutral-300 cursor-not-allowed">
                  <HomeIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Icon + label buttons */}
            <div>
              <p className="text-sm font-medium text-neutral-600 mb-3">Icon + label buttons</p>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="primary">
                  <HomeIcon className="w-4 h-4 mr-2" />
                  Home
                </Button>
                <Button variant="secondary">
                  <InsightsIcon className="w-4 h-4 mr-2" />
                  Insights
                </Button>
                <Button variant="tertiary" className="bg-brand-700">
                  <NotebookIcon className="w-4 h-4 mr-2" />
                  Notebook
                </Button>
                <Button variant="quaternary">
                  <SaveIcon className="w-4 h-4 mr-2" />
                  Save
                </Button>
              </div>
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

