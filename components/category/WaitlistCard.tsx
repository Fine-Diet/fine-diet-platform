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
      <div className="space-y-4 text-center pt-3">
        {/* Description only - no headline */}
        {description && (
          <p className="text-base font-light text-white">{description}</p>
        )}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-3 max-w-lg mx-auto">
            <div className="flex flex-col md:flex-row gap-3">
              <input
                type="email"
                placeholder="Enter your email"
                required
                className="
                  flex-1 px-5 py-3 rounded-[2.5rem]
                  bg-neutral-700/50 border border-neutral-600/50
                  text-base font-light text-white placeholder:text-base placeholder:font-light placeholder:text-white/50 placeholder:translate-y-[2px]
                  focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
                "
              />
              <input
                type="tel"
                placeholder="Enter your phone number"
                required
                className="
                  flex-1 px-5 py-3 rounded-[2.5rem]
                  bg-neutral-700/50 border border-neutral-600/50
                  text-base font-light text-white placeholder:text-base placeholder:font-light placeholder:text-white/50 placeholder:translate-y-[2px]
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

