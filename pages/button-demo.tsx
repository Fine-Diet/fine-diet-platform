import { Button } from '@/components/ui';

export default function ButtonDemo() {
  return (
    <div className="min-h-screen bg-neutral-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-brand-700 mb-8">
          Fine Diet Button Component Demo
        </h1>

        {/* Variants Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Variants
          </h2>
          <div className="flex gap-4 flex-wrap">
            <Button variant="primary">Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="tertiary">Tertiary Button</Button>
          </div>
        </section>

        {/* Sizes Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Sizes
          </h2>
          <div className="flex gap-4 items-center flex-wrap">
            <Button size="sm">Small Button</Button>
            <Button size="md">Medium Button</Button>
            <Button size="lg">Large Button</Button>
          </div>
        </section>

        {/* Disabled State Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Disabled State
          </h2>
          <div className="flex gap-4 flex-wrap">
            <Button variant="primary" disabled>
              Disabled Primary
            </Button>
            <Button variant="secondary" disabled>
              Disabled Secondary
            </Button>
            <Button variant="tertiary" disabled>
              Disabled Tertiary
            </Button>
          </div>
        </section>

        {/* Interactive Example */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            Interactive Example
          </h2>
          <Button
            variant="primary"
            size="lg"
            onClick={() => alert('Button clicked!')}
          >
            Click Me!
          </Button>
        </section>

        {/* Combinations */}
        <section className="mb-12">
          <h2 className="text-2xl font-semibold text-neutral-800 mb-4">
            All Combinations
          </h2>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-neutral-700 mb-2">
                Primary
              </h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="primary" size="sm">
                  Small
                </Button>
                <Button variant="primary" size="md">
                  Medium
                </Button>
                <Button variant="primary" size="lg">
                  Large
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-neutral-700 mb-2">
                Secondary
              </h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="secondary" size="sm">
                  Small
                </Button>
                <Button variant="secondary" size="md">
                  Medium
                </Button>
                <Button variant="secondary" size="lg">
                  Large
                </Button>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-neutral-700 mb-2">
                Tertiary
              </h3>
              <div className="flex gap-4 items-center flex-wrap">
                <Button variant="tertiary" size="sm">
                  Small
                </Button>
                <Button variant="tertiary" size="md">
                  Medium
                </Button>
                <Button variant="tertiary" size="lg">
                  Large
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

