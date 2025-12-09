import { Metadata } from 'next';
import { getWaitlistContent } from '@/lib/contentApi';
import { WaitlistForm } from './WaitlistForm';

export async function generateMetadata(): Promise<Metadata> {
  const content = await getWaitlistContent();
  
  return {
    title: content.seoTitle || content.title || 'Join the Waitlist • Fine Diet',
    description: content.seoDescription || content.description || 'Join the waitlist for early access to The Fine Diet Journal.',
  };
}

export default async function WaitlistPage() {
  const content = await getWaitlistContent();

  return <WaitlistForm content={content} />;
}
