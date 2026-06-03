import { LegalPageLayout, type LegalSection } from '@/components/legal/LegalPageLayout';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Information we collect',
    body: [
      'This section will describe the categories of information Fine Diet collects, such as account details you provide (for example name and email), information you enter into the Journal and onboarding (such as goals, preferences, and meal schedule), and technical information collected automatically (such as device and usage data).',
    ],
  },
  {
    heading: 'How we use your information',
    body: [
      'This section will explain how collected information is used — for example to provide and personalize the service, process payments, communicate with you, and improve the product.',
    ],
  },
  {
    heading: 'How we share information',
    body: [
      'This section will describe the limited circumstances in which information may be shared, such as with service providers who process payments or deliver email on our behalf, and when required by law.',
    ],
  },
  {
    heading: 'Data retention and security',
    body: [
      'This section will describe how long information is retained and the measures used to protect it.',
    ],
  },
  {
    heading: 'Your choices and rights',
    body: [
      'This section will describe the choices and rights available to you, including how to access, update, or delete your information and how to manage marketing communications.',
    ],
  },
  {
    heading: 'Contact',
    body: [
      'This section will provide the contact details for privacy-related questions and requests.',
    ],
  },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      metaDescription="How Fine Diet collects, uses, and protects your information. Draft pending legal review."
      summary="This Privacy Policy will explain what information Fine Diet collects, how it is used and protected, and the choices available to you. The content below outlines the sections the finalized policy will contain."
      sections={SECTIONS}
    />
  );
}
