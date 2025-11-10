import { Button } from '@/components/ui';

export default function ComponentTest() {
  return (
    <div className="p-11 flex flex-col gap-4 bg-neutral-50">
      <Button variant="primary">Primary Button</Button>
      <Button variant="secondary">Secondary Button</Button>
      <Button variant="tertiary">Tertiary Button</Button>
      <Button size="lg" variant="primary">Large Primary</Button>
      <Button disabled>Disabled</Button>
    </div>
  );
}

