import { LegalPageLayout, type LegalSection } from '@/components/legal/LegalPageLayout';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Acceptance of terms',
    body: [
      'This section will describe how using Fine Diet constitutes agreement to these Terms & Conditions, and how updates to the terms will be communicated.',
    ],
  },
  {
    heading: 'Accounts and eligibility',
    body: [
      'This section will describe account registration, eligibility requirements, and your responsibility for activity under your account.',
    ],
  },
  {
    heading: 'Subscriptions, purchases, and billing',
    body: [
      'This section will describe the programs, subscriptions, and one-time purchases offered, how billing works, and how renewals and cancellations are handled. Refunds are addressed in the Refund Policy.',
    ],
  },
  {
    heading: 'Acceptable use',
    body: [
      'This section will describe acceptable use of the service and activities that are not permitted.',
    ],
  },
  {
    heading: 'Intellectual property',
    body: [
      'This section will describe ownership of the content and materials provided through Fine Diet and the limited license granted to you.',
    ],
  },
  {
    heading: 'Disclaimers and limitation of liability',
    body: [
      'This section will set out the disclaimers and limitations of liability that apply to your use of the service. Health-related guidance is further addressed in the Health Disclaimer.',
    ],
  },
  {
    heading: 'Contact',
    body: ['This section will provide the contact details for questions about these terms.'],
  },
];

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms & Conditions"
      metaDescription="The terms that govern your use of Fine Diet. Draft pending legal review."
      summary="These Terms & Conditions will govern your access to and use of Fine Diet, including accounts, purchases, and acceptable use. The content below outlines the sections the finalized terms will contain."
      sections={SECTIONS}
    />
  );
}
