import { LegalPageLayout, type LegalSection } from '@/components/legal/LegalPageLayout';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Overview',
    body: [
      'This section will explain the scope of the Refund Policy and the products it applies to, including subscriptions, programs, and one-time purchases.',
    ],
  },
  {
    heading: 'Eligibility for refunds',
    body: [
      'This section will describe the conditions under which a purchase may be eligible for a refund, including any applicable time windows.',
    ],
  },
  {
    heading: 'How to request a refund',
    body: [
      'This section will describe how to request a refund and what information is required.',
    ],
  },
  {
    heading: 'Subscription cancellations',
    body: [
      'This section will describe how subscription cancellations are handled and how they relate to refunds and continued access.',
    ],
  },
  {
    heading: 'Processing and timing',
    body: [
      'This section will describe how approved refunds are processed and the expected timing.',
    ],
  },
  {
    heading: 'Contact',
    body: ['This section will provide the contact details for refund requests and questions.'],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalPageLayout
      title="Refund Policy"
      metaDescription="Fine Diet's approach to refunds and cancellations. Draft pending legal review."
      summary="This Refund Policy will explain when and how refunds and cancellations are handled for Fine Diet purchases. The content below outlines the sections the finalized policy will contain."
      sections={SECTIONS}
    />
  );
}
