import { LegalPageLayout, type LegalSection } from '@/components/legal/LegalPageLayout';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Introduction',
    body: [
      'Welcome to Fine Diet™, operated by Raire Label, Inc., a Louisiana-registered corporation (“Company,” “we,” “us,” or “our”). By accessing or using this website, our digital programs, online courses, subscription services, practitioner offerings, web application, or any related content (collectively, the “Services”), you agree to be bound by these Terms & Conditions (“Terms”).',
      'If you do not agree to these Terms, please do not use the Services.',
      'These Terms apply to all visitors, users, and customers of the Fine Diet™ platform.',
    ],
  },
  {
    heading: 'Eligibility',
    body: [
      'You must be at least 18 years old to use our Services.',
      'Individuals 16–17 years old may participate only with parental or guardian consent.',
    ],
  },
  {
    heading: 'Health Disclaimer & Scope of Practice',
    body: [
      'Fine Diet™ provides nutrition education, lifestyle guidance, and general wellness information. We operate solely within the scope of practice of a nutrition professional.',
      'We do not diagnose, treat, or cure medical conditions; prescribe medications; or provide medical, psychological, or therapeutic services.',
      'Any health-related information provided through the Services is educational and is not a substitute for care from a licensed healthcare provider.',
    ],
  },
  {
    heading: 'Payment Processing',
    body: [
      'Payments are processed through third-party platforms such as Stripe and Practice Better.',
      'By purchasing any Service, you agree to abide by the payment terms and policies of these processors.',
    ],
  },
  {
    heading: 'Refund Policy',
    body: [
      'Refunds, cancellations, and related policies are governed by our Refund Policy. Please review the Refund Policy before purchasing any Service.',
    ],
  },
  {
    heading: 'Governing Law',
    body: [
      'These Terms are governed by the laws of the State of Louisiana, without regard to conflict-of-law principles.',
    ],
  },
  {
    heading: 'Modifications',
    body: [
      'We may update these Terms from time to time. Updated terms will replace prior versions upon posting.',
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalPageLayout
      title="Terms & Conditions"
      effectiveDate="12/11/2025"
      metaDescription="The terms that govern your use of Fine Diet."
      summary="These Terms & Conditions govern your access to and use of Fine Diet, including our website, digital programs, subscription services, practitioner offerings, web application, and related content."
      sections={SECTIONS}
    />
  );
}
