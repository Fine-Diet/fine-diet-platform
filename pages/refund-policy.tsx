import { LegalPageLayout, type LegalSection } from '@/components/legal/LegalPageLayout';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Digital Programs & Downloads',
    body: [
      'All digital programs, PDFs, and downloadable content are non-refundable due to the immediate access provided.',
    ],
  },
  {
    heading: '1:1 Practitioner Services',
    body: [
      'Once booked, all 1:1 services are non-refundable.',
      'Rescheduling is allowed with at least 24 hours advance notice.',
      'Follow-ups are included as outlined in the specific service description.',
    ],
  },
  {
    heading: 'Subscriptions',
    body: [
      'Subscription fees for the web or mobile app are billed according to the subscription cycle.',
      'All subscription payments are non-refundable once charged.',
      'Cancellations take effect at the end of the current billing period.',
      'No partial refunds or prorated refunds are offered.',
    ],
  },
  {
    heading: 'Digital Workshops or Live Events',
    body: [
      'Refunds for digital workshops or live events, if available, will be governed by the terms listed at the time of purchase or registration.',
    ],
  },
  {
    heading: 'How to Request Support',
    body: [
      'For questions about billing, cancellations, or refund eligibility, contact hi@myfinediet.com.',
    ],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout
      title="Refund Policy"
      effectiveDate="12/11/2025"
      metaDescription="Fine Diet's policy for refunds, cancellations, subscriptions, digital programs, downloads, and practitioner services."
      summary="This Refund Policy explains how refunds and cancellations are handled for Fine Diet digital programs, downloads, practitioner services, subscriptions, workshops, and events."
      sections={SECTIONS}
    />
  );
}
