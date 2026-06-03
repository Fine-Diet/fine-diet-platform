import { LegalPageLayout, type LegalSection } from '@/components/legal/LegalPageLayout';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Information We Collect',
    body: [
      'We collect information you provide when you use our website, digital programs, subscription services, practitioner offerings, web application, or otherwise interact with us.',
      'This may include account details, contact information, purchase and payment-related information, intake responses, journal entries, preferences, goals, and other information you choose to provide through the Services.',
      'We may also collect technical and usage information automatically, such as device information, browser information, pages visited, and interactions with our Services.',
    ],
  },
  {
    heading: 'How We Use Your Information',
    body: [
      'We use your information to provide, operate, personalize, and improve the Services; process payments; manage accounts; communicate with you; provide customer support; and maintain the safety and security of our platform.',
      'We may also use information to understand how visitors and customers use Fine Diet™, improve our offerings, and comply with legal obligations.',
    ],
  },
  {
    heading: 'How We Share Information',
    body: [
      'We may share information with trusted service providers who help us operate the Services, including payment processors, hosting providers, analytics tools, email platforms, and client-management systems.',
      'We may also share information when required by law, to protect our rights, or in connection with a business transfer.',
      'We do not sell your personal information.',
    ],
  },
  {
    heading: 'Data Retention and Security',
    body: [
      'We retain information for as long as reasonably necessary to provide the Services, comply with legal obligations, resolve disputes, and enforce our agreements.',
      'We use reasonable administrative, technical, and organizational safeguards to protect your information.',
      'However, no method of transmission or storage is 100% secure. By using our Services, you acknowledge this risk.',
    ],
  },
  {
    heading: 'Children’s Privacy',
    body: [
      'Our Services are not intended for children under 16.',
      'Users aged 16–17 may participate with parental consent for practitioner services. We do not knowingly collect data from children under 16.',
    ],
  },
  {
    heading: 'Your Rights',
    body: [
      'Depending on where you live, you may have rights to access, correct, delete, or restrict the use of your personal information.',
      'You may also unsubscribe from marketing communications by following the instructions in those messages or by contacting us.',
    ],
  },
  {
    heading: 'Third-Party Links',
    body: [
      'Our site may contain links to external websites.',
      'We are not responsible for their content or privacy practices.',
    ],
  },
  {
    heading: 'International Users',
    body: [
      'If you access our Services from outside the United States, you consent to data transfer to U.S.-based servers.',
    ],
  },
  {
    heading: 'Changes to This Policy',
    body: [
      'We may update this Privacy Policy at any time.',
      'The updated version will replace prior versions upon posting.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      effectiveDate="12/11/2025"
      metaDescription="How Fine Diet collects, uses, stores, shares, and protects your information."
      summary="Your privacy is important to us. This Privacy Policy explains how Raire Label, Inc., doing business as Fine Diet™ (“Company,” “we,” “us,” or “our”), collects, uses, stores, and protects your information when you use our Services. By using our Services, you consent to the practices described in this Policy."
      sections={SECTIONS}
    />
  );
}
