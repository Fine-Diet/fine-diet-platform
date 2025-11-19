import { Button } from '@/components/ui/Button';

interface WaitlistCardProps {
  title: string;
  description?: string;
  buttonLabel?: string;
  onSubmit?: () => void;
}

export const WaitlistCard = ({
  title,
  description,
  buttonLabel = "Join Waitlist",
  onSubmit,
}: WaitlistCardProps) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Integrate with your waitlist API/backend
    if (onSubmit) {
      onSubmit();
    } else {
      console.log('Waitlist submission:', { title });
      // Placeholder - replace with actual waitlist submission logic
    }
  };

  return (
    <div className="rounded-[2.5rem] overflow-hidden bg-neutral-800/40 shadow-soft backdrop-blur border-2 border-dashed border-neutral-600/50">
      <div className="p-8 space-y-4 text-center">
        <div className="space-y-2">
          <h3 className="text-xl md:text-2xl font-semibold text-white">{title}</h3>
          {description && (
            <p className="text-base font-light text-white/70">{description}</p>
          )}
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <input
              type="email"
              placeholder="Enter your email"
              required
              className="
                flex-1 px-4 py-3 rounded-xl
                bg-neutral-700/50 border border-neutral-600/50
                text-white placeholder:text-white/50
                focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
              "
            />
            <Button
              type="submit"
              variant="quaternary"
              size="md"
              className="whitespace-nowrap"
            >
              {buttonLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

