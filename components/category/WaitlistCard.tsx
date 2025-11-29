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
    <div className="">
      <div className="space-y-4 text-center">
        {/* Description only - no headline */}
        {description && (
          <p className="text-base font-light text-white/70">{description}</p>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-3 max-w-md mx-auto">
            <div className="flex flex-row gap-3">
              <input
                type="email"
                placeholder="Enter your email"
                required
                className="
                  flex-1 px-4 py-3 rounded-[2.5rem]
                  bg-neutral-700/50 border border-neutral-600/50
                  text-white placeholder:text-white/50
                  focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                "
              />
              <input
                type="tel"
                placeholder="Enter your phone number"
                required
                className="
                  flex-1 px-4 py-3 rounded-[2.5rem]
                  bg-neutral-700/50 border border-neutral-600/50
                  text-white placeholder:text-white/50
                  focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                "
              />
            </div>
            <Button
              type="submit"
              variant="quaternary"
              size="md"
              className="whitespace-nowrap w-full"
            >
              {buttonLabel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

