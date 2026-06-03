import { LegalPageLayout, type LegalSection } from '@/components/legal/LegalPageLayout';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Not medical advice',
    body: [
      'This section will state that Fine Diet provides educational and lifestyle nutrition information and is not a substitute for professional medical advice, diagnosis, or treatment.',
    ],
  },
  {
    heading: 'Consult a professional',
    body: [
      'This section will encourage you to consult a qualified healthcare professional before making changes to your diet, exercise, or health routine, especially if you have a medical condition or take medication.',
    ],
  },
  {
    heading: 'Individual results vary',
    body: [
      'This section will explain that nutrition and lifestyle outcomes vary between individuals and that no specific result is guaranteed.',
    ],
  },
  {
    heading: 'No emergency use',
    body: [
      'This section will state that Fine Diet is not intended for medical emergencies and will direct you to appropriate emergency services when needed.',
    ],
  },
  {
    heading: 'Contact',
    body: ['This section will provide contact details for questions about this disclaimer.'],
  },
];

export default function HealthDisclaimerPage() {
  return (
    <LegalPageLayout
      title="Health Disclaimer"
      metaDescription="Important information about the educational nature of Fine Diet's content. Draft pending legal review."
      summary="This Health Disclaimer will clarify that Fine Diet provides educational nutrition and lifestyle information and is not medical advice. The content below outlines the sections the finalized disclaimer will contain."
      sections={SECTIONS}
    />
  );
}
