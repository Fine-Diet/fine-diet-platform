import { LegalPageLayout, type LegalSection } from '@/components/legal/LegalPageLayout';

const SECTIONS: LegalSection[] = [
  {
    heading: 'Not Medical Advice',
    body: [
      'Fine Diet™ does not provide medical advice, diagnosis, treatment, or prescriptions.',
      'All content, recommendations, insights, interpretations, and guidance offered through Fine Diet™ are not a substitute for professional medical care. Always consult with a licensed physician or qualified healthcare provider regarding any medical condition, symptoms, diagnosis, or treatment decisions.',
      'Using this website or any Fine Diet™ service does not establish a doctor–patient relationship.',
    ],
  },
  {
    heading: 'Scope of Practice',
    body: [
      'Fine Diet™ provides nutrition education, lifestyle guidance, and general wellness information.',
      'Our services may include general wellness education and metabolic and digestive support through nutrition strategies.',
      'We do not diagnose diseases, interpret medical conditions, or prescribe medications.',
    ],
  },
  {
    heading: 'Lab Test Interpretation Disclaimer',
    body: [
      'Any laboratory testing, lab review, or data-informed guidance provided through Fine Diet™ is intended for nutrition and wellness education only.',
      'Lab-related insights do not replace clinical lab interpretation by a physician and should be reviewed with your healthcare provider.',
      'Fine Diet™ does not claim to diagnose or treat medical conditions based on laboratory data.',
    ],
  },
  {
    heading: 'Age Requirements',
    body: [
      'Fine Diet™ services are intended for individuals 18 years or older.',
      'Participants aged 16–17 may engage in certain services with parental or guardian consent.',
    ],
  },
  {
    heading: 'Questions or Concerns',
    body: [
      'If you have questions about this Health Disclaimer or the scope of Fine Diet™ services, please contact hi@myfinediet.com.',
    ],
  },
];

export default function HealthDisclaimerPage() {
  return (
    <LegalPageLayout
      title="Health Disclaimer"
      effectiveDate="12/11/2025"
      metaDescription="Important information about the educational nature and scope of Fine Diet's content and services."
      summary="This Health Disclaimer explains the educational nature of Fine Diet content and clarifies that Fine Diet does not provide medical advice, diagnosis, treatment, or prescriptions."
      sections={SECTIONS}
    />
  );
}
